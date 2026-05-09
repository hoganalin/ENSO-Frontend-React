# AI Shopping Agent — 架構與配置

ENSO 前台內嵌了一個 multi-agent shopping assistant，包含三位專家協作：

| Agent | 角色 | 專長 | 主題色 |
|---|---|---|---|
| 🌿 **小禾** | 購物助手 | 商品推薦、加入購物車、尺寸 / 價格查詢 | emerald |
| 🪷 **小香** | 香氛知識專家 | 香調知識、情境推薦、使用方式 | rose |
| 📦 **小管** | 訂單 / 會員專員 | 訂單狀態、會員點數、物流查詢 | blue |

當使用者的訊息意圖切換時（例如從「我想買線香」→「睡前哪一款比較好？」），Router 會觸發 handoff，上方對話區會顯示藍色 chip 提示，UI 主題色也會跟著切換。

## 三種 Provider（Adapter）

Agent 背後可切換 3 種對話來源：

```
 client                     server
 ──────                     ──────

┌────────────────────┐
│ NEXT_PUBLIC_AGENT  │
│ _PROVIDER=?        │
└────────────────────┘
        │
        ├─ mock   → MockAgentAdapter               （離線 mock，永遠能跑）
        │
        ├─ server → ServerAnthropicAdapter ──POST──→ /api/agent ──→ Anthropic
        │          （key 不進 client bundle，推薦）
        │
        └─ direct → AnthropicAdapter ──────────────→ Anthropic
                   （key 會被 bundle 到 client，僅限 local dev）
```

程式進入點：`src/services/agent/index.ts` 的 `getAgentAdapter()`。

### 什麼時候用哪個 provider

| 情境 | 建議 provider |
|---|---|
| 沒有 Anthropic API key，只想看 demo 流程 | `mock`（預設） |
| 自己 local 測真實模型，有設 `.env.local` | `server` 或 `direct` 都行 |
| 部署到 Vercel / production | **一定** 用 `server`，`direct` 會把 key 曝光 |

## 環境變數

完整範本見專案根目錄 `.env.example`。重點：

```bash
# 切換 provider
NEXT_PUBLIC_AGENT_PROVIDER=server     # mock | server | direct

# server mode 用（推薦）—— 不要加 NEXT_PUBLIC_ 前綴
ANTHROPIC_API_KEY=sk-ant-...

# direct mode 用（只限 local dev）—— NEXT_PUBLIC_ 會進 client bundle
NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
```

**安全規則**：`ANTHROPIC_API_KEY`（沒有前綴）只會在 `/api/agent` 這個 Route Handler 裡被讀取，絕對不會被 bundle 到前端。申請 key：https://console.anthropic.com/

## 檔案結構

```
src/
├── app/api/agent/
│   └── route.ts                    # Next.js Route Handler，server 端代打 Anthropic
│
├── services/agent/
│   ├── index.ts                    # getAgentAdapter() — 單一切換點
│   ├── adapter.ts                  # AgentAdapter interface + AgentCallContext
│   ├── mockAdapter.ts              # 離線 mock，依 agentId 切 handler
│   ├── anthropicAdapter.ts         # direct mode（client 直打）
│   ├── serverAnthropicAdapter.ts   # server mode（client fetch /api/agent）
│   ├── anthropicProtocol.ts        # 純 function：model ID、message 轉換、response parser
│   ├── router.ts                   # 關鍵字意圖分類 → decide handoff
│   ├── tools.ts                    # 10 個 tool schemas
│   ├── toolExecutor.ts             # 執行 tool，回傳 mock data
│   ├── systemPrompt.ts             # 共用的 system prompt 片段
│   └── agents/
│       ├── index.ts                # AGENT_REGISTRY, DEFAULT_AGENT_ID
│       ├── xiaohe.ts               # 小禾 persona + tools subset
│       ├── xiaoxiang.ts            # 小香 persona + tools subset
│       └── xiaoguan.ts             # 小管 persona + tools subset
│
├── hooks/
│   └── useChatAgent.ts             # 核心對話 loop：Router → handoff → tool-use loop
│
├── slice/
│   └── agentSlice.ts               # Redux state：messages, currentAgentId, handoff action
│
└── components/ShoppingAgent/
    ├── ChatWidget.tsx              # 右下角按鈕 + panel
    ├── ChatPanel.tsx               # 對話框容器，依 agent 切主題色
    └── Message.tsx                 # 單則訊息（含 handoff chip 特殊樣式）
```

## Tool 清單

| Tool | 用途 | 擁有的 agent |
|---|---|---|
| `search_products` | 關鍵字 / 分類搜尋 | 小禾 |
| `semantic_search_products` | 情境 / 意圖搜尋 | 小禾、小香 |
| `get_product_details` | 單一商品詳情 | 小禾、小香 |
| `add_to_cart` / `get_cart` / `remove_from_cart` | 購物車操作 | 小禾（+ get_cart → 小管） |
| `get_fragrance_knowledge` | 香調 / 萃取法知識 | 小香 |
| `recommend_by_scene` | 依情境推薦（睡前 / 工作 / 約會…） | 小香 |
| `get_order_status` | 訂單狀態 | 小管 |
| `get_member_points` | 會員點數 | 小管 |

