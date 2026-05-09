import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type {
  AgentId,
  AgentStatus,
  ChatMessage,
  HandoffMeta,
  ToolCall,
} from "../types/agent";
import {
  AGENT_REGISTRY,
  DEFAULT_AGENT_ID,
} from "../services/agent/agents";

// Agent conversation state
// Phase 2：新增 currentAgentId，支援多 agent handoff
// 放 Redux 的原因：
// 1. Chat widget 在 FrontendShell，跨 route 都在，對話不應該因為導航而消失
// 2. 之後 Phase 4 的 analytics dashboard 可以直接 subscribe 這裡
// 3. dev view 的 transparency panel 也要讀同樣的 state

interface AgentSliceState {
  isOpen: boolean;
  status: AgentStatus;
  messages: ChatMessage[];
  currentAgentId: AgentId;
  // 當前進行中的 tool call，用於 UI 顯示 "正在搜尋商品..."
  activeToolCall: ToolCall | null;
  error: string | null;
}

const buildInitialGreeting = (agentId: AgentId): ChatMessage => ({
  id: `greeting-${agentId}-0`,
  role: "assistant",
  agentId,
  text: AGENT_REGISTRY[agentId].greeting,
  createdAt: Date.now(),
});

const initialState: AgentSliceState = {
  isOpen: false,
  status: "idle",
  currentAgentId: DEFAULT_AGENT_ID,
  messages: [buildInitialGreeting(DEFAULT_AGENT_ID)],
  activeToolCall: null,
  error: null,
};

const agentSlice = createSlice({
  name: "agent",
  initialState,
  reducers: {
    toggleAgent: (state) => {
      state.isOpen = !state.isOpen;
    },
    openAgent: (state) => {
      state.isOpen = true;
    },
    closeAgent: (state) => {
      state.isOpen = false;
    },
    appendMessage: (state, action: PayloadAction<ChatMessage>) => {
      state.messages.push(action.payload);
    },
    setStatus: (state, action: PayloadAction<AgentStatus>) => {
      state.status = action.payload;
    },
    setActiveToolCall: (state, action: PayloadAction<ToolCall | null>) => {
      state.activeToolCall = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    // Phase 2：切換當前 agent + 自動插入 handoff system 訊息
    handoffToAgent: (
      state,
      action: PayloadAction<HandoffMeta>,
    ) => {
      const { from, to, reason } = action.payload;
      state.currentAgentId = to;
      state.messages.push({
        id: `handoff-${Date.now()}`,
        role: "system",
        text: `${AGENT_REGISTRY[from].name} → ${AGENT_REGISTRY[to].name}：${reason}`,
        handoff: { from, to, reason },
        createdAt: Date.now(),
      });
    },
    resetConversation: (state) => {
      state.currentAgentId = DEFAULT_AGENT_ID;
      state.messages = [buildInitialGreeting(DEFAULT_AGENT_ID)];
      state.status = "idle";
      state.activeToolCall = null;
      state.error = null;
    },
  },
});

export const {
  toggleAgent,
  openAgent,
  closeAgent,
  appendMessage,
  setStatus,
  setActiveToolCall,
  setError,
  handoffToAgent,
  resetConversation,
} = agentSlice.actions;

export default agentSlice.reducer;
