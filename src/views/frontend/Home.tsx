import { useEffect, useState } from "react";
import { Link } from "react-router";

import { getProductApi } from "../../services/product";
import type { Product } from "../../types/product";
import { currency } from "../../assets/utils/filter";

import { EnsoCircle, SmokeLayer, KanjiDivider, Seal } from "../../components/atoms";

const CATEGORIES = [
  {
    href: "/product?category=放鬆",
    eyebrow: "Relaxation",
    title: "放鬆",
    sub: "釋放壓力 · 安眠修復",
    poem: "一日の終わり、ゆっくりと。",
    kanji: "鬆",
  },
  {
    href: "/product?category=冥想",
    eyebrow: "Meditation",
    title: "冥想",
    sub: "深度靜心 · 專注當下",
    poem: "心を静めて、今ここに。",
    kanji: "禅",
  },
  {
    href: "/product?category=淨化",
    eyebrow: "Purification",
    title: "淨化",
    sub: "清淨能量 · 淨化空間",
    poem: "清らかな空間、新しい気。",
    kanji: "淨",
  },
  {
    href: "/product?category=復甦",
    eyebrow: "Revival",
    title: "復甦",
    sub: "晨間醒覺 · 生機回返",
    poem: "朝の光、新しい一日。",
    kanji: "甦",
  },
];

const FALLBACK_KANJI = ["香", "月", "霧", "禅", "静", "夜"];

