import { useState } from "react";

import { KanjiDivider } from "./atoms";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: "線香的保存期限有多長？",
    answer:
      "ENSO 線香使用天然原料製作，放置於陰涼乾燥處可保存約 3–5 年。建議避免陽光直射與過度潮濕，以維持香氣的最佳狀態。",
  },
  {
    question: "線香點燃後煙霧很大嗎？",
    answer:
      "我們的產品採用低煙配方，相較傳統線香煙霧量極低，適合在現代室內空間、辦公室或公寓中使用，不顯嗆鼻。",
  },
  {
    question: "家中有小孩或寵物可以使用嗎？",
    answer:
      "可以。建議在通風良好的環境下使用，並將線香置於兒童及寵物無法觸及的高度。若寵物有呼吸道敏感問題，建議先短時間試用觀測。",
  },
  {
    question: "每支線香可以燃燒多久？",
    answer: "標準長度線香約可燃燒 40–50 分鐘，具體時間會因空間通風程度而略有差異。",
  },
  {
    question: "如何處理燃燒後的香灰？",
    answer: "等待香灰冷卻後，可直接倒入垃圾袋處理。部分的香灰也可以作為盆栽的天然肥料使用。",
  },
];

const FAQ = (): JSX.Element => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="enso-faq">
      <header className="enso-faq__hero">
        <div className="t-eyebrow">FAQ</div>
        <h1 className="enso-faq__title">
          常見<span className="accent">問</span>答
        </h1>
        <KanjiDivider kanji="問" />
      </header>

      <div className="enso-faq__list">
        {FAQ_DATA.map((item, index) => {
          const open = openIndex === index;
          return (
            <div key={index} className={`enso-faq-item ${open ? "is-open" : ""}`}>
              <button
                className="enso-faq-item__head"
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                aria-expanded={open}
              >
                <span className="num">{String(index + 1).padStart(2, "0")}</span>
                <span className="q">{item.question}</span>
                <i className={`fas fa-chevron-down chev ${open ? "is-open" : ""}`} />
              </button>
              {open && <div className="enso-faq-item__body">{item.answer}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FAQ;
