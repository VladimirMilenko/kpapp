import { getFocusable } from "./dom";

type Direction = "left" | "right" | "up" | "down";

const keyToDirection = new Map<string, Direction>([
  ["ArrowLeft", "left"],
  ["ArrowRight", "right"],
  ["ArrowUp", "up"],
  ["ArrowDown", "down"]
]);

export function handleSpatialNavigation(event: KeyboardEvent, container: ParentNode = document) {
  const direction = keyToDirection.get(event.key);
  if (!direction) {
    return false;
  }

  const focusables = getFocusable(container);
  if (!focusables.length) {
    return false;
  }

  const fallback = focusables[0];
  if (!fallback) {
    return false;
  }

  const current = document.activeElement instanceof HTMLElement ? document.activeElement : fallback;
  const currentRect = current.getBoundingClientRect();
  const currentCenter = center(currentRect);
  let best: { node: HTMLElement; score: number } | undefined;

  for (const node of focusables) {
    if (node === current) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    const nextCenter = center(rect);
    const dx = nextCenter.x - currentCenter.x;
    const dy = nextCenter.y - currentCenter.y;

    if (!isInDirection(direction, dx, dy)) {
      continue;
    }

    const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const overlapPenalty = hasAxisOverlap(direction, currentRect, rect) ? 0 : 400;
    const fixedPenalty = isFixedTopBarCandidate(direction, node, currentRect) ? 1800 : 0;
    const sameRailPenalty = direction === "up" || direction === "down" ? railPenalty(current, node) : 0;
    const score = primary + secondary * 2.3 + overlapPenalty + fixedPenalty + sameRailPenalty;

    if (!best || score < best.score) {
      best = { node, score };
    }
  }

  if (!best) {
    return false;
  }

  event.preventDefault();
  best.node.focus();
  best.node.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  return true;
}

export function clickFocused(event: KeyboardEvent) {
  if (event.key !== "Enter" && event.key !== " ") {
    return false;
  }

  if (document.activeElement instanceof HTMLElement) {
    event.preventDefault();
    document.activeElement.click();
    return true;
  }

  return false;
}

function center(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function isInDirection(direction: Direction, dx: number, dy: number) {
  switch (direction) {
    case "left":
      return dx < -8;
    case "right":
      return dx > 8;
    case "up":
      return dy < -8;
    case "down":
      return dy > 8;
  }
}

function hasAxisOverlap(direction: Direction, current: DOMRect, candidate: DOMRect) {
  if (direction === "left" || direction === "right") {
    return candidate.bottom >= current.top && candidate.top <= current.bottom;
  }

  return candidate.right >= current.left && candidate.left <= current.right;
}

function isFixedTopBarCandidate(direction: Direction, node: HTMLElement, currentRect: DOMRect) {
  if (direction !== "up") {
    return false;
  }

  const topBar = node.closest(".top-bar");
  return Boolean(topBar && currentRect.top > topBar.getBoundingClientRect().bottom + 80);
}

function railPenalty(current: HTMLElement, candidate: HTMLElement) {
  const currentRail = current.closest(".rail, .episode-rail, .search-grid");
  const candidateRail = candidate.closest(".rail, .episode-rail, .search-grid");

  if (!currentRail) {
    return 0;
  }

  return candidateRail && candidateRail !== currentRail ? 0 : 700;
}