export default function Home(): JSX.Element {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [featuredIndex, setFeaturedIndex] = useState(0);

  useEffect(() => {
    const getProducts = async () => {
      try {
        const response = await getProductApi(1, "線香");
        const products =
          response.data.products.length > 0
            ? response.data.products
            : (await getProductApi(1, "all")).data.products;
        setFeaturedProducts(products.slice(0, 3));
      } catch (error) {
        console.error("Fetch products error:", error);
      }
    };
    getProducts();
  }, []);

  useEffect(() => {
    if (featuredProducts.length <= 1) return;
    const timer = setInterval(() => {
      setFeaturedIndex((i) => (i + 1) % featuredProducts.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [featuredProducts.length]);

  return (
    <div className="enso-home">
      {/* Hero */}
      <section className="enso-hero enso-hero--video">
        <video
          className="enso-hero__video"
          src="/videos/hero.webm"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <div className="enso-hero__overlay" aria-hidden />
        <SmokeLayer count={4} intensity={0.25} />

        <div className="enso-hero__vertical" aria-hidden>
          <span>一</span><span>縷</span><span>の</span><span>煙</span>
          <span className="dot">、</span>
          <span>静</span><span>寂</span><span>へ</span><span>の</span><span>招</span><span>待</span>
        </div>

        <div className="enso-hero__seal" aria-hidden>
          <Seal text="圓相" size={56} rotate={8} />
        </div>

        <div className="enso-hero__center" data-aos="fade-up">
          <div className="enso-hero__eyebrow t-eyebrow">ENSO · KYOTO INCENSE · EST. 2018</div>
          <h1 className="enso-hero__title">
            <span className="block">點燃一縷香</span>
            <span className="block accent">靜下心</span>
          </h1>
          <p className="enso-hero__sub">Find Your Inner Silence</p>
          <p className="enso-hero__copy">每一縷煙 · 都是回歸自我的邀請</p>
          <div className="enso-hero__ctas">
            <Link to="/product" className="btn-gold" aria-label="Shop incense products">
              選購線香 →
            </Link>
            <Link to="/about" className="btn-ghost" aria-label="Read brand story">
              品牌故事
            </Link>
          </div>
        </div>

        <div className="enso-hero__scroll" aria-hidden>
          <span>スクロール</span>
          <span className="line" />
        </div>

        <div className="enso-hero__corner" aria-hidden>
          <EnsoCircle size={48} animated strokeWidth={2} />
        </div>
      </section>

      {/* Categories */}
      <section className="enso-categories">
        <div className="enso-categories__head" data-aos="fade-up">
          <div className="t-eyebrow">Collection</div>
          <h2 className="enso-categories__title">
            香の<span className="accent">四相</span>
          </h2>
        </div>

        <div className="enso-categories__grid">
          {CATEGORIES.map((cat) => (
            <Link key={cat.href} to={cat.href} className="enso-cat-card">
              <span className="enso-cat-card__kanji" aria-hidden>
                {cat.kanji}
              </span>
              <div className="enso-cat-card__eyebrow">{cat.eyebrow}</div>
              <div className="enso-cat-card__title">{cat.title}</div>
              <div className="enso-cat-card__sub">{cat.sub}</div>
              <div className="enso-cat-card__poem">{cat.poem}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="enso-featured">
        <div className="enso-featured__inner">
          <div className="enso-featured__head" data-aos="fade-up">
            <div>
              <div className="t-eyebrow">Featured</div>
              <h2 className="enso-featured__title">
                精選<span className="accent">線香</span>
              </h2>
            </div>
            <Link to="/product" className="btn-ghost">
              查看全部
            </Link>
          </div>

          <div
            className="enso-featured__carousel"
            aria-roledescription="carousel"
            aria-label="精選線香輪播"
          >
            <div
              className="enso-featured__track"
              style={{ transform: `translateX(-${featuredIndex * 100}%)` }}
            >
              {featuredProducts.map((product, i) => (
                <Link
                  key={product.id}
                  to={`/product/${product.id}`}
                  className="enso-product-card enso-product-card--compact"
                  aria-hidden={i !== featuredIndex}
                  tabIndex={i !== featuredIndex ? -1 : 0}
                >
                  <div className="enso-product-card__media">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.title} />
                    ) : (
                      <div
                        className="img-placeholder"
                        style={{ width: "100%", height: "100%" }}
                      >
                        NO IMAGE
                      </div>
                    )}
                    <span className="enso-product-card__kanji" aria-hidden>
                      {FALLBACK_KANJI[i % FALLBACK_KANJI.length]}
                    </span>
                  </div>
                  <div className="enso-product-card__eyebrow">
                    {product.category || "Incense"}
                  </div>
                  <h3 className="enso-product-card__title">{product.title}</h3>
                  <p className="enso-product-card__sub">
                    {product.eng_title || product.feature || ""}
                  </p>
                  <div className="enso-product-card__price">
                    <span className="now">{currency(product.price)}</span>
                    {product.origin_price > product.price && (
                      <span className="was">{currency(product.origin_price)}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            <div className="enso-featured__dots" role="tablist">
              {featuredProducts.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-label={`顯示第 ${i + 1} 張`}
                  aria-selected={i === featuredIndex}
                  className={`enso-featured__dot${i === featuredIndex ? " is-active" : ""}`}
                  onClick={() => setFeaturedIndex(i)}
                />
              ))}
            </div>
          </div>

          <div className="enso-featured__grid">
            {featuredProducts.map((product, i) => (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className="enso-product-card"
                data-aos="fade-up"
                data-aos-delay={i * 100}
              >
                <div className="enso-product-card__media">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.title} />
                  ) : (
                    <div className="img-placeholder" style={{ width: "100%", height: "100%" }}>
                      NO IMAGE
                    </div>
                  )}
                  <span className="enso-product-card__kanji" aria-hidden>
                    {FALLBACK_KANJI[i % FALLBACK_KANJI.length]}
                  </span>
                </div>
                <div className="enso-product-card__eyebrow">{product.category || "Incense"}</div>
                <h3 className="enso-product-card__title">{product.title}</h3>
                <p className="enso-product-card__sub">{product.eng_title || product.feature || ""}</p>
                <div className="enso-product-card__price">
                  <span className="now">{currency(product.price)}</span>
                  {product.origin_price > product.price && (
                    <span className="was">{currency(product.origin_price)}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="enso-philosophy">
        <div className="enso-philosophy__inner" data-aos="fade-up">
          <KanjiDivider kanji="禅" />
          <p className="enso-philosophy__quote">
            「香を聞く。<br />
            時を聞く。<br />
            己を聞く。」
          </p>
          <p className="enso-philosophy__author">— ENSO Brand Philosophy</p>
        </div>
      </section>

      {/* Cross promo */}
      <section className="enso-cross-promo">
        <div className="enso-cross-promo__grid">
          <Link to="/journal" className="enso-cross-promo__card" data-aos="fade-right">
            <span className="kanji-bg" aria-hidden>誌</span>
            <div className="t-eyebrow">Journal</div>
            <h3 className="title">香の読み物</h3>
            <p className="copy">
              關於香道、茶室、職人之手——六篇深度文章，
              帶你進入京都人不寫在日曆上的歲時記。
            </p>
          </Link>
          <Link to="/about" className="enso-cross-promo__card" data-aos="fade-left">
            <span className="kanji-bg" aria-hidden>縁</span>
            <div className="t-eyebrow">About</div>
            <h3 className="title">品牌故事</h3>
            <p className="copy">
              和敬清寂——ENSO 自 2018 年起，於京都伏見以
              四項約束製香：選原料、捲手作、陰乾百日、檢驗百次。
            </p>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="enso-cta">
        <div style={{ position: "relative", display: "inline-block" }}>
          <Seal text="香" size={48} />
        </div>
        <h2 className="enso-cta__title">
          一支香，一段<span className="accent">呼吸</span>
        </h2>
        <p className="enso-cta__copy">
          不需要坐墊、不需要 App。
          一支二十五分鐘的線香，就是你最好的冥想計時器。
        </p>
        <Link to="/product" className="btn-gold">
          開始選香
        </Link>
      </section>
    </div>
  );
}
