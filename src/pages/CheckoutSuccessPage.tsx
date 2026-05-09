import { useParams } from "react-router";

import CheckoutSuccess from "@/components/CheckoutSuccess";

export default function CheckoutSuccessPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  return <CheckoutSuccess orderId={orderId} />;
}
