import { useState } from "react";
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
  const wideUrl = image.current?.mode === "wide" ? image.current.url : undefined;
  // Crossfade: the last fully shown image stays underneath while the next one fades in on load,
  // so a hero change never flashes black. Only opacity animates, which stays on the compositor.
  const [settledUrl, setSettledUrl] = useState<string>();
  const [loadedUrl, setLoadedUrl] = useState<string>();

  return (
    <section
      className={`hero${image.current?.mode === "poster" ? " hero-poster-fallback" : ""}`}
      onFocusCapture={onFocusWithin}
    >
      {wideUrl && (
        <div className="hero-art" aria-hidden="true">
          {settledUrl && settledUrl !== wideUrl && <img src={settledUrl} alt="" draggable={false} />}
          <img
            key={wideUrl}
            className={loadedUrl === wideUrl ? (settledUrl === wideUrl ? undefined : "hero-art-entering") : "hero-art-pending"}
            src={wideUrl}
            alt=""
            decoding="async"
            draggable={false}
            onLoad={() => {
              image.onLoad();
              setLoadedUrl(wideUrl);
            }}
            onAnimationEnd={() => setSettledUrl(wideUrl)}
            onError={image.onError}
          />
        </div>
      )}
      <div className="hero-scrim" />
      {image.current?.mode === "poster" && (
        <div className="hero-fallback-poster" aria-hidden="true">
          <img src={image.current.url} alt="" decoding="async" draggable={false} onLoad={image.onLoad} onError={image.onError} />
        </div>
      )}
      <div key={String(item.id ?? "")} className="hero-content">
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
