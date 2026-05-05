import { useEffect, useRef } from "react";
import { TopBar } from "../components/TopBar";
import { useImagePreload } from "../hooks/useImagePreload";
import { cardPosterOf } from "../media";
import type { CatalogFilters, CatalogReference, KinoItem } from "../types";
import { SearchResultGrid } from "./SearchScreen";

export function BrowseScreen({
  items,
  loading,
  loadingMore,
  hasMore,
  error,
  filters,
  types,
  genres,
  onOpen,
  onOpenSearch,
  onOpenHistory,
  onOpenSettings,
  onChangeFilter,
  onLoadMore,
  onSearch,
  onLogout,
  onRetry
}: {
  items: KinoItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | undefined;
  filters: CatalogFilters;
  types: CatalogReference[];
  genres: CatalogReference[];
  onOpen: (id: string | number | undefined) => void;
  onOpenSearch: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onChangeFilter: (key: keyof CatalogFilters, value: string) => void;
  onLoadMore: () => void;
  onSearch: (query: string) => void;
  onLogout: () => void;
  onRetry: () => void;
}) {
  const loadMoreRef = useRef<HTMLButtonElement | null>(null);

  useImagePreload(items.slice(0, 10).map(cardPosterOf), 10);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { rootMargin: "320px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <main className="browse-screen">
      <div className="ambient-orb" />
      <TopBar
        active="browse"
        showSearchBox={false}
        onSearch={onSearch}
        onOpenSearch={onOpenSearch}
        onOpenBrowse={() => undefined}
        onOpenHistory={onOpenHistory}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
      <section className="browse-hero">
        <div className="kicker">Browse</div>
        <h1>Browse Kino.pub</h1>
        <p>Pick a content type, then narrow by genre. More titles load automatically as you move through the grid.</p>
        <div className="browse-filters" aria-label="Browse filters">
          <FilterGroup label="Type" filterKey="type" selected={filters.type} options={types} onChange={onChangeFilter} />
          <FilterGroup label="Genre" filterKey="genre" selected={filters.genre} options={genres.slice(0, 24)} onChange={onChangeFilter} />
        </div>
      </section>
      <section className="browse-results">
        <div className="search-results-heading">
          <h2>{browseHeading(filters)}</h2>
          {!loading && !error && <span>{items.length} titles</span>}
        </div>
        {loading && <BrowseSkeleton />}
        {error && (
          <section className="message-strip">
            <p>{error}</p>
            <button className="secondary-action" type="button" data-focusable onClick={onRetry}>
              Retry
            </button>
          </section>
        )}
        {!loading && !error && items.length === 0 && <section className="message-strip">No titles matched this browse filter.</section>}
        {!loading && !error && items.length > 0 && (
          <SearchResultGrid
            items={items}
            idPrefix={`${filters.type || "all"}-${filters.genre || "all"}`}
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

function FilterGroup({
  label,
  filterKey,
  selected,
  options,
  onChange
}: {
  label: string;
  filterKey: keyof CatalogFilters;
  selected: string | undefined;
  options: CatalogReference[];
  onChange: (key: keyof CatalogFilters, value: string) => void;
}) {
  if (!options.length) {
    return null;
  }

  return (
    <div className="filter-group">
      <span>{label}</span>
      <div>
        {options.map((option) => {
          const id = String(option.id);
          const active = selected === id;
          return (
            <button
              key={`${filterKey}-${id}`}
              className={`filter-chip${active ? " is-selected" : ""}`}
              type="button"
              data-focusable
              aria-pressed={active}
              onClick={() => onChange(filterKey, id)}
            >
              {referenceLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function browseHeading(filters: CatalogFilters) {
  if (filters.type || filters.genre) {
    return "Browse results";
  }

  return "Latest titles";
}

function referenceLabel(reference: CatalogReference) {
  const title = reference.title;
  const map: Record<string, string> = {
    movie: "Movies",
    serial: "Series",
    doc: "Documentary",
    "Мультфильм": "Animation",
    "Фэнтези": "Fantasy",
    "Семейный": "Family",
    "Приключения": "Adventure",
    "Боевик": "Action",
    "Комедия": "Comedy",
    "Драма": "Drama",
    "Триллер": "Thriller",
    "Фантастика": "Sci-Fi",
    "Ужасы": "Horror"
  };

  return map[title] || map[String(reference.id)] || title;
}

function BrowseSkeleton() {
  return (
    <div className="search-grid" aria-hidden="true">
      {Array.from({ length: 10 }, (_item, index) => (
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
