/**
 * 一次性 migration：把 data/candidate-cases.json 灌進 Upstash Redis。
 *
 * 跟 migrate-events-to-redis.ts 是同一套模式，只是 key 不同。
 *
 * 用法：
 *   npx tsx --env-file=.env.local scripts/migrate-cases-to-redis.ts
 *   （--reset 旗標會先 DEL Redis key 再灌）
 *
 * 注意：跑這個之前先確認 .env.local 有 KV_REST_API_URL / KV_REST_API_TOKEN
 *       沒有就 `npx vercel env pull .env.local` 拉下來。
 */

import { promises as fs } from "fs";
import path from "path";

import { Redis } from "@upstash/redis";

import type { CandidateCase } from "../src/types/candidate-case";

const REDIS_KEY = "enso:candidate_cases";
const DATA_FILE = path.join(process.cwd(), "data", "candidate-cases.json");

async function main() {
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

  let raw: string;
  try {
    raw = await fs.readFile(DATA_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`ℹ️  ${DATA_FILE} 不存在，沒有資料要 migrate（OK）`);
      return;
    }
    throw err;
  }

  const cases = JSON.parse(raw) as CandidateCase[];
  if (!Array.isArray(cases)) {
    console.error("❌ data/candidate-cases.json 不是 array");
    process.exit(1);
  }

  console.log(`📂 從 ${DATA_FILE} 讀到 ${cases.length} 筆 case`);

  if (cases.length === 0) {
    console.log("ℹ️  本機沒有 case 資料，無事可做。");
    return;
  }

  if (reset) {
    console.log("🗑  --reset：先 DEL Redis key");
    await redis.del(REDIS_KEY);
  }

  const sorted = [...cases].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  await redis.rpush(REDIS_KEY, ...(sorted as unknown[]));

  const finalLen = await redis.llen(REDIS_KEY);
  console.log(`✅ 完成。Redis ${REDIS_KEY} 目前長度：${finalLen}`);
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
