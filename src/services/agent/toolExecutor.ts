import { getAllProductsApi, getSingleProductApi } from "../product";
import {
  addCartApi,
  deleteSingleCartApi,
  getCartApi,
} from "../cart";
import {
  deleteEntry,
  loadUserProfile,
  saveEntry,
} from "./memory";
import { retrieve } from "./knowledge/retrieval";

import type { Product } from "../../types/product";
import type { AgentId, ToolCall, ToolResult } from "../../types/agent";

// Tool Executor
// 把 LLM 的 tool_call 轉成實際的 API 呼叫，執行完把結果包成 ToolResult 回傳
//
// 設計原則：
// 1. 每個 tool 都有獨立的 handler function
// 2. 所有輸出都是可讀性高的 JSON 字串（LLM 較好消化）
// 3. 錯誤一律 catch，回傳 is_error: true 讓 agent 自己 recover
// 4. 商品欄位精簡，不要把所有欄位都塞給 LLM（token 浪費）

interface CartItemFromApi {
  id: string;
  product_id: string;
  qty: number;
  final_total: number;
  product: {
    title: string;
    price: number;
  };
}

// 精簡版商品，給 LLM 看用
const toProductDigest = (p: Product) => ({
  id: p.id,
  title: p.title,
  price: p.price,
  origin_price: p.origin_price,
  category: p.category,
  description: p.description,
  scenes: p.scenes,
  top_smell: p.top_smell,
  heart_smell: p.heart_smell,
  base_smell: p.base_smell,
});

// 簡易文字 matching（phase 1 用，phase 3 會換成 embedding）
const matchScore = (p: Product, query: string): number => {
  const q = query.toLowerCase();
  const haystack = [
    p.title,
    p.description,
    p.content,
    p.top_smell,
    p.heart_smell,
    p.base_smell,
    (p.scenes || []).join(" "),
    p.category,
  ]
    .join(" ")
    .toLowerCase();

  // 簡單 token 匹配 + 部分字串
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 1;
  }
  return score;
};

