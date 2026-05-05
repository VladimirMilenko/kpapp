import { TopBar } from "../components/TopBar";
import { useAutoFocus } from "../hooks/useAutoFocus";
import { cardPosterOf, escapeCssUrl, historyTimeLabel, mediaFromHistoryEntry, metaLine, titleOf, watchingMetaOf } from "../media";
import type { KinoHistoryEntry } from "../types";
import { cssVars } from "../ui";

export function HistoryScreen({
  entries,
  loading,
  error,
  onResume,
  onOpen,
  onSearch,
  onOpenSearch,
  onOpenBrowse,
  onOpenSettings,
  onLogout,
  onRetry
}: {
  entries: KinoHistoryEntry[];
  loading: boolean;
  error: string | undefined;
  onResume: (entry: KinoHistoryEntry) => void;
  onOpen: (id: string | number | undefined) => void;
  onSearch: (query: string) => void;
  onOpenSearch: () => void;
  onOpenBrowse: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onRetry: () => void;
}) {
  const visibleEntries = entries.filter((entry) => entry.item);

  useAutoFocus([loading, visibleEntries.length]);

  return (
    <main className="history-screen">
      <div className="ambient-orb" />
      <TopBar
        active="history"
        showSearchBox={false}
        onSearch={onSearch}
        onOpenSearch={onOpenSearch}
        onOpenBrowse={onOpenBrowse}
        onOpenHistory={() => undefined}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
      <section className="history-hero">
        <div className="kicker">Watch history</div>
        <h1>Recently watched</h1>
        <p>Resume recent movies and episodes from Kino.pub history.</p>
      </section>
      <section className="history-results">
        <div className="search-results-heading">
          <h2>History</h2>
          {!loading && !error && <span>{visibleEntries.length} titles</span>}
        </div>
        {loading && <HistorySkeleton />}
        {error && (
          <section className="message-strip">
            <p>{error}</p>
            <button className="secondary-action" type="button" data-focusable onClick={onRetry}>
              Retry
            </button>
          </section>
        )}
        {!loading && !error && visibleEntries.length === 0 && <section className="message-strip">No watch history yet.</section>}
        {!loading && !error && visibleEntries.length > 0 && (
          <div className="history-grid">
            {visibleEntries.map((entry, index) => {
              const item = entry.item;
              const media = mediaFromHistoryEntry(entry);
              const poster = item ? cardPosterOf(item) : "";

              return (
                <article key={String(item?.id ?? `${historyTimeLabel(entry)}-${index}`)} className="history-card">
                  <button
                    className="history-card-main"
                    type="button"
                    data-focusable
                    data-autofocus={index === 0 || undefined}
                    style={poster ? cssVars({ "--poster": `url("${escapeCssUrl(poster)}")` }) : undefined}
                    onClick={() => onResume(entry)}
                  >
                    <span className="history-card-poster" />
                    <span className="history-card-copy">
                      <span className="history-card-title">{titleOf(item ?? {})}</span>
                      <span className="history-card-meta">{media ? watchingMetaOf(item ?? {}) : metaLine(item ?? {})}</span>
                      <span className="history-card-time">{historyTimeLabel(entry)}</span>
                    </span>
                  </button>
                  <button className="history-details-button" type="button" data-focusable onClick={() => onOpen(item?.id)}>
                    Details
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function HistorySkeleton() {
  return (
    <div className="history-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_item, index) => (
        <div key={index} className="history-card search-skeleton">
          <div className="history-card-main">
            <span className="history-card-poster" />
            <span className="history-card-copy">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
