import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  AGENT_TOOLS,
  AGENT_REGISTRY,
  executeToolCall,
  getAgentAdapter,
  getToolsForAgent,
  routeMessage,
} from "../services/agent";
import {
  logConversationTurn,
  logHandoff,
  logToolConverted,
} from "../services/agent/eventLogger";
import { formatForPrompt, loadUserProfile } from "../services/agent/memory";
import { getOrCreateSessionId } from "../services/agent/sessionId";
import {
  appendMessage,
  handoffToAgent,
  setActiveToolCall,
  setError,
  setStatus,
} from "../slice/agentSlice";
import { createAsyncGetCart } from "../slice/cartSlice";

import type { AppDispatch, RootState } from "../store/store";
import type { ChatMessage } from "../types/agent";
import type { ToolCallSnapshot } from "../types/agent-events";

// useChatAgent — Phase 2：多 agent handoff loop
//
// 流程：
//   user 送出 → Router 決定要交給誰
//     → 若要換 agent → dispatch handoffToAgent（產生 system 訊息 + 切換 currentAgentId）
//   → append user msg → 呼叫當前 agent 的 adapter（帶入該 agent 的 systemPrompt + 工具 subset）
//     → tool-use loop 同 Phase 1
//
// MAX_TURNS 保護避免無窮 loop。

const MAX_TURNS = 6;

