import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { RotatingLines } from "react-loader-spinner";
import type { RootState, AppDispatch } from "../store/store";
import { createOrderApi } from "../services/cart";
import { logOrderPlaced } from "../services/agent/eventLogger";
import { getOrCreateSessionId } from "../services/agent/sessionId";
import { createAsyncGetCart } from "../slice/cartSlice";
import {
  PAYMENT_METHODS,
  PAYMENT_CATEGORIES,
  getPaymentMethod,
  generateMerchantTradeNo,
  generateCheckMacValue,
  type PaymentCategory,
} from "../constants/paymentMethods";

interface CheckoutFormData {
  email: string;
  name: string;
  tel: string;
  address: string;
  payment: string;
  message: string;
}

// 把 12 種付款方式依 category 分群，讓 UI 分區顯示
const METHODS_BY_CATEGORY = PAYMENT_METHODS.reduce<
  Record<PaymentCategory, typeof PAYMENT_METHODS>
>(
  (acc, m) => {
    (acc[m.category] ||= []).push(m);
    return acc;
  },
  { card: [], wallet: [], transfer: [], cvs: [], qr: [] },
);

const CATEGORY_ORDER: PaymentCategory[] = [
  "card",
  "wallet",
  "transfer",
  "cvs",
  "qr",
];
function Checkout(): JSX.Element {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const carts = useSelector((state: RootState) => state.cart.carts);
  const totalPrice = useSelector((state: RootState) => state.cart.final_total); // 總價
  //useForm
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CheckoutFormData>();

  const onFormSubmit: SubmitHandler<CheckoutFormData> = async (data) => {
    const { name, email, tel, address, message, payment } = data;
    const method = getPaymentMethod(payment);
    if (!method) {
      alert("請選擇付款方式");
      return;
    }

    // 產生綠界格式的商店交易編號。這個值會陪著訂單走到 mock payment 頁，
    // 並塞進 order.user.merchant_trade_no 讓後台也能還原同一筆交易。
    const merchantTradeNo = generateMerchantTradeNo();
    const checkMacValue = generateCheckMacValue();

    // 把付款資訊以結構化欄位塞進 order.user，後台 AdminOrders 直接讀取；
    // 同時冗餘寫一份人類可讀版到 message，供 debug 和在 HexSchool 後台直接看。
    const orderData = {
      user: {
        name,
        email,
        tel,
        address,
        // 以下欄位 HexSchool EC API 會當作自訂欄位保留，後台透過 getAdminOrders 拿得到
        paid_method: method.id,
        paid_method_label: method.label,
        paid_category: method.category,
        merchant_trade_no: merchantTradeNo,
        check_mac_value: checkMacValue,
        // is_paid_mock 標記這是模擬金流下的「成功付款」，後台用來和真實 is_paid 區分
        is_paid_mock: true,
      },
      message:
        `[ECPay 模擬 ${method.label}｜${merchantTradeNo}]` +
        (message ? ` ${message}` : ""),
    };
    try {
      setIsSubmitting(true);
      // 建立訂單，取得 orderId
      const res = await createOrderApi(orderData);
      const orderId = res.data.orderId;

      // Phase F: funnel 最後一環。即使訂單未付款我們也 log，因為 funnel 關心的是
      // 「使用者有沒有走到下單這一步」——付款失敗是另一個問題。
      logOrderPlaced({
        sessionId: getOrCreateSessionId(),
        orderId,
        total: totalPrice,
        itemCount: carts.length,
      });

      // 結帳後重新整理購物車，讓狀態歸零
      dispatch(createAsyncGetCart());
      // 中繼站：跳去模擬綠界付款頁，讓使用者看到「綠界交易中」的 UI。付款
      // 頁結束後會自動跳 /checkout-success/[orderId]。
      const params = new URLSearchParams({
        method: method.id,
        amt: String(totalPrice),
        tno: merchantTradeNo,
      });
      navigate(`/payment/mock/${orderId}?${params.toString()}`);
      reset();
    } catch (error) {
      console.error("結帳失敗：", error);
      alert("結帳失敗，請稍後再試。");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {isSubmitting && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="訂單處理中"
        >
          <RotatingLines
            strokeColor="#ffffff"
            strokeWidth="4"
            animationDuration="0.75"
            width="64"
            visible={true}
          />
          <p className="mt-4 text-white text-lg font-medium">
            訂單處理中，請稍候…
          </p>
        </div>
      )}
      <div className="checkout-page py-12">
        <div className="max-w-[1180px] mx-auto">
          {/* ... (進度條保持不變) */}
          {/* 結帳進度條 */}
          <div className="checkout-progress mb-12 pb-4">
            <div className="step completed">
              <span className="step-num">1</span>
              <span className="step-text">確認購物車</span>
            </div>
            <div className="step-line active"></div>
            <div className="step active">
              <span className="step-num">2</span>
              <span className="step-text">填寫資料</span>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <span className="step-num">3</span>
              <span className="step-text">完成訂購</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* 左側：客戶資訊表單 */}
            <div className="lg:col-span-7">
              <div className="checkout-form-container">
                <h3 className="section-title mb-4">收件人資訊</h3>
                <form onSubmit={handleSubmit(onFormSubmit)}>
                  <div className="mb-4">
                    <label
                      htmlFor="email"
                      className="block text-gray-500 text-sm font-bold mb-2"
                    >
                      電子郵件
                    </label>
                    <input
                      type="email"
                      className="enso-input"
                      id="email"
                      {...register("email", {
                        required: "請輸入 Email",
                        pattern: {
                          value: /^\S+@\S+$/i,
                          message: "Email 格式不正確",
                        },
                      })}
                      placeholder="example@gmail.com"
                    />
                    {errors.email && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="mb-4">
                      <label
                        htmlFor="name"
                        className="block text-gray-500 text-sm font-bold mb-2"
                      >
                        收件人姓名
                      </label>
                      <input
                        type="text"
                        className="enso-input"
                        id="name"
                        {...register("name", {
                          required: "請輸入收件人姓名",
                        })}
                      />
                      {errors.name && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.name.message}
                        </p>
                      )}
                    </div>
                    <div className="mb-4">
                      <label
                        htmlFor="tel"
                        className="block text-gray-500 text-sm font-bold mb-2"
                      >
                        電話
                      </label>
                      <input
                        type="tel"
                        className="enso-input"
                        id="tel"
                        {...register("tel", {
                          required: "請輸入收件人電話",
                          minLength: { value: 8, message: "電話至少 8 碼" },
                          maxLength: { value: 10, message: "電話最多 10 碼" },
                          pattern: {
                            value: /^\d+$/,
                            message: "電話僅能輸入數字",
                          },
                        })}
                      />
                      {errors.tel && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.tel.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label
                      htmlFor="address"
                      className="block text-gray-500 text-sm font-bold mb-2"
                    >
                      收件地址
                    </label>
                    <input
                      type="text"
                      className="enso-input"
                      id="address"
                      {...register("address", {
                        required: "請輸入收件地址",
                      })}
                      placeholder="請輸入詳細地址"
                    />
                    {errors.address && (
                      <p className="text-red-500 text-sm mt-1">
                        {errors.address.message}
                      </p>
                    )}
                  </div>

                  <div className="mb-5">
                    <label className="block text-gray-500 text-sm font-bold mb-2">
                      付款方式
                    </label>
                    <div className="payment-methods space-y-4">
                      {CATEGORY_ORDER.map((category) => {
                        const methods = METHODS_BY_CATEGORY[category];
                        if (!methods || methods.length === 0) return null;
                        const cat = PAYMENT_CATEGORIES[category];
                        return (
                          <div key={category}>
                            <div
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-2 ${cat.colorClass}`}
                            >
                              {cat.label}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {methods.map((m) => (
                                <label
                                  key={m.id}
                                  className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-enso-primary hover:bg-emerald-50/30 transition [&:has(input:checked)]:border-enso-primary [&:has(input:checked)]:bg-emerald-50/50 [&:has(input:checked)]:ring-1 [&:has(input:checked)]:ring-enso-primary/40"
                                >
                                  <input
                                    type="radio"
                                    value={m.id}
                                    className="mt-1 accent-emerald-600"
                                    {...register("payment", {
                                      required: "請選擇付款方式",
                                    })}
                                  />
                                  <span className="flex-1">
                                    <span className="flex items-center gap-2 font-medium">
                                      <i className={`bi ${m.icon}`}></i>
                                      {m.label}
                                    </span>
                                    <span className="block text-xs text-gray-500 mt-0.5">
                                      {m.description}
                                    </span>
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {errors.payment && (
                      <p className="text-red-500 text-sm mt-2">
                        {errors.payment.message}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-3 leading-5">
                      ⓘ 本站為 portfolio demo，已串接綠界 ECPay
                      模擬器，不會實際扣款，僅示範完整 UI / 資料流 / 後台對帳。
                    </p>
                  </div>

                  <h3 className="section-title mb-4">訂單備註</h3>
                  <div className="mb-5">
                    <textarea
                      className="form-control enso-input"
                      rows={3}
                      placeholder="有什麼想告訴我們的嗎？"
                      {...register("message")}
                    ></textarea>
                  </div>

                  <div className="flex justify-between items-center">
                    <Link
                      to="/cart"
                      className="text-gray-500 no-underline hover:text-enso-primary transition"
                    >
                      <i className="bi bi-arrow-left mr-2"></i>回購物車
                    </Link>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="py-3 px-8 bg-enso-primary text-white rounded-full font-bold hover:bg-enso-primary/90 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      {isSubmitting && (
                        <RotatingLines
                          strokeColor="white"
                          strokeWidth="5"
                          animationDuration="0.75"
                          width="18"
                          visible={true}
                        />
                      )}
                      {isSubmitting ? "處理中…" : "提交訂單"}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* 右側：訂單摘要 */}
            <div className="lg:col-span-5">
              <div className="order-summary-card">
                <h3 className="summary-title mb-4">訂單摘要</h3>
                <div className="item-list mb-4">
                  {carts?.map((item) => (
                    <div
                      className="summary-item flex items-center mb-3"
                      key={item.id}
                    >
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 mr-3">
                        <img
                          src={item.product?.imageUrl}
                          alt={item.product?.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="item-info grow">
                        <p className="item-name m-0">{item.product?.title}</p>
                        <p className="item-qty  text-gray-500">x {item.qty}</p>
                      </div>
                      <div className="item-price">NT${item.total}</div>
                    </div>
                  ))}
                </div>

                <div className="price-details pt-4 border-t border-gray-200">
                  <div className="flex justify-between mb-3">
                    <span>小計</span>
                    <span>NT${totalPrice}</span>
                  </div>
                  <div className="flex justify-between mb-3">
                    <span>運費</span>
                    <span className="text-green-600">
                      {totalPrice >= 800 ? "免運" : "NT$50"}
                    </span>
                  </div>
                  <div className="flex justify-between total-price pt-3 border-t border-gray-200 mt-3">
                    <strong>總計</strong>
                    <strong className="text-enso-gold  text-xl">
                      NT {totalPrice >= 800 ? totalPrice : totalPrice + 50}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Checkout;
