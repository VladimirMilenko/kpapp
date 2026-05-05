import { heroImageCandidatesOf, heroStatsOf, synopsisOf, titleOf } from "../media";
import { useImageCandidate } from "../hooks/useImageCandidate";
import type { KinoItem } from "../types";

export function Hero({
  item,
  onOpen,
  onFocusWithin
}: {
  item: KinoItem;
  onOpen: (id: string | number | undefined) => void;
  onFocusWithin?: () => void;
}) {
  const image = useImageCandidate(heroImageCandidatesOf(item));
  const stats = heroStatsOf(item);

  return (
    <section
      className={`hero${image.current?.mode === "poster" ? " hero-poster-fallback" : ""}`}
      onFocusCapture={onFocusWithin}
    >
      {image.current?.mode === "wide" && (
        <div className="hero-art" aria-hidden="true">
          <img src={image.current.url} alt="" decoding="async" draggable={false} onLoad={image.onLoad} onError={image.onError} />
        </div>
      )}
      <div className="hero-scrim" />
      {image.current?.mode === "poster" && (
        <div className="hero-fallback-poster" aria-hidden="true">
          <img src={image.current.url} alt="" decoding="async" draggable={false} onLoad={image.onLoad} onError={image.onError} />
        </div>
      )}
      <div className="hero-content">
        <div className="kicker">{item.type || "Kino.pub"}</div>
        <h1>{titleOf(item)}</h1>
        <div className={`meta-line${stats ? "" : " is-empty"}`}>{stats || "\u00a0"}</div>
        <p className="hero-copy">{synopsisOf(item)}</p>
        <div className="hero-actions">
          <button className="primary-action" type="button" data-focusable onClick={() => onOpen(item.id)}>
            Open
          </button>
        </div>
      </div>
    </section>
  );
}
