import type { Section } from "../appTypes";
import { escapeCssUrl, railPosterOf, titleOf, watchProgressPercentOf } from "../media";
import type { KinoItem } from "../types";
import { cssVars } from "../ui";

export interface ShelfFocusContext {
  items: KinoItem[];
  index: number;
  mode?: Section["mode"];
}

export function Shelf({
  title,
  items,
  mode,
  onOpen,
  onContinue,
  onFocusItem
}: {
  title: string;
  items: KinoItem[];
  mode?: Section["mode"];
  onOpen: (id: string | number | undefined) => void;
  onContinue?: (item: KinoItem) => void;
  onFocusItem?: (item: KinoItem, context: ShelfFocusContext) => void;
}) {
  const isContinue = mode === "continue";

  return (
    <section className={`shelf${isContinue ? " continue-shelf" : ""}`}>
      <div className="shelf-heading">
        <h2>{title}</h2>
        <span>{items.length} titles</span>
      </div>
      <div className="rail">
        {items.map((item, index) => {
          const poster = railPosterOf(item);
          const progress = isContinue ? watchProgressPercentOf(item) : 0;
          return (
            <button
              key={String(item.id ?? `${title}-${index}`)}
              className={`poster-card${isContinue ? " is-continue-card" : ""}`}
              type="button"
              data-focusable
              style={poster ? cssVars({ "--poster": `url("${escapeCssUrl(poster)}")` }) : undefined}
              onFocus={() => onFocusItem?.(item, { items, index, mode })}
              onClick={() => (isContinue && onContinue ? onContinue(item) : onOpen(item.id))}
            >
              <span className="poster-gradient" />
              <span className="poster-title">{titleOf(item)}</span>
              {isContinue && progress > 0 && (
                <span className="continue-progress" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
