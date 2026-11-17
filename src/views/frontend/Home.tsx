import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { getProductApi } from "../../services/product";
import type { Product } from "../../types/product";
import { currency } from "../../assets/utils/filter";

/* 四星屋 — 對應真實商品分類 */
const HOUSES = [
  {
    href: "/product?category=能量精油",
    idx: "I",
    en: "Essential Oil",
    zh: "能量精油",
    poem: "喚醒磁場，安定心緒 —— 以香，點亮內在的光。",
    glyph: (
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="10" />
        <path d="M24 2v8M24 38v8M2 24h8M38 24h8M9 9l6 6M39 9l-6 6M9 39l6-6M39 39l-6-6" />
      </svg>
    ),
  },
  {
    href: "/product?category=香氛噴霧",
    idx: "II",
    en: "Aura Mist",
    zh: "香氛噴霧",
    poem: "一噴之間，招財納福，好運循光而來。",
    glyph: (
      <svg viewBox="0 0 48 48">
        <path d="M24 4l5 13 14 .6-11 8.6 4 13.8L24 35l-12 8 4-13.8-11-8.6 14-.6z" />
      </svg>
    ),
  },
  {
    href: "/product?category=能量蠟燭",
    idx: "III",
    en: "Energy Candle",
    zh: "能量蠟燭",
    poem: "燭光搖曳，淨化空間，點亮祈願。",
    glyph: (
      <svg viewBox="0 0 48 48">
        <path d="M24 4c2 7 9 9 9 18a9 9 0 0 1-18 0c0-4 2-6.5 4.5-8.5 1 3.5 3.5 3.5 3.5 3.5 1.2-4.5-1.5-8.5-1.5-13z" />
        <path d="M18 44h12" />
      </svg>
    ),
  },
  {
    href: "/product?category=洗髮精",
    idx: "IV",
    en: "Hair Ritual",
    zh: "洗髮護髮",
    poem: "植萃賦活，由根而生 —— 溫柔寵愛自己。",
    glyph: (
      <svg viewBox="0 0 48 48">
        <path d="M30 6a18 18 0 1 0 12 22A14 14 0 0 1 30 6Z" />
      </svg>
    ),
  },
];

/* 星盤刻度 */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const a = (i / 60) * Math.PI * 2;
  const r1 = 196;
  const r2 = i % 5 === 0 ? 182 : 188;
  return {
    x1: +(200 + Math.cos(a) * r1).toFixed(1),
    y1: +(200 + Math.sin(a) * r1).toFixed(1),
    x2: +(200 + Math.cos(a) * r2).toFixed(1),
    y2: +(200 + Math.sin(a) * r2).toFixed(1),
  };
});

/* 星座連線 */
const CONSTEL = (() => {
  const pts = [
    [0.2, 0.3], [0.42, 0.2], [0.6, 0.36], [0.72, 0.58],
    [0.55, 0.74], [0.33, 0.66], [0.46, 0.48],
  ].map(([x, y]) => [+(x * 280 + 60).toFixed(1), +(y * 280 + 60).toFixed(1)]);
  const lines: number[][][] = [];
  for (let i = 1; i < pts.length; i++) lines.push([pts[i - 1], pts[i]]);
  return { pts, lines };
})();

const MARQUEE = "Abundance · 招財 　 Serendipity · 桃花 　 Allies · 貴人 　 Clarity · 淨化 　 285 Hertz 　 Celestial Maison 　";

