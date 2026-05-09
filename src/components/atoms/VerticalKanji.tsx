import { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  style?: CSSProperties;
}

export default function VerticalKanji({ children, style }: Props): JSX.Element {
  return (
    <div
      className="t-vertical t-jp-title"
      style={{
        fontSize: 12,
        letterSpacing: "0.3em",
        color: "var(--fg-muted)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
