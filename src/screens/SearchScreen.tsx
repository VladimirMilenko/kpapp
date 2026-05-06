import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { PosterImage } from "../components/PosterImage";
import { TopBar } from "../components/TopBar";
import { useImagePreload } from "../hooks/useImagePreload";
import { scrollIntoViewCompat } from "../dom";
import { cardPosterCandidatesOf, cardPosterOf, metaLine, synopsisOf, titleOf } from "../media";
import { readSearchHistory } from "../searchHistory";
import type { KinoItem } from "../types";

export function SearchScreen({
  query,
  items,
  loading,
  loadingMore,
  hasMore,
  waitingForMoreInput,
  error,
  onSearch,
  onLiveSearch,
  onOpen,
  onOpenBrowse,
  onOpenHistory,
  onOpenSettings,
  onLoadMore,
  onLogout,
  onRetry
}: {
  query: string;
  items: KinoItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  waitingForMoreInput: boolean;
  error: string | undefined;
  onSearch: (query: string) => void;
  onLiveSearch: (query: string) => void;
  onOpen: (id: string | number | undefined) => void;
  onOpenBrowse: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onLoadMore: () => void;
  onLogout: () => void;
  onRetry: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(query);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const loadMoreRef = useRef<HTMLButtonElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const recentRef = useRef<HTMLDivElement | null>(null);
  const history = readSearchHistory();

  useImagePreload(items.slice(0, 10).map(cardPosterOf), 10);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [query]);

  useEffect(() => {
    if (draft.trim() === query) {
      return;
    }

    const timer = window.setTimeout(() => onLiveSearch(draft), 350);
    return () => window.clearTimeout(timer);
  }, [draft, onLiveSearch, query]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loadingMore) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(draft);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const target = focusFirstResult(resultsRef.current) ?? focusFirstResult(recentRef.current);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    target.focus();
    scrollIntoViewCompat(target, { behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  return (
    <main className={`search-screen${keyboardActive ? " is-keyboard-open" : ""}`}>
      <div className="ambient-orb" />
      <TopBar
        active="search"
        currentQuery={query}
        showSearchBox={false}
        onSearch={onSearch}
        onOpenBrowse={onOpenBrowse}
        onOpenHistory={onOpenHistory}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
      <section className="search-hero">
        <div className="search-prompt">
          <div className="kicker">Search</div>
          <h1>{query ? `Searching "${query}"` : "Search as you type"}</h1>
          <p>Text search only. Use Browse for genres, collections, and category navigation.</p>
        </div>
        <form className="search-page-form" onSubmit={submit}>
          <input
            ref={inputRef}
            className="search-page-input"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setKeyboardActive(true)}
            onBlur={() => setKeyboardActive(false)}
            placeholder="Harry Potter, Severance, Nolan..."
            autoComplete="off"
            data-focusable
          />
          <button className="primary-action" type="submit" data-focusable>
            Search
          </button>
        </form>
        {!query && history.length > 0 && (
          <div ref={recentRef} className="recent-searches" aria-label="Recent searches">
            <span>Recent</span>
            {history.map((item) => (
              <button key={item} type="button" data-focusable onClick={() => onSearch(item)}>
                {item}
              </button>
            ))}
          </div>
        )}
      </section>
      <section ref={resultsRef} className="search-results">
        <div className="search-results-heading">
          <h2>{resultHeading(query)}</h2>
          {query && !loading && !error && <span>{items.length} titles</span>}
        </div>
        {loading && <SearchSkeleton />}
        {!loading && !error && waitingForMoreInput && <section className="message-strip">Keep typing. Search starts after 2 characters.</section>}
        {error && (
          <section className="message-strip">
            <p>{error}</p>
            <button className="secondary-action" type="button" data-focusable onClick={onRetry}>
              Retry
            </button>
          </section>
        )}
        {!loading && !error && query && !waitingForMoreInput && items.length === 0 && <section className="message-strip">Nothing found. Try a shorter title or English/Russian spelling.</section>}
        {!loading && !error && items.length > 0 && (
          <SearchResultGrid
            items={items}
            idPrefix={query}
            hasMore={hasMore}
            loadingMore={loadingMore}
            loadMoreRef={loadMoreRef}
            onLoadMore={onLoadMore}
            onOpen={onOpen}
          />
        )}
      </section>
    </main>
  );
}

function focusFirstResult(container: HTMLElement | null) {
  return container?.querySelector<HTMLElement>("[data-focusable]:not([disabled])") ?? null;
}

function resultHeading(query: string) {
  return query ? `Results for "${query}"` : "Start searching";
}

export function SearchResultGrid({
  items,
  idPrefix,
  hasMore,
  loadingMore,
  loadMoreRef,
  onLoadMore,
  onOpen
}: {
  items: KinoItem[];
  idPrefix: string;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreRef?: RefObject<HTMLButtonElement | null>;
  onLoadMore: () => void;
  onOpen: (id: string | number | undefined) => void;
}) {
  return (
    <>
      <div className="search-grid">
        {items.map((item, index) => {
          const posterUrls = cardPosterCandidatesOf(item);
          return (
            <button
              key={String(item.id ?? `${idPrefix}-${index}`)}
              className="search-result-card"
              type="button"
              data-focusable
              onClick={() => onOpen(item.id)}
            >
              <PosterImage urls={posterUrls} className="search-result-poster" alt="" />
              <span className="search-result-copy">
                <span className="search-result-title">{titleOf(item)}</span>
                <span className="search-result-meta">{metaLine(item)}</span>
                <span className="search-result-plot">{synopsisOf(item)}</span>
              </span>
            </button>
          );
        })}
      </div>
      {(hasMore || loadingMore) && (
        <button
          ref={loadMoreRef}
          className={`load-more-card${loadingMore ? " is-busy" : ""}`}
          type="button"
          data-focusable
          disabled={loadingMore}
          onFocus={() => {
            if (hasMore && !loadingMore) {
              onLoadMore();
            }
          }}
          onClick={onLoadMore}
        >
          {loadingMore ? "Loading" : "Load more"}
        </button>
      )}
    </>
  );
}

function SearchSkeleton() {
  return (
    <div className="search-grid" aria-hidden="true">
      {Array.from({ length: 8 }, (_item, index) => (
        <div key={index} className="search-result-card search-skeleton">
          <span className="search-result-poster" />
          <span className="search-result-copy">
            <span />
            <span />
            <span />
          </span>
        </div>
      ))}
    </div>
  );
}
