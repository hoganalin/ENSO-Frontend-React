// Memory — 跨 session 的使用者偏好記憶
//
// 設計理念：
//   Agent 在對話中主動辨識使用者偏好（例如「我想要助眠的」「預算 2000 以下」「喜歡木質調」），
//   透過 save_user_preference tool 寫入 localStorage。下次使用者進來任何 agent（小禾 / 小香 / 小管）
//   都可以在 systemPrompt 裡看到這份記憶，做出更個人化的推薦。
//
// 三個 buyer agent 共用同一份 userProfile（商家端 xiaodian 不共用，因為那是不同使用者）。
// SSR 安全（server render 時沒 window，回傳空 profile）。
//
// localStorage key: 'enso-user-profile-v1'
//   未來要重構或清資料時直接改 v2 就能切換；v1 自然作廢。
//
// 對外 API：
//   loadUserProfile() → UserProfile
//   saveEntry({ key, value, source }) → MemoryEntry（帶回新增的 entry，含 id/createdAt）
//   deleteEntry(id) → void
//   clearProfile() → void
//   formatForPrompt(profile) → string （注入 systemPrompt 用的 markdown；沒內容時回空字串）

import type { AgentId } from "@/types/agent";

// 一筆記憶 = 一對 key/value + 出處
// key 是「偏好類別」，value 是「具體內容」，source 是哪個 agent 記下來的。
// 例：{ key: "情境偏好", value: "想要助眠、放鬆", source: "xiaohe" }
// 例：{ key: "預算", value: "2000 以內", source: "xiaohe" }
// 例：{ key: "香調偏好", value: "偏好木質、不喜歡太甜", source: "xiaoxiang" }
export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  source: AgentId;
  createdAt: number;
}

export interface UserProfile {
  entries: MemoryEntry[];
  updatedAt: number;
}

const STORAGE_KEY = "enso-user-profile-v1";

const EMPTY_PROFILE: UserProfile = { entries: [], updatedAt: 0 };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function makeId(): string {
  // 不需要 crypto 等級；時間 + 隨機就夠區分同一次 tick 的多筆
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 讀取目前儲存的 userProfile。SSR / localStorage 不可用 / JSON 壞掉都回空 profile。
 */
export function loadUserProfile(): UserProfile {
  if (!isBrowser()) return { ...EMPTY_PROFILE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_PROFILE };
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    if (!parsed || !Array.isArray(parsed.entries)) return { ...EMPTY_PROFILE };
    // 防壞資料：過濾掉 shape 不對的
    const entries: MemoryEntry[] = parsed.entries.filter(
      (e): e is MemoryEntry =>
        !!e &&
        typeof (e as MemoryEntry).id === "string" &&
        typeof (e as MemoryEntry).key === "string" &&
        typeof (e as MemoryEntry).value === "string" &&
        typeof (e as MemoryEntry).source === "string" &&
        typeof (e as MemoryEntry).createdAt === "number",
    );
    return {
      entries,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return { ...EMPTY_PROFILE };
  }
}

function writeProfile(profile: UserProfile): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // quota exceeded / 隱私模式：靜默失敗，避免 agent loop 崩
  }
}

/**
 * 新增一筆 memory entry。同 key 的舊資料會被覆蓋（保留最新偏好），不同 key 則累積。
 *
 * 例如使用者一開始說「想要助眠」後來改口「想要提神」，
 * 同 key "情境偏好" 會用新的值蓋掉，避免 agent 看到矛盾資訊。
 */
export function saveEntry(
  entry: Omit<MemoryEntry, "id" | "createdAt">,
): MemoryEntry {
  const profile = loadUserProfile();
  const now = Date.now();
  const nextEntry: MemoryEntry = {
    id: makeId(),
    createdAt: now,
    ...entry,
  };

  // 同 key 覆蓋：移除所有同 key 舊 entry，只留這次新的
  const filtered = profile.entries.filter((e) => e.key !== entry.key);
  const next: UserProfile = {
    entries: [...filtered, nextEntry],
    updatedAt: now,
  };
  writeProfile(next);
  return nextEntry;
}

export function deleteEntry(id: string): void {
  const profile = loadUserProfile();
  const next: UserProfile = {
    entries: profile.entries.filter((e) => e.id !== id),
    updatedAt: Date.now(),
  };
  writeProfile(next);
}

export function clearProfile(): void {
  writeProfile({ entries: [], updatedAt: Date.now() });
}

/**
 * 把 profile 轉成要注入 systemPrompt 的 markdown 片段。
 *
 * 沒任何 entry → 回空字串（useChatAgent 會判斷為空就不 inject，避免白白吃 token）。
 *
 * 輸出範例：
 *   ## 關於這位使用者（記憶）
 *   - 情境偏好：想要助眠、放鬆（來自 小禾 對話）
 *   - 預算：2000 以內（來自 小禾 對話）
 *   - 香調偏好：偏好木質、不喜歡太甜（來自 小香 對話）
 *
 *   請自然地參考這些偏好做推薦，不要每句話都引用。若本次對話發現新偏好或舊偏好已改變，請用 save_user_preference 更新。
 */
export function formatForPrompt(profile: UserProfile): string {
  if (!profile.entries.length) return "";

  const agentLabel: Record<AgentId, string> = {
    xiaohe: "小禾",
    xiaoxiang: "小香",
    xiaoguan: "小管",
  };

  // 依 createdAt 遞增排，讓最早記下的在前面，較穩定
  const sorted = [...profile.entries].sort((a, b) => a.createdAt - b.createdAt);
  const lines = sorted.map(
    (e) => `- ${e.key}：${e.value}（來自 ${agentLabel[e.source] ?? e.source} 對話）`,
  );

  return [
    "## 關於這位使用者（記憶）",
    ...lines,
    "",
    "請自然地參考這些偏好做推薦，不要每句話都引用。若本次對話發現新偏好或舊偏好已改變，請用 save_user_preference 更新。",
  ].join("\n");
}