const searchProducts = async (input: {
  query?: string;
  max_price?: number;
  category?: string;
}): Promise<string> => {
  const res = await getAllProductsApi();
  // API 可能回傳 object map 或 array
  const raw = res.data.products;
  const list: Product[] = Array.isArray(raw) ? raw : Object.values(raw || {});

  let filtered = list.filter((p) => p.is_enabled !== false);

  if (input.max_price) {
    filtered = filtered.filter((p) => p.price <= (input.max_price as number));
  }
  if (input.category) {
    filtered = filtered.filter((p) =>
      p.category?.toLowerCase().includes((input.category as string).toLowerCase()),
    );
  }
  if (input.query && input.query.trim()) {
    const scored = filtered
      .map((p) => ({ p, s: matchScore(p, input.query as string) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    filtered = scored.map((x) => x.p);
  }

  const digest = filtered.slice(0, 5).map(toProductDigest);
  return JSON.stringify({ count: digest.length, products: digest });
};

const semanticSearchProducts = async (input: {
  description: string;
  max_price?: number;
}): Promise<string> => {
  // Phase 1: 用 description 當 query 跑 matchScore，附註這是暫時實作
  // Phase 3 會換成真 embedding + cosine similarity
  const res = await getAllProductsApi();
  const raw = res.data.products;
  const list: Product[] = Array.isArray(raw) ? raw : Object.values(raw || {});

  let filtered = list.filter((p) => p.is_enabled !== false);
  if (input.max_price) {
    filtered = filtered.filter((p) => p.price <= (input.max_price as number));
  }

  const scored = filtered
    .map((p) => ({ p, s: matchScore(p, input.description) }))
    .sort((a, b) => b.s - a.s);

  // 即使沒有 match，也回傳前幾個（避免空結果讓對話卡住）
  const top = scored.slice(0, 5).map((x) => toProductDigest(x.p));
  return JSON.stringify({
    count: top.length,
    products: top,
    note: "以關鍵字匹配排序，phase 3 將切換為 embedding 搜尋",
  });
};

const getProductDetails = async (input: {
  product_id: string;
}): Promise<string> => {
  const res = await getSingleProductApi(input.product_id);
  const p: Product = res.data.product;
  return JSON.stringify({
    id: p.id,
    title: p.title,
    price: p.price,
    origin_price: p.origin_price,
    category: p.category,
    description: p.description,
    content: p.content,
    scenes: p.scenes,
    top_smell: p.top_smell,
    heart_smell: p.heart_smell,
    base_smell: p.base_smell,
    burning_time: p.burning_time,
    unit: p.unit,
  });
};

const addToCart = async (input: {
  product_id: string;
  qty?: number;
}): Promise<string> => {
  await addCartApi({ product_id: input.product_id, qty: input.qty ?? 1 });
  return JSON.stringify({
    success: true,
    message: `已加入購物車：product_id=${input.product_id}, qty=${input.qty ?? 1}`,
  });
};

const getCart = async (): Promise<string> => {
  const res = await getCartApi();
  const data = res.data.data;
  const items = (data.carts as CartItemFromApi[]).map((item) => ({
    cart_item_id: item.id,
    product_id: item.product_id,
    title: item.product.title,
    qty: item.qty,
    price: item.product.price,
    subtotal: item.final_total,
  }));
  return JSON.stringify({
    items,
    total: data.total,
    final_total: data.final_total,
    item_count: items.length,
  });
};

const removeFromCart = async (input: {
  cart_item_id: string;
}): Promise<string> => {
  await deleteSingleCartApi(input.cart_item_id);
  return JSON.stringify({
    success: true,
    message: `已從購物車移除 cart_item_id=${input.cart_item_id}`,
  });
};

// ---- Phase 2：小香的香氛知識庫（mock，之後 Phase 3 換成 RAG）----
// 這份資料刻意寫得像知識卡片，LLM 可以直接把欄位摘出來讀
const FRAGRANCE_KNOWLEDGE: Record<
  string,
  {
    title: string;
    summary: string;
    details: string;
    related_terms?: string[];
  }
> = {
  柑橘調: {
    title: "柑橘調（Citrus）",
    summary: "明亮、乾淨、有活力，前味常見、揮發快。",
    details:
      "代表原料：佛手柑、檸檬、甜橙、葡萄柚、萊姆。適合早晨、工作起手式、夏天、想讓空間「清爽」的場景。缺點是留香短，通常需要搭配中味固定。",
    related_terms: ["前味", "佛手柑", "清新調"],
  },
  花香調: {
    title: "花香調（Floral）",
    summary: "甜美、女性化也可以很中性，常在中味。",
    details:
      "代表原料：玫瑰、茉莉、橙花、晚香玉、依蘭。玫瑰偏古典、茉莉帶點性感、橙花乾淨透明。送禮、浪漫場景常用。",
    related_terms: ["中味", "玫瑰", "茉莉"],
  },
  木質調: {
    title: "木質調（Woody）",
    summary: "溫暖、沉穩、有安全感，常在後味。",
    details:
      "代表原料：檀香、雪松、廣藿香、琥珀。適合深夜、書房、冬天、想營造沉靜感的場景。留香時間最長。",
    related_terms: ["後味", "檀香", "沉穩"],
  },
  東方調: {
    title: "東方調（Oriental）",
    summary: "辛香、甜感、異國感，濃郁。",
    details:
      "代表原料：香草、肉桂、丁香、乳香、沒藥、安息香。冬天、節慶、臥室、需要厚重氛圍時適合。不建議白天辦公使用（太重）。",
    related_terms: ["辛香", "香草", "肉桂"],
  },
  前味: {
    title: "前味（Top Note）",
    summary: "最先聞到的味道，揮發最快，15–30 分鐘消散。",
    details:
      "前味決定第一印象，多是柑橘、綠葉、辛香。挑香氛時聞到的第一波通常就是前味。",
    related_terms: ["柑橘調", "第一印象"],
  },
  中味: {
    title: "中味（Heart Note）",
    summary: "主要香氣個性，在前味退後浮現，可持續 2–4 小時。",
    details:
      "中味是「這支香的個性」，多是花香、水果、辛香。購買前建議聞一下中味，因為這才是你會聞最久的味道。",
    related_terms: ["花香調", "中段"],
  },
  後味: {
    title: "後味（Base Note）",
    summary: "留在皮膚或空間最久的基底，可持續半天以上。",
    details:
      "後味決定香氛的「深度」，多是木質、琥珀、麝香、香草。空間香氛的後味會決定你離開房間再回來時的感覺。",
    related_terms: ["木質調", "深度"],
  },
  留香時間: {
    title: "留香時間",
    summary: "線香熄滅後香氣還能在空間中持續多久的概念。",
    details:
      "單支線香燃燒約 25–40 分鐘，熄滅後的餘韻依香調而定：柑橘、花香調 30–60 分鐘；木質、樹脂調可持續 2–4 小時；深度沉香與檀香後味能延續整夜。要長效留香選冥想系列或後味厚重的款式。",
  },
};

const getFragranceKnowledge = async (input: {
  topic: string;
}): Promise<string> => {
  const topic = (input.topic || "").trim();
  // 直接命中
  if (FRAGRANCE_KNOWLEDGE[topic]) {
    return JSON.stringify({ hit: true, ...FRAGRANCE_KNOWLEDGE[topic] });
  }
  // 模糊命中（包含關鍵字）
  for (const key of Object.keys(FRAGRANCE_KNOWLEDGE)) {
    if (topic.includes(key) || key.includes(topic)) {
      return JSON.stringify({
        hit: true,
        matched_key: key,
        ...FRAGRANCE_KNOWLEDGE[key],
      });
    }
  }
  return JSON.stringify({
    hit: false,
    topic,
    available_topics: Object.keys(FRAGRANCE_KNOWLEDGE),
    note: "查無此主題，可參考 available_topics 重新詢問",
  });
};

// 情境 → 香氛搭配邏輯（mock 知識庫）
const SCENE_RECOMMENDATIONS: Record<
  string,
  { mood: string; suggest_notes: string[]; avoid: string[]; tip: string }
> = {
  睡前: {
    mood: "放鬆、助眠、降低警覺",
    suggest_notes: ["薰衣草", "檀香", "香草", "安息香"],
    avoid: ["柑橘調（太提神）", "薄荷", "強烈辛香"],
    tip: "建議睡前 30 分鐘點一支放鬆系列線香，燒完後熄火入睡，餘香會延續整夜。",
  },
  工作: {
    mood: "清醒、專注、不分心",
    suggest_notes: ["佛手柑", "迷迭香", "綠茶", "雪松"],
    avoid: ["花香（易發散注意力）", "濃重的東方調"],
    tip: "工作場景建議選低煙配方的清新木質調，午休或開工前點一支，燃燒時保持通風。",
  },
  約會: {
    mood: "溫暖、有記憶點、不壓迫",
    suggest_notes: ["玫瑰", "茉莉", "琥珀", "麝香"],
    avoid: ["太重的東方調會搶戲"],
    tip: "記憶點來自中味，選你對方聞得到但不會頭痛的劑量。",
  },
  雨天: {
    mood: "溫暖、被包覆、抵銷濕冷",
    suggest_notes: ["檀香", "琥珀", "肉桂", "香草"],
    avoid: ["過於清爽的柑橘（跟雨天違和）"],
    tip: "這類天氣適合「後味主導」的香氛，營造被包住的感覺。",
  },
  瑜伽: {
    mood: "平靜、有呼吸感、不干擾動作",
    suggest_notes: ["乳香", "檀香", "薰衣草", "雪松"],
    avoid: ["過甜、過花、過刺激"],
    tip: "瑜珈前 10 分鐘先點燃線香、把香爐放在動線外的角落，練習時不必一直盯著火。",
  },
};

const recommendByScene = async (input: {
  scene: string;
}): Promise<string> => {
  const scene = (input.scene || "").trim();
  if (SCENE_RECOMMENDATIONS[scene]) {
    return JSON.stringify({ scene, ...SCENE_RECOMMENDATIONS[scene] });
  }
  // 模糊比對
  for (const key of Object.keys(SCENE_RECOMMENDATIONS)) {
    if (scene.includes(key) || key.includes(scene)) {
      return JSON.stringify({
        scene,
        matched_key: key,
        ...SCENE_RECOMMENDATIONS[key],
      });
    }
  }
  return JSON.stringify({
    scene,
    available_scenes: Object.keys(SCENE_RECOMMENDATIONS),
    note: "查無此情境，可參考 available_scenes 或換個說法",
  });
};

// ---- Phase 2：小管的訂單與會員 tools（mock）----
// 之後可以串真的訂單 API（六角學院的 /api/{path}/order/{id}）

const mockOrderDatabase: Record<
  string,
  {
    order_id: string;
    status: string;
    placed_at: string;
    items: { title: string; qty: number }[];
    carrier?: string;
    tracking_no?: string;
    eta?: string;
  }
> = {
  "ORD-20260418-A1": {
    order_id: "ORD-20260418-A1",
    status: "已出貨",
    placed_at: "2026-04-18",
    items: [
      { title: "晨林沈靜", qty: 1 },
      { title: "龍血沉香", qty: 2 },
    ],
    carrier: "新竹物流",
    tracking_no: "SNCS-9921-4472",
    eta: "2026-04-23",
  },
  "ORD-20260412-C3": {
    order_id: "ORD-20260412-C3",
    status: "已送達",
    placed_at: "2026-04-12",
    items: [{ title: "雨後雪松", qty: 1 }],
    carrier: "黑貓宅急便",
    tracking_no: "KM-2041-9988",
  },
  "ORD-20260420-F7": {
    order_id: "ORD-20260420-F7",
    status: "備貨中",
    placed_at: "2026-04-20",
    items: [{ title: "玫瑰茉莉禮盒", qty: 1 }],
    eta: "2026-04-24",
  },
};

const getOrderStatus = async (input: {
  order_id: string;
}): Promise<string> => {
  const orderId = (input.order_id || "").trim().toUpperCase();
  const order = mockOrderDatabase[orderId];
  if (!order) {
    return JSON.stringify({
      found: false,
      order_id: orderId,
      note: "查無此訂單。請確認訂單編號格式（ORD-YYYYMMDD-Xn）。",
      available_for_demo: Object.keys(mockOrderDatabase),
    });
  }
  return JSON.stringify({ found: true, ...order });
};

const getMemberPoints = async (): Promise<string> => {
  // 暫時 mock；串真會員 API 後會讀 Redux auth state 取 user id
  return JSON.stringify({
    member_name: "ENSO 訪客",
    level: "香氛新芽 🌱",
    points: 280,
    next_level: "香氛常客（需 500 點）",
    points_expiring_soon: { amount: 60, expires_at: "2026-06-30" },
    perks: ["滿 1000 免運", "生日月 2 倍點數", "新品優先試用"],
  });
};

// ---- RAG handler ----
// 回傳結構刻意把 source_refs 挑明成獨立欄位，讓 agent 在回答時更容易引用。
const retrieveKnowledge = async (input: {
  query: string;
  top_k?: number;
}): Promise<string> => {
  const query = (input?.query ?? "").trim();
  if (!query) {
    return JSON.stringify({ hits: [], note: "query 不可為空" });
  }
  const topK = Math.min(Math.max(input?.top_k ?? 3, 1), 5);
  const hits = retrieve(query, { topK });

  if (!hits.length) {
    return JSON.stringify({
      hits: [],
      note: "知識庫沒有相關段落。可以直接回覆『這部分我還沒有足夠資料』，不要憑空編答案。",
    });
  }

  return JSON.stringify({
    query,
    hits: hits.map((h) => ({
      id: h.passage.id,
      title: h.passage.title,
      content: h.passage.content,
      source: h.passage.source,
      source_ref: `KB#${h.passage.id}`,
      score: Number(h.score.toFixed(2)),
    })),
    note: "請以這些段落為依據回答，並在回答中引用 source_ref（例如 KB#kb-001）。",
  });
};

// ---- User Memory handlers ----
// source 會帶入呼叫當下的 agentId，讓記憶能看出「這則是小禾記的 / 小香記的」
const saveUserPreference = async (
  input: { key?: string; value?: string },
  source: AgentId,
): Promise<string> => {
  const key = (input?.key ?? "").trim();
  const value = (input?.value ?? "").trim();
  if (!key || !value) {
    return JSON.stringify({
      ok: false,
      error: "key 和 value 都不能為空",
    });
  }
  const entry = saveEntry({ key, value, source });
  return JSON.stringify({
    ok: true,
    saved: { id: entry.id, key: entry.key, value: entry.value },
    note:
      "已記下。下次使用者再來時，所有 agent 都能在 systemPrompt 裡看到這筆偏好。",
  });
};

const getUserPreferences = async (): Promise<string> => {
  const profile = loadUserProfile();
  if (!profile.entries.length) {
    return JSON.stringify({ entries: [], note: "目前還沒有記錄任何使用者偏好。" });
  }
  return JSON.stringify({
    entries: profile.entries.map((e) => ({
      id: e.id,
      key: e.key,
      value: e.value,
      source: e.source,
    })),
  });
};

// （保留供 UI / eval 用）
export { deleteEntry as deleteMemoryEntry };

// Dispatcher
// 第二參數 context 帶入當前 agent 的身份，讓 memory tool 能標記 source。
// 舊 caller 若不傳 context 也能運作（只是 memory tool 會退回預設 source）。
export const executeToolCall = async (
  call: ToolCall,
  context?: { agentId?: AgentId },
): Promise<ToolResult> => {
  try {
    let content: string;
    switch (call.name) {
      case "search_products":
        content = await searchProducts(call.input as never);
        break;
      case "semantic_search_products":
        content = await semanticSearchProducts(call.input as never);
        break;
      case "get_product_details":
        content = await getProductDetails(call.input as never);
        break;
      case "add_to_cart":
        content = await addToCart(call.input as never);
        break;
      case "get_cart":
        content = await getCart();
        break;
      case "remove_from_cart":
        content = await removeFromCart(call.input as never);
        break;
      case "get_fragrance_knowledge":
        content = await getFragranceKnowledge(call.input as never);
        break;
      case "recommend_by_scene":
        content = await recommendByScene(call.input as never);
        break;
      case "retrieve_knowledge":
        content = await retrieveKnowledge(call.input as never);
        break;
      case "get_order_status":
        content = await getOrderStatus(call.input as never);
        break;
      case "get_member_points":
        content = await getMemberPoints();
        break;
      case "save_user_preference":
        content = await saveUserPreference(
          call.input as { key?: string; value?: string },
          context?.agentId ?? "xiaohe",
        );
        break;
      case "get_user_preferences":
        content = await getUserPreferences();
        break;
      default:
        return {
          tool_use_id: call.id,
          content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
          is_error: true,
        };
    }
    return { tool_use_id: call.id, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[executeToolCall] tool failed:", call.name, err);
    return {
      tool_use_id: call.id,
      content: JSON.stringify({ error: message, tool: call.name }),
      is_error: true,
    };
  }
};
