import { Link } from "react-router";
import MemberShell from "@/components/MemberShell";
import { useMember } from "@/hooks/useMember";
import styles from "@/styles/Member.module.css";

export default function MemberPage() {
  const { profile, loading, error, retry } = useMember();
  return <MemberShell title="會員中心">
    {loading ? <p role="status">正在讀取會員資料…</p> : error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={retry}>重新讀取</button></div>
      : !profile ? <p>登入後即可查看訂單、收藏與推薦資訊。<Link to="/login">前往登入</Link></p>
      : <><h2>{profile.name || "會員"}，歡迎回來</h2>
        <p>會員等級：{({ normal: "一般會員", silver: "銀卡會員", gold: "金卡會員" })[profile.member_tier]}</p>
        <div className={styles.card}><h2>訂單與收藏</h2><p>查看付款及出貨狀態，或將曾購買的商品按目前價格重新加入購物車。</p>
          <div className={styles.actions}><Link className={styles.button} to="/orders">查看訂單</Link><Link className={styles.button} to="/favorites">我的收藏</Link></div></div>
        <div className={styles.card}><h2>優惠與推薦</h2><p>查看進行中的活動、優惠碼及你的推薦紀錄。</p><div className={styles.actions}><Link className={styles.button} to="/offers">優惠與活動</Link><Link className={styles.button} to="/referral">我的推薦</Link></div></div>
        {profile.role === "distributor" && <p><Link className={styles.button} to="/distributor">經銷採購與對帳</Link></p>}
        <p><Link to="/partner-resources">教育資料與推薦素材</Link></p>
      </>}
  </MemberShell>;
}

