import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/styles/Member.module.css";

interface MemberMessage { id: string; title: string; message: string; created_at: string }
export default function MemberMessages() {
  const [rows,setRows] = useState<MemberMessage[]>([]);
  const [loading,setLoading] = useState(true);
  useEffect(()=>{
    let active=true;
    setLoading(true);
    void Promise.resolve(supabase.from("member_messages").select("id,title,message,created_at")
      .order("created_at",{ascending:false}).limit(50)).then(({data,error:failure})=>{
        if(active){setRows(failure ? [] : data ?? []);setLoading(false);}
      }).catch(()=>{if(active){setRows([]);setLoading(false);}});
    return ()=>{active=false;};
  },[]);
  return <section aria-labelledby="member-messages-title">
    <h2 id="member-messages-title">我的站內訊息</h2>
    {loading ? <p role="status">正在讀取訊息…</p>
      : rows.length===0 ? <p>目前沒有站內訊息。</p>
      : <ul className={styles.list}>{rows.map(row=><li key={row.id} className={styles.card}>
          <h3>{row.title}</h3><p style={{whiteSpace:"pre-wrap"}}>{row.message}</p>
          <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString("zh-TW")}</time>
        </li>)}</ul>}
  </section>;
}
