// 前端付款薄層（services/payment/client.ts）的測試。
// 重點是「這一層真的什麼都不做」：只傳 orderId、不碰金額、不改綠界欄位，
// 以及後端回的錯誤要被翻成看得懂的訊息，而不是 supabase-js 的那句英文。
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPaymentForm,
  PaymentError,
  submitPaymentForm,
  startEcpayPayment,
  type PaymentFormPayload,
} from "@/services/payment/client";

const invoke = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}));

const payload: PaymentFormPayload = {
  action: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  fields: {
    MerchantID: "2000132",
    MerchantTradeNo: "ENSO_9F3A2B1C",
    MerchantTradeDate: "2026/09/12 20:05:01",
    PaymentType: "aio",
    TotalAmount: "1880",
    TradeDesc: "ENSO 線上購物",
    ItemName: "沉靜檀香 x 2#晨露白茶 x 1",
    ReturnURL: "https://abc.supabase.co/functions/v1/payment-notify",
    ChoosePayment: "ALL",
    EncryptType: "1",
    CheckMacValue: "A1B2C3D4E5F60718293A4B5C6D7E8F90A1B2C3D4E5F60718293A4B5C6D7E8F90",
  },
  merchantTradeNo: "ENSO_9F3A2B1C",
  amount: 1880,
  orderNo: "ENSO-9F3A2B1C",
};

beforeEach(() => {
  invoke.mockReset();
  document.body.innerHTML = "";
});

describe("createPaymentForm", () => {
  it("只傳 orderId 給 payment-create（金額一律由伺服器算）", async () => {
    invoke.mockResolvedValue({ data: payload, error: null });

    const result = await createPaymentForm("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04");

    expect(invoke).toHaveBeenCalledWith("payment-create", {
      body: { orderId: "3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04" },
    });
    // body 裡不該出現任何金額欄位
    const body = invoke.mock.calls[0][1] as { body: Record<string, unknown> };
    expect(Object.keys(body.body)).toEqual(["orderId"]);
    expect(result.amount).toBe(1880);
  });

  it("沒有 orderId 直接擋掉，不發請求", async () => {
    await expect(createPaymentForm("")).rejects.toBeInstanceOf(PaymentError);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("把 Edge Function 的錯誤 body 翻成繁中訊息與 code", async () => {
    // supabase-js 對非 2xx 只給一句英文，真正原因在 error.context（Response）裡
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: {
          json: async () => ({
            error: { code: "order_not_payable", message: "訂單狀態為 completed，無法付款" },
          }),
        },
      },
    });

    await expect(createPaymentForm("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04")).rejects.toThrow(
      "訂單狀態為 completed，無法付款",
    );

    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: {
          json: async () => ({ error: { code: "amount_mismatch", message: "訂單金額驗算不符" } }),
        },
      },
    });
    const err = await createPaymentForm("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04").catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).code).toBe("amount_mismatch");
  });

  it("回應不是 JSON 時給通用訊息，不讓 exception 逸出成別的型別", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: {
          json: async () => {
            throw new SyntaxError("Unexpected token <");
          },
        },
      },
    });
    const err = await createPaymentForm("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04").catch((e) => e);
    expect(err).toBeInstanceOf(PaymentError);
    expect((err as PaymentError).code).toBe("invoke_failed");
  });

  it("回應缺少 action / fields 視為異常", async () => {
    invoke.mockResolvedValue({ data: { amount: 100 }, error: null });
    const err = await createPaymentForm("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04").catch((e) => e);
    expect((err as PaymentError).code).toBe("invalid_response");
  });
});

describe("submitPaymentForm", () => {
  it("原封不動地把欄位放進隱藏表單並 POST 到綠界", () => {
    // jsdom 沒有實作 form.submit()，會丟 Not implemented，所以攔下來檢查
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});

    submitPaymentForm(payload);

    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    expect(form!.method.toUpperCase()).toBe("POST");
    expect(form!.action).toBe(payload.action);
    expect(form!.target).toBe("_self"); // _blank 會被彈窗攔阻擋掉付款

    const inputs = Array.from(form!.querySelectorAll("input"));
    expect(inputs).toHaveLength(Object.keys(payload.fields).length);
    for (const [name, value] of Object.entries(payload.fields)) {
      const input = inputs.find((i) => i.name === name);
      expect(input, `缺少欄位 ${name}`).toBeDefined();
      expect(input!.type).toBe("hidden");
      // 值必須一字不差，改一個字綠界就驗簽失敗
      expect(input!.value).toBe(value);
    }
    expect(submit).toHaveBeenCalledTimes(1);
    submit.mockRestore();
  });

  it("含引號 / 角括號的值不會被當成 HTML（不是字串拼接）", () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const nasty = '<img src=x onerror="alert(1)">"\'';

    submitPaymentForm({ ...payload, fields: { ...payload.fields, ItemName: nasty } });

    const form = document.querySelector("form")!;
    const input = Array.from(form.querySelectorAll("input")).find((i) => i.name === "ItemName")!;
    expect(input.value).toBe(nasty);
    // 沒有任何 <img> 被真的建出來
    expect(document.querySelectorAll("img")).toHaveLength(0);
    submit.mockRestore();
  });
});

describe("startEcpayPayment", () => {
  it("取得欄位後直接送出表單", async () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    invoke.mockResolvedValue({ data: payload, error: null });

    await startEcpayPayment("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04");

    expect(submit).toHaveBeenCalledTimes(1);
    expect(document.querySelector("form")!.action).toBe(payload.action);
    submit.mockRestore();
  });

  it("payment-create 失敗時不會送出任何表單", async () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    invoke.mockResolvedValue({
      data: null,
      error: { message: "boom", context: { json: async () => ({}) } },
    });

    await expect(startEcpayPayment("3f8a6e2c-1b4d-4f7a-9c3e-2d5b8a1f6c04")).rejects.toBeInstanceOf(
      PaymentError,
    );
    expect(submit).not.toHaveBeenCalled();
    expect(document.querySelector("form")).toBeNull();
    submit.mockRestore();
  });
});
