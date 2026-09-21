import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMember } from "@/hooks/useMember";
import { FAVORITES_CHANGED, readFavorites, setFavorite } from "@/services/favorites";
import styles from "@/styles/Member.module.css";

interface FavoriteButtonProps { productId: string }
export default function FavoriteButton({ productId }: FavoriteButtonProps) {
  const { profile, loading, error } = useMember();
  const [selected, setSelected] = useState(false);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const refresh = () => {
      try { setSelected(!!profile && readFavorites(profile.id).includes(productId.toLowerCase())); }
      catch { setFailure("無法讀取此瀏覽器的收藏資料。"); }
    };
    refresh(); window.addEventListener(FAVORITES_CHANGED, refresh); window.addEventListener("storage", refresh);
    return () => { window.removeEventListener(FAVORITES_CHANGED, refresh); window.removeEventListener("storage", refresh); };
  }, [profile, productId]);
  if (loading) return null;
  if (!profile) return <Link to="/login">登入以收藏商品</Link>;
  return <div><button type="button" className={styles.button} aria-pressed={selected} disabled={!productId} onClick={() => {
    try { setFavorite(profile.id, productId, !selected); setFailure(""); } catch { setFailure("收藏儲存失敗，請確認瀏覽器允許本機儲存。"); }
  }}>{selected ? "取消收藏" : "收藏商品"}</button><p className="small">收藏儲存在此瀏覽器，不會跨裝置同步。</p>{(failure || error) && <p role="alert">{failure || error}</p>}</div>;
}
