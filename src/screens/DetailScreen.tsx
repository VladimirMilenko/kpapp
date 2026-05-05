import { useEffect } from "react";
import { MediaSection } from "../components/MediaSection";
import { PosterImage } from "../components/PosterImage";
import { useImagePreload } from "../hooks/useImagePreload";
import { mediaDomId, mediaProgressOf, mediaRowsOf, metaLine, posterCandidatesOf, posterOf, resumeMediaOf, synopsisOf, titleOf } from "../media";
import type { MediaRow } from "../media";
import type { KinoItem, KinoMedia } from "../types";

export function DetailScreen({ item, onHome, onPlay }: { item: KinoItem; onHome: () => void; onPlay: (media: KinoMedia) => void }) {
  const rows = mediaRowsOf(item);
  const poster = posterOf(item);
  const posterUrls = posterCandidatesOf(item);
  const fallbackMedia = rows.find((row) => row.items.length)?.items[0];
  const resumeMedia = resumeMediaOf(item);
  const primaryMedia = resumeMedia ?? fallbackMedia;
  const primaryProgress = primaryMedia ? mediaProgressOf(item, primaryMedia) : undefined;
  const resumeMediaId = mediaDomId(resumeMedia);
  const badges = detailBadges(item, rows, primaryMedia);
  const showMediaRows = rows.reduce((sum, row) => sum + row.items.length, 0) > 1;

  useEffect(() => {
    requestAnimationFrame(() => {
      const target = showMediaRows
        ? document.querySelector<HTMLElement>("[data-resume-media='true']")
        : document.querySelector<HTMLElement>("[data-detail-play='true']");

      target?.focus();
      target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
  }, [item.id, resumeMediaId, showMediaRows]);

  useImagePreload([poster], 1);

  return (
    <main
      className="detail-screen"
      onKeyDownCapture={(event) => {
        if (event.key === "ArrowUp" && document.activeElement instanceof HTMLElement && document.activeElement.dataset.detailPlay === "true") {
          event.preventDefault();
          focusBackButton(event.currentTarget);
        }
      }}
    >
      <button className="back-button" type="button" data-focusable data-detail-back="true" onFocus={(event) => scrollDetailTop(event.currentTarget)} onClick={onHome}>
        Back
      </button>
      <section className="detail-layout">
        <PosterImage urls={posterUrls} className="detail-poster" alt="" loading="eager" />
        <div className="detail-copy">
          <div className="kicker">{item.type || "Title"}</div>
          <h1>{titleOf(item)}</h1>
          <div className="meta-line">{metaLine(item)}</div>
          <div className="badge-row">
            {badges.map((badge) => (
              <span key={badge} className="meta-badge">
                {badge}
              </span>
            ))}
          </div>
          <p>{synopsisOf(item)}</p>
          <button
            className="primary-action detail-play-button"
            type="button"
            disabled={!primaryMedia}
            data-focusable={Boolean(primaryMedia) || undefined}
            data-detail-play="true"
            onClick={() => primaryMedia && onPlay(primaryMedia)}
          >
            {showMediaRows && primaryProgress?.inProgress ? "Continue" : "Play"}
          </button>
        </div>
      </section>
      {showMediaRows && rows.map((row) => <MediaSection key={row.title} item={item} row={row} resumeMediaId={resumeMediaId} onPlay={onPlay} />)}
      {!rows.some((row) => row.items.length) && <section className="message-strip">No playable videos were returned for this item.</section>}
    </main>
  );
}

function focusBackButton(container: HTMLElement) {
  scrollDetailTop(container);
  container.querySelector<HTMLElement>("[data-detail-back='true']")?.focus();
}

function scrollDetailTop(element: HTMLElement) {
  const scrollTargets = new Set<HTMLElement>();
  const detailScreen = element.closest<HTMLElement>(".detail-screen");
  const appRoot = element.closest<HTMLElement>(".app-root");

  if (detailScreen) {
    scrollTargets.add(detailScreen);
  }

  if (appRoot) {
    scrollTargets.add(appRoot);
  }

  scrollTargets.add(document.documentElement);
  scrollTargets.add(document.body);

  scrollTargets.forEach((target) => target.scrollTo({ top: 0, behavior: "smooth" }));
}

function detailBadges(item: KinoItem, rows: MediaRow[], media: KinoMedia | undefined) {
  const badges: string[] = [];
  const quality = mediaQuality(media) || primitive(item.quality);
  const audioCount = Array.isArray(media?.audios) ? media.audios.length : numberPrimitive(media?.tracks) ?? numberPrimitive(item.langs);
  const subtitleCount = Array.isArray(media?.subtitles) ? media.subtitles.length : 0;
  const mediaCount = rows.reduce((sum, row) => sum + row.items.length, 0);

  if (quality) {
    badges.push(quality.endsWith("p") ? quality : `${quality}p`);
  }

  if (media?.ac3 || item.ac3) {
    badges.push("AC3");
  }

  if (audioCount) {
    badges.push(`${audioCount} audio ${audioCount === 1 ? "track" : "tracks"}`);
  }

  if (subtitleCount) {
    badges.push(`${subtitleCount} subtitle${subtitleCount === 1 ? "" : "s"}`);
  }

  if (mediaCount > 1) {
    badges.push(`${mediaCount} ${item.type === "serial" ? "episodes" : "videos"}`);
  }

  return badges.slice(0, 4);
}

function primitive(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function numberPrimitive(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function mediaQuality(media: KinoMedia | undefined) {
  if (!Array.isArray(media?.files)) {
    return "";
  }

  const heights = media.files.map((file) => numberPrimitive(file.height ?? file.h)).filter((height): height is number => Boolean(height));
  const maxHeight = heights.length ? Math.max(...heights) : 0;

  if (maxHeight) {
    return `${maxHeight}p`;
  }

  const quality = media.files.find((file) => file.quality)?.quality;
  return primitive(quality);
}
