import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { closeAgent, resetConversation } from "../../slice/agentSlice";
import { useChatAgent } from "../../hooks/useChatAgent";
import Message from "./Message";
import MemoryPanel from "./MemoryPanel";
import {
  AGENT_REGISTRY,
  ALL_AGENT_IDS,
  getAgentAdapter,
} from "../../services/agent";
import { loadUserProfile } from "../../services/agent/memory";

import type { RootState } from "../../store/store";

// Quick prompts 依不同情境設計，凸顯三個 agent 都跑得起來
const QUICK_PROMPTS = [
  "送女友生日禮物，預算 800",
  "木質調是什麼？適合哪些場合",
  "我的訂單 ORD-20260418-A1 到哪了",
];

function ChatPanel(): JSX.Element {
  const dispatch = useDispatch();
  const messages = useSelector((state: RootState) => state.agent.messages);
  const status = useSelector((state: RootState) => state.agent.status);
  const activeToolCall = useSelector(
    (state: RootState) => state.agent.activeToolCall,
  );
  const currentAgentId = useSelector(
    (state: RootState) => state.agent.currentAgentId,
  );
  const { send } = useChatAgent();

  const [input, setInput] = useState("");
  const [adapterName, setAdapterName] = useState("mock");
  const [showMemory, setShowMemory] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAdapterName(getAgentAdapter().name);
  }, []);

  // 計算 memory 數量：
  // 1. 首次掛載讀一次
  // 2. 每次訊息列表變動後重讀（agent 剛 save_user_preference 完成）
  // 3. 關閉 MemoryPanel 後重讀（使用者可能刪了）
  useEffect(() => {
    setMemoryCount(loadUserProfile().entries.length);
  }, [messages, showMemory]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, activeToolCall]);

  const isBusy = status === "thinking" || status === "calling_tool";
  const currentPersona = AGENT_REGISTRY[currentAgentId];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    const text = input;
    setInput("");
    send(text);
  };

  const handleQuickPrompt = (text: string) => {
    if (isBusy) return;
    send(text);
  };

  const statusLabel =
    status === "thinking"
      ? `${currentPersona.name} 思考中...`
      : status === "calling_tool" && activeToolCall
        ? `正在呼叫 ${activeToolCall.name}...`
        : null;

  return (
    <div className={`sa-panel sa-panel-${currentPersona.themeClass}`}>
      {/* Header */}
      <div className="sa-panel-header">
        <div className="sa-header-left">
          <div className={`sa-avatar sa-agent-${currentPersona.themeClass}`}>
            {currentPersona.avatar}
          </div>
          <div>
            <div className="sa-agent-name">
              {currentPersona.name}
              <span className="sa-agent-role">｜{currentPersona.shortTitle}</span>
            </div>
            <div className="sa-adapter-label">{adapterName}</div>
          </div>
        </div>
        <div className="d-flex align-items-center gap-1">
          <button
            type="button"
            onClick={() => setShowMemory(true)}
            className="sa-header-btn sa-header-btn-memory"
            aria-label={`查看使用者記憶（${memoryCount} 筆）`}
            title="使用者記憶"
          >
            <i className="bi bi-lightbulb"></i>
            {memoryCount > 0 && (
              <span className="sa-memory-badge" aria-hidden="true">
                {memoryCount > 9 ? "9+" : memoryCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => dispatch(resetConversation())}
            className="sa-header-btn"
            aria-label="重新開始對話"
            title="重新開始對話"
          >
            <i className="bi bi-arrow-counterclockwise"></i>
          </button>
          <button
            type="button"
            onClick={() => dispatch(closeAgent())}
            className="sa-header-btn"
            aria-label="關閉"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      </div>

      {/* Agent tabs */}
      <div className="sa-agent-tabs">
        {ALL_AGENT_IDS.map((id) => {
          const p = AGENT_REGISTRY[id];
          const active = id === currentAgentId;
          return (
            <div
              key={id}
              className={`sa-agent-tab sa-agent-${p.themeClass} ${active ? "is-active" : ""}`}
              aria-current={active ? "true" : undefined}
              title={p.shortTitle}
            >
              <span aria-hidden="true">{p.avatar}</span>
              {p.name}
            </div>
          );
        })}
      </div>

      {/* Messages */}
      <div ref={listRef} className="sa-message-list">
        {messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}

        {statusLabel && (
          <div className={`sa-msg sa-msg-assistant sa-agent-${currentPersona.themeClass}`}>
            <div className="sa-msg-avatar" aria-hidden="true">
              {currentPersona.avatar}
            </div>
            <div className="sa-msg-stack">
              <div className="sa-typing">
                <span className="sa-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                {statusLabel}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Prompts (只在對話初期顯示) */}
      {messages.length <= 1 && !isBusy && (
        <div className="sa-quick-prompts">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleQuickPrompt(p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="sa-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={`跟${currentPersona.name}說...`}
          rows={1}
          disabled={isBusy}
        />
        <button
          type="submit"
          disabled={!input.trim() || isBusy}
          className="sa-send-btn"
          aria-label="送出"
        >
          <i className="bi bi-send-fill"></i>
        </button>
      </form>

      {showMemory && <MemoryPanel onClose={() => setShowMemory(false)} />}
    </div>
  );
}

export default ChatPanel;
