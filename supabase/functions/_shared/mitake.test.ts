// supabase/functions/_shared/mitake.test.ts
// 執行：deno test --allow-net --allow-env supabase/functions/_shared/
//
// 這裡只測「不需要真實帳號」的部分：號碼正規化與回應解析。
// 真正的發送（sendSms）需要三竹帳密與點數，無法在 CI 驗證。

import { assertEquals } from "jsr:@std/assert@1";

import { normalizeTaiwanMobile, parseMitakeResponse } from "./mitake.ts";

Deno.test("手機號碼正規化", () => {
  assertEquals(normalizeTaiwanMobile("0912345678"), "0912345678");
  assertEquals(normalizeTaiwanMobile("0912-345-678"), "0912345678");
  assertEquals(normalizeTaiwanMobile("0912 345 678"), "0912345678");
  assertEquals(normalizeTaiwanMobile("+886912345678"), "0912345678");
  assertEquals(normalizeTaiwanMobile("886912345678"), "0912345678");
  // 不合法的一律 null，讓呼叫端寫 log 而不是把垃圾送給三竹
  assertEquals(normalizeTaiwanMobile("091234567"), null); // 少一碼
  assertEquals(normalizeTaiwanMobile("0812345678"), null); // 不是 09 開頭
  assertEquals(normalizeTaiwanMobile("02-27001234"), null); // 市話
  assertEquals(normalizeTaiwanMobile(""), null);
  assertEquals(normalizeTaiwanMobile(null), null);
});

Deno.test("解析三竹 INI 回應：成功", () => {
  // 三竹實際回傳的格式（不是 pipe 分隔——舊版實作在這裡就錯了）
  const res = parseMitakeResponse(
    ["[1]", "msgid=1010079522", "statuscode=1", "AccountPoint=98", ""].join("\r\n"),
  );
  assertEquals(res.success, true);
  assertEquals(res.msgid, "1010079522");
  assertEquals(res.statusCode, "1");
  assertEquals(res.accountPoint, 98);
});

Deno.test("解析三竹 INI 回應：已送達 / 排程中都算受理", () => {
  for (const code of ["0", "1", "2", "4"]) {
    const res = parseMitakeResponse(`[1]\nmsgid=X\nstatuscode=${code}\n`);
    assertEquals(res.success, true, `statuscode=${code} 應視為已受理`);
  }
});

Deno.test("解析三竹 INI 回應：失敗狀態碼", () => {
  const wrongPassword = parseMitakeResponse("[1]\nstatuscode=e\n");
  assertEquals(wrongPassword.success, false);
  assertEquals(wrongPassword.error, "帳號、密碼錯誤");

  const noNumber = parseMitakeResponse("[1]\nmsgid=\nstatuscode=6\n");
  assertEquals(noNumber.success, false);
  assertEquals(noNumber.error, "門號不存在或關機");

  // 舊版把 '0' 當成唯一的成功值、其他都是錯誤，方向剛好相反
  assertEquals(parseMitakeResponse("[1]\nstatuscode=7\n").success, false);
});

Deno.test("解析三竹 INI 回應：格式完全對不上時要判失敗", () => {
  const res = parseMitakeResponse("<html>500 Internal Server Error</html>");
  assertEquals(res.success, false);
  assertEquals(typeof res.error, "string");
});
