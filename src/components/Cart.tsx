import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router";
import type { RootState, AppDispatch } from "../store/store";

import { currency } from "../assets/utils/filter";
import useMemberContext from "../hooks/useMemberContext";
import useMessage from "../hooks/useMessage";
import usePromoPreview from "../hooks/usePromoPreview";
import {
  createAsyncDeleteAllCart,
  createAsyncDeleteSingleCart,
  createAsyncUpdateCart,
} from "../slice/cartSlice";
import { clearCouponCode, setCouponCode } from "../slice/promoSlice";
import type { CheckoutItem } from "../domain/orderTotals";

function Cart(): JSX.Element {
  const carts = useSelector((state: RootState) => state.cart.carts);
  const appliedCoupon = useSelector((state: RootState) => state.promo.couponCode);
  // 會員情境（等級／生日月／已完成訂單數）；生日禮、首購、回購類活動要用
  const { context: memberContext } = useMemberContext();
  const dispatch = useDispatch<AppDispatch>();
  const { showSuccess, showError } = useMessage();
  const [loadingCartId, setLoadingCartId] = useState("");
  const [couponInput, setCouponInput] = useState("");

  // 購物車 → 活動引擎的輸入。注意用 product_id（商品 id），不是 cartItem.id（購物車列 id）。
  const items = useMemo<CheckoutItem[]>(
    () =>
      carts.map((c) => ({
        productId: c.product_id,
        title: c.product.title,
        unitPrice: c.product.price,
        qty: c.qty,
      })),
    [carts],
  );

  const { result, couponStatus, loading: promosLoading } = usePromoPreview(
    items,
    memberContext ?? "normal",
    appliedCoupon,
  );

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) {
      showError("請輸入優惠代碼");
      return;
    }
    // 套用只是把 code 寫進 store，實際成立與否由引擎判定（見下方 couponStatus）。
    dispatch(setCouponCode(code));
  };

  const handleRemoveCoupon = () => {
    dispatch(clearCouponCode());
    setCouponInput("");
  };

  const handleDeleteSingleCart = async (
    e: React.MouseEvent<HTMLButtonElement>,
    id: string,
  ) => {
    e.preventDefault();
    setLoadingCartId(id);
    try {
      await dispatch(createAsyncDeleteSingleCart(id)).unwrap();
      showSuccess("已從購物車移除項目");
    } catch (error: unknown) {
      showError(typeof error === "string" ? error : "刪除失敗");
    } finally {
      setLoadingCartId("");
    }
  };

  const handleDeleteAllCart = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      await dispatch(createAsyncDeleteAllCart()).unwrap();
      dispatch(clearCouponCode());
      showSuccess("購物車已成功清空");
    } catch (error: unknown) {
      showError(typeof error === "string" ? error : "清空失敗");
    }
  };

  // 數量增減：接收購物車ID, 產品ID 與新數量
  const handleQtyChange = async (
    cartId: string,
    productId: string,
    qty: number,
  ) => {
    setLoadingCartId(cartId);
    try {
      await dispatch(
        createAsyncUpdateCart({ id: cartId, product_id: productId, qty }),
      ).unwrap();
    } catch (error: unknown) {
      showError(typeof error === "string" ? error : "更新數量失敗");
    } finally {
      setLoadingCartId("");
    }
  };

  return (
    <div className="max-w-[1180px] mx-auto py-5">
      {/* 結帳進度條 */}
      <div className="checkout-progress mb-5">
        <div className="step active">
          <span className="step-num">1</span>
          <span className="step-text">確認購物車</span>
        </div>
        <div className="step-line "></div>
        <div className="step ">
          <span className="step-num">2</span>
          <span className="step-text">填寫資料</span>
        </div>
        <div className="step-line"></div>
        <div className="step">
          <span className="step-num">3</span>
          <span className="step-text">完成訂購</span>
        </div>
      </div>
      <div className="flex justify-center">
        <div
          className="w-full md:max-w-xl py-12 px-6 enso-cart-panel"
          style={{
            minHeight: "calc(100vh - 56px - 76px)",
          }}
        >
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-200">
            {/* border-b = 只有下邊框 */}
            <h2 className="text-xl font-bold text-gray-900">購物車明細</h2>
            {carts.length > 0 && (
              <button
                type="button"
                className="text-sm px-3 py-1 rounded-full border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition"
                onClick={handleDeleteAllCart}
                aria-label="Clear all items from shopping cart"
              >
                <i className="fas fa-trash-alt mr-2"></i>
                <small>清空全部</small>
              </button>
            )}
          </div>
          {carts?.map((cartItem) => (
            <div className="flex mt-4 bg-gray-100" key={cartItem.id}>
              <div className="flex flex-col flex-shrink-0 w-[120px]">
                <img
                  src={cartItem.product.imageUrl}
                  alt=""
                  className="w-[120px] h-[120px] md:h-full object-cover"
                />
                <p className="md:hidden text-enso-gold font-bold text-center whitespace-nowrap my-auto">
                  NT${currency(cartItem.total)}
                </p>
              </div>
              <div className="w-full min-w-0 p-3 relative">
                <button
                  type="button"
                  className="absolute top-3 right-3 p-0 border-0 bg-transparent leading-none"
                  // leading-none = 行高設為 1（等於字體大小本身，沒有額外間距）。
                  onClick={(e) => handleDeleteSingleCart(e, cartItem.id)}
                  disabled={loadingCartId === cartItem.id}
                  aria-label={`Remove ${cartItem.product.title} from cart`}
                >
                  {loadingCartId === cartItem.id ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fas fa-times text-gray-400"></i>
                  )}
                </button>
                <p className="font-bold">{cartItem.product.title}</p>
                <p className="text-gray-500 text-sm mb-1">
                  {cartItem.product.description}
                </p>
                <div className="flex flex-wrap gap-2 items-center w-full md:justify-evenly">
                  <div className="single-product__qty-selector">
                    <button
                      type="button"
                      disabled={
                        cartItem.qty === 1 || loadingCartId === cartItem.id
                      }
                      aria-label="Decrease quantity"
                      onClick={() =>
                        handleQtyChange(
                          cartItem.id,
                          cartItem.product_id,
                          cartItem.qty - 1,
                        )
                      }
                    >
                      {loadingCartId === cartItem.id ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : (
                        "−"
                      )}
                    </button>
                    <input
                      type="number"
                      value={cartItem.qty}
                      aria-label="Quantity"
                      readOnly
                    />
                    <button
                      type="button"
                      disabled={loadingCartId === cartItem.id}
                      aria-label="Increase quantity"
                      onClick={() =>
                        handleQtyChange(
                          cartItem.id,
                          cartItem.product_id,
                          cartItem.qty + 1,
                        )
                      }
                    >
                      {loadingCartId === cartItem.id ? (
                        <i className="fas fa-spinner fa-spin"></i>
                      ) : (
                        "+"
                      )}
                    </button>
                  </div>
                  <p className="hidden md:block text-enso-gold font-bold whitespace-nowrap">
                    NT${currency(cartItem.total)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* 優惠碼 */}
          <div className="flex my-4">
            <input
              type="text"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg outline-none focus:ring-2 focus:ring-enso-primary"
              placeholder="有優惠碼嗎"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyCoupon();
              }}
            />
            <button
              className="bg-enso-primary text-white px-4 py-2 rounded-r-lg hover:bg-enso-primary/90 disabled:opacity-50 transition"
              type="button"
              onClick={handleApplyCoupon}
              disabled={promosLoading || !couponInput.trim()}
            >
              {promosLoading ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                "套用優惠券"
              )}
            </button>
          </div>

          {couponStatus && (
            <div
              className={`text-sm mb-2 flex items-center justify-between ${
                couponStatus.ok ? "text-green-700" : "text-red-600"
              }`}
              role="status"
            >
              <span>
                <i
                  className={`fas ${
                    couponStatus.ok ? "fa-check-circle" : "fa-exclamation-circle"
                  } mr-1`}
                ></i>
                {couponStatus.message}
              </span>
              {appliedCoupon && (
                <button
                  type="button"
                  className="underline text-gray-500 hover:text-gray-800"
                  onClick={handleRemoveCoupon}
                >
                  移除
                </button>
              )}
            </div>
          )}

          {/* 金額明細（引擎試算） */}
          <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between text-gray-700">
              <span>小計</span>
              <span>NT${currency(result?.subtotal ?? 0)}</span>
            </div>

            {result?.applied
              .filter((a) => (a.amount ?? 0) > 0)
              .map((a) => (
                <div
                  key={a.promo.id}
                  className="flex justify-between text-green-700 text-sm"
                >
                  <span>
                    <i className="fas fa-tag mr-1"></i>
                    {a.label}
                  </span>
                  <span>−NT${currency(a.amount ?? 0)}</span>
                </div>
              ))}

            <div className="flex justify-between text-gray-700">
              <span>運費</span>
              <span>
                {result?.freeShip ? (
                  <>
                    <s className="text-gray-400 mr-1">
                      NT${currency(result.shippingFee || 0)}
                    </s>
                    <span className="text-green-700">免運</span>
                  </>
                ) : (
                  `NT$${currency(result?.shippingFee ?? 0)}`
                )}
              </span>
            </div>

            {result?.gift && (
              <div className="flex justify-between text-enso-gold text-sm">
                <span>
                  <i className="fas fa-gift mr-1"></i>贈品
                </span>
                <span>{result.gift}</span>
              </div>
            )}

            {/* 被互斥規則擋掉的活動：讓使用者知道為什麼沒折到 */}
            {result?.skipped.map((s) => (
              <div
                key={s.promo.id}
                className="flex justify-between text-gray-400 text-xs"
              >
                <span>
                  <i className="fas fa-ban mr-1"></i>
                  {s.promo.name}
                </span>
                <span>{s.reason}</span>
              </div>
            ))}

            <div className="flex justify-between pt-2 border-t border-gray-200">
              <p className="text-xl font-bold">總計</p>
              <p className="text-xl font-bold text-enso-gold">
                NT${currency(result?.total ?? 0)}
              </p>
            </div>
          </div>

          {carts.length === 0 ? (
            <button
              // 購物車空的（disabled 狀態）
              className="w-full mt-4 rounded-xl py-3 font-bold bg-gray-900 text-white opacity-50 cursor-not-allowed"
              disabled
            >
              購物車是空的喔
            </button>
          ) : (
            <Link
              to="/checkout"
              className="block w-full mt-4 rounded-xl py-3 font-bold bg-gray-900 text-white text-center no-underline hover:bg-gray-800 transition"
              aria-label="Proceed to checkout"
            >
              確認結帳
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default Cart;
