import { Link } from "react-router";
import MemberShell from "@/components/MemberShell";
import styles from "@/styles/Member.module.css";

export default function PartnerResourcesPage() {
  return <MemberShell title="教育資料與推薦素材">
    <p>以下為測試網站的示範教材與文案，可用來練習介紹商品。正式商品規格與對外宣傳內容仍需品牌確認。</p>
    <section className={styles.card}><h2>經銷採購操作</h2><ol><li>於經銷會員中心確認訂閱有效期與折減比例。</li><li>填寫各商品數量，一次加入購物車。</li><li>在結帳頁確認活動、收件資料與最終金額。</li><li>付款後至我的訂單確認商品、付款狀態與出貨資訊。</li></ol><Link to="/distributor">開啟經銷會員中心</Link></section>
    <section className={styles.card}><h2>商品介紹練習</h2><p>從商品頁閱讀香材、規格與使用情境，再依顧客偏好介紹。避免宣稱療效；使用時保持通風，遠離易燃物，燃燒時有人看顧。</p><Link to="/product">查看商品圖片與介紹</Link></section>
    <section className={styles.card}><h2>推薦文案範例</h2><blockquote>想為日常留一段安靜的時間嗎？歡迎看看 ENSO 的香品與禮盒。可透過我的推薦連結查看商品，實際價格與活動以結帳頁為準。</blockquote><p>可選取複製上述文案，再貼上自己的推薦連結。請勿把測試訂單或模擬通知當成真實成交紀錄。</p><Link to="/referral">取得我的推薦連結與業績</Link></section>
  </MemberShell>;
}
