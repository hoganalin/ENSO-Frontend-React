import type { AgentAdapter } from "./adapter";
import { MockAgentAdapter } from "./mockAdapter";
import { AnthropicAdapter } from "./anthropicAdapter";

// Agent registry — 單一切換點（純 React 版）
//
// 兩種 provider：
//   - mock   ：離線 mock（預設）
//   - direct ：client 端直打 Anthropic API（VITE_ANTHROPIC_API_KEY，⚠️ key 會 bundle 到 client，只適合 local dev）
//
// 此版本拔除了 `server` provider（Next 版的 /api/agent route handler 在純 React SPA 不存在）。
// 切換方式：在 .env.local 設 VITE_AGENT_PROVIDER=mock | direct
// 未設置時 fallback → mock。

const getAdapter = (): AgentAdapter => {
  const forced = import.meta.env.VITE_AGENT_PROVIDER?.toLowerCase();

  if (forced === "direct" || forced === "anthropic") {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn(
        "[agent] VITE_AGENT_PROVIDER=direct 但找不到 VITE_ANTHROPIC_API_KEY，fallback 回 Mock",
      );
      return new MockAgentAdapter();
    }
    console.warn(
      "[agent] ⚠️ 使用 direct mode：API key 會被 bundle 到 client，僅限 local dev，不要部署到 production",
    );
    return new AnthropicAdapter(apiKey);
  }

  return new MockAgentAdapter();
};

let _adapter: AgentAdapter | null = null;
export const getAgentAdapter = (): AgentAdapter => {
  if (!_adapter) _adapter = getAdapter();
  return _adapter;
};

export { AGENT_TOOLS } from "./tools";
export { SHOPPING_AGENT_SYSTEM_PROMPT } from "./systemPrompt";
export { executeToolCall } from "./toolExecutor";
export { routeMessage, type RouteDecision } from "./router";
export {
  AGENT_REGISTRY,
  DEFAULT_AGENT_ID,
  ALL_AGENT_IDS,
  getAgent,
  getToolsForAgent,
} from "./agents";
export type { AgentAdapter, AgentCallContext } from "./adapter";