export default function Home(): JSX.Element {
  const [products, setProducts] = useState<Product[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getProductApi(1, "all");
        const all = res.data.products;
        const withImg = all.filter((p) => p.imageUrl);
        setProducts((withImg.length > 0 ? withImg : all).slice(0, 6));
      } catch (err) {
        console.error("Fetch products error:", err);
      }
    })();
  }, []);

  /* ambient: starfield / waveform / parallax / tilt */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cleanups: Array<() => void> = [];

    /* starfield */
    const sky = skyRef.current;
    if (sky) {
      const cx = sky.getContext("2d");
      if (cx) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        let W = 0, H = 0;
        let stars: Array<{ x: number; y: number; r: number; a: number; tw: number; p: number; c: string }> = [];
        let raf = 0;
        const build = () => {
          stars = [];
          const n = Math.round((window.innerWidth * window.innerHeight) / 9000);
          for (let i = 0; i < n; i++) {
            stars.push({
              x: Math.random() * W, y: Math.random() * H,
              r: (Math.random() * 1.3 + 0.2) * dpr, a: Math.random() * 0.6 + 0.2,
              tw: Math.random() * 0.02 + 0.004, p: Math.random() * 6.28,
              c: Math.random() < 0.12 ? "208,106,120" : Math.random() < 0.4 ? "236,203,161" : "241,233,219",
            });
          }
        };
        const size = () => {
          W = sky.width = window.innerWidth * dpr;
          H = sky.height = window.innerHeight * dpr;
          sky.style.width = window.innerWidth + "px";
          sky.style.height = window.innerHeight + "px";
          build();
        };
        const draw = () => {
          cx.clearRect(0, 0, W, H);
          for (const s of stars) {
            const al = reduce ? s.a : s.a * (0.6 + 0.4 * Math.sin(s.p));
            if (!reduce) s.p += s.tw;
            cx.beginPath();
            cx.arc(s.x, s.y, s.r, 0, 6.2832);
            cx.fillStyle = "rgba(" + s.c + "," + al.toFixed(3) + ")";
            cx.fill();
          }
          if (!reduce) raf = requestAnimationFrame(draw);
        };
        size();
        draw();
        let rt = 0;
        const onR = () => { window.clearTimeout(rt); rt = window.setTimeout(size, 180); };
        window.addEventListener("resize", onR);
        cleanups.push(() => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); });
      }
    }

    /* waveform 285Hz */
    const wc = waveRef.current;
    if (wc) {
      const wx = wc.getContext("2d");
      if (wx) {
        const wdpr = Math.min(2, window.devicePixelRatio || 1);
        let ww = 0, wh = 0, ph = 0, raf = 0;
        const wsz = () => {
          const b = wc.getBoundingClientRect();
          ww = wc.width = b.width * wdpr;
          wh = wc.height = b.height * wdpr;
        };
        const wave = () => {
          wx.clearRect(0, 0, ww, wh);
          const mid = wh / 2;
          const cols = ["208,106,120", "236,203,161", "241,233,219"];
          const ops = [0.9, 0.5, 0.28];
          for (let layer = 0; layer < 3; layer++) {
            const amp = wh * 0.2 * (1 - layer * 0.26);
            const freq = ((6 + layer * 2) / ww) * 6.2832;
            wx.beginPath();
            for (let x = 0; x <= ww; x += 2 * wdpr) {
              const env = Math.sin((x / ww) * Math.PI);
              const y = mid + Math.sin(x * freq + ph * (1 + layer * 0.3) + layer) * amp * env;
              if (x === 0) wx.moveTo(x, y); else wx.lineTo(x, y);
            }
            wx.lineWidth = (layer === 0 ? 1.8 : 1.1) * wdpr;
            wx.strokeStyle = "rgba(" + cols[layer] + "," + ops[layer] + ")";
            wx.stroke();
          }
          wx.beginPath();
          wx.moveTo(0, mid);
          wx.lineTo(ww, mid);
          wx.strokeStyle = "rgba(215,169,120,.12)";
          wx.lineWidth = 1;
          wx.stroke();
          if (!reduce) { ph += 0.03; raf = requestAnimationFrame(wave); }
        };
        wsz();
        wave();
        let wrt = 0;
        const onW = () => { window.clearTimeout(wrt); wrt = window.setTimeout(() => { wsz(); if (reduce) wave(); }, 180); };
        window.addEventListener("resize", onW);
        cleanups.push(() => { cancelAnimationFrame(raf); window.removeEventListener("resize", onW); });
      }
    }

    /* parallax (scroll + pointer) */
    const pars = Array.from(root.querySelectorAll("[data-par]")) as HTMLElement[];
    if (!reduce && pars.length) {
      let mx = 0, my = 0, tmx = 0, tmy = 0, ticking = false, rafP = 0;
      const apply = () => {
        ticking = false;
        const vh = window.innerHeight;
        for (const el of pars) {
          const sp = parseFloat(el.getAttribute("data-par") || "0") || 0;
          const r = el.getBoundingClientRect();
          const fromCenter = r.top + r.height / 2 - vh / 2;
          const ty = fromCenter * sp * -0.16;
          el.style.transform = "translate3d(" + (mx * sp * 40).toFixed(1) + "px," + (ty + my * sp * 26).toFixed(1) + "px,0)";
        }
      };
      const onScroll = () => { if (!ticking) { requestAnimationFrame(apply); ticking = true; } };
      const onMove = (e: MouseEvent) => { tmx = (e.clientX / window.innerWidth - 0.5) * 2; tmy = (e.clientY / window.innerHeight - 0.5) * 2; };
      const lerp = () => { mx += (tmx - mx) * 0.06; my += (tmy - my) * 0.06; apply(); rafP = requestAnimationFrame(lerp); };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("mousemove", onMove);
      lerp();
      cleanups.push(() => { cancelAnimationFrame(rafP); window.removeEventListener("scroll", onScroll); window.removeEventListener("mousemove", onMove); });
    }

    /* card tilt */
    if (!reduce) {
      const cards = Array.from(root.querySelectorAll(".qm-card")) as HTMLElement[];
      const handlers: Array<() => void> = [];
      for (const c of cards) {
        const move = (e: MouseEvent) => {
          const r = c.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          c.style.transform = "perspective(800px) rotateX(" + ((0.5 - py) * 7).toFixed(2) + "deg) rotateY(" + ((px - 0.5) * 8).toFixed(2) + "deg) translateY(-6px)";
          c.style.setProperty("--mx", (px * 100).toFixed(0) + "%");
          c.style.setProperty("--my", (py * 100).toFixed(0) + "%");
        };
        const leave = () => { c.style.transform = ""; };
        c.addEventListener("mousemove", move);
        c.addEventListener("mouseleave", leave);
        handlers.push(() => { c.removeEventListener("mousemove", move); c.removeEventListener("mouseleave", leave); });
      }
      cleanups.push(() => handlers.forEach((fn) => fn()));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  /* reveal on scroll (re-runs when products arrive) */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(root.querySelectorAll(".qm-reveal")) as HTMLElement[];
    if (reduce) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver(
      (ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }),
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [products.length]);

  const hero = products[0];

  return (
    <div className="qm-maison" ref={rootRef}>
      <canvas className="qm-starfield" ref={skyRef} aria-hidden />
      <div className="qm-veil" aria-hidden />

      <div className="qm-body">
        {/* ---------- HERO ---------- */}
        <section className="qm-hero">
          <div className="qm-astro" aria-hidden data-par="0.12">
            <svg viewBox="0 0 400 400">
              <g className="qm-spin-slow">
                <circle cx="200" cy="200" r="196" fill="none" stroke="rgba(215,169,120,.35)" strokeWidth="1" />
                <circle cx="200" cy="200" r="168" fill="none" stroke="rgba(215,169,120,.18)" strokeWidth="1" strokeDasharray="2 7" />
                <g stroke="rgba(236,203,161,.4)" strokeWidth="1">
                  {TICKS.map((t, i) => (
                    <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
                  ))}
                </g>
              </g>
              <g className="qm-spin-rev">
                <circle cx="200" cy="200" r="132" fill="none" stroke="rgba(208,106,120,.3)" strokeWidth="1" />
                <circle cx="200" cy="200" r="100" fill="none" stroke="rgba(241,233,219,.14)" strokeWidth="1" />
                <g stroke="rgba(236,203,161,.5)" fill="rgba(236,203,161,.9)">
                  {CONSTEL.lines.map((l, i) => (
                    <line key={"l" + i} x1={l[0][0]} y1={l[0][1]} x2={l[1][0]} y2={l[1][1]} strokeWidth="0.8" />
                  ))}
                  {CONSTEL.pts.map((p, i) => (
                    <circle key={"p" + i} cx={p[0]} cy={p[1]} r="2.1" />
                  ))}
                </g>
              </g>
              <circle cx="200" cy="200" r="60" fill="none" stroke="rgba(215,169,120,.4)" strokeWidth="1" />
              <circle cx="200" cy="200" r="3" fill="#eccba1" />
            </svg>
          </div>
          <div className="qm-moon" aria-hidden data-par="0.22" />
          <span className="qm-orb a" aria-hidden />
          <span className="qm-orb b" aria-hidden />
          <span className="qm-orb c" aria-hidden />

          <div className="qm-wrap qm-hero-grid">
            <div className="qm-hero-copy" data-par="-0.04">
              <div className="qm-kick">
                <span className="ln" />
                <span className="eyebrow">Celestial Perfumery · EST. MMXVIII</span>
              </div>
              <h1>
                <span className="ghost" aria-hidden>Align</span>
                <span className="en">Let the stars <b>align.</b></span>
                <span className="zh">循光而來，定心而香</span>
              </h1>
              <p className="qm-hero-lead">
                以西方星盤為引、以 <b>285Hz 再生頻率</b>調香的能量香氛。每一次噴灑，是為你的磁場重新定位 —— 招來你所渴望的那道光。
              </p>
              <div className="qm-hero-cta">
                <Link to="/product" className="qm-btn-gold">探索系列</Link>
                <a href="#qm-freq" className="qm-btn-ghost">關於 285Hz <span className="arw" /></a>
              </div>
            </div>

            <div className="qm-hero-prod" data-par="0.1">
              <span className="halo" aria-hidden />
              {hero?.imageUrl ? <img src={hero.imageUrl} alt={hero.title} /> : null}
              {hero ? <span className="tag">{hero.eng_title || hero.title}</span> : null}
            </div>
          </div>

          <div className="qm-scroll-hint" aria-hidden>
            <span>Scroll</span>
            <span className="bar-v" />
          </div>
        </section>

        {/* ---------- MARQUEE ---------- */}
        <div className="qm-marquee" aria-hidden>
          <div className="track">
            <span>{MARQUEE}</span>
            <span>{MARQUEE}</span>
          </div>
        </div>

        {/* ---------- FREQUENCY ---------- */}
        <section className="qm-freq" id="qm-freq">
          <div className="qm-wrap qm-freq-in">
            <div className="qm-reveal">
              <span className="eyebrow">The Signature Frequency</span>
              <div className="qm-big-num">285<sub>HZ</sub></div>
              <h2>Tuned for regeneration.</h2>
              <p>
                285 赫茲，被稱為「再生之頻」。王后美芙以此頻率校準每一支配方的能量基調，讓香氣不只是氣味，而是一張看不見的聲波藍圖 —— 修復、安定、重整你與空間的共振。
              </p>
            </div>
            <div className="qm-wave-box qm-reveal">
              <span className="qm-corner tl" /><span className="qm-corner tr" /><span className="qm-corner bl" /><span className="qm-corner br" />
              <canvas ref={waveRef} aria-hidden />
              <div className="qm-wave-cap">Resonance &nbsp; <b>285.0 Hz</b> &nbsp;·&nbsp; Sine Field</div>
            </div>
          </div>
        </section>

        {/* ---------- INTENTIONS ---------- */}
        <section className="qm-intent">
          <div className="qm-wrap">
            <div className="qm-sec-head qm-reveal">
              <span className="eyebrow">Four Celestial Houses</span>
              <h2>選一道<b>意念</b>，讓香氣為你導航</h2>
              <p>每一款香氛對應一座星屋。先問問自己此刻渴望什麼 —— 然後讓對的頻率，替你把它吸引過來。</p>
            </div>
            <div className="qm-cards">
              {HOUSES.map((h, i) => (
                <Link key={h.href} to={h.href} className="qm-card qm-reveal" style={{ transitionDelay: i * 0.08 + "s" }}>
                  <span className="idx">{h.idx}</span>
                  <div className="glyph">{h.glyph}</div>
                  <h3>{h.en}</h3>
                  <div className="zh">{h.zh}</div>
                  <p>{h.poem}</p>
                  <span className="link">進入星屋 <span className="arw" /></span>
                  <span className="sheen" />
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- COLLECTION ---------- */}
        <section className="qm-coll">
          <div className="qm-wrap">
            <div className="qm-sec-head left qm-reveal">
              <span className="eyebrow">The Collection · 本季星錄</span>
              <h2>星錄之作 <b>Maison Selection</b></h2>
            </div>
            <div className="qm-coll-grid">
              {products.map((p, i) => (
                <Link key={p.id} to={`/product/${p.id}`} className="qm-pc qm-reveal">
                  {i === 0 ? <span className="ribbon">Bestseller</span> : null}
                  <div className="ph">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.title} /> : <span className="img-ph">NO IMAGE</span>}
                  </div>
                  <div className="meta">
                    <div>
                      <h3>{p.eng_title || p.title}</h3>
                      {p.eng_title ? <div className="zh">{p.title}</div> : null}
                    </div>
                    <div className="price">{currency(p.price)}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="foot-line">
              <Link to="/product" className="qm-btn-ghost">瀏覽全部星錄 <span className="arw" /></Link>
            </div>
          </div>
        </section>

        {/* ---------- ETHOS ---------- */}
        <section className="qm-ethos">
          <span className="ring" aria-hidden />
          <span className="ring two" aria-hidden />
          <div className="qm-wrap">
            <blockquote className="qm-reveal">
              <span className="mark">&#8220;</span>
              <q>Fragrance is an invisible field —<br />a <b>constellation</b> you wear.</q>
              <p className="zh">香氣，是一片看不見的磁場；<br />是你隨身佩戴的、屬於自己的那片星空。</p>
              <div className="sig">— Queen Maeve, Celestial Maison</div>
            </blockquote>
          </div>
        </section>

        {/* ---------- CTA ---------- */}
        <section className="qm-cta">
          <div className="qm-wrap">
            <div className="qm-cta-card qm-reveal">
              <img
                className="astro-sm"
                aria-hidden
                alt=""
                src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><circle cx='150' cy='150' r='148' fill='none' stroke='%23d7a978' stroke-width='1'/><circle cx='150' cy='150' r='110' fill='none' stroke='%23d06a78' stroke-width='1' stroke-dasharray='3 8'/><circle cx='150' cy='150' r='70' fill='none' stroke='%23eccba1' stroke-width='1'/><circle cx='150' cy='2' r='3' fill='%23eccba1'/><circle cx='260' cy='150' r='2.4' fill='%23e3879a'/></svg>"
              />
              <h2>點亮你的<b>磁場</b></h2>
              <p>從一瓶能量香氛開始，讓好運、桃花與貴人，循著你的光而來。</p>
              <div className="ctas">
                <Link to="/product" className="qm-btn-gold">開始選購</Link>
                <Link to="/about" className="qm-btn-ghost">品牌故事 <span className="arw" /></Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
