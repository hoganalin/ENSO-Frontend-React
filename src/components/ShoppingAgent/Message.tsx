import { AGENT_REGISTRY } from "../../services/agent";
import type { ChatMessage } from "../../types/agent";

// 單則訊息渲染
// Phase 2 新增：
// - assistant 訊息顯示對應 agent 的頭像 + 姓名（配色透過 theme class）
// - system role 訊息 → 呈現 handoff 提示條

interface MessageProps {
  message: ChatMessage;
  showToolCalls?: boolean;
}

// 支援簡易 markdown (**粗體** 與換行)
const renderText = (text: string) => {
  // 先處理 \n → <br/>，再處理粗體
  return text.split("\n").map((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={li} className="sa-line">
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  });
};

function Message({
  message,
  showToolCalls = true,
}: MessageProps): JSX.Element | null {
  if (message.role === "user") {
    return (
      <div className="sa-msg sa-msg-user">
        <div className="sa-bubble">{message.text}</div>
      </div>
    );
  }

  if (message.role === "system" && message.handoff) {
    const from = AGENT_REGISTRY[message.handoff.from];
    const to = AGENT_REGISTRY[message.handoff.to];
    return (
      <div className="sa-handoff">
        <span className={`sa-handoff-chip sa-agent-${from.themeClass}`}>
          <span>{from.avatar}</span>
          {from.name}
        </span>
        <i className="bi bi-arrow-right-short sa-handoff-arrow" aria-hidden="true"></i>
        <span className={`sa-handoff-chip sa-agent-${to.themeClass}`}>
          <span>{to.avatar}</span>
          {to.name}
        </span>
        <span className="sa-handoff-reason">{message.handoff.reason}</span>
      </div>
    );
  }

  if (message.role === "assistant") {
    const agentId = message.agentId ?? "xiaohe";
    const persona = AGENT_REGISTRY[agentId];
    return (
      <div className={`sa-msg sa-msg-assistant sa-agent-${persona.themeClass}`}>
        <div className="sa-msg-avatar" aria-hidden="true">
          {persona.avatar}
        </div>
        <div className="sa-msg-stack">
          <div className="sa-msg-name">{persona.name}</div>
          {message.text && (
            <div className="sa-bubble">{renderText(message.text)}</div>
          )}
          {showToolCalls &&
            message.toolCalls?.map((tc) => (
              <span key={tc.id} className="sa-tool-badge">
                <i className="bi bi-tools"></i>
                {tc.name}
              </span>
            ))}
        </div>
      </div>
    );
  }

  if (message.role === "tool") {
    if (!showToolCalls) return null;
    return (
      <div className="sa-tool-done">
        <i className="bi bi-check2 me-1"></i>
        工具執行完成
      </div>
    );
  }

  return null;
}

export default Message;
