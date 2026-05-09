// Agent session id
//
// 每個瀏覽器 tab 一個 sessionId，用 sessionStorage 存。
// 關閉 tab → sessionId 消失 → 新 tab = 新 session（符合「一次購物行為」的直覺）。
//
// 為什麼不用 localStorage？
//   使用者在同一個瀏覽器開兩個 tab 可能在做兩件獨立的事——用 sessionStorage 這兩
//   個 session 會各自獨立，funnel 統計才不會被混在一起。
//
// 為什麼不用 uuid 套件？
//   Date.now + Math.random 對 analytics 事件夠用（碰撞率極低），少一個依賴。

const STORAGE_KEY = "enso-agent-session-id";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function getOrCreateSessionId(): string {
  if (!isBrowser()) {
    // SSR fallback：回傳一個暫時值（事件 logger 會 fire-and-forget，不會影響渲染）
    return `sess_ssr_${Date.now()}`;
  }
  const existing = sessionStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const fresh = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

export function resetSessionId(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}
