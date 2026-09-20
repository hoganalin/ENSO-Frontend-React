import PaymentPage from "@/pages/PaymentPage";

export default function CheckoutSuccessPage(): JSX.Element {
  // A return from the gateway is not proof of settlement. Read the buyer's
  // actual order and items, including when the webhook has not arrived yet.
  return <PaymentPage />;
}
