import type { ToolSchema } from "../../types/agent";

// Tool Definitions
// 對齊 Anthropic Messages API 的 tools 格式，切換真 API 時這份直接能用
//
// 設計原則：
// 1. Description 寫給 LLM 看，要說清楚「何時該用」
// 2. 參數名對 LLM 友善（snake_case，語意明確）
// 3. 避免太多 optional 參數，讓 LLM 容易決策

export const AGENT_TOOLS: ToolSchema[] = [
  {
    name: "search_products",
    description:
      "用明確條件搜尋商品清單。適用於使用者給出具體條件時，例如「500 元以下的線香」、「送禮的香氛」。回傳商品陣列，含 id、名稱、價格、描述、使用場景。",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "關鍵字（商品名、特色、氣味等），可留空",
        },
        max_price: {
          type: "number",
          description: "價格上限（台幣），可選",
        },
        category: {
          type: "string",
          description: "分類（例如「放鬆系列」、「冥想系列」、「淨化系列」、「復甦系列」），可選",
        },
      },
      required: [],
    },
  },
  {
    name: "semantic_search_products",
    description:
      "用語意/情境搜尋商品。適用於使用者用感性或模糊語言描述需求時，例如「想要放鬆助眠」、「送女友生日」、「讓辦公室不那麼沉悶」。語意比 search_products 更模糊也更強。",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "使用者的情境或感受描述，例如「想在下班後快速放鬆」、「需要提神但不要太刺激」",
        },
        max_price: {
          type: "number",
          description: "價格上限（台幣），可選",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "get_product_details",
      description:
      "取得單一商品的完整細節，包含前味/中味/後味、煙氣質地、完整描述與使用情境。使用者問某個商品的細節時呼叫。",
    input_schema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "商品 ID（從 search_products 或 semantic_search_products 取得）",
        },
      },
      required: ["product_id"],
    },
  },
  {
    name: "add_to_cart",
    description:
      "把商品加入購物車。使用者明確表達要購買時才呼叫（「加入購物車」「我要買」「就選這個」）。不要在推薦階段就自動加。",
    input_schema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "商品 ID",
        },
        qty: {
          type: "number",
          description: "數量，預設 1",
        },
      },
      required: ["product_id"],
    },
  },
  {
    name: "get_cart",
    description:
      "取得目前購物車內容與總金額。使用者問「我買了什麼」「看購物車」「結帳多少錢」時呼叫。",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "remove_from_cart",
    description:
      "從購物車移除一個商品項目。使用者說「我不要那個了」「移除」時呼叫。需要購物車內該項目的 cart_item_id（不是 product_id）。",
    input_schema: {
      type: "object",
      properties: {
        cart_item_id: {
          type: "string",
          description: "購物車項目 ID（不是商品 ID），先呼叫 get_cart 取得",
        },
      },
      required: ["cart_item_id"],
    },
  },

  // ---- 小香專屬 tools（香氛知識）----
  {
    name: "get_fragrance_knowledge",
    description:
      "查詢香氛知識庫：香調解釋（柑橘／花香／木質／東方／綠葉／辛香）、前中後味概念、常見術語。使用者問「什麼是 xx 味」「前味是什麼」時呼叫。",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description:
            "查詢主題，例如「柑橘調」「前味」「木質調」「東方調」「留香時間」",
        },
      },
      required: ["topic"],
    },
  },
  {
    name: "recommend_by_scene",
    description:
      "依照具體情境／心情推薦香氛搭配邏輯（不只推商品，還解釋為什麼）。例如「睡前」「雨天工作」「約會」「瑜伽」「冥想」。",
    input_schema: {
      type: "object",
      properties: {
        scene: {
          type: "string",
          description: "情境關鍵字，例如「睡前」「雨天工作」「約會」",
        },
      },
      required: ["scene"],
    },
  },

  // ---- 小管專屬 tools（訂單／會員）----
  {
    name: "get_order_status",
    description:
      "查詢訂單狀態與出貨進度。使用者問「我的訂單到哪裡了」「出貨了嗎」時呼叫。需要訂單編號；如果使用者沒提供，就先問他。",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "訂單編號（例如 ORD-20260418-A1）",
        },
      },
      required: ["order_id"],
    },
  },
  {
    name: "get_member_points",
    description:
      "查詢會員點數與會員等級。使用者問「我有多少點數」「我是什麼等級」時呼叫。",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  // ---- RAG：知識庫檢索 ----
  // 小香主要使用。小禾可選配（遇到模糊知識問題時主動呼叫）。
  // 設計重點：tool description 明示「回答知識題前務必先 retrieve」，
  // 讓 agent 不要腦補。回傳有 source_refs，agent 應該引用。
  {
    name: "retrieve_knowledge",
    description:
      "從 ENSO 香氛知識庫檢索相關段落，用於回答知識題（香調理論、原料差異、使用方式、保存、安全、送禮、寵物、空間搭配等）。**回答知識題前務必先呼叫此 tool**，不要直接憑自己知識回答；回答時請引用 source_refs（例如 KB#kb-001）讓使用者看得到依據。回傳 top-K 相關段落，每段有 id、title、content、source。",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "使用者的問題或關鍵字，可以是完整句子（例如「檀香跟沉香差在哪」），也可以是關鍵詞（例如「線香 保存」、「低煙 配方」）。",
        },
        top_k: {
          type: "number",
          description: "回傳幾段，預設 3，最多 5。",
        },
      },
      required: ["query"],
    },
  },

  // ---- 三個 buyer agent 共用：使用者記憶 ----
  // 跨 session 持久化使用者偏好。任何一個 agent 都能讀／寫這份記憶。
  {
    name: "save_user_preference",
    description:
      "記下使用者的偏好，供下次對話或其他 agent 參考。當使用者透露可重複使用的個人資訊時呼叫：情境需求（助眠／提神／放鬆）、香調偏好（喜歡木質／不喜歡太甜）、預算、收禮對象、用途場景等。不要記一次性資訊（例如「今天天氣」）或敏感資訊（電話／地址）。同一個 key 會覆蓋舊值。",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "偏好類別，盡量精簡穩定。常用：「情境偏好」「香調偏好」「預算」「收禮對象」「使用空間」。",
        },
        value: {
          type: "string",
          description:
            "具體偏好內容，用短語描述，例如「想要助眠、放鬆」「偏好木質、不喜歡太甜」「2000 以內」。",
        },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "get_user_preferences",
    description:
      "讀取這位使用者過去記下的偏好。如果 systemPrompt 裡已經有「關於這位使用者」區塊，就不用再呼叫；只有在需要確認最新快照、或對話剛開始想主動打招呼時才用。",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];
