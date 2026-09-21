// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const enabled = process.env.ENSO_LIVE_SMS_TEST === "1";
describe.skipIf(!enabled)("live database mock SMS acceptance (no provider calls)", () => {
  const orderId = crypto.randomUUID();
  const jobIds: string[] = [];
  let userId: string;
  let admin: SupabaseClient;
  let deliver: (db: unknown, job: unknown) => Promise<string>;
  beforeAll(async () => {
    admin = createClient(process.env.ENSO_TEST_URL!, process.env.ENSO_TEST_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const entry = "../../supabase/functions/_shared/delivery.ts";
    deliver = (await import(/* @vite-ignore */ entry)).deliverJob;
    const { data, error } = await admin.auth.admin.createUser({ email: `enso-${orderId}@example.invalid`, password: crypto.randomUUID(), email_confirm: true });
    if (error || !data.user) throw error ?? new Error("fixture user missing");
    userId = data.user.id;
    const saved = await admin.from("orders").insert({ id: orderId, buyer_id: userId, subtotal: 1000, total: 1000, status: "paid", recipient: { tel: "+886912345678" } });
    if (saved.error) throw saved.error;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!admin) return;
    for (const [table, column, value] of [["sms_log", "related_order_id", orderId], ["delivery_jobs", "order_id", orderId], ["orders", "id", orderId]]) {
      const result = await admin.from(table).delete().eq(column, value);
      if (result.error) throw result.error;
    }
    if (userId) { const result = await admin.auth.admin.deleteUser(userId); if (result.error) throw result.error; }
  });
  it.each(["success", "failed", "uncertain"])("persists mock %s, recipient, content and job status", async (result) => {
    vi.stubGlobal("Deno", { env: { get: (key: string) => key === "MITAKE_MODE" ? "mock" : key === "MITAKE_MOCK_RESULT" ? result : undefined } });
    const id = jobIds[0] ?? crypto.randomUUID();
    if (!jobIds.length) jobIds.push(id);
    const token = crypto.randomUUID();
    const saved = await admin.from("delivery_jobs").upsert({ id, order_id: orderId, kind: "buyer_sms", status: "processing", attempts: 1, lease_token: token, lease_until: new Date(Date.now() + 60000).toISOString() });
    if (saved.error) throw saved.error;
    const expected = result === "success" ? "succeeded" : result;
    expect(await deliver(admin, { id, order_id: orderId, kind: "buyer_sms", lease_token: token })).toBe(expected);
    const logs = await admin.from("sms_log").select("to_phone,message,is_simulated,status").eq("delivery_job_id", id).order("created_at", { ascending: false });
    if (logs.error) throw logs.error;
    expect(logs.data?.[0]).toMatchObject({ to_phone: "0912345678", is_simulated: true, status: result === "success" ? "sent" : "failed" });
    expect(logs.data?.[0].message).toContain("NT$1,000");
    const job = await admin.from("delivery_jobs").select("status").eq("id", id).single();
    expect(job.data?.status).toBe(expected);
  });
});
