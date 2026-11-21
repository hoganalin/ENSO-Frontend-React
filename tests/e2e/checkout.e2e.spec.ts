// E2E:登入 → 加入購物車 → 結帳 → 建立訂單 → TapPay 3DS(人工過 OTP)→ 回站驗證「已付款」+ 截圖。
// 前置:本機 vite dev 已啟動、指向本機 Supabase + TapPay sandbox;已 seed 測試會員(scripts/seed-test-accounts.mjs)。
// ⚠️ 選擇器為 best-effort,請依實際按鈕文字/欄位微調。付款那步必須用可見瀏覽器,由你手動完成 3DS OTP。
import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL || "e2e-member@test.local";
const PASSWORD = process.env.E2E_PASSWORD || "E2e-Password-123";

test("結帳付款全流程(人工過 3DS OTP)→ 訂單已付款", async ({ page }) => {
  test.setTimeout(10 * 60_000);

  // 1. 登入
  await page.goto("/login");
  await page.getByPlaceholder(/name@example\.com|email/i).fill(EMAIL);
  await page.getByPlaceholder(/密碼/).fill(PASSWORD);
  await page.getByRole("button", { name: /登\s*入/ }).click();
  await page.waitForLoadState("networkidle");

  // 2. 選一個商品 → 加入購物車
  await page.goto("/product");
  await page.locator("a[href^='/product/']").first().click();
  await expect(page).toHaveURL(/\/product\//);
  await page.getByRole("button", { name: /加入購物車/ }).first().click();

  // 3. 到購物車 → 前往結帳
  await page.goto("/cart");
  await page.getByRole("link", { name: /結帳/ })
    .or(page.getByRole("button", { name: /結帳/ })).first().click();
  await expect(page).toHaveURL(/\/checkout/);

  // 4. 填結帳資料(本店免地址,只填姓名/Email/手機)
  await page.getByPlaceholder(/姓名|收件人/).first().fill("E2E 測試");
  await page.getByPlaceholder(/email|@/i).first().fill(EMAIL);
  await page.getByPlaceholder(/手機|電話|09/).first().fill("0912345678");

  // 5. 建立訂單 → 進入付款(信用卡 3DS 會轉導發卡行 OTP 頁)
  await page.getByRole("button", { name: /建立訂單|送出|前往付款|確認|結帳|付款/ }).first().click();

  // 6~11. 人工完成 3DS OTP(可見瀏覽器):選網路ATM等、輸入 OTP…
  console.log("⏸️  請在開啟的瀏覽器中完成 TapPay 3DS 驗證(最多等 5 分鐘)…");

  // 12~15. 回站後等「付款成功 / 已付款」出現(涵蓋人工 OTP + webhook 以 AUTH 結算的時間)
  const paid = page.getByText(/付款成功|付款完成|已付款/);
  await expect(paid).toBeVisible({ timeout: 5 * 60_000 });

  // 成功截圖(交付用)
  await page.screenshot({ path: "tests/e2e/__screenshots__/payment-success.png", fullPage: true });

  // 最終驗證:頁面顯示已付款
  await expect(paid).toBeVisible();
});
