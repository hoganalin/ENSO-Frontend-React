// Cross-repo Agent Event logger — pure-React no-op stub
//
// 純 React 版本沒有 /api/events route handler（Next 版才有）。
// 為了不破壞所有呼叫端，這裡保留同樣的 export 簽名，但實作改為 console.debug only。
// 若日後接後端，再把 _post 換回 fetch("/api/events", ...) 即可。

import type {
  AgentEvent,
  EvalFailedCaseSummary,
  ToolCallSnapshot,
} from "../../types/agent-events";
import type { AgentId } from "../../types/agent";

function _post(event: AgentEvent): void {
  if (import.meta.env.DEV) {
    console.debug("[eventLogger:noop]", event.kind, event);
  }
}

export function logConversationTurn(args: {
  agentId: AgentId;
  userMessage: string;
  assistantText: string;
  toolCalls: ToolCallSnapshot[];
  latencyMs: number;
  tokenUsage?: { inputTokens: number; outputTokens: number };
  stopReason?: string;
  sessionId?: string;
}): void {
  _post({
    kind: "conversation_turn",
    timestamp: new Date().toISOString(),
    intent: null,
    ...args,
  });
}

export function logHandoff(args: {
  from: AgentId;
  to: AgentId;
  reason: string;
  sessionId?: string;
}): void {
  _post({ kind: "handoff", timestamp: new Date().toISOString(), ...args });
}

export function logToolConverted(args: {
  sessionId: string;
  agentId: AgentId;
  toolName: string;
  productId?: string;
  productTitle?: string;
  qty?: number;
}): void {
  _post({ kind: "tool_converted", timestamp: new Date().toISOString(), ...args });
}

export function logOrderPlaced(args: {
  sessionId: string;
  orderId: string;
  total: number;
  itemCount: number;
}): void {
  _post({ kind: "order_placed", timestamp: new Date().toISOString(), ...args });
}

export function logEvalRun(args: {
  agentId: AgentId;
  passRate: number;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  failedCases: EvalFailedCaseSummary[];
  systemPromptSnippet: string;
  adapterName: string;
}): void {
  _post({ kind: "eval_run", timestamp: new Date().toISOString(), ...args });
}
