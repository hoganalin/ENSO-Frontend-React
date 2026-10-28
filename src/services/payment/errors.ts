// src/services/payment/errors.ts — 付款錯誤型別（金流中立）
//
// 從已移除的 ECPay client.ts 搬出來，給 TapPay 等金流共用。

export class PaymentError extends Error {
  /** 穩定代碼，例如 order_not_payable / amount_mismatch / unauthorized */
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}
