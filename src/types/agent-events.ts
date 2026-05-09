// Cross-repo Agent Event schema
//
// 設計原則：
// - 單一 event stream，用 kind 區分類型（避免多張表跨 repo 同步的複雜度）
// - 所有指標（24h 對話量、handoff 次數、eval pass rate、intent 分佈）都應該能靠
//   event stream 的 filter + aggregate 算出來，不要冗餘欄位
// - Backend (Vite) 只透過 GET /api/events 讀，不持有 state
//
// 消費端：
// - Next.js useChatAgent（寫入 conversation_turn + handoff）
// - Next.js /playground/eval（寫入 eval_run）
// - Vite ENSO-BackEnd /admin/agent（讀取所有類型）

import type { AgentId, ToolCall } from "./agent";

export interface ConversationTurnEvent {
  kind: "conversation_turn";
  timestamp: string; // ISO 8601
  agentId: AgentId;
  userMessage: string;
  assistantText: string;
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  latencyMs: number;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  stopReason?: string;
  // intent 欄位留給未來 classifier（目前 null，前端用 keyword rule 分類）
  intent?: string | null;
  // Phase F: 讓 funnel 能把同一個使用者的多個對話 → 加購物車 → 下單串起來
  // optional 是為了 backward compat（先前已存在的事件沒這欄）
  sessionId?: string;
}

export interface HandoffEvent {
  kind: "handoff";
  timestamp: string;
  from: AgentId;
  to: AgentId;
  reason: string;
  sessionId?: string;
}

// Phase F: 商業成果 funnel 事件
//
// tool_converted 只在 add_to_cart 成功時發一次（使用者真的對 agent 推薦有所行動）。
// order_placed 只在 checkout 成功時發一次。
// 兩個事件都帶 sessionId 才能跟 conversation_turn 串起來計算轉換率。
//
// 設計選擇：為何不把 add_to_cart 直接從 conversation_turn 的 toolCalls 推回？
// — 因為 tool_use 可能失敗（例如庫存不足），agent 仍會「呼叫」但實際沒加到車。
//   我們只對 executor 回報 success 時記 tool_converted，這樣 funnel 數字才可信。

export interface ToolConvertedEvent {
  kind: "tool_converted";
  timestamp: string;
  sessionId: string;
  agentId: AgentId;
  toolName: string; // add_to_cart / remove_from_cart
  productId?: string;
  productTitle?: string;
  qty?: number;
}

export interface OrderPlacedEvent {
  kind: "order_placed";
  timestamp: string;
  sessionId: string;
  orderId: string;
  total: number;
  itemCount: number;
}

export interface EvalFailedCaseSummary {
  id: string;
  title: string;
  reason: string; // 第一個失敗 check 的 reason
  category?: string; // happy-path / handoff / safety / edge-case
}

export interface EvalRunEvent {
  kind: "eval_run";
  timestamp: string;
  agentId: AgentId;
  passRate: number; // 0–1
  total: number;
  passed: number;
  failed: number;
  errored: number;
  failedCases: EvalFailedCaseSummary[];
  systemPromptSnippet: string; // 前 200 字，讓 dashboard 能顯示「這次改了什麼」的 hint
  adapterName: string; // Mock / Anthropic / Server Anthropic
}

export type AgentEvent =
  | ConversationTurnEvent
  | HandoffEvent
  | EvalRunEvent
  | ToolConvertedEvent
  | OrderPlacedEvent;

// Helper：方便 conversation_turn 的寫入端 assemble
export type ToolCallSnapshot = Pick<ToolCall, "name" | "input">;
