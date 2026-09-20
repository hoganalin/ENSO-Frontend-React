// supabase/functions/_shared/ecpay.test.ts
// 執行：deno test --allow-net --allow-env --allow-read supabase/functions/_shared/
//
// 重點是第一個測試：**把我們的簽章跟綠界官方 Node SDK 算出來的值對比**。
// 簽章這種東西自己測自己永遠會過，只有跟官方實作逐字元比對才有意義。
// 官方套件：ecpay_aio_nodejs@1.2.2（lib/ecpay_payment/helper.js）。
//
// 注意：官方 SDK 的 gen_chk_mac_value 用 `JSON.stringify().replace()` 組字串，
// 參數值裡若出現 `","` 這種序列會被它誤判成欄位分隔。我們的實作是直接
// join `&`，沒有這個問題；所以測試資料刻意避開那種值，才能公平比對。

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import ECPayHelper from "npm:ecpay_aio_nodejs@1.2.2/lib/ecpay_payment/helper.js";

import {
  buildAioCheckoutFields,
  buildCheckMacRawString,
  formatMerchantTradeDate,
  generateCheckMacValue,
  orderNoFromMerchantTradeNo,
  parseNotifyPayload,
  toMerchantTradeNo,
  verifyCheckMacValue,
  type EcpayConfig,
} from "./ecpay.ts";

// 綠界官方文件的測試商店資料（公開資訊，不是真金鑰）。
const config: EcpayConfig = {
  merchantId: "2000132",
  hashKey: "5294y06JbISpM5x9",
  hashIv: "v77hoKGq4kWxNNIS",
  isProduction: false,
};

function officialCheckMac(params: Record<string, string>): string {
  const helper = new (ECPayHelper as unknown as new (o: unknown) => {
    gen_chk_mac_value(p: Record<string, string>, mode?: number): string;
  })({
    OperationMode: "Test",
    MercProfile: {
      MerchantID: config.merchantId,
      HashKey: config.hashKey,
      HashIV: config.hashIv,
    },
    IgnorePayment: [],
    IsProjectContractor: false,
  });
  return helper.gen_chk_mac_value({ ...params }, 1); // mode 1 = SHA256
}

const SAMPLES: Record<string, string>[] = [
  {
    // 綠界文件範例的參數組合
    MerchantID: "2000132",
    MerchantTradeNo: "Test1234567",
    MerchantTradeDate: "2013/03/12 15:30:23",
    PaymentType: "aio",
    TotalAmount: "300",
    TradeDesc: "促銷方案",
    ItemName: "Iphone6 手機",
    ReturnURL: "http://public.ecpay.com.tw/receive.aspx",
    ChoosePayment: "ALL",
    EncryptType: "1",
  },
  {
    // 我們實際會送的形狀：底線編號、中文品項、https 回調
    MerchantID: "2000132",
    MerchantTradeNo: "ENSO_9F3A2B1C",
    MerchantTradeDate: "2026/09/12 20:05:01",
    PaymentType: "aio",
    TotalAmount: "1880",
    TradeDesc: "ENSO 線上購物",
    ItemName: "沉靜檀香 x 2#晨露白茶 x 1",
    ReturnURL: "https://abcdefg.supabase.co/functions/v1/payment-notify",
    ClientBackURL: "https://enso.example.com/orders",
    ChoosePayment: "ALL",
    EncryptType: "1",
    CustomField1: "ENSO-9F3A2B1C",
  },
  {
    // 邊界字元：空白、單引號、波浪號、`+`、括號（.NET UrlEncode 與 encodeURIComponent 的差異點）
    MerchantID: "2000132",
    MerchantTradeNo: "EDGE_0001",
    MerchantTradeDate: "2026/01/01 00:00:00",
    PaymentType: "aio",
    TotalAmount: "1",
    TradeDesc: "a b~c'd (e) f+g",
    ItemName: "測試 商品~'()",
    ReturnURL: "https://example.com/a?b=c&d=e",
    ChoosePayment: "Credit",
    EncryptType: "1",
  },
];

Deno.test("CheckMacValue 與綠界官方 SDK 完全一致", async () => {
  for (const sample of SAMPLES) {
    const mine = await generateCheckMacValue(sample, config);
    const official = officialCheckMac(sample);
    assertEquals(
      mine,
      official,
      `MerchantTradeNo=${sample.MerchantTradeNo} 的簽章與官方 SDK 不符`,
    );
    assert(/^[0-9A-F]{64}$/.test(mine), "應為 64 碼大寫 hex（SHA256）");
  }
});

Deno.test("簽章原文格式：HashKey=...&排序後參數&HashIV=...", () => {
  const raw = buildCheckMacRawString(
    { ZParam: "1", aParam: "2", MParam: "3" },
    config,
  );
  assertEquals(
    raw,
    `HashKey=${config.hashKey}&aParam=2&MParam=3&ZParam=1&HashIV=${config.hashIv}`,
  );
});

Deno.test("簽章參數含 CheckMacValue / HashKey / HashIV 時要拋錯", () => {
  for (const bad of ["CheckMacValue", "HashKey", "HashIV"]) {
    let threw = false;
    try {
      buildCheckMacRawString({ A: "1", [bad]: "x" }, config);
    } catch {
      threw = true;
    }
    assert(threw, `${bad} 沒有被擋下來`);
  }
});

