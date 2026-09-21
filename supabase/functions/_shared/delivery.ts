import { loadMitakeConfig, normalizeTaiwanMobile, sendSms } from "./mitake.ts";
import { isInvoiceEnabled, issueB2CInvoice, loadInvoiceConfig, makeInvoiceItems } from "./invoice.ts";

export interface DeliveryJob { id: string; order_id: string; kind: "buyer_sms"|"referrer_sms"|"invoice"; lease_token: string }

export async function processDeliveryJobs(admin: any, limit = 5) {
  const claimed = await admin.rpc("claim_delivery_jobs",{p_limit:limit});
  if (claimed.error) throw claimed.error;
  const results = [];
  for (const job of (claimed.data ?? []) as DeliveryJob[]) results.push({id:job.id,status:await deliverJob(admin,job)});
  return results;
}

/** Port is structural so the job state machine can be tested without a live database. */
export async function deliverJob(admin: any, job: DeliveryJob): Promise<string> {
  let sending = false;
  const transition = async (status: string, error: string|null = null, reference: string|null = null) => {
    const result = await admin.rpc("transition_delivery_job", {p_id:job.id,p_token:job.lease_token,p_status:status,p_error:error,p_reference:reference});
    if (result.error || !result.data) throw new Error("工作鎖定已失效，請重新整理");
  };
  try {
    const {data: order,error} = await admin.from("orders").select("*").eq("id",job.order_id).single();
    if (error || !order) throw new Error("無法讀取訂單");
    if (!["paid","shipped","completed"].includes(order.status)) throw new Error("訂單目前無法發送，請人工核對");
    const recipient = order.recipient ?? {};
    if (job.kind === "invoice") {
      if (!isInvoiceEnabled()) throw new Error("電子發票尚未啟用");
      const config = loadInvoiceConfig();
      const {data: invoice,error: invoiceError} = await admin.from("invoices").select("status,invoice_number").eq("order_id",order.id).maybeSingle();
      if (invoiceError) throw new Error("無法查詢發票紀錄");
      if (invoice?.status === "issued") { await transition("succeeded",null,invoice.invoice_number); return "succeeded"; }
      const lines = await admin.from("order_items").select("title,qty,unit_price").eq("order_id",order.id);
      if (lines.error || !lines.data?.length) throw new Error("無法取得發票品項");
      const invoiceItems = makeInvoiceItems(lines.data.map((i: any) => ({name:i.title,count:i.qty,price:i.unit_price,word:"件"})),order.discount,order.shipping_fee);
      const params = {relateNumber:order.id.replace(/-/g,""),buyerName:recipient.name || "消費者",buyerEmail:recipient.email,
        buyerPhone:recipient.tel ?? recipient.phone,buyerAddress:recipient.address,salesAmount:order.total,
        items:invoiceItems,print:"1" as const};
      if (!params.buyerAddress) throw new Error("發票收件地址未填寫");
      await transition("sending"); sending = true;
      const issued = await issueB2CInvoice(params,config);
      const saved = await admin.from("invoices").upsert({order_id:order.id,provider:"ecpay",relate_number:params.relateNumber,
        amount:order.total,status:"issued",buyer_name:params.buyerName,buyer_email:params.buyerEmail,buyer_phone:params.buyerPhone,
        invoice_number:issued.invoiceNumber,invoice_date:issued.invoiceDate,random_number:issued.randomNumber,
        response_payload:issued.raw,issued_at:new Date().toISOString(),updated_at:new Date().toISOString(),error_message:null},{onConflict:"order_id"});
      if (saved.error) throw new Error("發票可能已開立，但本機紀錄寫入失敗，請先查詢綠界");
      await transition("succeeded",null,issued.invoiceNumber);
    } else {
      const env = typeof Deno !== "undefined" ? Deno.env : null;
      const mockSms = env?.get("MITAKE_MODE") === "mock";
      const config = mockSms ? null : loadMitakeConfig();
      let phone = recipient.tel ?? recipient.phone;
      let profileId = order.buyer_id;
      let message = `您的訂單 ${order.order_no} 已付款，總額 NT$${order.total.toLocaleString("en-US")}。`;
      if (job.kind === "referrer_sms") {
        const ref = await admin.from("profiles").select("phone").eq("id",order.referrer_id).single();
        if (ref.error) throw new Error("無法讀取推薦人電話");
        phone = ref.data.phone; profileId = order.referrer_id;
        message = `您推薦的訂單 ${order.order_no} 已付款，訂單總額 NT$${order.total.toLocaleString("en-US")}。`;
      }
      phone = normalizeTaiwanMobile(phone);
      if (!phone) throw new Error("收訊人的手機號碼無效或未填寫");
      await transition("sending"); sending = true;
      const result = mockSms
        ? (env?.get("MITAKE_MOCK_RESULT") === "failed"
          ? { success:false, error:"模擬簡訊失敗（MITAKE_MOCK_RESULT=failed）", statusCode:"599", msgid:null }
          : env?.get("MITAKE_MOCK_RESULT") === "uncertain"
          ? { success:false, error:"模擬供應商結果不明，請人工對帳", statusCode:undefined, msgid:null }
          : { success:true, error:null, statusCode:"200", msgid:`MOCK-${job.id.replace(/-/g,"").slice(0,16)}` })
        : await sendSms({phone,message,clientId:job.id.replace(/-/g,"")},config!);
      const saved = await admin.from("sms_log").insert({to_profile_id:profileId,to_phone:phone,message,related_order_id:order.id,
        status:result.success ? "sent" : "failed",mitake_msgid:result.msgid ?? null,error_message:result.error ?? null,
        is_simulated:mockSms, delivery_job_id:job.id, payment_reference_id:order.payment_gateway_trade_no});
      if (saved.error) throw new Error("簡訊可能已送出，但紀錄寫入失敗，請先核對三竹");
      if (!result.success) {
        // An absent/unrecognized response cannot prove that the provider did not send.
        const status = result.statusCode ? "failed" : "uncertain";
        await transition(status,result.error ?? "簡訊發送未確認"); return status;
      }
      await transition("succeeded",null,result.msgid ?? null);
    }
    return "succeeded";
  } catch (error) {
    const status = sending ? "uncertain" : "failed";
    try { await transition(status,error instanceof Error ? error.message : "工作失敗"); }
    catch (stateError) { console.error("[delivery] state update failed",stateError); }
    return status;
  }
}
