import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import styles from "@/styles/Payment.module.css";

type Refund = { id: string; amount: number; status: string; reason: string };
const labels: Record<string,string> = { requested: "待審核", approved: "已核准", processing: "處理中", succeeded: "已退款", failed: "失敗待重試", uncertain: "待人工對帳", rejected: "已拒絕" };
export default function RefundRequest({ orderId, total, eligible }: { orderId: string; total: number; eligible: boolean }) {
  const [rows, setRows] = useState<Refund[]>([]);
  const [exchanges, setExchanges] = useState<{id:string;quantity:number;tracking_number:string}[]>([]);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const key = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setReady(false);
    supabase.from("refund_requests").select("id,amount,status,reason").eq("order_id",orderId).order("created_at").then(({ data, error }) => {
      if (!active) return;
      if (error) setNotice("退款紀錄讀取失敗，請重新整理後再試。");
      else { setRows(data ?? []); setReady(true); }
    });
    supabase.from("exchange_shipments").select("id,quantity,tracking_number").eq("order_id",orderId).order("created_at").then(({data,error})=>{
      if(active && !error) setExchanges(data ?? []);
    });
    return () => { active = false; };
  }, [orderId]);
  const available = Math.max(0,total-rows.filter(row => row.status!=="rejected").reduce((sum,row)=>sum+row.amount,0));
  return <section aria-label="退款申請">
    {exchanges.length>0 && <div><h2>換貨出貨紀錄</h2>{exchanges.map(row=><p key={row.id}>換貨 {row.quantity} 件 · 物流單號 {row.tracking_number}</p>)}</div>}
    <p>需要同品項換貨時，請聯繫客服安排退貨驗收與重寄。</p>
    <h2>退款紀錄</h2>
    {rows.map(row => <p key={row.id}>NT${row.amount.toLocaleString()} · {labels[row.status] ?? row.status} · {row.reason}</p>)}
    {ready && !rows.length && <p>尚無退款申請。</p>}
    {eligible && ready && available>0 && exchanges.length===0 && <details><summary>申請全額或部分退款</summary>
      <form onSubmit={async event => {
        event.preventDefault();
        if(lock.current) return;
        lock.current=true; setBusy(true); setNotice("");
        key.current ??= crypto.randomUUID();
        try {
        const { data,error } = await supabase.rpc("request_partial_refund",{p_order:orderId,p_amount:Number(amount),p_reason:reason.trim(),p_request_key:key.current});
        if(error) setNotice("申請未完成，請確認剩餘金額及訂單狀態後重試。");
        else { setRows(previous=>previous.some(row=>row.id===data.id)?previous:[...previous,data]); setAmount(""); setReason(""); key.current=null; setNotice("退款申請已送出，等待財務處理。退貨驗收另行記錄。"); }
        } catch { setNotice("連線中斷，請重試；相同申請不會重複建立。"); }
        finally { lock.current=false; setBusy(false); }
      }}>
        <p>可申請金額 NT${available.toLocaleString()}；處理中及失敗待重試的申請會保留額度。</p>
        <label htmlFor="refund-amount">退款金額</label>
        <input id="refund-amount" type="number" required min="1" max={available} step="1" value={amount} disabled={busy} onChange={event=>{setAmount(event.target.value);key.current=null;}} />
        <label htmlFor="refund-reason">退款原因</label>
        <textarea id="refund-reason" required maxLength={1000} value={reason} disabled={busy} onChange={event=>{setReason(event.target.value);key.current=null;}} />
        <button className={styles.secondaryBtn} disabled={busy || !reason.trim()}>{busy?"送出中…":"送出退款申請"}</button>
      </form>
    </details>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}


