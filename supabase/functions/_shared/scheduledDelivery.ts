/** A separate cron entry point cannot perform admin reconciliation or accept caller limits. */
export function createScheduledDeliveryHandler(deps: {
  authorize: (token: string) => Promise<boolean>;
  process: () => Promise<unknown[]>;
  env: (name: string) => string | undefined;
}) {
  return async (req: Request): Promise<Response> => {
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
    const token = req.headers.get("x-delivery-cron-token") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) return reply(401, { error: "unauthorized" });
    try {
      if (!await deps.authorize(token)) return reply(401, { error: "unauthorized" });
      // This site is explicitly a simulation. Fail closed if provider configuration changes.
      if (deps.env("MITAKE_MODE") !== "mock" || deps.env("ECPAY_INVOICE_ENABLED") === "true") {
        return reply(409, { error: "simulation_required" });
      }
      const results = await deps.process();
      return reply(200, { processed: results.length, results });
    } catch {
      // Do not echo request headers, database errors, provider credentials or customer details.
      return reply(503, { error: "delivery_worker_unavailable" });
    }
  };
}
