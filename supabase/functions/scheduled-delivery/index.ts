import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { processDeliveryJobs } from "../_shared/delivery.ts";
import { createScheduledDeliveryHandler } from "../_shared/scheduledDelivery.ts";

Deno.serve(createScheduledDeliveryHandler({
  env: (name) => Deno.env.get(name),
  authorize: async (token) => {
    const result = await createAdminClient().rpc("validate_delivery_cron_token", { p_token: token });
    if (result.error) throw new Error("Cron authorization unavailable");
    return result.data === true;
  },
  process: () => processDeliveryJobs(createAdminClient(), 10),
}));
