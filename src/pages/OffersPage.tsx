import { useEffect, useState } from "react";
import { Link } from "react-router";
import MemberShell from "@/components/MemberShell";
import MemberMessages from "@/components/MemberMessages";
import { listMemberOffers, offerBenefit, offerConditions } from "@/services/db/memberOffers";
import type { PromotionRow } from "@/services/db/types";
import styles from "@/styles/Member.module.css";

export default function OffersPage() {
  const [offers, setOffers] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError("");
    listMemberOffers().then(rows => { if (active) setOffers(rows); })
      .catch(() => { if (active) setError("活動讀取失敗，請稍後重試。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return <MemberShell title="優惠與活動">
    <MemberMessages />
    <p>下列為目前進行中的活動。優惠碼可於購物車輸入；是否符合資格、商品限制及可併用優惠，依結帳確認結果為準。</p>
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">正在讀取活動…</p> : error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={() => retry(n => n + 1)}>重新讀取</button></div>
      : <>{!offers.length && <p>目前沒有進行中的活動。<Link to="/product">查看商品</Link></p>}
        <ul className={styles.list}>{offers.map(offer => <li className={styles.card} key={offer.id}>
          <h2>{offer.name}</h2><p>{offerBenefit(offer)}</p><p>{offer.is_auto ? "符合條件時自動套用" : offer.code ? `優惠碼：${offer.code}` : "依活動條件套用"}</p>
          <p>活動期限：{offer.ends_at ? new Date(offer.ends_at).toLocaleString("zh-TW") : "未設定結束日期"}</p>
          <ul>{offerConditions(offer).map(condition => <li key={condition}>{condition}</li>)}</ul>
          {offer.code && <button className={styles.button} onClick={async () => {
            try { await navigator.clipboard.writeText(offer.code!); setMessage(`已複製優惠碼 ${offer.code}，可到購物車輸入。`); }
            catch { setMessage(`無法使用剪貼簿，請手動複製：${offer.code}`); }
          }}>複製優惠碼</button>}
        </li>)}</ul></>}
  </MemberShell>;
}
