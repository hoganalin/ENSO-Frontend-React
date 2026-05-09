# `data/` — runtime stores

這個資料夾混了兩種性質的檔案，請分開看待：

## `agent-events.json` — **production 用 Upstash Redis，這個檔僅供本機 dev fallback**

跨 repo 的 Agent Event stream（讀寫端定義在 `src/app/api/events/route.ts`）。

- **Production / Preview / 任何有 `KV_REST_API_URL` env 的環境** → 直接走 Upstash Redis（key：`enso:agent_events`，LIST 結構，`RPUSH` append、`LRANGE` 讀、`LTRIM` 限制最大長度）。
- **本機 dev 沒設 Redis env** → fallback 到這個 JSON 檔。`/api/events` 的 storage abstraction 會自己挑。

寫入端：Next.js `useChatAgent`（對話輪次）、`/playground/eval`（eval 執行）、checkout 流程（order_placed）等。
讀取端：ENSO-BackEnd `/admin/agent`（商家後台 dashboard）。

**這個檔已加進 `.gitignore`，不再 commit。** 過去 commit 過會被 build 進 Vercel lambda image，造成 production 讀到舊死資料的錯覺；現在從 Redis 讀，這個風險不存在。

要重置本機 dev 資料：

```bash
echo "[]" > data/agent-events.json
```

要把本機事件灌進 Redis（一次性 migration，已執行過）：

```bash
npx vercel env pull .env.local
npx tsx --env-file=.env.local scripts/migrate-events-to-redis.ts
```

## `candidate-cases.json` — Eval 候選庫，**已遷移至 Upstash Redis**

讀寫端：`src/app/api/candidate-cases/route.ts`。

- **Production / 任何有 `KV_REST_API_URL` env 的環境** → Upstash Redis（key：`enso:candidate_cases`，LIST 結構，`RPUSH` append、`LRANGE` 讀、`LSET` 改）。
- **本機 dev 沒設 Redis env** → fallback 到這個 JSON 檔（`fs.readFile` / `fs.writeFile`）。

過去版本只支援 `fs.writeFile`，在 Vercel serverless 會 `EROFS: read-only file system`。已於 2026-04 commit `a43bff9` 套用跟 events 相同的 Redis pattern 解決。

## Schema

- `agent-events.json` → `src/types/agent-events.ts`（5 種 kind：conversation_turn / handoff / eval_run / tool_converted / order_placed）
- `candidate-cases.json` → `src/types/candidate-case.ts`
