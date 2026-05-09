import type {
  AgentId,
  AgentResponse,
  ChatMessage,
  ToolSchema,
} from "../../types/agent";

// Agent Adapter 介面
// 所有的 agent backend（Mock / Anthropic / OpenAI）都實作這個介面
// 這樣 useChatAgent hook 不需要知道後面是哪家的 API

// Phase 2：多 agent context
// 把當前 agent 資訊帶進 adapter 呼叫，Mock 實作可以依此切換個性；
// Anthropic 實作可以忽略（agent 資訊已經透過 systemPrompt/tools 傳達）。
export interface AgentCallContext {
  agentId: AgentId;
}

export interface AgentAdapter {
  readonly name: string; // 顯示用（"mock" / "claude-haiku-4.5"）

  /**
   * 送一輪對話給 LLM，回傳它的 response
   * @param messages 完整對話歷史（包含 user、assistant、tool results）
   * @param systemPrompt 系統 prompt（當前 agent 的）
   * @param tools 可用的 tools（當前 agent 的 subset）
   * @param context 當前 agent 身份等附加資訊
   */
  sendMessage(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ToolSchema[],
    context?: AgentCallContext,
  ): Promise<AgentResponse>;
}