const uid = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useChatAgent = () => {
  const dispatch = useDispatch<AppDispatch>();
  const messages = useSelector((state: RootState) => state.agent.messages);
  const status = useSelector((state: RootState) => state.agent.status);
  const currentAgentId = useSelector(
    (state: RootState) => state.agent.currentAgentId,
  );

  const send = useCallback(
    async (userText: string) => {
      const text = userText.trim();
      if (!text || status === "thinking" || status === "calling_tool") return;

      const adapter = getAgentAdapter();
      // Phase F: 每一輪對話都從 sessionStorage 讀（第一次會 create）
      const sessionId = getOrCreateSessionId();

      // 1. Router 決定要交給誰（Phase 2 新增）
      const decision = routeMessage(text, currentAgentId);
      let effectiveAgentId = currentAgentId;
      const working: ChatMessage[] = [...messages];

      if (decision.switched) {
        dispatch(
          handoffToAgent({
            from: currentAgentId,
            to: decision.agentId,
            reason: decision.reason,
          }),
        );
        effectiveAgentId = decision.agentId;
        working.push({
          id: `handoff-${Date.now()}`,
          role: "system",
          text: `${AGENT_REGISTRY[currentAgentId].name} → ${AGENT_REGISTRY[decision.agentId].name}：${decision.reason}`,
          handoff: {
            from: currentAgentId,
            to: decision.agentId,
            reason: decision.reason,
          },
          createdAt: Date.now(),
        });
        // 跨 repo event log：handoff（fire-and-forget）
        logHandoff({
          from: currentAgentId,
          to: decision.agentId,
          reason: decision.reason,
          sessionId,
        });
      }

      // 2. 把 user message 放進 state
      const userMessage: ChatMessage = {
        id: uid(),
        role: "user",
        text,
        createdAt: Date.now(),
      };
      dispatch(appendMessage(userMessage));
      dispatch(setStatus("thinking"));
      dispatch(setError(null));
      working.push(userMessage);

      // 3. 準備當前 agent 的 systemPrompt + 工具 subset
      const persona = AGENT_REGISTRY[effectiveAgentId];
      const toolsForAgent = getToolsForAgent(effectiveAgentId, AGENT_TOOLS);

      // 記憶注入：把使用者既有偏好拼到 systemPrompt 前面，讓 agent 每一輪都看得到。
      // （tool_use loop 中途若使用者又存了新偏好，Anthropic 會從 tool_result 看到，
      //   不需要重新 load；下次 send() 時才重新讀 localStorage。）
      const memorySnapshot = formatForPrompt(loadUserProfile());
      const systemPromptWithMemory = memorySnapshot
        ? `${memorySnapshot}\n\n---\n\n${persona.systemPrompt}`
        : persona.systemPrompt;

      // Event logging 所需的累計器（跨整個 tool-use loop）
      const turnStartMs = Date.now();
      const accumulatedToolCalls: ToolCallSnapshot[] = [];
      let accumulatedInputTokens = 0;
      let accumulatedOutputTokens = 0;
      let lastStopReason: string | undefined;

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const response = await adapter.sendMessage(
            working,
            systemPromptWithMemory,
            toolsForAgent,
            { agentId: effectiveAgentId },
          );

          // 累計 token usage（每個 LLM turn 都有）
          if (response.usage) {
            accumulatedInputTokens += response.usage.inputTokens;
            accumulatedOutputTokens += response.usage.outputTokens;
          }
          lastStopReason = response.stopReason;

          // Case A: 沒有 tool call → 直接產 assistant message 結束
          if (!response.toolCalls || response.toolCalls.length === 0) {
            const assistantMsg: ChatMessage = {
              id: uid(),
              role: "assistant",
              agentId: effectiveAgentId,
              text: response.text || "",
              createdAt: Date.now(),
            };
            dispatch(appendMessage(assistantMsg));
            dispatch(setStatus("idle"));
            dispatch(setActiveToolCall(null));

            // 跨 repo event log：conversation_turn 完成
            logConversationTurn({
              agentId: effectiveAgentId,
              userMessage: text,
              assistantText: response.text || "",
              toolCalls: accumulatedToolCalls,
              latencyMs: Date.now() - turnStartMs,
              tokenUsage:
                accumulatedInputTokens + accumulatedOutputTokens > 0
                  ? {
                      inputTokens: accumulatedInputTokens,
                      outputTokens: accumulatedOutputTokens,
                    }
                  : undefined,
              stopReason: lastStopReason,
              sessionId,
            });
            return;
          }

          // Case B: 有 tool call → append assistant (toolCalls) 然後執行
          for (const call of response.toolCalls) {
            accumulatedToolCalls.push({ name: call.name, input: call.input });
          }

          const assistantMsg: ChatMessage = {
            id: uid(),
            role: "assistant",
            agentId: effectiveAgentId,
            text: response.text,
            toolCalls: response.toolCalls,
            createdAt: Date.now(),
          };
          dispatch(appendMessage(assistantMsg));
          working.push(assistantMsg);

          dispatch(setStatus("calling_tool"));

          const toolResults = [];
          let cartMutated = false;
          for (const call of response.toolCalls) {
            dispatch(setActiveToolCall(call));
            const result = await executeToolCall(call, {
              agentId: effectiveAgentId,
            });
            toolResults.push(result);
            if (
              call.name === "add_to_cart" ||
              call.name === "remove_from_cart"
            ) {
              cartMutated = true;
              // Phase F: 只在真的回報成功才 log，避免庫存不足/網路錯誤時高估轉換率
              const succeeded = (() => {
                try {
                  const parsed = JSON.parse(result.content);
                  return parsed && parsed.success === true;
                } catch {
                  return false;
                }
              })();
              if (succeeded) {
                const input = call.input as {
                  product_id?: string;
                  qty?: number;
                };
                logToolConverted({
                  sessionId,
                  agentId: effectiveAgentId,
                  toolName: call.name,
                  productId: input.product_id,
                  qty: input.qty,
                });
              }
            }
          }

          const toolMsg: ChatMessage = {
            id: uid(),
            role: "tool",
            toolResults,
            createdAt: Date.now(),
          };
          dispatch(appendMessage(toolMsg));
          working.push(toolMsg);

          dispatch(setActiveToolCall(null));
          dispatch(setStatus("thinking"));

          if (cartMutated) {
            dispatch(createAsyncGetCart());
          }
        }

        // 超過 MAX_TURNS 保護
        const maxTurnsText =
          "抱歉，這個問題有點繞，我暫時想不出來——可以換個方式問嗎？";
        dispatch(
          appendMessage({
            id: uid(),
            role: "assistant",
            agentId: effectiveAgentId,
            text: maxTurnsText,
            createdAt: Date.now(),
          }),
        );
        dispatch(setStatus("idle"));
        dispatch(setActiveToolCall(null));

        logConversationTurn({
          agentId: effectiveAgentId,
          userMessage: text,
          assistantText: maxTurnsText,
          toolCalls: accumulatedToolCalls,
          latencyMs: Date.now() - turnStartMs,
          tokenUsage:
            accumulatedInputTokens + accumulatedOutputTokens > 0
              ? {
                  inputTokens: accumulatedInputTokens,
                  outputTokens: accumulatedOutputTokens,
                }
              : undefined,
          stopReason: "max_turns",
          sessionId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[useChatAgent] error:", err);
        dispatch(setError(message));
        const errorText = "欸，我這邊突然出了點狀況。等等再試一次？";
        dispatch(
          appendMessage({
            id: uid(),
            role: "assistant",
            agentId: effectiveAgentId,
            text: errorText,
            createdAt: Date.now(),
          }),
        );
        dispatch(setStatus("error"));
        dispatch(setActiveToolCall(null));

        // 失敗也要 log，讓 dashboard 能統計錯誤率
        logConversationTurn({
          agentId: effectiveAgentId,
          userMessage: text,
          assistantText: errorText,
          toolCalls: accumulatedToolCalls,
          latencyMs: Date.now() - turnStartMs,
          tokenUsage:
            accumulatedInputTokens + accumulatedOutputTokens > 0
              ? {
                  inputTokens: accumulatedInputTokens,
                  outputTokens: accumulatedOutputTokens,
                }
              : undefined,
          stopReason: "error",
          sessionId,
        });
      }
    },
    [dispatch, messages, status, currentAgentId],
  );

  return { send };
};