Deno.test("驗簽：自己簽的過、被竄改的不過", async () => {
  const params: Record<string, string> = { ...SAMPLES[1] };
  const signed: Record<string, string> = {
    ...params,
    CheckMacValue: await generateCheckMacValue(params, config),
  };
  assert(await verifyCheckMacValue(signed, config), "自己簽的應該驗得過");

  // 改金額 → 驗不過（這就是防「付 1 元」的那道關）
  const tampered = { ...signed, TotalAmount: "1" };
  assertEquals(await verifyCheckMacValue(tampered, config), false);

  // 少一個欄位 → 驗不過（提醒：驗簽時不可過濾 payload）
  const missingField: Record<string, string> = { ...signed };
  delete missingField.CustomField1;
  assertEquals(await verifyCheckMacValue(missingField, config), false);

  // 沒有 CheckMacValue → 直接不過
  assertEquals(await verifyCheckMacValue({ ...params }, config), false);

  // 大小寫不同但值相同 → 應該過（綠界回傳一律大寫，但不要靠這點）
  const lower = { ...signed, CheckMacValue: signed.CheckMacValue.toLowerCase() };
  assert(await verifyCheckMacValue(lower, config));
});

Deno.test("MerchantTradeNo：order_no 轉換可逆且符合 ^\\w{4,20}$", () => {
  assertEquals(toMerchantTradeNo("ENSO-9F3A2B1C"), "ENSO9F3A2B1C");
  assertEquals(toMerchantTradeNo("ENSO-9F3A2B1C", 2), "ENSO9F3A2B1C2");
  assertEquals(orderNoFromMerchantTradeNo("ENSO9F3A2B1C"), "ENSO9F3A2B1C");
  assertEquals(orderNoFromMerchantTradeNo("ENSO9F3A2B1C3"), "ENSO9F3A2B1C3");

  for (const n of ["ENSO9F3A2B1C", toMerchantTradeNo("ENSO-9F3A2B1C", 9)]) {
    assert(/^\w{4,20}$/.test(n), `${n} 不符合綠界格式`);
  }

  // UUID（舊實作的 bug）必須被擋下來：36 字且含 `-`
  let threw = false;
  try {
    toMerchantTradeNo("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04");
  } catch {
    threw = true;
  }
  assert(threw, "UUID 應該被判為不合法的 MerchantTradeNo");
});

Deno.test("MerchantTradeDate 是台北時間（UTC+8）且格式正確", () => {
  // 2026-09-12T16:05:01Z → 台北時間 2026/09/13 00:05:01（跨日）
  const formatted = formatMerchantTradeDate(new Date("2026-09-12T16:05:01Z"));
  assertEquals(formatted, "2026/09/13 00:05:01");
  assert(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(formatted));
  // 若誤用 UTC 就會是 09/12 16:05:01
  assertNotEquals(formatted, "2026/09/12 16:05:01");
});

Deno.test("buildAioCheckoutFields：必要欄位、字串型別、簽章可驗證", async () => {
  const { action, fields } = await buildAioCheckoutFields(
    {
      merchantTradeNo: "ENSO_TEST0001",
      totalAmount: 1880,
      items: [
        { title: "沉靜檀香#特別版", qty: 2, unitPrice: 880 },
        { title: "晨露白茶", qty: 1, unitPrice: 120 },
      ],
      tradeDesc: "ENSO 線上購物",
      returnUrl: "https://abc.supabase.co/functions/v1/payment-notify",
      now: new Date("2026-09-12T04:00:00Z"),
    },
    config,
  );

  assertEquals(action, "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5");
  assertEquals(fields.EncryptType, "1"); // 字串，不是數字
  assertEquals(fields.PaymentType, "aio");
  assertEquals(fields.TotalAmount, "1880");
  assertEquals(fields.ChoosePayment, "ALL");
  // AIO 沒有 NotifyURL；背景回調就是 ReturnURL
  assertEquals("NotifyURL" in fields, false);
  assertEquals(fields.ReturnURL, "https://abc.supabase.co/functions/v1/payment-notify");
  // 商品名稱裡的 `#` 會破壞品項分隔，必須被清掉
  assertEquals(fields.ItemName.split("#").length, 2);
  for (const [k, v] of Object.entries(fields)) {
    assertEquals(typeof v, "string", `${k} 必須是字串`);
  }
  assert(await verifyCheckMacValue(fields, config));
});

Deno.test("buildAioCheckoutFields：金額不合法要拋錯", async () => {
  for (const amount of [0, -1, 12.5]) {
    let threw = false;
    try {
      await buildAioCheckoutFields(
        {
          merchantTradeNo: "ENSO_TEST0001",
          totalAmount: amount,
          items: [{ title: "x", qty: 1, unitPrice: amount }],
          tradeDesc: "t",
          returnUrl: "https://a.b/c",
        },
        config,
      );
    } catch {
      threw = true;
    }
    assert(threw, `TotalAmount=${amount} 應該被擋下來`);
  }
});

Deno.test("parseNotifyPayload：讀 RtnCode / TradeAmt（不是 TradeStatus / TotalAmount）", () => {
  const ok = parseNotifyPayload({
    MerchantID: "2000132",
    MerchantTradeNo: "ENSO_9F3A2B1C",
    RtnCode: "1",
    RtnMsg: "Succeeded",
    TradeNo: "2609121234567890",
    TradeAmt: "1880",
    PaymentDate: "2026/09/12 20:06:33",
    PaymentType: "Credit_CreditCard",
    SimulatePaid: "0",
  });
  assertEquals(ok.paid, true);
  assertEquals(ok.amount, 1880);
  assertEquals(ok.gatewayTradeNo, "2609121234567890");
  assertEquals(ok.simulatePaid, false);

  const failed = parseNotifyPayload({
    MerchantTradeNo: "ENSO_9F3A2B1C",
    RtnCode: "10100058",
    RtnMsg: "付款失敗",
    TradeAmt: "1880",
  });
  assertEquals(failed.paid, false);

  // 舊實作看 TradeStatus，但回調裡沒有這個欄位 → 永遠判定失敗
  assertEquals(parseNotifyPayload({ TradeStatus: "0" }).paid, false);
});
