// Candidate Case — 待審查的 regression test case 提案
//
// 來源：後台 Live Trace 的「加進 regression」按鈕。運營看到一個 agent 表現有趣
// 或出錯的對話，就把它 promote 成候選 case，由 engineer 審查後 export 成
// TS snippet 加進 testCases.ts。
//
// 不是直接寫到 testCases 是為了保留人工確認環節：
//   - 同一個 user 可能問了很多次類似的問題，不能都加進去
//   - 「預期的行為」需要人寫，不能自動產
//
// 儲存：data/candidate-cases.json（跟 agent-events.json 一樣，demo scale 單檔）

export interface CandidateCase {
  /** cand_<timestamp>_<rand> — 前台自行產，避免 backend 依賴 uuid 庫 */
  id: string;
  /** ISO timestamp — 被提案的時間（不是原事件的時間） */
  createdAt: string;
  /** 提案來源：從 live trace promote 還是手動輸入 */
  source: "live_trace" | "manual";
  /** 若 source = live_trace，指向原 event 的 timestamp，方便回查 */
  sourceEventTimestamp?: string;
  /** 哪個 agent 的對話 */
  agentId: "xiaohe" | "xiaoxiang" | "xiaoguan" | "xiaodian";
  /** 原 user message（不可編輯，保留原樣才有 regression 意義） */
  userMessage: string;
  /** 原 assistant 的回覆（回顧用；不會被 export） */
  assistantText?: string;
  /** 人工填入：這個 case 期待 agent 怎麼表現 */
  expectedBehavior: string;
  /** 人工填入：為什麼這 case 值得納入 regression */
  why: string;
  /** 分類 tags，例如 ['handoff', 'memory', 'tool_use'] */
  tags: string[];
  /** 審查狀態 */
  status: "proposed" | "approved" | "exported" | "archived";
}
