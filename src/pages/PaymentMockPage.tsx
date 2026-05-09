import { useParams } from "react-router";

import PaymentMock from "@/components/PaymentMock";

export default function PaymentMockPage(): JSX.Element {
  const { orderId } = useParams<{ orderId: string }>();
  return <PaymentMock orderId={orderId ?? ""} />;
}
