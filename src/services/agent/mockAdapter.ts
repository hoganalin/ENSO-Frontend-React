import type { AgentAdapter, AgentCallContext } from "./adapter";
import type {
  AgentId,
  AgentResponse,
  ChatMessage,
  ToolCall,
  ToolSchema,
} from "../../types/agent";
import { DEFAULT_AGENT_ID } from "./agents";

// Mock Agent Adapter — Phase 2：多 agent 版本
//
// 依 context.agentId 切換成不同 persona 的 mock 邏輯：
// - xiaohe：購物流程（保留 Phase 1 行為）
// - xiaoxiang：香氛知識查詢、情境建議
// - xiaoguan：訂單、會員、運費
//
// 這個 mock 會 emit 真的 tool calls，所以所有 UI / state / tool loop 都是真的會動的。

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const uid = () => `toolu_${Math.random().toString(36).slice(2, 10)}`;

// ============================================================
// 共用：從歷史訊息找上次展示的商品（小禾 add_to_cart 會用）
// ============================================================
interface ShownProduct {
  id: string;
  title: string;
  price: number;
}

const findLastShownProducts = (messages: ChatMessage[]): ShownProduct[] => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "tool" && m.toolResults) {
      for (const r of m.toolResults) {
        try {
          const parsed = JSON.parse(r.content);
          if (parsed.products && Array.isArray(parsed.products)) {
            return parsed.products.map(
              (p: { id: string; title: string; price: number }) => ({
                id: p.id,
                title: p.title,
                price: p.price,
              }),
            );
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return [];
};

const extractNumber = (text: string): number | undefined => {
  const m = text.match(/(\d{2,5})\s*(?:元|塊|dollar|nt|台幣)?/);
  return m ? Number(m[1]) : undefined;
};

const extractOrdinal = (text: string): number | undefined => {
  const map: Record<string, number> = {
    第一: 0,
    第二: 1,
    第三: 2,
    第四: 3,
    第五: 4,
    "1": 0,
    "2": 1,
    "3": 2,
    "4": 3,
    "5": 4,
  };
  for (const k of Object.keys(map)) {
    if (text.includes(k)) return map[k];
  }
  return undefined;
};

const extractOrderId = (text: string): string | undefined => {
  const m = text.match(/ORD-\d{4,8}-[A-Z0-9]+/i);
  return m?.[0]?.toUpperCase();
};

// 找最近的 tool_call name（給 narrateToolResult 用）
const findToolNameForResult = (
  messages: ChatMessage[],
  toolUseId: string,
): string => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const call = m.toolCalls?.find((c) => c.id === toolUseId);
    if (call) return call.name;
  }
  return "";
};

// ============================================================
// 小禾 — 購物 agent
// ============================================================
const GREET_KEYWORDS = ["你好", "hi", "hello", "哈囉", "嗨"];
const CART_VIEW_KEYWORDS = ["購物車", "買了什麼", "結帳多少"];
const REMOVE_KEYWORDS = ["移除", "取消", "不要了", "刪掉"];
const PURCHASE_KEYWORDS = [
  "加購",
  "加入購物車",
  "我要買",
  "買這個",
  "就選",
  "選這個",
  "要這個",
  "就這個",
];
const SEMANTIC_KEYWORDS = [
  "送禮",
  "送女友",
  "送男友",
  "生日",
  "放鬆",
  "助眠",
  "療癒",
  "提神",
  "浪漫",
  "約會",
  "氣氛",
  "情境",
];
const SEARCH_KEYWORDS = ["找", "推薦", "有什麼", "搜尋", "看看", "介紹"];

const xiaoheHandleUser = (
  text: string,
  messages: ChatMessage[],
): AgentResponse => {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (GREET_KEYWORDS.some((k) => lower.includes(k.toLowerCase())) && t.length < 15) {
    return {
      text: "嗨嗨！想找什麼氛圍的香？放鬆、冥想、淨化、復甦四個系列都有，跟我說「想要什麼感覺的氣氛」，我幫你挑 🌿",
      stopReason: "end_turn",
    };
  }

  if (CART_VIEW_KEYWORDS.some((k) => t.includes(k))) {
    return {
      toolCalls: [{ id: uid(), name: "get_cart", input: {} }],
      stopReason: "tool_use",
    };
  }

  if (REMOVE_KEYWORDS.some((k) => t.includes(k))) {
    return {
      toolCalls: [{ id: uid(), name: "get_cart", input: {} }],
      stopReason: "tool_use",
    };
  }

  if (PURCHASE_KEYWORDS.some((k) => t.includes(k))) {
    const shown = findLastShownProducts(messages);
    const ordinal = extractOrdinal(t) ?? 0;
    const target = shown[ordinal];
    if (!target) {
      return {
        text: "欸我還沒推薦過商品耶，要不要先跟我說你想找什麼？",
        stopReason: "end_turn",
      };
    }
    return {
      toolCalls: [
        {
          id: uid(),
          name: "add_to_cart",
          input: { product_id: target.id, qty: 1 },
        },
      ],
      stopReason: "tool_use",
    };
  }

  if (SEMANTIC_KEYWORDS.some((k) => t.includes(k))) {
    return {
      toolCalls: [
        {
          id: uid(),
          name: "semantic_search_products",
          input: { description: t, max_price: extractNumber(t) },
        },
      ],
      stopReason: "tool_use",
    };
  }

  if (SEARCH_KEYWORDS.some((k) => t.includes(k))) {
    return {
      toolCalls: [
        {
          id: uid(),
          name: "search_products",
          input: { query: t, max_price: extractNumber(t) },
        },
      ],
      stopReason: "tool_use",
    };
  }

  if (t.length < 8) {
    return {
      text: "想幫你找得更準一點——是送禮還是自用？喜歡清新還是沉穩的氣味？",
      stopReason: "end_turn",
    };
  }

  return {
    toolCalls: [
      {
        id: uid(),
        name: "semantic_search_products",
        input: { description: t, max_price: extractNumber(t) },
      },
    ],
    stopReason: "tool_use",
  };
};

const xiaoheNarrate = (messages: ChatMessage[]): string => {
  const last = messages[messages.length - 1];
  if (last.role !== "tool" || !last.toolResults?.[0]) return "好，接下來呢？";
  const r = last.toolResults[0];
  if (r.is_error) return "抱歉，我這邊查詢卡住了，換個說法再試試？";

  const toolName = findToolNameForResult(messages, r.tool_use_id);
  try {
    const data = JSON.parse(r.content);

    if (toolName === "search_products" || toolName === "semantic_search_products") {
      const products = data.products || [];
      if (products.length === 0)
        return "這邊目前沒有完全符合的商品耶，要不要提高預算或換個情境描述？";
      const lines = products.slice(0, 3).map(
        (p: { title: string; price: number; top_smell?: string; description?: string }, idx: number) => {
          const pitch = p.top_smell ? `前味 ${p.top_smell}` : (p.description || "").slice(0, 20);
          return `${idx + 1}. **${p.title}** — NT$${p.price}${pitch ? `｜${pitch}` : ""}`;
        },
      );
      return `我挑了幾個：\n\n${lines.join("\n")}\n\n想看哪一個的細節，或直接加入購物車？`;
    }

    if (toolName === "add_to_cart") return "好了！已經幫你加進購物車。還要繼續逛，還是看購物車？";

    if (toolName === "get_cart") {
      const items = data.items || [];
      if (items.length === 0) return "購物車還是空的喔。要我推薦一些給你嗎？";
      const lines = items.map(
        (it: { title: string; qty: number; subtotal: number }) =>
          `• ${it.title} × ${it.qty}（NT$${it.subtotal}）`,
      );
      return `目前購物車：\n${lines.join("\n")}\n\n小計 NT$${data.final_total}。`;
    }

    if (toolName === "remove_from_cart") return "OK，已經幫你移除了。還有要調整的嗎？";
    if (toolName === "get_product_details")
      return `${data.title}：${data.description}\n\n前味 ${data.top_smell}／中味 ${data.heart_smell}／後味 ${data.base_smell}。NT$${data.price}，要加入購物車嗎？`;
  } catch {
    // ignore
  }
  return "好的，處理完了。接下來呢？";
};

// ============================================================
// 小香 — 香氛知識 agent
// ============================================================
const KNOWLEDGE_TOPIC_KEYWORDS = [
  "柑橘",
  "花香",
  "木質",
  "東方",
  "前味",
  "中味",
  "後味",
  "留香",
  "香調",
];
const SCENE_KEYWORDS = [
  "睡前",
  "助眠",
  "工作",
  "約會",
  "雨天",
  "瑜伽",
  "冥想",
  "下班",
  "讀書",
];

const xiaoxiangHandleUser = (text: string): AgentResponse => {
  const t = text.trim();

  // 優先：命中情境 → recommend_by_scene
  const sceneHit = SCENE_KEYWORDS.find((k) => t.includes(k));
  if (sceneHit) {
    return {
      toolCalls: [
        { id: uid(), name: "recommend_by_scene", input: { scene: sceneHit } },
      ],
      stopReason: "tool_use",
    };
  }

  // 命中知識庫主題
  const topicHit = KNOWLEDGE_TOPIC_KEYWORDS.find((k) => t.includes(k));
  if (topicHit) {
    return {
      toolCalls: [
        { id: uid(), name: "get_fragrance_knowledge", input: { topic: topicHit } },
      ],
      stopReason: "tool_use",
    };
  }

  if (t.length < 6) {
    return {
      text: "想知道哪個香調，或是哪個情境的搭配邏輯？可以丟給我一個關鍵字，例如「木質調」「睡前」。",
      stopReason: "end_turn",
    };
  }

  // 其他訊息用語意搜尋商品（小香也有這個 tool）
  return {
    toolCalls: [
      {
        id: uid(),
        name: "semantic_search_products",
        input: { description: t },
      },
    ],
    stopReason: "tool_use",
  };
};

const xiaoxiangNarrate = (messages: ChatMessage[]): string => {
  const last = messages[messages.length - 1];
  if (last.role !== "tool" || !last.toolResults?.[0]) return "還有想了解的嗎？";
  const r = last.toolResults[0];
  if (r.is_error) return "這題我這邊資料不夠，換個角度問？";

  const toolName = findToolNameForResult(messages, r.tool_use_id);
  try {
    const data = JSON.parse(r.content);

    if (toolName === "get_fragrance_knowledge") {
      if (!data.hit) {
        const list = (data.available_topics || []).join("、");
        return `這個主題我這邊還沒收錄耶。目前可以聊：${list}。`;
      }
      return `**${data.title}**\n${data.summary}\n\n${data.details}\n\n想深入買一款這個調性的，我把你接給小禾？`;
    }

    if (toolName === "recommend_by_scene") {
      if (data.available_scenes) {
        const list = data.available_scenes.join("、");
        return `「${data.scene}」這個情境我這邊還沒整理出來。我比較熟：${list}。`;
      }
      const notes = (data.suggest_notes || []).join("、");
      const avoid = (data.avoid || []).join("、");
      return `**${data.scene}**：目標氛圍是「${data.mood}」。\n\n推薦：${notes}\n避開：${avoid}\n\n💡 ${data.tip}`;
    }

    if (toolName === "semantic_search_products") {
      const products = data.products || [];
      if (products.length === 0) return "這種感覺的品項我手上沒有完全對上的，要不要描述更具體一點？";
      const top = products.slice(0, 3);
      const lines = top.map(
        (p: { title: string; top_smell?: string; heart_smell?: string }, idx: number) =>
          `${idx + 1}. **${p.title}** — ${p.top_smell || ""} → ${p.heart_smell || ""}`,
      );
      return `以這種感覺來看，有幾個方向：\n\n${lines.join("\n")}\n\n要不要我接給小禾幫你看細節或加購？`;
    }

    if (toolName === "get_product_details") {
      return `${data.title}\n前味 ${data.top_smell}／中味 ${data.heart_smell}／後味 ${data.base_smell}\n\n${data.description}`;
    }
  } catch {
    // ignore
  }
  return "這是我查到的結果，想從哪個角度深入？";
};

// ============================================================
// 小管 — 訂單／會員 agent
// ============================================================
const ORDER_KEYWORDS = ["訂單", "出貨", "到貨", "物流", "追蹤"];
const MEMBER_KEYWORDS = ["點數", "會員", "等級", "福利", "折抵"];

const xiaoguanHandleUser = (text: string): AgentResponse => {
  const t = text.trim();

  const orderId = extractOrderId(t);
  if (orderId) {
    return {
      toolCalls: [
        { id: uid(), name: "get_order_status", input: { order_id: orderId } },
      ],
      stopReason: "tool_use",
    };
  }

  if (ORDER_KEYWORDS.some((k) => t.includes(k))) {
    return {
      text: "沒問題，跟我說訂單編號（格式像 ORD-20260418-A1），我馬上查。",
      stopReason: "end_turn",
    };
  }

  if (MEMBER_KEYWORDS.some((k) => t.includes(k))) {
    return {
      toolCalls: [{ id: uid(), name: "get_member_points", input: {} }],
      stopReason: "tool_use",
    };
  }

  if (t.includes("購物車")) {
    return {
      toolCalls: [{ id: uid(), name: "get_cart", input: {} }],
      stopReason: "tool_use",
    };
  }

  return {
    text: "我負責訂單、會員、物流、運費規則。想查訂單請給我訂單編號，問會員點數可以直接說「我有多少點數」。",
    stopReason: "end_turn",
  };
};

const xiaoguanNarrate = (messages: ChatMessage[]): string => {
  const last = messages[messages.length - 1];
  if (last.role !== "tool" || !last.toolResults?.[0]) return "還需要查什麼嗎？";
  const r = last.toolResults[0];
  if (r.is_error) return "抱歉，這邊系統有點卡，能再提供一次資訊嗎？";

  const toolName = findToolNameForResult(messages, r.tool_use_id);
  try {
    const data = JSON.parse(r.content);

    if (toolName === "get_order_status") {
      if (!data.found) {
        const demoList = (data.available_for_demo || []).join("、");
        return `查無這筆訂單喔。demo 用的測試訂單有：${demoList}`;
      }
      const itemLines = (data.items || [])
        .map((it: { title: string; qty: number }) => `• ${it.title} × ${it.qty}`)
        .join("\n");
      const tracking = data.tracking_no
        ? `\n物流：${data.carrier}｜追蹤號 ${data.tracking_no}`
        : "";
      const eta = data.eta ? `\n預計到貨：${data.eta}` : "";
      return `**訂單 ${data.order_id}**｜${data.status}\n下單日 ${data.placed_at}\n\n${itemLines}${tracking}${eta}`;
    }

    if (toolName === "get_member_points") {
      const perks = (data.perks || []).map((p: string) => `• ${p}`).join("\n");
      const expiring = data.points_expiring_soon
        ? `\n⚠️ ${data.points_expiring_soon.amount} 點 將於 ${data.points_expiring_soon.expires_at} 過期`
        : "";
      return `**${data.member_name}**｜${data.level}\n目前點數：${data.points}（距離 ${data.next_level}）${expiring}\n\n會員福利：\n${perks}`;
    }

    if (toolName === "get_cart") {
      const items = data.items || [];
      if (items.length === 0) return "你的購物車現在是空的喔。";
      const lines = items.map(
        (it: { title: string; qty: number; subtotal: number }) =>
          `• ${it.title} × ${it.qty}（NT$${it.subtotal}）`,
      );
      return `購物車內容：\n${lines.join("\n")}\n\n小計 NT$${data.final_total}。`;
    }
  } catch {
    // ignore
  }
  return "這是查詢結果，還需要什麼協助嗎？";
};

// ============================================================
// Dispatcher：依 agentId 派給對應的 handler
// ============================================================
const handleUserByAgent = (
  agentId: AgentId,
  text: string,
  messages: ChatMessage[],
): AgentResponse => {
  switch (agentId) {
    case "xiaohe":
      return xiaoheHandleUser(text, messages);
    case "xiaoxiang":
      return xiaoxiangHandleUser(text);
    case "xiaoguan":
      return xiaoguanHandleUser(text);
    default:
      return { text: "嗨。", stopReason: "end_turn" };
  }
};

const narrateByAgent = (agentId: AgentId, messages: ChatMessage[]): string => {
  switch (agentId) {
    case "xiaohe":
      return xiaoheNarrate(messages);
    case "xiaoxiang":
      return xiaoxiangNarrate(messages);
    case "xiaoguan":
      return xiaoguanNarrate(messages);
    default:
      return "好的。";
  }
};

// 粗略估算 token：中文 / 英文混雜時，1 token ≈ 1.5 char（保守值）
// 只是 mock 用，Playground 顯示 metrics 時好看就好，不是精準計費
const estimateTokens = (s: string): number =>
  Math.max(1, Math.round(s.length / 1.5));

// 把 mock response 包裝成帶 fake usage 的 AgentResponse
const withMockUsage = (
  response: AgentResponse,
  systemPrompt: string,
  messages: ChatMessage[],
): AgentResponse => {
  const inputText =
    systemPrompt +
    messages
      .map((m) => m.text ?? "")
      .join("\n");
  const outputText =
    (response.text ?? "") +
    (response.toolCalls ?? [])
      .map((tc) => JSON.stringify(tc.input))
      .join("");
  return {
    ...response,
    usage: {
      inputTokens: estimateTokens(inputText),
      outputTokens: estimateTokens(outputText),
    },
  };
};

export class MockAgentAdapter implements AgentAdapter {
  readonly name = "mock";

  async sendMessage(
    messages: ChatMessage[],
    systemPrompt: string,
    _tools: ToolSchema[],
    context?: AgentCallContext,
  ): Promise<AgentResponse> {
    await delay(500 + Math.random() * 500);

    const agentId = context?.agentId ?? DEFAULT_AGENT_ID;
    const last = messages[messages.length - 1];

    if (!last) {
      return withMockUsage(
        { text: "嗨。", stopReason: "end_turn" },
        systemPrompt,
        messages,
      );
    }

    // A: 最後一則是 tool_result → 產生最終自然回覆
    if (last.role === "tool") {
      return withMockUsage(
        { text: narrateByAgent(agentId, messages), stopReason: "end_turn" },
        systemPrompt,
        messages,
      );
    }

    // B: 最後一則是 user → 派給當前 agent 的 handler
    if (last.role === "user" && last.text) {
      return withMockUsage(
        handleUserByAgent(agentId, last.text, messages),
        systemPrompt,
        messages,
      );
    }

    return withMockUsage(
      { text: "我沒有完全聽懂，再說一次？", stopReason: "end_turn" },
      systemPrompt,
      messages,
    );
  }
}

    