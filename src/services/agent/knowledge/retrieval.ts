// Retrieval — 給 RAG 用的 ranker
//
// 架構：retrieve(query, topK) → RetrievalHit[]。呼叫端只看介面，不管內部實作。
// 換成真 embedding 時（例如 @xenova/transformers 或 OpenAI embedding），
// 只要換這個檔的內部實作，tool executor 跟 prompt 不用動。
//
// MVP 實作：簡化版 BM25 風格 + 中英分詞 + tag boost。
// 為什麼不用真 embedding：
//   - Demo portable 優先，不想要 demo 機器下載 100MB+ 的模型
//   - Zero dependency、純 JS、離線可跑
//   - 中文文本用 bigram + unigram 兜著，效果對這種小知識庫夠用
//
// 中文分詞策略：
//   沒有中文斷詞器情況下，用「單字（unigram）+ 相鄰兩字（bigram）」混合，
//   對短 query 與短 passage 都有效、且能抓到「檀香」「沉香」這種 2-字詞。

import {
  KNOWLEDGE_PASSAGES,
  type KnowledgePassage,
} from "./passages";

export interface RetrievalHit {
  passage: KnowledgePassage;
  score: number;
  // 每個 hit 的短版預覽，給 LLM 看用（避免整段丟進 context 吃 token）
  preview: string;
}

// --- 分詞 ---
// 英文按空白與非字元切，中文拆 unigram + bigram。
// 會把結果 lower-case、去掉長度 < 1 的。
const tokenize = (text: string): string[] => {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // 先把英文／數字抽出來（連續 ascii 字元當一個 token）
  const englishMatches = lower.match(/[a-z0-9]+/g) ?? [];
  tokens.push(...englishMatches);

  // 把非英文當中文處理：unigram + bigram
  // 先移除英文部分避免重複
  const chineseOnly = lower.replace(/[a-z0-9\s\p{P}]/gu, "");
  for (let i = 0; i < chineseOnly.length; i += 1) {
    const ch = chineseOnly[i];
    if (ch && ch.trim()) tokens.push(ch);
    if (i + 1 < chineseOnly.length) {
      const bi = chineseOnly[i] + chineseOnly[i + 1];
      if (bi.trim().length === 2) tokens.push(bi);
    }
  }

  return tokens;
};

// --- BM25 風格 scoring（簡化版） ---
// 不做全語料 idf 計算（語料只有 15 段，意義不大），改用：
//   1. title / tags 命中有額外 weight
//   2. bigram 命中分數 > unigram（因為 bigram 訊號更強）
//   3. 長 passage 不會因為「字多自然命中多」而過度加分（長度正規化）

const TITLE_BOOST = 3;
const TAG_BOOST = 2;
const BIGRAM_WEIGHT = 2;
const UNIGRAM_WEIGHT = 1;

const scorePassage = (
  passage: KnowledgePassage,
  queryTokens: string[],
): number => {
  if (!queryTokens.length) return 0;

  const titleTokens = new Set(tokenize(passage.title));
  const tagTokens = new Set(
    passage.tags.flatMap((t) => tokenize(t)),
  );
  const contentTokens = tokenize(passage.content);
  const contentCount = new Map<string, number>();
  for (const t of contentTokens) {
    contentCount.set(t, (contentCount.get(t) ?? 0) + 1);
  }

  let score = 0;

  for (const q of queryTokens) {
    const weight = q.length >= 2 ? BIGRAM_WEIGHT : UNIGRAM_WEIGHT;

    // content 命中（取 log 避免超長 passage 暴衝）
    const freq = contentCount.get(q) ?? 0;
    if (freq > 0) score += weight * (1 + Math.log(freq));

    // title 命中
    if (titleTokens.has(q)) score += TITLE_BOOST * weight;

    // tag 命中（同義詞通常在 tag 裡）
    if (tagTokens.has(q)) score += TAG_BOOST * weight;
  }

  // 長度正規化：避免長 passage 命中多就被推高
  const len = passage.content.length;
  const lengthNorm = 1 / (1 + Math.log(1 + len / 200));
  return score * lengthNorm;
};

// 擷取包含 query token 的前後文片段當 preview（類似 snippet highlight）
// 找不到時 fallback 到 passage 開頭 120 字
const makePreview = (passage: KnowledgePassage, queryTokens: string[]): string => {
  const text = passage.content;
  for (const q of queryTokens) {
    if (q.length < 2) continue;
    const idx = text.indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + 90);
      const slice = text.slice(start, end);
      return (start > 0 ? "…" : "") + slice + (end < text.length ? "…" : "");
    }
  }
  return text.slice(0, 120) + (text.length > 120 ? "…" : "");
};

export interface RetrieveOptions {
  topK?: number;
  minScore?: number;
}

export const retrieve = (
  query: string,
  options: RetrieveOptions = {},
): RetrievalHit[] => {
  const topK = options.topK ?? 3;
  const minScore = options.minScore ?? 0.5;

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];

  const scored: RetrievalHit[] = KNOWLEDGE_PASSAGES.map((passage) => {
    const score = scorePassage(passage, queryTokens);
    return {
      passage,
      score,
      preview: makePreview(passage, queryTokens),
    };
  })
    .filter((hit) => hit.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
};

// 供 eval / debug 用，暴露 tokenizer 讓測試能檢查分詞行為
export const _internalsForTesting = { tokenize, scorePassage };
