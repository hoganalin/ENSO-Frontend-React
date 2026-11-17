import { useState } from "react";

import { KanjiDivider } from "./atoms";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: "能量香氛可以保存多久？",
    answer:
      "建議存放於陰涼乾燥、避免陽光直射的環境；開封後建議於 1–2 年內使用完畢，以維持香氣與品質的最佳狀態。",
  },
  {
    question: "不同品項要怎麼使用？",
    answer:
      "能量精油可滴於擴香石或擴香儀；香氛噴霧可噴灑於空間、寢具或隨身衣物；能量蠟燭請置於耐熱平面、遠離易燃物，並全程有人看顧。",
  },
  {
    question: "成分溫和嗎？孕婦、孩童或寵物適合嗎？",
    answer:
      "我們選用植萃香調，但每個人的膚況與體質不同。孕期、哺乳、過敏體質或家有孩童與寵物者，建議先於小範圍試用、保持通風；如有不適請立即停止使用並諮詢專業人員。",
  },
  {
    question: "「285Hz 再生頻率」是什麼？",
    answer:
      "285Hz 是我們調香時依循的能量基調與品牌理念，象徵安定與重整的氛圍。它是一種美學與感受上的設計，並非醫療或療效宣稱。",
  },
  {
    question: "招財、桃花、貴人、淨化要怎麼挑？",
    answer:
      "四相能量是依「意念」分類的香調命名——先問問自己此刻渴望什麼氛圍，再挑選對應的香氣。這是一種儀式感的選擇，實際感受因人而異。",
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
