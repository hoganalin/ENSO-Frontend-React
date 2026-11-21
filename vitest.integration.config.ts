import { defineConfig } from "vitest/config";

// 整合測試:node 環境、打本機 Supabase(supabase start)。
// 與單元測試(src/**,jsdom)分開,序列化執行避免共用本機 DB 互相干擾。
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.int.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    globals: false,
  },
});
