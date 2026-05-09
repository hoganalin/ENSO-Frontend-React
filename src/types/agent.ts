// Shopping Agent 對話與 tool 呼叫的型別定義
// 設計原則：對齊 Anthropic Messages API 的結構，未來切換真 API 時幾乎不用改

// Phase 2：Multi-agent handoff
// AgentRole 新增 "system" → 用來表示 router 插入的 handoff 提示（不送給 LLM）
export type AgentRole = "user" | "assistant" | "tool" | "system";

export type AgentStatus = "idle" | "thinking" | "calling_tool" | "error";

// Phase 2：Agent 身份識別
// xiaohe: 購物（推薦、加購、購物車）
// xiaoxiang: 香氛知識專家（香調、情境、產品故事）
// xiaoguan: 訂單與會員
export type AgentId = "xiaohe" | "xiaoxiang" | "xiaoguan";

// 對應 Anthropic tool_use block
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// 對應 Anthropic tool_result block
export interface ToolResult {
  tool_use_id: string;
  content: string; // JSON string 或自然語言結果
  is_error?: boolean;
}

// Phase 2：handoff metadata（放在 system message 上）
export interface HandoffMeta {
  from: AgentId;
  to: AgentId;
  reason: string;
}

// 一則訊息 = 可能是純文字，也可能帶 tool_call
export interface ChatMessage {
  id: string;
  role: AgentRole;
  text?: string;
  // Phase 2：assistant 訊息標記是哪個 agent 回的；user/system/tool 可省略
  agentId?: AgentId;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  handoff?: HandoffMeta;
  createdAt: number;
}

// Anthropic API usage metrics（token 計費用）
// Mock adapter 會用字數估算的 fake usage，真 Claude 會回 input_tokens/output_tokens
export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
}

// Agent 一輪回應（可能要求呼叫多個 tool，或直接給出文字）
export interface AgentResponse {
  text?: string;
  toolCalls?: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "error";
  usage?: AgentUsage;
}

// Tool schema（對齊 Anthropic 格式）
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

// Phase 2：Agent persona 設定
export interface AgentPersona {
  id: AgentId;
  name: string; // 顯示名：小禾／小香／小管
  shortTitle: string; // 副標：購物助理 / 香氛專家 / 會員管家
  avatar: string; // emoji
  themeClass: string; // CSS class 後綴：xiaohe / xiaoxiang / xiaoguan
  systemPrompt: string;
  toolNames: string[]; // 這個 agent 允許呼叫的 tool 子集
  greeting: string; // 初次見面的招呼
  handoffTargets: AgentId[]; // 能轉交給誰
}
