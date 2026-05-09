interface Props {
  opacity?: number;
  color?: string;
}

export default function Asanoha({ opacity = 0.1, color }: Props): JSX.Element {
  const c = color ?? "var(--enso-gold)";
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}
      aria-hidden
    >
      <defs>
        <pattern id="enso-asanoha" x="0" y="0" width="60" height="104" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={c} strokeWidth={0.6}>
            <path d="M30,0 L30,52 M30,52 L60,34 M30,52 L0,34 M30,52 L60,70 M30,52 L0,70 M30,52 L30,104 M0,0 L30,0 L0,34 Z M60,0 L30,0 L60,34 Z" />
            <path d="M0,104 L30,104 L0,70 Z M60,104 L30,104 L60,70 Z" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#enso-asanoha)" />
    </svg>
  );
}
