import { CSSProperties } from "react";

interface Props {
  text?: string;
  size?: number;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}

export default function Seal({
  text = "香",
  size = 56,
  rotate = -6,
  className = "",
  style,
}: Props): JSX.Element {
  const chars = [...text];
  return (
    <div
      className={`seal ${className}`.trim()}
      style={{
        width: size,
        minHeight: chars.length * size * 0.8,
        transform: `rotate(${rotate}deg)`,
        fontSize: size * 0.45,
        ...style,
      }}
    >
      {chars.map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </div>
  );
}
