/** Deliberately local simulation: never invokes a financial provider. */
export function mockAfterSalesResult(action: "refund" | "void", id: string, status = "succeeded") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid operation ID");
  if (!["succeeded", "failed", "uncertain"].includes(status)) throw new Error("Invalid simulated result");
  return { status, providerReference: `MOCK-${action.toUpperCase()}-${id.replace(/-/g, "")}`, simulated: true };
}

