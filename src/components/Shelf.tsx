import { memo, useCallback, useRef } from "react";
import type { Section } from "../appTypes";
import { railPosterCandidatesOf, titleOf, watchProgressPercentOf } from "../media";
import type { KinoItem } from "../types";
import { PosterImage } from "./PosterImage";

export interface ShelfFocusContext {
  items: KinoItem[];
  index: number;
  mode?: Section["mode"];
}

interface ShelfProps {
  title: string;
  items: KinoItem[];
  mode?: Section["mode"];
  onOpen: (id: string | number | undefined) => void;
  onContinue?: (item: KinoItem) => void;
  onFocusItem?: (item: KinoItem, context: ShelfFocusContext) => void;
}

// Memoized so a focus move (which updates the hero) only re-renders cards whose item changed,
// not every card on every rail; TV CPUs feel that on each remote press.
export const Shelf = memo(function Shelf(props: ShelfProps) {
  const { title, items, mode } = props;
  const isContinue = mode === "continue";
  const latestRef = useRef(props);
  latestRef.current = props;

  const focusIndex = useCallback((index: number) => {
    const { items: current, mode: currentMode, onFocusItem } = latestRef.current;
    const item = current[index];
    if (item) {
      onFocusItem?.(item, { items: current, index, mode: currentMode });
    }
  }, []);

  const activateIndex = useCallback((index: number) => {
    const { items: current, mode: currentMode, onContinue, onOpen } = latestRef.current;
    const item = current[index];
    if (!item) {
      return;
    }

    if (currentMode === "continue" && onContinue) {
      onContinue(item);
    } else {
      onOpen(item.id);
    }
  }, []);

  return (
    <section className={`shelf${isContinue ? " continue-shelf" : ""}`}>
      <div className="shelf-heading">
        <h2>{title}</h2>
        <span>{items.length} titles</span>
      </div>
      <div className="rail">
        {items.map((item, index) => (
          <PosterCard
            key={String(item.id ?? `${title}-${index}`)}
            item={item}
            index={index}
            isContinue={isContinue}
            onFocusIndex={focusIndex}
            onActivateIndex={activateIndex}
          />
        ))}
      </div>
    </section>
  );
});

const PosterCard = memo(function PosterCard({
  item,
  index,
  isContinue,
  onFocusIndex,
  onActivateIndex
}: {
  item: KinoItem;
  index: number;
  isContinue: boolean;
  onFocusIndex: (index: number) => void;
  onActivateIndex: (index: number) => void;
}) {
  const progress = isContinue ? watchProgressPercentOf(item) : 0;

  return (
    <button
      className={`poster-card${isContinue ? " is-continue-card" : ""}`}
      type="button"
      data-focusable
      onFocus={() => onFocusIndex(index)}
      onClick={() => onActivateIndex(index)}
    >
      <PosterImage urls={railPosterCandidatesOf(item)} className="poster-image" alt="" />
      <span className="poster-gradient" />
      <span className="poster-title">{titleOf(item)}</span>
      {isContinue && progress > 0 && (
        <span className="continue-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      )}
    </button>
  );
});
