import type { AgentId } from "../../types/agent";

// Router — 決定 user 訊息要交給哪個 agent
//
// 設計原則：
// 1. 關鍵字優先、但「當前 agent 能處理時優先留在原地」（避免頻繁切換）
// 2. 回傳 reason 供 UI 顯示 handoff 原因（透明感、可 debug）
// 3. 當前為 mock 實作；Phase 3 會改用小型 LLM 做 routing 或純 embedding 相似度
//
// 與 MockAdapter 的 intent 分類有點重疊，但責任不同：
// - Router 決定「誰來接」（agent 層級）
// - MockAdapter 決定「這個 agent 要做什麼」（tool 層級）

export interface RouteDecision {
  agentId: AgentId;
  reason: string;
  switched: boolean; // 是否為 handoff（而不是留在當前）
}

// 小管關鍵字：訂單／物流／會員／點數／運費
const XIAOGUAN_KEYWORDS = [
  "訂單",
  "物流",
  "出貨",
  "到貨",
  "追蹤",
  "退貨",
  "退款",
  "換貨",
  "運費",
  "寄送",
  "會員",
  "點數",
  "等級",
  "折抵",
];

// 小香關鍵字：香氛知識／香調／情境
const XIAOXIANG_KEYWORDS = [
  "香調",
  "前味",
  "中味",
  "後味",
  "留香",
  "木質",
  "柑橘",
  "花香",
  "東方調",
  "什麼是",
  "怎麼分",
  "差別",
  "差在哪",
  "為什麼",
  "介紹一下",
  "原理",
  "適合哪種場景",
  "搭配邏輯",
];

// 小禾關鍵字：購買／推薦
const XIAOHE_KEYWORDS = [
  "買",
  "加入購物車",
  "購物車",
  "推薦",
  "有什麼",
  "找",
  "多少錢",
  "價錢",
  "預算",
  "送禮",
  "送女友",
  "送男友",
  "結帳",
];

const countHits = (text: string, keywords: string[]): number => {
  let n = 0;
  for (const k of keywords) {
    if (text.includes(k)) n += 1;
  }
  return n;
};

export const routeMessage = (
  userText: string,
  currentAgentId: AgentId,
): RouteDecision => {
  const text = userText.trim();
  if (!text) {
    return {
      agentId: currentAgentId,
      reason: "空訊息，留在當前 agent",
      switched: false,
    };
  }

  const scores: Record<AgentId, number> = {
    xiaohe: countHits(text, XIAOHE_KEYWORDS),
    xiaoxiang: countHits(text, XIAOXIANG_KEYWORDS),
    xiaoguan: countHits(text, XIAOGUAN_KEYWORDS),
  };

  // 找出最高分的 agent
  let best: AgentId = currentAgentId;
  let bestScore = scores[currentAgentId];
  for (const id of ["xiaohe", "xiaoxiang", "xiaoguan"] as AgentId[]) {
    if (scores[id] > bestScore) {
      best = id;
      bestScore = scores[id];
    }
  }

  // 所有 agent 都 0 分 → 留在當前
  if (bestScore === 0) {
    return {
      agentId: currentAgentId,
      reason: "未偵測到明確意圖，留在當前 agent",
      switched: false,
    };
  }

  // 當前 agent 也有得分且跟最高分同分 → 留在當前（減少震盪）
  if (scores[currentAgentId] === bestScore && currentAgentId !== best) {
    return {
      agentId: currentAgentId,
      reason: "當前 agent 同樣適合，不切換",
      switched: false,
    };
  }

  if (best === currentAgentId) {
    return {
      agentId: currentAgentId,
      reason: `命中 ${currentAgentId} 關鍵字`,
      switched: false,
    };
  }

  // 不同 agent → handoff
  const reasonMap: Record<AgentId, string> = {
    xiaohe: "偵測到購買意圖，交給小禾",
    xiaoxiang: "偵測到香氛知識問題，交給小香",
    xiaoguan: "偵測到訂單／會員需求，交給小管",
  };
  return {
    agentId: best,
    reason: reasonMap[best],
    switched: true,
  };
};
