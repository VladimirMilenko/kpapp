import { escapeCssUrl, heroImageOf, heroStatsOf, synopsisOf, titleOf } from "../media";
import type { KinoItem } from "../types";
import { cssVars } from "../ui";

export function Hero({
  item,
  onOpen,
  onFocusWithin
}: {
  item: KinoItem;
  onOpen: (id: string | number | undefined) => void;
  onFocusWithin?: () => void;
}) {
  const image = heroImageOf(item);
  const stats = heroStatsOf(item);

  return (
    <section
      className={`hero${image?.mode === "poster" ? " hero-poster-fallback" : ""}`}
      style={image ? cssVars({ "--hero-image": `url("${escapeCssUrl(image.url)}")` }) : undefined}
      onFocusCapture={onFocusWithin}
    >
      {image?.mode === "wide" && (
        <div className="hero-art" aria-hidden="true">
          <img src={image.url} alt="" decoding="async" draggable={false} />
        </div>
      )}
      <div className="hero-scrim" />
      {image?.mode === "poster" && <div className="hero-fallback-poster" aria-hidden="true" />}
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
