# AI Shopping Agent — 架構與配置

ENSO 前台內嵌了一個 multi-agent shopping assistant，包含三位專家協作：

| Agent | 角色 | 專長 | 主題色 |
|---|---|---|---|
| 🌿 **小禾** | 購物助手 | 商品推薦、加入購物車、尺寸 / 價格查詢 | emerald |
| 🪷 **小香** | 香氛知識專家 | 香調知識、情境推薦、使用方式 | rose |
| 📦 **小管** | 訂單 / 會員專員 | 訂單狀態、會員點數、物流查詢 | blue |

當使用者意圖切換時（例如「我想買線香」→「睡前哪一款比較好？」），Router 觸發 handoff，對話區顯示藍色 chip 提示，UI 主題色也跟著切換。

## 兩種 Provider（Adapter）

純 SPA 版本支援兩種對話來源：

```
 client（瀏覽器）
 ──────────────

 ┌──────────────────────┐
 │ VITE_AGENT_PROVIDER  │
 └──────────┬───────────┘
            │
            ├─ mock   → MockAgentAdapter            （離線 mock，預設、永遠能跑）
            │
            └─ direct → AnthropicAdapter ──────────→ Anthropic Messages API
                       （key 會 bundle 到 client，⚠️ 僅限 local dev）
```

> **歷史變更**：原 Next.js 版的 `server` provider（透過 `/api/agent` Route Handler 代打 Anthropic）以及 Prompt Playground / Eval Suite，在遷移到 Vite SPA 後已移除。SPA 沒有 server，無法保護 API key。若日後需要安全的 production AI，需另起 server proxy。

進入點：`src/services/agent/index.ts` 的 `getAgentAdapter()`。

### 什麼時候用哪個 provider

| 情境 | 建議 provider |
|---|---|
| 沒有 Anthropic API key，只想看 demo 流程 | `mock`（預設） |
| 自己 local 測真實模型 | `direct`（接受 key bundle 到 client）|
| 部署到 production / 公開的 demo 站 | **不可使用 `direct`**（key 會被任何人從 bundle 取出）；請維持 `mock` 或另起 server proxy |

## 環境變數

```bash
# 切換 provider
VITE_AGENT_PROVIDER=mock        # mock | direct（其他值 fallback 為 mock）

# direct mode 才需要 —— ⚠️ 會被 bundle 進 client，僅限 local dev
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

申請 key：https://console.anthropic.com/

## 檔案結構

```
src/
├── services/agent/
│   ├── index.ts                    # getAgentAdapter() — 單一切換點
│   ├── adapter.ts                  # AgentAdapter interface + AgentCallContext
│   ├── mockAdapter.ts              # 離線 mock，依 agentId 切 handler
│   ├── anthropicAdapter.ts         # direct mode（client 直打 Anthropic）
│   ├── anthropicProtocol.ts        # 純 function：model id、訊息轉換、response parser
│   ├── router.ts                   # 關鍵字意圖分類 → 決定 handoff
│   ├── tools.ts                    # 10 個 tool schemas
│   ├── toolExecutor.ts             # 執行 tool，回傳 mock data
│   ├── systemPrompt.ts             # 共用 system prompt 片段
│   ├── memory.ts sessionId.ts eventLogger.ts
│   ├── agents/
│   │   ├── index.ts                # AGENT_REGISTRY、DEFAULT_AGENT_ID、getToolsForAgent
│   │   ├── xiaohe.ts               # 小禾 persona + tools subset
│   │   ├── xiaoxiang.ts            # 小香
│   │   └── xiaoguan.ts             # 小管
│   └── knowledge/
│       ├── passages.ts             # 知識段落
│       └── retrieval.ts            # 簡單檢索
│
├── hooks/
│   └── useChatAgent.ts             # 核心對話 loop：Router → handoff → tool-use loop
│
├── slice/
│   └── agentSlice.ts               # Redux state：messages、currentAgentId、handoff action
│
└── components/ShoppingAgent/
    ├── ChatWidget.tsx              # 右下角浮動按鈕 + panel
    ├── ChatPanel.tsx               # 對話框容器，依 agent 切主題色
    ├── Message.tsx                 # 單則訊息（含 handoff chip 特殊樣式）
    └── MemoryPanel.tsx             # 記憶 / 偏好面板
```

## Tool 清單

| Tool | 用途 | 擁有的 agent |
|---|---|---|
| `search_products` | 關鍵字 / 分類搜尋 | 小禾 |
| `semantic_search_products` | 情境 / 意圖搜尋 | 小禾、小香 |
| `get_product_details` | 單一商品詳情 | 小禾、小香 |
| `add_to_cart` / `get_cart` / `remove_from_cart` | 購物車操作 | 小禾（`get_cart` → 也給小管）|
| `get_fragrance_knowledge` | 香調 / 萃取法知識 | 小香 |
| `recommend_by_scene` | 依情境推薦（睡前 / 工作 / 約會 …）| 小香 |
| `get_order_status` | 訂單狀態 | 小管 |
| `get_member_points` | 會員點數 | 小管 |

所有 tool 目前回 mock data（見 `toolExecutor.ts`），之後接真實 EC API 只需換實作。

## 驗證 checklist

1. **Mock 永遠 OK**
   - `.env.local` 設 `VITE_AGENT_PROVIDER=mock`（或不設）
   - `npm run dev`
   - 打開 ChatWidget，問「推薦線香」→ 看到小禾回應並顯示商品卡

2. **Direct mode — 真實 Claude（僅 local）**
   - `.env.local` 設：
     ```
     VITE_AGENT_PROVIDER=direct
     VITE_ANTHROPIC_API_KEY=sk-ant-...
     ```
   - 重啟 `npm run dev`
   - 問「我想買檀香」→ Claude 應實際呼叫 `semantic_search_products`、回商品推薦
   - 問「睡前適合哪款？」→ 應 handoff 給小香
   - Network tab 會看到直接打 `api.anthropic.com`
   - 打開 DevTools 能在 bundled JS 裡搜到 key 字串 → 就是這個 mode 不能 production 用的原因
   - 沒設 `VITE_ANTHROPIC_API_KEY` 時會 console warn 並 fallback 回 `mock`

## 常見問題

**Q: 為什麼有 mock adapter？**
A: 三個目的：(1) 沒 API key 也能 demo (2) 單元測試不打網路 (3) 做 prompt iteration 時的對照組。

**Q: 為什麼 handoff 要寫 `role: "system"` 訊息？**
A: `system` 訊息只活在 Redux state / UI，`toAnthropicMessages` 會明確跳過——這樣 UI 能畫 handoff chip，但不會污染 LLM 對話 context（避免 Claude 以為自己就是「剛剛切換的那位」）。

**Q: Tool schema 要怎麼加？**
A: (1) `tools.ts` 加 schema；(2) `toolExecutor.ts` 加執行邏輯；(3) 在對應 agent persona 的 `toolNames` 加名字。`getToolsForAgent()` 會自動過濾成該 agent 能用的子集。

**Q: 怎麼換模型？**
A: 改 `anthropicProtocol.ts` 的 `ANTHROPIC_MODEL_ID`。

**Q: 為什麼拔掉 `server` provider？**
A: `server` 模式依賴 Next.js 的 `/api/agent` Route Handler，遷移至 Vite SPA 後不再有 server。若日後想保護 API key，需另起獨立的 BFF/proxy（不在本 repo 範圍）。

## 相關文件

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 整體架構
- [FEATURES.md](./FEATURES.md) — 功能清單
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 開發規範
