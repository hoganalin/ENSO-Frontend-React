import { describe, it, expect } from "vitest";

import {
  creditForCompletedOrder,
  earnTxForOrder,
  reverseTxForOrder,
  spendTx,
  balanceOf,
  pendingExpiryAmount,
  ONE_YEAR_MS,
  type CompletedOrder,
  type CreditTx,
  type Referrer,
} from "@/domain/storeCredit";

const order = (subtotal: number, id = "#1"): CompletedOrder => ({
  id,
  buyerId: "B",
  subtotal,
});
const T0 = 1_700_000_000_000; // 固定基準時間（毫秒）

describe("creditForCompletedOrder — 依推薦人當下身分", () => {
  const normal: Referrer = { id: "N", tier: "normal" };
  const gold: Referrer = { id: "G", tier: "gold" };
  const silver: Referrer = { id: "S", tier: "silver" };

  it("普通會員推薦人：拿商品小計的比例（四捨五入）", () => {
    expect(creditForCompletedOrder(order(1000), normal, 10)).toBe(100);
    expect(creditForCompletedOrder(order(880), normal, 20)).toBe(176);
  });

  it("金卡／銀卡推薦人：只有可見度、不拿錢", () => {
    expect(creditForCompletedOrder(order(1000), gold, 10)).toBe(0);
    expect(creditForCompletedOrder(order(1000), silver, 20)).toBe(0);
  });

  it("沒有推薦人或比例為 0：不發", () => {
    expect(creditForCompletedOrder(order(1000), null, 10)).toBe(0);
    expect(creditForCompletedOrder(order(1000), normal, 0)).toBe(0);
  });
});

describe("earnTxForOrder — 發放與效期", () => {
  it("普通推薦人：產生 earn，效期為完成時間 +1 年", () => {
    const tx = earnTxForOrder(order(2000), { id: "N", tier: "normal" }, 10, T0);
    expect(tx).not.toBeNull();
    expect(tx!.type).toBe("earn");
    expect(tx!.amount).toBe(200);
    expect(tx!.memberId).toBe("N");
    expect(tx!.expiresAt).toBe(T0 + ONE_YEAR_MS);
  });

  it("金卡推薦人：不產生交易", () => {
    expect(earnTxForOrder(order(2000), { id: "G", tier: "gold" }, 10, T0)).toBeNull();
  });
});

describe("balanceOf — 現金流餘額（允許負值）", () => {
  it("賺、花之後結餘正確", () => {
    const ledger: CreditTx[] = [
      earnTxForOrder(order(1000, "#1"), { id: "N", tier: "normal" }, 10, T0)!, // +100
      spendTx("N", 30, T0 + 1000), // -30
    ];
    expect(balanceOf("N", ledger)).toBe(70);
  });
});

describe("退貨回沖 — reverseTxForOrder", () => {
  it("退款回沖對應訂單的購物金；已花掉則變負餘額", () => {
    const earn = earnTxForOrder(order(2000, "#7"), { id: "N", tier: "normal" }, 10, T0)!; // +200
    const spend = spendTx("N", 150, T0 + 1000); // -150  → 餘 50
    let ledger: CreditTx[] = [earn, spend];
    expect(balanceOf("N", ledger)).toBe(50);

    const reverse = reverseTxForOrder("#7", ledger, T0 + 2000); // -200（回沖）
    expect(reverse).not.toBeNull();
    expect(reverse!.amount).toBe(200);
    ledger = [...ledger, reverse!];
    expect(balanceOf("N", ledger)).toBe(-150); // 50 - 200 = -150（記負值）
  });

  it("找不到對應 earn 時回傳 null", () => {
    expect(reverseTxForOrder("#nope", [], T0)).toBeNull();
  });
});

describe("pendingExpiryAmount — 一年效期（FIFO）", () => {
  it("未到期不算過期", () => {
    const ledger = [earnTxForOrder(order(1000, "#1"), { id: "N", tier: "normal" }, 10, T0)!];
    expect(pendingExpiryAmount("N", ledger, T0 + ONE_YEAR_MS - 1)).toBe(0);
  });

  it("到期且未使用：整筆可過期", () => {
    const ledger = [earnTxForOrder(order(1000, "#1"), { id: "N", tier: "normal" }, 10, T0)!]; // +100
    expect(pendingExpiryAmount("N", ledger, T0 + ONE_YEAR_MS + 1)).toBe(100);
  });

  it("到期但已花掉一部分：只有剩餘可過期（FIFO 先扣最舊）", () => {
    const ledger: CreditTx[] = [
      earnTxForOrder(order(1000, "#1"), { id: "N", tier: "normal" }, 10, T0)!, // +100
      spendTx("N", 40, T0 + 1000), // 花掉 40
    ];
    expect(pendingExpiryAmount("N", ledger, T0 + ONE_YEAR_MS + 1)).toBe(60);
  });
});
