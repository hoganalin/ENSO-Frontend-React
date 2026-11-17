import { KanjiDivider } from "@/components/atoms";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function StoresPage(): JSX.Element {
  usePageTitle("門市 · Queen Maeve");
  return (
    <div className="enso-stores">
      <header className="enso-stores__hero">
        <div className="t-eyebrow">Our Stores</div>
        <h1 className="enso-stores__title">
          門市<span className="accent"> · 體驗據點</span>
        </h1>
        <p>實體門市與體驗據點資訊即將公布，敬請期待。</p>
        <KanjiDivider kanji="店" />
      </header>
      {/* TODO(品牌)：門市據點與地址待提供後補上 */}
    </div>
  );
}
