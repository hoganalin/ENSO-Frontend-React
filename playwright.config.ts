import { defineConfig, devices } from "@playwright/test";

// E2E:Playwright 會自行以「E2E 模式」啟動一台 vite(指向本機 Supabase + TapPay sandbox),
// 跑在獨立埠 5199,避免與平常 `npm run dev`(可能指向正式)衝突;絕不重用既有 server。
// headless 必須為 false —— 付款 3DS OTP 在發卡行頁面,需由人手動完成。
const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE,
    headless: false,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "npm run dev:e2e",
    url: BASE,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
