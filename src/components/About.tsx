import { Link } from "react-router";

import { EnsoCircle, KanjiDivider } from "./atoms";
import GardenParallaxSection from "./About/GardenParallaxSection";

const VOWS = [
  { kanji: "選", title: "選原料", copy: "日本、印度、斯里蘭卡有機認證農場直採。一支香的純度，從原料就決定了。" },
  { kanji: "捲", title: "手工捲", copy: "工匠以雙手捲製，無機器擠壓。每一支線香的密度與粗細，都是時間的痕跡。" },
  { kanji: "陰", title: "陰乾百日", copy: "九十至一百二十天的陰乾，讓香自己跟京都的氣候對話，急不得。" },
  { kanji: "檢", title: "檢驗百次", copy: "每一批香都要經過七次燃燒測試與感官評鑑，才允許離開工房。" },
];

function About(): JSX.Element {
  return (
    <div className="enso-about">
      <header className="enso-about__hero">
        <div className="enso-about__hero-enso" aria-hidden>
          <EnsoCircle size={460} animated strokeWidth={3} />
        </div>
        <div className="t-eyebrow">Our Story</div>
        <h1 className="enso-about__title">
          香、是時間的<span className="accent">藝術</span>
        </h1>
        <p className="enso-about__sub">
          ENSO，圓相。代表禪宗中「完整」與「空無」的共存。
          每一縷香煙，都是一次回歸當下的邀請。
        </p>
      </header>

      <section className="enso-about__story">
        <KanjiDivider kanji="縁" />
        <p>
          創辦人旅居京都期間，深受傳統香道啟發，在百年老舖中第一次體驗到香氣對心靈的深刻影響。
          2018 年回台後，於京都伏見設立工房，開始以四項約束製香——
          選原料、捲手作、陰乾百日、檢驗百次。
        </p>
        <p>
          每一支 ENSO 線香，都是工匠以雙手捲製，選用日本、印度與斯里蘭卡有機認證原料，
          配合自家開發的低煙配方，讓香氛更適合現代生活。
        </p>
      </section>

      <section className="enso-about__vows">
        <div className="t-eyebrow" style={{ textAlign: "center" }}>Our Four Vows</div>
        <h2 className="enso-about__vows-title">四つの<span className="accent">約束</span></h2>
        <div className="enso-about__vows-grid">
          {VOWS.map((v) => (
            <div key={v.kanji} className="enso-about__vow" data-aos="fade-up">
              <span className="enso-about__vow-kanji" aria-hidden>{v.kanji}</span>
              <h3>{v.title}</h3>
              <p>{v.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <GardenParallaxSection />

      <section className="enso-about__cta">
        <KanjiDivider kanji="香" />
        <h2 className="enso-about__cta-title">開始你的<span className="accent">香氣旅程</span></h2>
        <p>讓香氣成為你日常靜心的開始。</p>
        <Link to="/product" className="btn-gold">探索全部線香</Link>
      </section>
    </div>
  );
}
export default About;
