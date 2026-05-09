/**
 * 和敬清寂 — Wa Kei Sei Jaku.
 * Background video (autoplay, muted, loop) with darken overlay; foreground text stays static.
 */
export default function GardenParallaxSection(): JSX.Element {
  return (
    <section className="enso-garden enso-garden--video">
      <video
        className="enso-garden__video"
        src="/videos/%E5%B1%B1%E6%B0%B4.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden
      />
      <div className="enso-garden__overlay" aria-hidden />

      <div className="enso-garden__inner">
        <div className="t-eyebrow">和敬清寂 · Wa Kei Sei Jaku</div>
        <h2 className="enso-garden__title">
          一座枯山水<br />一支線香
        </h2>
        <p className="enso-garden__copy">
          和——以心相待。<br />
          敬——以禮相向。<br />
          清——身心潔淨。<br />
          寂——靜謐當下。
        </p>
      </div>
    </section>
  );
}
