import { Seal, KanjiDivider } from "@/components/atoms";
import { usePageTitle } from "@/hooks/usePageTitle";

const STORES = [
  {
    kanji: "京",
    name: "京都・伏見 本店",
    address: "京都市伏見区深草1-1-1",
    hours: "火 – 日 · 11:00 – 19:00",
    note: "百年町家改建，附香道體驗預約。",
  },
  {
    kanji: "東",
    name: "東京・南青山",
    address: "東京都港区南青山4-12-3",
    hours: "月 – 日 · 12:00 – 20:00",
    note: "與獨立香水選品店共同營運。",
  },
  {
    kanji: "台",
    name: "台北・大安門市",
    address: "台北市大安區永康街32巷5號",
    hours: "二 – 日 · 13:00 – 21:00",
    note: "提供香道講座與訂製服務。",
  },
];

export default function StoresPage(): JSX.Element {
  usePageTitle("實體店面 · ENSO Kyoto");
  return (
    <div className="enso-stores">
      <header className="enso-stores__hero">
        <div className="t-eyebrow">Our Stores</div>
        <h1 className="enso-stores__title">
          実店舗<span className="accent"> · 直営</span>
        </h1>
        <p>三間直營店面，每一處都依當地節氣選香、開設講座與品香會。</p>
        <KanjiDivider kanji="店" />
      </header>

      <section className="enso-stores__grid">
        {STORES.map((s) => (
          <article key={s.name} className="enso-store-card">
            <span className="enso-store-card__kanji" aria-hidden>{s.kanji}</span>
            <h2>{s.name}</h2>
            <dl>
              <div><dt>Address</dt><dd>{s.address}</dd></div>
              <div><dt>Hours</dt><dd>{s.hours}</dd></div>
            </dl>
            <p>{s.note}</p>
            <Seal text={s.kanji} size={36} className="enso-store-card__seal" />
          </article>
        ))}
      </section>
    </div>
  );
}
