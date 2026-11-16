import { useEffect, useState } from "react";
import { Link } from "react-router";
import MemberShell from "@/components/MemberShell";
import { useMember } from "@/hooks/useMember";
import { getBalance } from "@/services/db/storeCredit";
import styles from "@/styles/Member.module.css";

function useCreditBalance(memberId: string | undefined) {
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setBalance(null); setError(false);
    if (!memberId) return;
    let active = true;
    getBalance(memberId)
      .then(value => { if (active) setBalance(Math.max(0, value)); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [memberId, attempt]);
  return { balance, error, retry: () => setAttempt(n => n + 1) };
}

const TIER_LABEL: Record<string, string> = {
  normal: "一般會員", silver: "銀卡會員", gold: "金卡會員",
};
const TIER_COLOR: Record<string, string> = {
  normal: "var(--enso-fg,#f5eee0)", silver: "#aabbcc", gold: "var(--enso-gold,#c9a063)",
};

export default function MemberPage() {
  const { profile, loading, error, retry } = useMember();
  const credit = useCreditBalance(profile?.id);

  return (
    <MemberShell title="會員中心">
      {loading ? (
        <p role="status">正在讀取會員資料…</p>
      ) : error ? (
        <div role="alert">
          <p>{error}</p>
          <button className={styles.button} onClick={retry}>重新讀取</button>
        </div>
      ) : !profile ? (
        <p>登入後即可查看訂單、收藏與推薦資訊。<Link to="/login">前往登入</Link></p>
      ) : (
        <>
          {/* 歡迎列 */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "1.5rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{profile.name || "會員"}，歡迎回來</h2>
            <span style={{
              fontSize: ".85rem", fontWeight: 600, padding: "2px 10px",
              border: "1px solid " + TIER_COLOR[profile.member_tier],
              color: TIER_COLOR[profile.member_tier], borderRadius: "20px",
            }}>
              {TIER_LABEL[profile.member_tier] ?? profile.member_tier}
            </span>
          </div>

          {/* 員工／管理員：進入後台入口 */}
          {!!profile.role && ["admin", "finance", "warehouse", "support", "marketing"].includes(profile.role) && (
            <Link
              to="/admin"
              className={styles.button}
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "1.25rem",
                background: "var(--enso-gold,#c9a063)", color: "#1a1d1b", fontWeight: 700, textDecoration: "none",
              }}
            >
              進入後台管理 →
            </Link>
          )}

          {/* 購物金餘額卡 */}
          <div className={styles.card} style={{ marginBottom: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <p style={{ margin: "0 0 4px", fontSize: ".85rem", opacity: .7 }}>可用購物金</p>
                <p style={{
                  margin: 0, fontSize: "2rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  color: "var(--enso-gold,#c9a063)", letterSpacing: "-.02em",
                }}>
                  {credit.error ? "暫時無法取得" : credit.balance === null ? "讀取中…" : `NT$ ${credit.balance.toLocaleString("zh-TW")}`}
                </p>
                {credit.error && <div role="alert"><p>購物金讀取失敗，請重試。</p><button className={styles.button} onClick={credit.retry}>重新讀取購物金</button></div>}
                {profile.member_tier !== "normal" && (
                  <p style={{ margin: "4px 0 0", fontSize: ".78rem", opacity: .6 }}>
                    推薦訂單完成後依有效會員等級與回饋設定發放購物金。
                  </p>
                )}
              </div>
              <Link className={styles.button} to="/orders" style={{ fontSize: ".85rem" }}>
                查看我的訂單 →
              </Link>
            </div>
          </div>

          {/* 訂單與收藏 */}
          <div className={styles.card}>
            <h2>訂單與收藏</h2>
            <p>查看付款及出貨狀態，或將曾購買的商品按目前價格重新加入購物車。</p>
            <div className={styles.actions}>
              <Link className={styles.button} to="/orders">查看訂單</Link>
              <Link className={styles.button} to="/favorites">我的收藏</Link>
            </div>
          </div>

          {/* 優惠與推薦 */}
          <div className={styles.card}>
            <h2>優惠與推薦</h2>
            <p>查看進行中的活動、優惠碼及你的推薦紀錄。</p>
            <div className={styles.actions}>
              <Link className={styles.button} to="/offers">優惠與活動</Link>
              <Link className={styles.button} to="/referral">我的推薦</Link>
            </div>
          </div>

          {profile.role === "distributor" && (
            <div className={styles.card}>
              <h2>經銷採購</h2>
              <p>以經銷夥伴身份查看專屬批發價格、批量下單及對帳報表。</p>
              <div className={styles.actions}>
                <Link className={styles.button} to="/distributor">經銷採購與對帳</Link>
              </div>
            </div>
          )}

          <p style={{ marginTop: "1rem" }}>
            <Link to="/partner-resources">教育資料與推薦素材</Link>
          </p>
        </>
      )}
    </MemberShell>
  );
}
