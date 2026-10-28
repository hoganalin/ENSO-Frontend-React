import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import axios from "axios";

import useMessage from "../hooks/useMessage";
import { getSingleProductApi } from "../services/product";
import { createAsyncAddCart } from "../slice/cartSlice";
import { currency } from "../assets/utils/filter";
import FavoriteButton from "./FavoriteButton";

import type { AppDispatch } from "../store/store";
import type { Product } from "../types/product";

interface SingleProductProps {
  id: string;
}

const FALLBACK_KANJI = "香";

type TabKey = "features" | "specs" | "desc";
const TABS: { key: TabKey; label: string; en: string }[] = [
  { key: "features", label: "產品特色", en: "Features" },
  { key: "specs", label: "產品規格", en: "Specifications" },
  { key: "desc", label: "產品描述", en: "Description" },
];

function SingleProduct({ id }: SingleProductProps): JSX.Element {
  const [product, setProduct] = useState<Product>({} as Product);
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<TabKey>("features");
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useMessage();

  useEffect(() => {
    if (!id) return;
    const getProduct = async (productId: string) => {
      try {
        const response = await getSingleProductApi(productId);
        setProduct(response.data.product);
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          console.error(error.response || error.message);
        } else {
          console.error(error);
        }
        showError("獲取產品資料失敗");
      }
    };
    getProduct(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAddCart = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!product.id) return;
    try {
      await dispatch(createAsyncAddCart({ id: product.id, qty })).unwrap();
      showSuccess("已成功加入購物車！");
    } catch (error: unknown) {
      showError(typeof error === "string" ? error : "加入購物車失敗");
    }
  };

  const handleQtyChange = (delta: number) => {
    setQty((prev) => Math.max(1, prev + delta));
  };

  // ---- derive tab content with graceful fallbacks ----
  const featuresText = (product.features || "").trim();
  const descText = (product.content || product.description || "").trim();
  const specItems =
    product.specs && product.specs.length > 0
      ? product.specs
      : [
          product.unit ? { label: "規格 / 容量", value: product.unit } : null,
          product.inventory != null
            ? { label: "庫存", value: `${product.inventory}` }
            : null,
        ].filter(Boolean) as { label: string; value: string }[];

  const hasTabContent = featuresText || descText || specItems.length > 0;

  return (
    <div className="enso-detail">
      <div className="enso-detail__inner">
        {/* Left — image / kanji */}
        <div className="enso-detail__media-col" data-aos="fade-right">
          <div className="enso-detail__media">
            <span className="enso-detail__kanji" aria-hidden>
              {FALLBACK_KANJI}
            </span>
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} />
            ) : (
              <div className="img-placeholder" style={{ width: "100%", height: "100%" }}>
                NO IMAGE
              </div>
            )}
          </div>
          {product.imagesUrl && product.imagesUrl.length > 0 && (
            <div className="enso-detail__thumbs">
              {product.imagesUrl.map((src) => (
                <img key={src} src={src} alt="" />
              ))}
            </div>
          )}
        </div>

        {/* Right — info */}
        <div className="enso-detail__info" data-aos="fade-left" data-aos-delay={100}>
          <div className="t-eyebrow">{product.category || "Queen Maeve"}</div>
          <h1 className="enso-detail__title">{product.title}</h1>
          {product.vip_only && <p>VIP 金卡會員限定商品</p>}
          {product.available_at && <p>一般開放購買：{new Date(product.available_at).toLocaleString("zh-TW")}</p>}
          {product.vip_available_at && <p>VIP 金卡搶先購買：{new Date(product.vip_available_at).toLocaleString("zh-TW")}</p>}
          {product.eng_title && <p className="enso-detail__sub">{product.eng_title}</p>}

          <div className="enso-detail__price">
            <span className="now">{currency(product.price)}</span>
            {product.origin_price && product.origin_price !== product.price && (
              <span className="was">{currency(product.origin_price)}</span>
            )}
          </div>

          {product.description && <p className="enso-detail__desc">{product.description}</p>}
          {product.id && <FavoriteButton productId={product.id} />}

          {/* Stock */}
          <div className="enso-detail__stock">
            <span>庫存狀態</span>
            <span
              style={
                product.inventory == null
                  ? { color: "var(--fg-dim)" }
                  : product.inventory <= 0
                    ? { color: "var(--vermillion)" }
                    : product.inventory < 5
                      ? { color: "var(--vermillion)" }
                      : undefined
              }
            >
              {product.inventory == null
                ? "—"
                : product.inventory <= 0
                  ? "已售完"
                  : product.inventory < 5
                    ? `僅剩 ${product.inventory} 件`
                    : "現貨供應"}
            </span>
          </div>

          {/* Purchase */}
          <div className="enso-detail__purchase">
            <div className="enso-qty">
              <button type="button" onClick={() => handleQtyChange(-1)} aria-label="Decrease quantity">−</button>
              <input
                type="number"
                value={qty}
                aria-label="Quantity"
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <button type="button" onClick={() => handleQtyChange(1)} aria-label="Increase quantity">+</button>
            </div>
            <button
              type="button"
              className="btn-gold enso-detail__add"
              onClick={handleAddCart}
              aria-label={`Add ${product.title} to cart`}
            >
              加入購物車
            </button>
          </div>

          <button
            type="button"
            className="btn-ghost enso-detail__view-cart"
            onClick={() => navigate("/cart")}
          >
            前往購物車
          </button>
        </div>
      </div>

      {/* Product detail tabs — 產品特色 / 產品規格 / 產品描述 */}
      {hasTabContent && (
        <section className="enso-detail__tabs-section">
          <div className="enso-detail__tabs-inner">
            <div className="enso-detail__tablist" role="tablist" aria-label="產品資訊">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`enso-detail__tab${tab === t.key ? " is-active" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  <span className="cn">{t.label}</span>
                  <span className="en">{t.en}</span>
                </button>
              ))}
            </div>

            <div className="enso-detail__tabpanel" role="tabpanel">
              {tab === "features" && (
                featuresText ? (
                  <div className="enso-detail__richtext">{featuresText}</div>
                ) : (
                  <p className="enso-detail__empty">尚未提供產品特色。</p>
                )
              )}

              {tab === "specs" && (
                specItems.length > 0 ? (
                  <dl className="enso-spec-list">
                    {specItems.map((it, i) => (
                      <div key={`${it.label}-${i}`}>
                        <dt>{it.label}</dt>
                        <dd>{it.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="enso-detail__empty">尚未提供產品規格。</p>
                )
              )}

              {tab === "desc" && (
                descText ? (
                  <div className="enso-detail__richtext">{descText}</div>
                ) : (
                  <p className="enso-detail__empty">尚未提供產品描述。</p>
                )
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default SingleProduct;
