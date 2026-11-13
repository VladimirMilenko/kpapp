import { useMemo } from "react";
import { normalizeImageUrls } from "../imageFallback";
import { useImageCandidate } from "../hooks/useImageCandidate";

export function PosterImage({
  urls,
  className,
  alt = "",
  loading = "lazy"
}: {
  urls: Array<string | undefined>;
  className: string;
  alt?: string;
  loading?: "eager" | "lazy";
}) {
  const key = urls.join("\n");
  // Keyed on the URL list so useImageCandidate's memo isn't invalidated by a fresh array every render.
  const candidates = useMemo(() => normalizeImageUrls(urls).map((url) => ({ url })), [key]);
  const image = useImageCandidate(candidates);

  return (
    <span className={className} aria-hidden={alt ? undefined : true}>
      {image.current && (
        <img
          src={image.current.url}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onLoad={image.onLoad}
          onError={image.onError}
        />
      )}
    </span>
  );
}
