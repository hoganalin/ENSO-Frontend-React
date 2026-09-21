import { describe, it, expect } from "vitest";

import {
  creditForCompletedOrder,
  earnTxForOrder,
  reverseTxForOrder,
  spendTx,
  balanceOf,
  pendingExpiryAmount,
  rateForTier,
  ONE_YEAR_MS,
  DEFAULT_TIER_RATES,
  type CompletedOrder,
  type CreditTx,
  type Referrer,
  type TierRates,
} from "@/domain/storeCredit";

const order = (subtotal: number, id = "#1"): CompletedOrder => ({
  id,
  buyerId: "B",
  subtotal,
});
const T0 = 1_700_000_000_000; // 固定基準時間（毫秒）

// 預設比例：銀卡 10%、金卡 20%
const RATES: TierRates = DEFAULT_TIER_RATES;

describe("rateForTier — 等級比例對照", () => {
  it("normal 回傳 0（不發）", () => {
    expect(rateForTier("normal", RATES)).toBe(0);
  });
  it("silver 回傳 silverPercent", () => {
    expect(rateForTier("silver", RATES)).toBe(10);
  });
  it("gold 回傳 goldPercent", () => {
    expect(rateForTier("gold", RATES)).toBe(20);
  });
});

describe("creditForCompletedOrder — 依推薦人當下身分", () => {
  const normal: Referrer = { id: "N", tier: "normal" };
  const gold: Referrer = { id: "G", tier: "gold" };
  const silver: Referrer = { id: "S", tier: "silver" };

  it("普通會員推薦人：不發購物金（回傳 0）", () => {
    expect(creditForCompletedOrder(order(1000), normal, RATES)).toBe(0);
    expect(creditForCompletedOrder(order(880), normal, RATES)).toBe(0);
  });

  it("銀卡推薦人：subtotal × 10%，四捨五入", () => {
    expect(creditForCompletedOrder(order(1000), silver, RATES)).toBe(100);
    expect(creditForCompletedOrder(order(880), silver, RATES)).toBe(88);
    expect(creditForCompletedOrder(order(333), silver, RATES)).toBe(33); // 33.3 → 33
  });

  it("金卡推薦人：subtotal × 20%，四捨五入", () => {
    expect(creditForCompletedOrder(order(1000), gold, RATES)).toBe(200);
    expect(creditForCompletedOrder(order(880), gold, RATES)).toBe(176);
    expect(creditForCompletedOrder(order(333), gold, RATES)).toBe(67); // 66.6 → 67
  });

  it("自訂比例：管理者可調整兩個等級的比例", () => {
    const custom: TierRates = { silverPercent: 5, goldPercent: 15 };
    expect(creditForCompletedOrder(order(1000), silver, custom)).toBe(50);
    expect(creditForCompletedOrder(order(1000), gold, custom)).toBe(150);
  });

  it("沒有推薦人：不發", () => {
    expect(creditForCompletedOrder(order(1000), null, RATES)).toBe(0);
  });

  it("比例為 0 時：不發", () => {
    const zeroRates: TierRates = { silverPercent: 0, goldPercent: 0 };
    expect(creditForCompletedOrder(order(1000), silver, zeroRates)).toBe(0);
    expect(creditForCompletedOrder(order(1000), gold, zeroRates)).toBe(0);
  });
});

describe("earnTxForOrder — 發放與效期", () => {
  it("銀卡推薦人：產生 earn（10%），效期 +1 年", () => {
    const tx = earnTxForOrder(order(2000), { id: "S", tier: "silver" }, RATES, T0);
    expect(tx).not.toBeNull();
    expect(tx!.type).toBe("earn");
    expect(tx!.amount).toBe(200); // 2000 × 10%
    expect(tx!.memberId).toBe("S");
    expect(tx!.expiresAt).toBe(T0 + ONE_YEAR_MS);
  });

  it("金卡推薦人：產生 earn（20%）", () => {
    const tx = earnTxForOrder(order(2000), { id: "G", tier: "gold" }, RATES, T0);
    expect(tx).not.toBeNull();
    expect(tx!.amount).toBe(400); // 2000 × 20%
  });

  it("普通會員推薦人：不產生交易（回傳 null）", () => {
    expect(earnTxForOrder(order(2000), { id: "N", tier: "normal" }, RATES, T0)).toBeNull();
  });

  it("沒有推薦人：不產生交易", () => {
    expect(earnTxForOrder(order(2000), null, RATES, T0)).toBeNull();
  });
});

describe("balanceOf — 現金流餘額（允許負值）", () => {
  it("銀卡推薦人賺、花之後結餘正確", () => {
    const ledger: CreditTx[] = [
      earnTxForOrder(order(1000, "#1"), { id: "S", tier: "silver" }, RATES, T0)!, // +100
      spendTx("S", 30, T0 + 1000), // -30
    ];
    expect(balanceOf("S", ledger)).toBe(70);
  });
});

describe("退貨回沖 — reverseTxForOrder", () => {
  it("退款回沖對應訂單的購物金；已花掉則變負餘額", () => {
    const earn = earnTxForOrder(order(2000, "#7"), { id: "S", tier: "silver" }, RATES, T0)!; // +200
    const spend = spendTx("S", 150, T0 + 1000); // -150  → 餘 50
    let ledger: CreditTx[] = [earn, spend];
    expect(balanceOf("S", ledger)).toBe(50);

    const reverse = reverseTxForOrder("#7", ledger, T0 + 2000); // -200（回沖）
    expect(reverse).not.toBeNull();
    expect(reverse!.amount).toBe(200);
    ledger = [...ledger, reverse!];
    expect(balanceOf("S", ledger)).toBe(-150); // 50 - 200 = -150（記負值）
  });

  it("找不到對應 earn 時回傳 null", () => {
    expect(reverseTxForOrder("#nope", [], T0)).toBeNull();
  });
});

describe("pendingExpiryAmount — 一年效期（FIFO）", () => {
  it("未到期不算過期", () => {
    const ledger = [earnTxForOrder(order(1000, "#1"), { id: "S", tier: "silver" }, RATES, T0)!];
    expect(pendingExpiryAmount("S", ledger, T0 + ONE_YEAR_MS - 1)).toBe(0);
  });

  it("到期且未使用：整筆可過期", () => {
    const ledger = [earnTxForOrder(order(1000, "#1"), { id: "S", tier: "silver" }, RATES, T0)!]; // +100
    expect(pendingExpiryAmount("S", ledger, T0 + ONE_YEAR_MS + 1)).toBe(100);
  });

  it("到期但已花掉一部分：只有剩餘可過期（FIFO 先扣最舊）", () => {
    const ledger: CreditTx[] = [
      earnTxForOrder(order(1000, "#1"), { id: "S", tier: "silver" }, RATES, T0)!, // +100
      spendTx("S", 40, T0 + 1000), // 花掉 40
    ];
    expect(pendingExpiryAmount("S", ledger, T0 + ONE_YEAR_MS + 1)).toBe(60);
  });
});
