import { useMemo } from "react";

interface Props {
  count?: number;
  intensity?: number;
}

export default function SmokeLayer({ count = 5, intensity = 0.5 }: Props): JSX.Element {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => {
        const dx = (Math.random() - 0.5) * 80;
        const delay = Math.random() * 8;
        const duration = 8 + Math.random() * 6;
        const size = 180 + Math.random() * 140;
        const left = 10 + (i / count) * 80 + (Math.random() - 0.5) * 10;
        return { dx, delay, duration, size, left, key: i };
      }),
    [count],
  );

  return (
    <div
      className="smoke-layer"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
      aria-hidden
    >
      {particles.map((p) => (
        <div
          key={p.key}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            bottom: "-20%",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(245,238,224,${intensity * 0.15}) 0%, rgba(245,238,224,${intensity * 0.08}) 30%, transparent 70%)`,
            filter: "blur(24px)",
            animation: `ensoSmokeDrift ${p.duration}s linear ${p.delay}s infinite`,
            ["--dx" as string]: `${p.dx}px`,
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
