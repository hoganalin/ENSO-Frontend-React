// Anthropic Messages API protocol helpers
// 純 function，client 與 server（Next.js Route Handler）都能 import。
// 不要 import 任何 client-only API（DOM / redux / localStorage）。

import type { AgentResponse, ChatMessage, ToolCall } from "../../types/agent";

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_MODEL_ID = "claude-haiku-4-5-20251001";
export const ANTHROPIC_MAX_TOKENS = 1024;
export const ANTHROPIC_API_VERSION = "2023-06-01";

// ---- Anthropic content block types ----
export interface AnthropicTextBlock {
  type: "text";
  text: string;
}
export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

// 把我們的 ChatMessage[] 轉成 Anthropic 格式
// 規則：
// - user message → role: "user", content: string
// - assistant message → role: "assistant", content: 包 text/tool_use blocks
// - tool message → role: "user", content: tool_result blocks（Anthropic 的慣例）
// - system role 訊息（Phase 2 handoff 提示）→ 不送給 LLM，直接略過
export const toAnthropicMessages = (
  messages: ChatMessage[],
): AnthropicMessage[] => {
  const result: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "user" && m.text) {
      result.push({ role: "user", content: m.text });
    } else if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.text) blocks.push({ type: "text", text: m.text });
      if (m.toolCalls) {
        for (const tc of m.toolCalls) {
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
      }
      if (blocks.length > 0) {
        result.push({ role: "assistant", content: blocks });
      }
    } else if (m.role === "tool" && m.toolResults) {
      result.push({
        role: "user",
        content: m.toolResults.map((tr) => ({
          type: "tool_result" as const,
          tool_use_id: tr.tool_use_id,
          content: tr.content,
          is_error: tr.is_error,
        })),
      });
    }
    // m.role === "system" 的 handoff 提示訊息 → 故意跳過，不進上下文
  }

  return result;
};

// Anthropic response → 我們的 AgentResponse
export const parseAnthropicResponse = (data: {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}): AgentResponse => {
  const contentBlocks: AnthropicContentBlock[] = data.content || [];

  const textBlocks = contentBlocks.filter(
    (b): b is AnthropicTextBlock => b.type === "text",
  );
  const toolUseBlocks = contentBlocks.filter(
    (b): b is AnthropicToolUseBlock => b.type === "tool_use",
  );

  const toolCalls: ToolCall[] | undefined =
    toolUseBlocks.length > 0
      ? toolUseBlocks.map((b) => ({
          id: b.id,
          name: b.name,
          input: b.input,
        }))
      : undefined;

  const text = textBlocks.map((b) => b.text).join("\n") || undefined;

  const rawStop = data.stop_reason || "end_turn";
  const stopReason =
    rawStop === "tool_use" || rawStop === "end_turn" || rawStop === "max_tokens"
      ? rawStop
      : "end_turn";

  // Anthropic 在 top-level 回 usage（input_tokens / output_tokens）
  const usage =
    data.usage && typeof data.usage.input_tokens === "number"
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens ?? 0,
        }
      : undefined;

  return { text, toolCalls, stopReason, usage };
};
