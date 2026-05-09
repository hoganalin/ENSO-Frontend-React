interface Props {
  opacity?: number;
  color?: string;
}

export default function Seigaiha({ opacity = 0.08, color }: Props): JSX.Element {
  const c = color ?? "var(--enso-gold)";
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}
      aria-hidden
    >
      <defs>
        <pattern id="enso-seigaiha" x="0" y="0" width="60" height="30" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={c} strokeWidth={1}>
            <circle cx="30" cy="30" r="28" />
            <circle cx="30" cy="30" r="21" />
            <circle cx="30" cy="30" r="14" />
            <circle cx="30" cy="30" r="7" />
            <circle cx="0" cy="30" r="28" />
            <circle cx="0" cy="30" r="21" />
            <circle cx="0" cy="30" r="14" />
            <circle cx="0" cy="30" r="7" />
            <circle cx="60" cy="30" r="28" />
            <circle cx="60" cy="30" r="21" />
            <circle cx="60" cy="30" r="14" />
            <circle cx="60" cy="30" r="7" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#enso-seigaiha)" />
    </svg>
  );
}
