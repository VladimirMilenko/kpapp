const failedImageUrls = new Set<string>();
const loadedImageUrls = new Set<string>();

export function normalizeImageUrls(urls: Array<string | undefined>) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of urls) {
    const url = value?.trim();
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalized.push(url);
  }

  return normalized;
}

export function isImageUrlFailed(url: string) {
  return failedImageUrls.has(url);
}

export function markImageLoaded(url: string) {
  loadedImageUrls.add(url);
  failedImageUrls.delete(url);
}

export function markImageFailed(url: string) {
  if (!loadedImageUrls.has(url)) {
    failedImageUrls.add(url);
  }
}

export function preloadImage(url: string) {
  if (failedImageUrls.has(url) || loadedImageUrls.has(url)) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const image = new Image();

    image.decoding = "async";
    image.onload = () => {
      markImageLoaded(url);
      resolve(true);
    };
    image.onerror = () => {
      markImageFailed(url);
      resolve(false);
    };
    image.src = url;
  });
}
