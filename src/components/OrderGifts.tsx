import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export default function OrderGifts({orderId}:{orderId:string}) {
 const [gifts,setGifts]=useState<{id:string;title:string;qty:number}[]>([]);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;supabase.from("order_gifts").select("id,title,qty").eq("order_id",orderId).then(({data,error})=>{if(active){setGifts(data ?? []);setError(Boolean(error));}});return()=>{active=false;};},[orderId]);
 if(error) return <p role="status">贈品資料暫時無法讀取，請稍後更新訂單。</p>;
 if(!gifts.length)return null;
 return <section aria-label="訂單贈品"><h2>隨單贈品</h2><ul>{gifts.map(gift=><li key={gift.id}>{gift.title} × {gift.qty}（免費）</li>)}</ul></section>;
}
