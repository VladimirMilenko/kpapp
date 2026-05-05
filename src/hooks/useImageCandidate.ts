import { useMemo, useState } from "react";
import { isImageUrlFailed, markImageFailed, markImageLoaded } from "../imageFallback";

export interface ImageCandidate {
  url: string;
}

export function useImageCandidate<T extends ImageCandidate>(candidates: T[]) {
  const [revision, setRevision] = useState(0);

  const availableCandidates = useMemo(() => {
    const seen = new Set<string>();
    const available: T[] = [];

    for (const candidate of candidates) {
      const url = candidate.url.trim();
      if (!url || seen.has(url) || isImageUrlFailed(url)) {
        continue;
      }

      seen.add(url);
      available.push(url === candidate.url ? candidate : { ...candidate, url });
    }

    return available;
  }, [candidates, revision]);

  const current = availableCandidates[0];

  return {
    current,
    onLoad() {
      if (current) {
        markImageLoaded(current.url);
      }
    },
    onError() {
      if (current) {
        markImageFailed(current.url);
        setRevision((value) => value + 1);
      }
    }
  };
}
