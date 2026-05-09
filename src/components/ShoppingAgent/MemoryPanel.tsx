import { useCallback, useEffect, useState } from "react";

import { AGENT_REGISTRY } from "../../services/agent";
import {
  clearProfile,
  deleteEntry,
  loadUserProfile,
} from "../../services/agent/memory";

import type { MemoryEntry, UserProfile } from "../../services/agent/memory";

interface MemoryPanelProps {
  onClose: () => void;
}

// MemoryPanel — 記憶總覽面板
//
// 使用情境：
//   買家點 ChatPanel header 的 🧠 icon 打開，可看到 agent 過去記了什麼偏好、也能刪。
//   對應 PalUp JD 要求的「記憶機制 + 可觀察／可管控」。
//
// 重要：所有讀寫都透過 memory.ts 的 helper（不直接碰 localStorage），
// 這樣之後要換成 server-side 會員記憶時，只要改 memory.ts 一處。

function formatTime(ts: number): string {
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function MemoryPanel({ onClose }: MemoryPanelProps): JSX.Element {
  const [profile, setProfile] = useState<UserProfile>(() => loadUserProfile());

  // 每次外部可能改動（adapter 存了新 entry）時，重新讀一次
  const refresh = useCallback(() => {
    setProfile(loadUserProfile());
  }, []);

  useEffect(() => {
    // 開啟面板時先刷新一次（以防 agent 剛寫入）
    refresh();
  }, [refresh]);

  const handleDelete = (id: string) => {
    deleteEntry(id);
    refresh();
  };

  const handleClearAll = () => {
    if (!profile.entries.length) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "要清空所有使用者記憶嗎？這會刪掉 agent 過去記下的所有偏好。",
      );
      if (!ok) return;
    }
    clearProfile();
    refresh();
  };

  const entries: MemoryEntry[] = [...profile.entries].sort(
    (a, b) => b.createdAt - a.createdAt,
  );

  return (
    <div className="sa-memory-overlay" role="dialog" aria-label="使用者記憶">
      <div className="sa-memory-panel">
        <div className="sa-memory-header">
          <div>
            <div className="sa-memory-title">
              <i className="bi bi-lightbulb" aria-hidden="true"></i>
              使用者記憶
            </div>
            <div className="sa-memory-subtitle">
              這些是 agent 過去記下的偏好，會跨 session 保留在你的瀏覽器中。
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sa-header-btn"
            aria-label="關閉記憶面板"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="sa-memory-body">
          {entries.length === 0 ? (
            <div className="sa-memory-empty">
              <div className="sa-memory-empty-icon" aria-hidden="true">
                🫧
              </div>
              <div className="sa-memory-empty-title">還沒有任何記憶</div>
              <div className="sa-memory-empty-hint">
                跟小禾／小香／小管聊聊你的偏好（情境、香調、預算、送禮對象），他們會自動記下來。
              </div>
            </div>
          ) : (
            <ul className="sa-memory-list">
              {entries.map((e) => {
                const persona = AGENT_REGISTRY[e.source];
                return (
                  <li key={e.id} className="sa-memory-item">
                    <div className="sa-memory-item-main">
                      <div className="sa-memory-item-key">{e.key}</div>
                      <div className="sa-memory-item-value">{e.value}</div>
                      <div className="sa-memory-item-meta">
                        <span
                          className={`sa-memory-item-source sa-agent-${persona?.themeClass ?? "xiaohe"}`}
                        >
                          <span aria-hidden="true">{persona?.avatar ?? "🧠"}</span>
                          {persona?.name ?? e.source}
                        </span>
                        <span className="sa-memory-item-time">
                          {formatTime(e.createdAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="sa-memory-item-delete"
                      aria-label={`刪除「${e.key}」`}
                      title="刪除這筆記憶"
                    >
                      <i className="bi bi-trash"></i>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="sa-memory-footer">
          <div className="sa-memory-privacy">
            <i className="bi bi-shield-lock" aria-hidden="true"></i>
            儲存在瀏覽器 localStorage，不會上傳到伺服器。
          </div>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="sa-memory-clear"
            >
              <i className="bi bi-trash3"></i>
              全部清除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default MemoryPanel;
