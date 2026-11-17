import { useCallback, useEffect, useRef, useState } from "react";
import { RotatingLines } from "react-loader-spinner";
import { useDispatch } from "react-redux";
import { useNavigate, useSearchParams } from "react-router";
import axios from "axios";

import Pagination from "./Pagination";
import useMessage from "../hooks/useMessage";
import { getProductApi, getAllProductsApi } from "../services/product";
import { createAsyncAddCart } from "../slice/cartSlice";
import { currency } from "../assets/utils/filter";

import type { AppDispatch } from "../store/store";
import type { Product } from "../types/product";

interface PaginationData {
  total_pages: number;
  current_page: number;
  has_next: boolean;
  has_pre: boolean;
}


const Products = (): JSX.Element => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [currentCategory, setCurrentCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"default" | "price-asc" | "price-desc">("default");
  const [loadingCartId, setLoadingCartId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationData | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestId = useRef(0);
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { showSuccess, showError } = useMessage();
  const [searchParams] = useSearchParams();
  const searchTerm = searchParams.get("search") || "";
  const urlCategory = searchParams.get("category");

  useEffect(() => {
    setCurrentCategory(urlCategory || "all");
  }, [urlCategory]);

  const handleAddCart = async (
    e: React.MouseEvent<HTMLButtonElement>,
    productId: string,
    qty = 1,
  ) => {
    e.preventDefault();
    setLoadingCartId(productId);
    try {
      await dispatch(createAsyncAddCart({ id: productId, qty })).unwrap();
      showSuccess("已成功加入購物車！");
    } catch (error: unknown) {
      console.error("加入購物車失敗：", error);
      showError(typeof error === "string" ? error : "加入購物車失敗");
    } finally {
      setLoadingCartId(null);
    }
  };

  const getProducts = useCallback(
    async (page = 1, category = currentCategory) => {
      const id = ++requestId.current;
      setLoading(true);
      setLoadError("");
      try {
        const response = await getProductApi(page, category);
        if (id !== requestId.current) return;
        setProducts(response.data.products);
        setPagination(response.data.pagination);
      } catch (error: unknown) {
        if (id !== requestId.current) return;
        setLoadError("商品暫時無法載入，請稍後重試。");
        if (axios.isAxiosError(error)) {
          showError(error.response?.data?.message || "獲取產品列表失敗");
        } else {
          showError("獲取產品列表失敗");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [currentCategory, showError],
  );

  const getAllCategories = useCallback(async () => {
    try {
      const response = await getAllProductsApi();
      const result = [
        "all",
        ...new Set(
          response.data.products.map((product: Product) => product.category),
        ),
      ] as string[];
      setCategories(result);
    } catch (error: unknown) {
      console.error("獲取類別失敗：", error);
      showError("獲取產品類別失敗");
    }
  }, [showError]);

  useEffect(() => {
    getAllCategories();
  }, [getAllCategories]);

  useEffect(() => {
    getProducts(1, currentCategory);
  }, [currentCategory, getProducts]);

  const filteredProducts = products
    .filter(
      (product) =>
        product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      return 0;
    });

  return (
    <div className="enso-product-page">
      <header className="enso-product-page__hero">
        <div className="t-eyebrow">Collection</div>
        <h1 className="enso-product-page__title">
          能量<span className="accent">香氛</span>
        </h1>
        <p className="enso-product-page__sub">
          四相能量——招財・桃花・貴人・淨化。每一支香氛，都是為你的磁場重新定位的邀請。
        </p>
      </header>

      <div className="enso-product-page__body">
        <aside
          className={`enso-product-page__filters${filtersOpen ? " is-open" : ""}`}
          aria-label="Category filters"
        >
          <button
            type="button"
            className="enso-product-page__filters-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="enso-cat-filter-list"
            aria-label="切換分類篩選"
          >
            <span className="t-eyebrow">Category</span>
            <span className="enso-product-page__filters-current">
              {currentCategory === "all" ? "全部" : currentCategory}
            </span>
            <span className="enso-product-page__filters-chevron" aria-hidden>
              {filtersOpen ? "−" : "+"}
            </span>
          </button>
          <div className="enso-product-page__filters-body">
            <ul id="enso-cat-filter-list" className="enso-cat-filter">
              {categories.map((category) => (
                <li key={category}>
                  <button
                    type="button"
                    className={`enso-cat-filter__item ${currentCategory === category ? "is-active" : ""}`}
                    onClick={() => {
                      setCurrentCategory(category);
                      setFiltersOpen(false);
                    }}
                    aria-label={`Filter by ${category}`}
                  >
                    <span>{category === "all" ? "全部" : category}</span>
                    <span className="dot" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="enso-product-page__main">
          <div className="enso-product-page__toolbar">
            <div className="t-eyebrow">
              {searchTerm ? `Search · ${searchTerm}` : currentCategory === "all" ? "All" : currentCategory}
            </div>
            <div className="enso-product-page__sort">
              <label htmlFor="sort">排序</label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="default">預設</option>
                <option value="price-asc">價格 · 低到高</option>
                <option value="price-desc">價格 · 高到低</option>
              </select>
            </div>
          </div>

          {searchTerm && (
            <div className="enso-product-page__search-bar">
              搜尋「<strong>{searchTerm}</strong>」的結果：{filteredProducts.length} 件
              <button type="button" onClick={() => navigate("/product")}>
                清除搜尋
              </button>
            </div>
          )}

          <div className="enso-product-grid">
            {loading ? <p role="status">商品載入中…</p> : loadError ? (
              <div className="enso-product-empty" role="alert">
                <p>{loadError}</p>
                <button type="button" className="btn-ghost" onClick={() => getProducts()}>重新載入</button>
              </div>
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((product, index) => (
                <article
                  key={product.id}
                  className="enso-product-card"
                  data-aos="fade-up"
                  data-aos-delay={(index % 4) * 80}
                >
                  <button
                    type="button"
                    className="enso-product-card__media"
                    onClick={() => navigate(`/product/${product.id}`)}
                    aria-label={`View detail for ${product.title}`}
                  >
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} />
                    ) : (
                      <div className="img-placeholder" style={{ width: "100%", height: "100%" }}>
                        NO IMAGE
                      </div>
                    )}
                  </button>
                  <div className="enso-product-card__eyebrow">{product.category}</div>
                  <h3 className="enso-product-card__title">
                    <button type="button" onClick={() => navigate(`/product/${product.id}`)}>
                      {product.title}
                    </button>
                  </h3>
                  <p className="enso-product-card__sub">{product.eng_title || product.feature || ""}</p>
                  <div className="enso-product-card__footer">
                    <div className="enso-product-card__price">
                      <span className="now">{currency(product.price)}</span>
                      {product.origin_price > product.price && (
                        <span className="was">{currency(product.origin_price)}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="enso-product-card__add"
                      onClick={(e) => handleAddCart(e, product.id)}
                      disabled={loadingCartId === product.id}
                      aria-label={`Add ${product.title} to cart`}
                    >
                      {loadingCartId === product.id ? (
                        <RotatingLines strokeColor="#c9a063" strokeWidth="5" animationDuration="0.75" width="18" />
                      ) : (
                        <i className="fas fa-plus" />
                      )}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="enso-product-empty">
                <div className="t-eyebrow">No Result</div>
                <h4>{searchTerm ? `找不到「${searchTerm}」` : "目前沒有符合條件的商品"}</h4>
                <p>請調整分類或搜尋條件，或查看全系列商品。</p>
                <button type="button" className="btn-ghost" onClick={() => { setCurrentCategory("all"); navigate("/product"); }}>
                  查看所有商品
                </button>
              </div>
            )}
          </div>

          {!loading && !loadError && filteredProducts.length > 0 && (
            <Pagination pagination={pagination} onChangePage={getProducts} />
          )}
        </section>
      </div>
    </div>
  );
};

export default Products;