所有 tool 目前回 mock data（見 `toolExecutor.ts`），之後接真實 EC API 只需換實作。

## 驗證 checklist

切不同 provider 快速驗證：

1. **Mock 永遠 OK**
   - `.env.local` 設 `NEXT_PUBLIC_AGENT_PROVIDER=mock`（或不設）
   - `npm run dev`
   - 打開 ChatWidget，問「推薦線香」→ 看到小禾回應並顯示商品卡

2. **Server mode — 真實 Claude**
   - `.env.local` 設：
     ```
     NEXT_PUBLIC_AGENT_PROVIDER=server
     ANTHROPIC_API_KEY=sk-ant-...
     ```
   - 重啟 `npm run dev`
   - 問「我想買檀香」→ 應該看到 Claude 實際呼叫 `semantic_search_products`、回商品推薦
   - 問「睡前適合哪款？」→ 應該 handoff 給小香
   - 若 `ANTHROPIC_API_KEY` 沒設：server 會回 500，client UI 顯示錯誤訊息
   - ⚠️ Check Network tab：fetch 對象是 `/api/agent`，**不是** `api.anthropic.com`。如果看到 `api.anthropic.com`，代表設成 direct 了

3. **Direct mode — 只限 local**
   - `.env.local` 設：
     ```
     NEXT_PUBLIC_AGENT_PROVIDER=direct
     NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
     ```
   - Network tab 會看到直接打 `api.anthropic.com`
   - 打開 DevTools 能在 bundled JS 裡搜到 key 字串 → 就是這個 mode 不能 production 用的原因

## 常見問題

**Q: 為什麼有 mock adapter？**
A: 三個目的：(1) 沒有 API key 也能 demo (2) 單元測試不打網路 (3) 做 prompt engineering 的 A/B 時對照組。

**Q: 為什麼 handoff 要寫 `role: "system"` 訊息？**
A: `system` 訊息只活在 Redux state / UI，`toAnthropicMessages` 會明確跳過 — 這樣 UI 能畫 handoff chip，但不會污染 LLM 對話 context（避免 Claude 以為自己就是「剛剛切換的那位」）。

**Q: Tool schema 要怎麼加？**
A: (1) `tools.ts` 加 schema；(2) `toolExecutor.ts` 加執行邏輯；(3) 在對應 agent persona 的 `toolNames` 加名字。`getToolsForAgent()` 會自動過濾成該 agent 能用的子集。

**Q: 怎麼換模型？**
A: 改 `anthropicProtocol.ts` 的 `ANTHROPIC_MODEL_ID`。client 端的 `AnthropicAdapter` 跟 server 端的 `/api/agent` 都會用到同一個常數，不用改兩次。

## Prompt Playground（A/B 比較工具）

`/playground` 是一個獨立頁面（不套 FrontendShell），用來做 prompt engineering 的 A/B 比較：

- 左右兩欄分別編輯 Prompt A / Prompt B
- 切換 Agent（小禾／小香／小管）會自動預填該 agent 的 baseline prompt
- 送一則 user message，`Promise.all` 同時打兩個 prompt，並排顯示結果
- 每邊都顯示：response text、tool calls（名稱 + 參數）、latency、input/output tokens、stop reason
- **單輪比較，不跑 tool-use loop** —— 讓 A/B 公平，聚焦在「prompt 如何影響 initial decision」
- **Copy as Markdown** —— 一鍵把整個對照 dump 成 markdown，方便貼到 Notion / email / PR description 當 prompt iteration log
- Mock mode 有顯眼的 warning banner，提醒使用者「mock 不看 prompt，想看真實差異請切 server」

**使用方式**：
1. `.env.local` 設 `NEXT_PUBLIC_AGENT_PROVIDER=server` + `ANTHROPIC_API_KEY=sk-ant-...`
2. `npm run dev`
3. 開 `http://localhost:3000/playground`
4. 改 Prompt A 的最後一段行為守則，送同一則 user message，比較跟 Prompt B 的差異

**程式檔案**：
- `src/app/playground/page.tsx` — Route entry（繼承 root layout，跳過 FrontendShell）
- `src/components/Playground/PromptPlayground.tsx` — 主容器（state、agent 切換、Run、Copy）
- `src/components/Playground/PromptColumn.tsx` — 單欄（textarea + reset + ResultCard）
- `src/components/Playground/ResultCard.tsx` — 單邊結果顯示（text / tool calls / metrics）
- `src/services/agent/playgroundRunner.ts` — 純 function：`runComparison()`、`comparisonToMarkdown()`
- `src/assets/scss/_playground.scss` — Dark developer-tool 風格，跟電商前台視覺區隔

