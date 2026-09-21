import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/styles/Member.module.css";

interface MemberMessage { id: string; title: string; message: string; created_at: string }
export default function MemberMessages() {
  const [rows,setRows] = useState<MemberMessage[]>([]);
  const [error,setError] = useState(false);
  const [loading,setLoading] = useState(true);
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError(false);
    void Promise.resolve(supabase.from("member_messages").select("id,title,message,created_at")
      .order("created_at",{ascending:false}).limit(50)).then(({data,error:failure})=>{
        if(active){setError(Boolean(failure));setRows(failure ? [] : data ?? []);setLoading(false);}
      }).catch(()=>{if(active){setError(true);setLoading(false);}});
    return ()=>{active=false;};
  },[attempt]);
  return <section aria-labelledby="member-messages-title">
    <h2 id="member-messages-title">我的站內訊息</h2>
    {loading ? <p role="status">正在讀取訊息…</p> : error ? <div role="alert">訊息讀取失敗。<button className={styles.button} onClick={()=>setAttempt(n=>n+1)}>重試</button></div>
      : rows.length===0 ? <p>目前沒有站內訊息。</p> : <ul className={styles.list}>{rows.map(row=><li key={row.id} className={styles.card}>
        <h3>{row.title}</h3><p style={{whiteSpace:"pre-wrap"}}>{row.message}</p><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("zh-TW")}</time>
      </li>)}</ul>}
  </section>;
}
