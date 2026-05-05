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
  const candidates = normalizeImageUrls(urls).map((url) => ({ url }));
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
