import { CSSProperties } from "react";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
  animated?: boolean;
  incomplete?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function EnsoCircle({
  size = 80,
  color,
  strokeWidth = 3,
  animated = false,
  incomplete = true,
  className = "",
  style,
}: Props): JSX.Element {
  const c = color ?? "var(--enso-gold)";
  const path = incomplete
    ? "M 50,10 A 40,40 0 1,1 18,74"
    : "M 50,10 A 40,40 0 1,1 49.9,10";
  const filterId = `enso-ink-rough-${size}`;
  const animatedStyle: CSSProperties = animated
    ? {
        strokeDasharray: 260,
        strokeDashoffset: 260,
        animation: "ensoDrawStroke 2.4s cubic-bezier(0.5,0,0.5,1) forwards",
        ["--dash-len" as string]: 260,
      }
    : {};
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={style}
      aria-hidden
    >
      <defs>
        <filter id={filterId}>
          <feTurbulence baseFrequency="0.8" numOctaves={2} seed={4} />
          <feDisplacementMap in="SourceGraphic" scale={1.5} />
        </filter>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={c}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        filter={`url(#${filterId})`}
        style={animatedStyle}
      />
    </svg>
  );
}
