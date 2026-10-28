// supabase/functions/_shared/tradeNo.ts
// 付款交易編號工具（金流中立）。
//
// 從 ecpay.ts 搬出來，讓 TapPay 等其他金流不必相依綠界模組；
// 綠界被移除時，這支仍可獨立使用。
//
// 規則：只允許英文字母與數字（4–20 碼）。attempt > 1 時加數字後綴，
// 讓同一訂單「重新發起付款」有不同的唯一編號。

export function toMerchantTradeNo(orderNo: string, attempt = 1): string {
  const base = orderNo.replace(/[^A-Za-z0-9]/g, "");
  const candidate = attempt > 1 ? `${base}${attempt}` : base;
  if (!/^[A-Za-z0-9]{4,20}$/.test(candidate)) {
    throw new Error(`[payment] 交易編號不合法（需符合 ^\\w{4,20}$）：${candidate}`);
  }
  return candidate;
}
