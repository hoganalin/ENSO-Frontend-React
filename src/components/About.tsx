import { Link } from "react-router";

import { EnsoCircle, KanjiDivider } from "./atoms";

const VOWS = [
  { kanji: "財", title: "招財", copy: "流動的金色頻率，為事業與財路鋪一條亮路。" },
  { kanji: "緣", title: "桃花", copy: "柔軟而明亮的粉調，牽引良緣與善意的相遇。" },
  { kanji: "貴", title: "貴人", copy: "沉穩的木質基底，召喚扶持你的那些人。" },
  { kanji: "淨", title: "淨化", copy: "清透的月光氣息，洗去雜訊，留下澄明。" },
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
          香氣，是看不見的<span className="accent">磁場</span>
        </h1>
        <p className="enso-about__sub">
          Queen Maeve 王后美芙，以西方星辰美學與 285Hz 再生頻率調香的能量香氛。
          每一次噴灑，都是為你的磁場重新定位的邀請。
        </p>
      </header>

      <section className="enso-about__story">
        <KanjiDivider kanji="緣" />
        <p>
          我們相信，香氣不只是氣味，而是一張看不見的能量藍圖。
          以 285Hz「再生之頻」校準每一支配方的能量基調，
          修復、安定，重整你與空間的共振。
        </p>
        <p>
          精選植萃與能量香調，為日常儀式注入光——
          讓好運、桃花與貴人，循著你的光而來。
        </p>
        {/* TODO(品牌)：此段為示意文案，請替換為生展創意／王后美芙的正式品牌故事 */}
      </section>

      <section className="enso-about__vows">
        <div className="t-eyebrow" style={{ textAlign: "center" }}>Four Celestial Houses</div>
        <h2 className="enso-about__vows-title">四相<span className="accent">能量</span></h2>
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

      <section className="enso-about__cta">
        <KanjiDivider kanji="香" />
        <h2 className="enso-about__cta-title">開始你的<span className="accent">能量旅程</span></h2>
        <p>讓香氣成為你日常點亮磁場的開始。</p>
        <Link to="/product" className="btn-gold">探索全部香氛</Link>
      </section>
    </div>
  );
}

export default About;
