import { defineConfig, devices } from "@playwright/test";

// E2E:打本機已啟動的前端(vite dev,指向本機 Supabase + TapPay sandbox)。
// headless 必須為 false —— 付款的 3DS OTP 在發卡行頁面,需由人手動完成。
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 10 * 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    headless: false,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
