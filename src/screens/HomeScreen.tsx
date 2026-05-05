import type { Section } from "../appTypes";
import { useRef } from "react";
import { Hero } from "../components/Hero";
import { Shelf } from "../components/Shelf";
import type { ShelfFocusContext } from "../components/Shelf";
import { TopBar } from "../components/TopBar";
import { useAutoFocus } from "../hooks/useAutoFocus";
import { useImagePreload } from "../hooks/useImagePreload";
import { posterOf, railPosterOf } from "../media";
import type { KinoItem } from "../types";

export function HomeScreen({
  sections,
  searchTitle,
  searchItems,
  heroItem,
  selectedHeroItemId,
  onOpen,
  onContinue,
  onFocusItem,
  onOpenSearch,
  onOpenBrowse,
  onOpenHistory,
  onOpenSettings,
  onLiveSearch,
  onSearch,
  onLogout
}: {
  sections: Section[];
  searchTitle: string | undefined;
  searchItems: KinoItem[] | undefined;
  heroItem: KinoItem | undefined;
  selectedHeroItemId: string | number | undefined;
  onOpen: (id: string | number | undefined) => void | Promise<void>;
  onContinue: (item: KinoItem) => void;
  onFocusItem: (item: KinoItem, context: ShelfFocusContext) => void;
  onOpenSearch: () => void;
  onOpenBrowse: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onLiveSearch: (query: string) => void;
  onSearch: (query: string) => void;
  onLogout: () => void;
}) {
  const mainRef = useRef<HTMLElement | null>(null);
  const selectedFallback = selectedHeroItemId
    ? sections.flatMap((section) => section.items).find((item) => String(item.id) === String(selectedHeroItemId))
    : undefined;
  const firstItem = mergeHeroItem(heroItem, selectedFallback) ?? searchItems?.[0] ?? sections.find((section) => section.items.length)?.items[0];
  const visibleItems = searchItems ?? sections.flatMap((section) => section.items.slice(0, 8));

  useAutoFocus([searchTitle, sections.length, searchItems?.length]);
  useImagePreload([posterOf(firstItem ?? {}), ...visibleItems.map(railPosterOf)], 14);

  function scrollToHero() {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main ref={mainRef} className="home-screen">
      <div className="ambient-orb" />
      <TopBar
        onFocusWithin={scrollToHero}
        onSearch={onSearch}
        onLiveSearch={onLiveSearch}
        onOpenSearch={onOpenSearch}
        onOpenBrowse={onOpenBrowse}
        onOpenHistory={onOpenHistory}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
      />
      {firstItem ? (
        <Hero item={firstItem} onOpen={onOpen} onFocusWithin={scrollToHero} />
      ) : (
        <section className="hero empty-hero" onFocusCapture={scrollToHero}>
          <div className="hero-content">
            <div className="kicker">Kino.pub</div>
            <h1>No titles loaded</h1>
          </div>
        </section>
      )}
      <div className="home-content">
        {searchItems ? (
          searchItems.length ? (
            <Shelf title={searchTitle || "Search"} items={mergeDisplayItems(searchItems, heroItem)} onOpen={onOpen} onFocusItem={onFocusItem} />
          ) : (
            <section className="message-strip">Nothing found for this search.</section>
          )
        ) : (
          sections.map((section) => (
            <Shelf
              key={section.id}
              title={section.title}
              items={mergeDisplayItems(section.items, heroItem)}
              mode={section.mode}
              onOpen={onOpen}
              onContinue={onContinue}
              onFocusItem={onFocusItem}
            />
          ))
        )}
      </div>
    </main>
  );
}

function mergeHeroItem(detail: KinoItem | undefined, fallback: KinoItem | undefined) {
  if (!detail) {
    return fallback;
  }

  return fallback && String(fallback.id) === String(detail.id) ? { ...fallback, ...detail } : detail;
}

function mergeDisplayItems(items: KinoItem[], detail: KinoItem | undefined) {
  if (!detail?.id) {
    return items;
  }

  return items.map((item) => (String(item.id) === String(detail.id) ? { ...item, ...detail } : item));
}
