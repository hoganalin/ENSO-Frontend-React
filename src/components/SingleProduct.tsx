import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import axios from "axios";

import useMessage from "../hooks/useMessage";
import { getSingleProductApi } from "../services/product";
import { createAsyncAddCart } from "../slice/cartSlice";
import { currency } from "../assets/utils/filter";
import { KanjiDivider } from "./atoms";

import type { AppDispatch } from "../store/store";
import type { Product } from "../types/product";

interface SingleProductProps {
  id: string;
}

const FALLBACK_KANJI = "香";

function SingleProduct({ id }: SingleProductProps): JSX.Element {
  const [product, setProduct] = useState<Product>({} as Product);
  const [qty, setQty] = useState(1);
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
          <div className="t-eyebrow">{product.category || "Incense"}</div>
          <h1 className="enso-detail__title">{product.title}</h1>
          <p className="enso-detail__sub">
            {product.eng_title || "Premium Incense Series"}
          </p>

          <div className="enso-detail__price">
            <span className="now">{currency(product.price)}</span>
            {product.origin_price && product.origin_price !== product.price && (
              <span className="was">{currency(product.origin_price)}</span>
            )}
          </div>

          <p className="enso-detail__desc">{product.description}</p>

          {/* Aroma profile */}
          <div className="enso-detail__aroma">
            <div className="t-eyebrow" style={{ marginBottom: 18 }}>Aroma · 香氣輪廓</div>
            <div className="enso-aroma-graph">
              {[
                { label: "前調", en: "Top", value: product.top_smell },
                { label: "中調", en: "Heart", value: product.heart_smell },
                { label: "基調", en: "Base", value: product.base_smell },
              ].map((note, i) => (
                <div key={note.label} className="enso-aroma-graph__row">
                  <div className="enso-aroma-graph__label">
                    <span className="cn">{note.label}</span>
                    <span className="en">{note.en}</span>
                  </div>
                  <div className="enso-aroma-graph__bar">
                    <span style={{ width: `${[80, 60, 90][i]}%` }} />
                  </div>
                  <div className="enso-aroma-graph__value">{note.value || "—"}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Specs */}
          <dl className="enso-detail__specs">
            <div>
              <dt>燃燒時間</dt>
              <dd>{product.burning_time || "約 40 分鐘 / 支"}</dd>
            </div>
            <div>
              <dt>香煙特性</dt>
              <dd>{product.feature || "低煙配方"}</dd>
            </div>
            <div>
              <dt>每盒數量</dt>
              <dd>{product.unit ? `${product.unit}` : "20 支"}</dd>
            </div>
            <div>
              <dt>庫存</dt>
              <dd
                style={
                  product.inventory == null
                    ? { color: "var(--fg-dim)" }
                    : product.inventory < 5
                      ? { color: "var(--vermillion)" }
                      : undefined
                }
              >
                {product.inventory != null ? `${product.inventory} 盒` : "缺貨"}
              </dd>
            </div>
          </dl>

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

          <p className="enso-detail__notice">
            滿 NT$ 800 免運 · 京都直送 · 2–3 個工作天到貨
          </p>
        </div>
      </div>

      {/* Experience */}
      <section className="enso-detail__experience">
        <div className="enso-detail__experience-inner">
          <KanjiDivider kanji="香" />
          <div className="t-eyebrow" style={{ textAlign: "center", marginTop: 24 }}>
            The Scent Experience
          </div>
          <h2 className="enso-detail__experience-title">香氣體驗</h2>
          <p className="enso-detail__experience-copy">{product.content}</p>

          {product.scenes && product.scenes.length > 0 && (
            <ul className="enso-detail__scenes">
              {product.scenes.map((scene) => (
                <li key={scene}>{scene}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

export default SingleProduct;
