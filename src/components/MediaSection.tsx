import { episodeNumber, mediaDomId, mediaProgressOf, mediaSubtitle, mediaTitle } from "../media";
import type { MediaRow } from "../media";
import type { KinoItem, KinoMedia } from "../types";

export function MediaSection({
  item,
  row,
  resumeMediaId,
  onPlay
}: {
  item: KinoItem;
  row: MediaRow;
  resumeMediaId?: string;
  onPlay: (media: KinoMedia) => void;
}) {
  return (
    <section className="media-section">
      <div className="shelf-heading">
        <h2>{row.title}</h2>
        <span>{row.items.length} videos</span>
      </div>
      <div className="episode-rail">
        {row.items.map((media, index) => {
          const id = mediaDomId(media) || `${row.title}-${index}`;
          const progress = mediaProgressOf(item, media);
          const isResume = id === resumeMediaId;

          return (
            <button
              key={id}
              className={`episode-card${isResume ? " is-resume" : ""}${progress.completed ? " is-watched" : ""}`}
              type="button"
              data-focusable
              data-resume-media={isResume || undefined}
              onClick={() => onPlay(media)}
            >
              <span className="episode-number">{episodeNumber(media)}</span>
              <span className="episode-title">{mediaTitle(media)}</span>
              <span className="episode-meta">{isResume && progress.inProgress ? "Continue here" : mediaSubtitle(media) || progress.label}</span>
              {progress.percent > 0 && (
                <span className="episode-progress" aria-label={progress.label}>
                  <span style={{ width: `${progress.percent}%` }} />
                </span>
              )}
              {progress.percent > 0 && <span className="episode-progress-label">{progress.label}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