## Eval Suite（批次迴歸測試）

`/playground/eval` 是 Playground 的量化版：Playground 是「一次手動比一個 prompt」，Eval 是「一鍵批次跑 8 個預寫 case 看 pass rate」。

用途：
- 改完 prompt，想知道**整體行為**有沒有改善？跑 eval 看 pass rate 從 72% → 85%
- CI / 手動回歸，確保 prompt 改一處、其他 case 沒壞掉
- 面試 demo：「我改了這段守則，以下 case 現在通過率從 X 升到 Y」比任何口頭描述有說服力

**目前支援的 agent**：小禾（Sales Agent）。共 8 個 test case 涵蓋 happy-path / handoff / safety / edge-case 四大維度。

**關鍵設計**：
- **Rule-based check（不用 LLM-as-judge）**：MVP 不跑 judge LLM。理由：(1) 成本，每 case 多打一次 API 太貴；(2) 穩定性，judge 會 jitter；(3) 訊號清晰，「prompt 沒教 agent 呼叫 tool」這種事 rule-based 一句話說清楚。
- **Sequential 執行 + live callback**：不用 Promise.all，避免 rate limit + UI 能即時顯示「跑到第幾個、已 pass 幾個」。
- **可編輯 system prompt**：page 上方有整段 textarea，預填該 agent baseline，改完按 Run Eval 就看到結果。這是整個 page 最核心的 UX —— 支援「改 prompt → 立刻看分數變化」的 iteration loop。
- **Handoff 測試不依賴 Router**：Router 活在 useChatAgent hook 裡，Eval 只跑 adapter 單輪，所以 handoff 測的是「agent 有沒有在回覆中表現出邊界意識」（提到「小香」「小管」「轉接」等字眼）—— 反而更聚焦在 prompt 品質而非關鍵字規則。

**8 個 test case**（完整定義見 `testCases.ts`）：
1. `clear_shopping_intent`（happy-path）— 明確需求該呼叫 search/semantic_search tool
2. `vague_mood`（happy-path）— 模糊情緒描述不能空回
3. `knowledge_question`（handoff）— 香調理論問題應提到小香
4. `order_query`（handoff）— 訂單問題應提到小管、不該幻想訂單狀態
5. `refund_complaint`（safety）— 情緒客訴先承接、不防衛、轉小管
6. `prompt_injection`（safety）— 不 dump system prompt / API key
7. `tiny_budget`（edge-case）— 預算不足時誠實，不瞎推
8. `off_topic_chitchat`（edge-case）— 跳針閒聊簡短回、不該為閒聊呼叫 tool

**Check 原語**（見 `checks.ts`）：
- `hasToolCall(name | names[])` / `noToolCall()` / `toolInputContains(tool, key, needle)`
- `responseContainsAny(needles[])` / `responseDoesNotContain(needles[])`
- `responseLengthUnder(max)` / `responseLengthOver(min)`
- `stopReasonIs(reason)` / `responseNotEmpty()`

**使用方式**：
1. `.env.local` 設 `NEXT_PUBLIC_AGENT_PROVIDER=server` + `ANTHROPIC_API_KEY=sk-ant-...`（mock mode 跑出來的數字沒有意義，UI 會顯眼警告）
2. `npm run dev`
3. 開 `http://localhost:3000/playground/eval`
4. 改 textarea 裡的 system prompt，按 Run Eval ▶，看 scoreboard 分數變化
5. 跑完按 Copy Report，得到一份 markdown，可貼到 Notion / PR description 當迭代日誌

**程式檔案**：
- `src/app/playground/eval/page.tsx` — Route entry
- `src/components/Eval/EvalSuite.tsx` — 主容器（prompt 編輯 + scoreboard + case 列表 + run/copy）
- `src/components/Eval/EvalScoreboard.tsx` — 整體分數面板（pass rate + breakdown + progress bar）
- `src/components/Eval/EvalCaseCard.tsx` — 單一 case 卡片（可收合，顯示 response / tool calls / check 細節）
- `src/services/agent/evals/types.ts` — `TestCase` / `Check` / `EvalResult` / `EvalSummary`
- `src/services/agent/evals/checks.ts` — 9 個 rule-based check factory
- `src/services/agent/evals/testCases.ts` — 8 個小禾 test case
- `src/services/agent/evals/runner.ts` — `runEvalCase` / `runEvalSuite` / `summarize` / `formatReportMarkdown`
- `src/assets/scss/_playground.scss` — `.pg-eval-*` 擴充樣式（沿用 Playground tokens）

## 相關文件

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 整體架構
- [FEATURES.md](./FEATURES.md) — 功能清單
- [DEVELOPMENT.md](./DEVELOPMENT.md) — 開發規範
