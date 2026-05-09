/**
 * 一次性 migration：把 data/agent-events.json 灌進 Upstash Redis。
 *
 * 用法：
 *   1. 先確保本機 .env.local 有 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *      （或 KV_REST_API_URL / KV_REST_API_TOKEN）。
 *      Vercel 那邊把這些 vars pull 下來：`vercel env pull .env.local`
 *   2. `npx tsx scripts/migrate-events-to-redis.ts`
 *
 * 行為：
 *   - 預設只「append」現有資料（不刪 Redis 既有）。
 *   - 加 --reset 旗標會先 DEL 再灌（小心：會清掉 production 累積的事件）。
 *   - migration 後印出 Redis LIST 長度作為 sanity check。
 */

import { promises as fs } from "fs";
import path from "path";

import { Redis } from "@upstash/redis";

import type { AgentEvent } from "../src/types/agent-events";

const REDIS_KEY = "enso:agent_events";
const DATA_FILE = path.join(process.cwd(), "data", "agent-events.json");

async function main() {
  // 同時支援 Vercel KV-style 與原生 Upstash 命名
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    console.error(
      "❌ 缺少 Redis 環境變數。請先 `vercel env pull .env.local` 或手動設定：\n" +
        "   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN\n" +
        "   或 KV_REST_API_URL / KV_REST_API_TOKEN",
    );
    process.exit(1);
  }

  const redis = new Redis({ url, token });
  const reset = process.argv.includes("--reset");

  // 讀本機 JSON 檔
  let raw: string;
  try {
    raw = await fs.readFile(DATA_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`❌ 找不到 ${DATA_FILE}`);
      process.exit(1);
    }
    throw err;
  }

  const events = JSON.parse(raw) as AgentEvent[];
  if (!Array.isArray(events)) {
    console.error("❌ data/agent-events.json 不是 array");
    process.exit(1);
  }

  console.log(`📂 從 ${DATA_FILE} 讀到 ${events.length} 筆事件`);

  if (reset) {
    console.log("🗑  --reset：先 DEL Redis key");
    await redis.del(REDIS_KEY);
  }

  // 依時間排序（舊→新），用 RPUSH 一筆一筆 append，這樣讀出來時順序合理
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  // 批次 RPUSH 一次（@upstash/redis 支援多參數）
  if (sorted.length > 0) {
    // SDK 接受 unknown[]，把每筆事件展開成 args
    await redis.rpush(REDIS_KEY, ...(sorted as unknown[]));
  }

  const finalLen = await redis.llen(REDIS_KEY);
  console.log(`✅ 完成。Redis ${REDIS_KEY} 目前長度：${finalLen}`);
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
