import { useEffect } from "react";

const preloaded = new Set<string>();
const queue: string[] = [];
let queueTimer: number | undefined;

export function useImagePreload(urls: Array<string | undefined>, limit = 16) {
  const key = urls.filter(Boolean).slice(0, limit).join("\n");

  useEffect(() => {
    if (!key) {
      return;
    }

    preloadImages(key.split("\n"));
  }, [key]);
}

export function preloadImages(urls: Array<string | undefined>, limit = 16) {
  for (const url of urls.filter(Boolean).slice(0, limit)) {
    if (!url || preloaded.has(url)) {
      continue;
    }

    preloaded.add(url);
    queue.push(url);
  }

  schedulePreload();
}

function schedulePreload() {
  if (queueTimer !== undefined || !queue.length) {
    return;
  }

  queueTimer = window.setTimeout(() => {
    queueTimer = undefined;
    const url = queue.shift();

    if (url) {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
    }

    schedulePreload();
  }, 90);
}
