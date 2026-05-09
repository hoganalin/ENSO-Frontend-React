import { useState } from "react";
import { Link } from "react-router";
import { useSearchParams } from "react-router";

import { getPaymentMethod } from "../constants/paymentMethods";
import { EnsoCircle, KanjiDivider } from "./atoms";

interface CheckoutSuccessProps {
  orderId?: string;
}

function CheckoutSuccess({ orderId }: CheckoutSuccessProps): JSX.Element {
  const [searchParams] = useSearchParams();
  const [orderNumber] = useState(
    () => orderId || "ENSO-" + Math.floor(10000000 + Math.random() * 89999999),
  );
  const paidMethodId = searchParams.get("method") ?? "";
  const merchantTradeNo = searchParams.get("tno") ?? "";
  const ecpayTradeNo = searchParams.get("ectno") ?? "";
  const paymentMethod = getPaymentMethod(paidMethodId);

  return (
    <div className="enso-success">
      <div className="enso-success__enso" aria-hidden>
        <EnsoCircle size={320} animated strokeWidth={3} incomplete={false} />
      </div>

      <div className="enso-success__inner">
        <div className="t-eyebrow">Order Complete</div>
        <h1 className="enso-success__title">
          訂單已<span className="accent">完成</span>
        </h1>
        <p className="enso-success__copy">
          感謝您的訂購。<br />
          我們已收到訂單，正在為您準備精心挑選的線香。
        </p>

        <KanjiDivider kanji="完" />

        <div className="enso-success__order">
          <span className="enso-success__order-label">Order No.</span>
          <span className="enso-success__order-no">{orderNumber}</span>
        </div>

        {paymentMethod && (
          <dl className="enso-success__payment">
            <div>
              <dt>付款方式</dt>
              <dd>
                <i className={`bi ${paymentMethod.icon}`} style={{ marginRight: 8 }} />
                {paymentMethod.label}
              </dd>
            </div>
            {merchantTradeNo && (
              <div>
                <dt>商店交易編號</dt>
                <dd className="mono">{merchantTradeNo}</dd>
              </div>
            )}
            {ecpayTradeNo && (
              <div>
                <dt>綠界交易編號</dt>
                <dd className="mono">{ecpayTradeNo}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="enso-success__actions">
          <Link to="/" className="btn-ghost">返回首頁</Link>
          <Link to="/product" className="btn-gold">繼續選香</Link>
        </div>
      </div>
    </div>
  );
}

export default CheckoutSuccess;
