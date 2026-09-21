import { useEffect, useState } from "react";
import { Link } from "react-router";
import MemberShell from "@/components/MemberShell";
import { useMember } from "@/hooks/useMember";
import { getProductsByIds } from "@/services/db/products";
import type { ProductRow } from "@/services/db/types";
import { FAVORITES_CHANGED, readFavorites, setFavorite } from "@/services/favorites";
import styles from "@/styles/Member.module.css";

export default function FavoritesPage() {
  const member = useMember();
  const [ids, setIds] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!member.profile) return;
      setLoading(true); setError("");
      try {
        const current = readFavorites(member.profile.id);
        const rows = await getProductsByIds(current);
        if (active) { setIds(current); setProducts(rows); }
      } catch { if (active) setError("收藏讀取失敗，請確認網路與瀏覽器儲存權限。"); }
      finally { if (active) setLoading(false); }
    };
    void refresh(); window.addEventListener(FAVORITES_CHANGED, refresh); window.addEventListener("storage", refresh);
    return () => { active = false; window.removeEventListener(FAVORITES_CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, [member.profile, attempt]);
  return <MemberShell title="我的收藏">
    <p>收藏儲存在此瀏覽器，依登入帳號區分，不會跨裝置同步。</p>
    {member.loading || loading ? <p role="status">正在讀取收藏…</p>
      : member.error ? <div role="alert"><p>{member.error}</p><button className={styles.button} onClick={member.retry}>重新讀取</button></div>
      : !member.profile ? <p>請先<Link to="/login">登入</Link>以查看收藏。</p>
      : error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={() => retry(n => n + 1)}>重新讀取</button></div>
      : <>{!ids.length && <p>還沒有收藏的商品。<Link to="/product">前往選購</Link></p>}
        <ul className={styles.list}>{ids.map(id => {
          const product = products.find(row => row.id.toLowerCase() === id);
          return <li className={`${styles.card} ${styles.product}`} key={id}>
            {product?.image_url && <img src={product.image_url} alt="" />}
            <div>{product ? <><h2><Link to={`/product/${id}`}>{product.title}</Link></h2><p>NT${product.price.toLocaleString()}</p></> : <p>此收藏商品已下架或無法購買。</p>}
              <button className={styles.button} onClick={() => { try { setFavorite(member.profile!.id, id, false); } catch { setError("無法更新收藏，請確認瀏覽器儲存權限。"); } }}>移除收藏</button></div>
          </li>;
        })}</ul></>}
  </MemberShell>;
}
