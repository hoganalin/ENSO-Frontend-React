import { CSSProperties } from "react";

interface Props {
  kanji?: string;
  style?: CSSProperties;
}

export default function KanjiDivider({ kanji = "香", style }: Props): JSX.Element {
  return (
    <div className="kanji-divider" style={style}>
      <span className="t-jp-title" style={{ fontSize: 20, color: "var(--enso-gold)" }}>
        {kanji}
      </span>
    </div>
  );
}
