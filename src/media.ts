import type {
  AudioOption,
  KinoFile,
  KinoHistoryEntry,
  KinoItem,
  KinoMedia,
  KinoRuntimeConfig,
  KinoSeason,
  MediaSourceOption,
  PlaybackSession,
  PreferredStream,
  SubtitleOption
} from "./types";

export interface MediaRow {
  title: string;
  items: KinoMedia[];
}

export interface MediaProgress {
  currentTime: number;
  duration: number;
  percent: number;
  completed: boolean;
  inProgress: boolean;
  label: string;
}

export function playbackSessionOf(item: KinoItem, media: KinoMedia, config: KinoRuntimeConfig): PlaybackSession {
  const sources = sourcesOf(media, config.preferredStream || "hls4");
  if (!sources.length) {
    console.warn("No playable Kino.pub sources", {
      mediaId: mediaIdOf(media),
      files: media.files,
      preferredStream: config.preferredStream
    });
  }

  const title = titleOf(item);
  const progressKey = progressKeyOf(item, media);
  const legacyProgressKey = `kino.pub.tv.progress.${title}`;
  const progress = Number(localStorage.getItem(progressKey) || localStorage.getItem(legacyProgressKey) || watchTimeOf(media) || 0);
  const session: PlaybackSession = {
    id: String(mediaIdOf(media) || item.id || title),
    title,
    sources,
    audios: audiosOf(media),
    subtitles: subtitlesOf(media),
    resumeTime: Number.isFinite(progress) ? progress : 0,
    progressKey
  };

  const subtitle = mediaTitle(media);
  const poster = backdropOf(item) || posterOf(item);
  const itemId = item.id;
  const seasonNumber = numberValue(media.season);
  const videoNumber = numberValue(media.number) ?? 1;
  const watchStatus = watchStatusOf(media);

  if (subtitle) {
    session.subtitle = subtitle;
  }

  if (poster) {
    session.poster = poster;
  }

  if (itemId !== undefined) {
    session.itemId = itemId;
  }

  if (seasonNumber !== undefined) {
    session.seasonNumber = seasonNumber;
  }

  if (videoNumber !== undefined) {
    session.videoNumber = videoNumber;
  }

  if (watchStatus !== undefined) {
    session.watched = watchStatus === 1;
  }

  return session;
}

export function mediaRowsOf(item: KinoItem): MediaRow[] {
  const rows: MediaRow[] = [];
  const videos = mediaArray(item.videos);

  if (videos.length) {
    rows.push({ title: videos.length === 1 ? "Movie" : "Videos", items: videos });
  }

  if (Array.isArray(item.seasons)) {
    for (const season of item.seasons) {
      const episodes = seasonMedia(season);
      if (episodes.length) {
        rows.push({
          title: season.title || `Season ${season.number ?? rows.length + 1}`,
          items: episodes.map((episode) =>
            episode.season === undefined && season.number !== undefined ? { ...episode, season: season.number } : episode
          )
        });
      }
    }
  }

  if (!rows.length && Array.isArray((item as KinoMedia).files)) {
    rows.push({ title: "Movie", items: [item as KinoMedia] });
  }

  return rows;
}

export function flatMediaOf(item: KinoItem) {
  return mediaRowsOf(item).flatMap((row) => row.items);
}

export function nextMediaAfterSession(item: KinoItem, session: PlaybackSession) {
  const media = flatMediaOf(item);
  const currentIndex = media.findIndex((candidate) => mediaMatchesSession(candidate, session));

  if (currentIndex < 0) {
    return nextMediaByEpisodeNumber(media, session);
  }

  return media[currentIndex + 1];
}

export function previousMediaBeforeSession(item: KinoItem, session: PlaybackSession) {
  const media = flatMediaOf(item);
  const currentIndex = media.findIndex((candidate) => mediaMatchesSession(candidate, session));

  if (currentIndex < 0) {
    return previousMediaByEpisodeNumber(media, session);
  }

  return media[currentIndex - 1];
}

export function mediaFromHistoryEntry(entry: KinoHistoryEntry) {
  if (entry.media) {
    return entry.media;
  }

  const item = entry.item;
  if (!item) {
    return undefined;
  }

  return resumeMediaOf(item);
}

export function resumeMediaOf(item: KinoItem) {
  const media = mediaRowsOf(item).flatMap((row) => row.items);
  const inProgress = media
    .map((candidate, index) => ({ candidate, index, progress: mediaProgressOf(item, candidate) }))
    .filter(({ candidate, progress }) => progress.inProgress || watchStatusOf(candidate) === 0)
    .sort((a, b) => watchUpdatedOf(b.candidate) - watchUpdatedOf(a.candidate) || a.index - b.index);

  return inProgress[0]?.candidate ?? media.find((candidate) => !mediaProgressOf(item, candidate).completed) ?? media[0];
}

export function watchTimeOf(media: KinoMedia) {
  return numberValue(media.watching?.time ?? media.time) ?? 0;
}

export function watchStatusOf(media: KinoMedia) {
  return numberValue(media.watching?.status ?? media.status);
}

export function watchUpdatedOf(media: KinoMedia) {
  return numberValue(media.watching?.updated ?? media.updated) ?? 0;
}

export function mediaProgressOf(item: KinoItem, media: KinoMedia): MediaProgress {
  const duration = numberValue(media.duration) ?? 0;
  const currentTime = localWatchTimeOf(item, media) ?? watchTimeOf(media);
  const completed = watchStatusOf(media) === 1 || (duration > 0 && currentTime / duration >= 0.96);
  const percent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : completed ? 100 : 0;
  const inProgress = currentTime > 0 && !completed;
  const label = completed ? "Watched" : inProgress ? `Resume at ${formatClock(currentTime)}` : "Ready to play";

  return {
    currentTime,
    duration,
    percent,
    completed,
    inProgress,
    label
  };
}

export function sourcesOf(media: KinoMedia, preferred: PreferredStream): MediaSourceOption[] {
  const files = mediaArray(media.files) as KinoFile[];
  const order = streamPreference(preferred);

  return files
    .map((file, index) => {
      const url = sourceUrl(file, order);
      if (!url) {
        return null;
      }

      const height = numberValue(file.height ?? file.h);
      const width = numberValue(file.width ?? file.w);
      const quality = String(file.quality || file.quality_id || (height ? `${height}p` : ""));
      const source: MediaSourceOption = {
        id: String(file.id ?? file.file ?? file.quality ?? index),
        label: quality || file.codec || `Source ${index + 1}`,
        url
      };

      if (quality) {
        source.quality = quality;
      }

      if (width !== undefined) {
        source.width = width;
      }

      if (height !== undefined) {
        source.height = height;
      }

      if (typeof file.codec === "string") {
        source.codec = file.codec;
      }

      return source;
    })
    .filter(Boolean)
    .sort((a, b) => (b?.height ?? 0) - (a?.height ?? 0)) as MediaSourceOption[];
}

export function hasPlayableSources(media: KinoMedia) {
  const files = mediaArray(media.files) as KinoFile[];
  const order = streamPreference("hls4");

  return files.some((file) => Boolean(sourceUrl(file, order)));
}

export function sourceUrl(file: KinoFile, order: PreferredStream[]) {
  const urlSets = [typeof file.url === "object" && file.url ? file.url : undefined, file.urls].filter(
    Boolean
  ) as Array<Partial<Record<PreferredStream | string, string>>>;

  for (const key of order) {
    for (const urls of urlSets) {
      const url = urls[key];
      if (url) {
        return url;
      }
    }
  }

  if (typeof file.url === "string") {
    return file.url;
  }

  for (const urls of urlSets) {
    const fallback = Object.values(urls).find((value): value is string => Boolean(value));
    if (fallback) {
      return fallback;
    }
  }

  return undefined;
}

export function streamPreference(preferred: PreferredStream): PreferredStream[] {
  const all: PreferredStream[] = ["hls4", "hls2", "hls", "http"];
  return [preferred, ...all.filter((item) => item !== preferred)];
}

export function mediaArray(value: unknown): KinoMedia[] {
  if (Array.isArray(value)) {
    return value as KinoMedia[];
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter(
      (item): item is KinoMedia => Boolean(item && typeof item === "object")
    );
  }

  return [];
}

export function titleOf(item: KinoItem) {
  return item.title || item.original_title || "Untitled";
}

export function mediaTitle(media: KinoMedia) {
  return media.title || media.name || (media.number ? `Episode ${media.number}` : "Video");
}

export function mediaSubtitle(media: KinoMedia) {
  return [media.season ? `S${media.season}` : "", media.number ? `E${media.number}` : ""].filter(Boolean).join(" ");
}

export function episodeNumber(media: KinoMedia) {
  if (media.season && media.number) {
    return `S${media.season} E${media.number}`;
  }

  return media.number ? `E${media.number}` : "Play";
}

export function metaLine(item: KinoItem) {
  return [item.year, formatRuntime(runtimeOf(item)), ratingOf(item), genresOf(item).slice(0, 3).join(" / ")]
    .filter(Boolean)
    .join("  ");
}

export function heroStatsOf(item: KinoItem) {
  const stats = [imdbRatingOf(item), qualityOf(item), countriesOf(item).slice(0, 2).join(" / ")].filter(Boolean);

  return stats.join("  ");
}

export function shortMeta(item: KinoItem) {
  return [item.year, ratingOf(item)].filter(Boolean).join("  ");
}

export function watchingMetaOf(item: KinoItem) {
  const total = numberValue(item.total);
  const watched = numberValue(item.watched);
  const unwatched = numberValue(item.new);

  if (total !== undefined && watched !== undefined) {
    const suffix = unwatched ? `, ${unwatched} left` : "";
    return `${watched}/${total} watched${suffix}`;
  }

  const media = resumeMediaOf(item);
  const time = media ? watchTimeOf(media) : 0;

  if (time > 0) {
    return `Resume at ${formatClock(time)}`;
  }

  return shortMeta(item);
}

export function continueMetaOf(item: KinoItem) {
  const total = numberValue(item.total);
  const watched = numberValue(item.watched);
  const unwatched = numberValue(item.new);
  const media = resumeMediaOf(item);
  const time = media ? watchTimeOf(media) || itemWatchTimeOf(item) : itemWatchTimeOf(item);
  const duration = (media ? numberValue(media.duration) : undefined) ?? itemDurationOf(item);

  if (duration && time > 0 && time < duration) {
    return `${formatClock(duration - time)} remaining`;
  }

  if (time > 0) {
    return `Resume at ${formatClock(time)}`;
  }

  if (total !== undefined && watched !== undefined) {
    const suffix = unwatched ? `, ${unwatched} left` : "";
    return `${watched}/${total} watched${suffix}`;
  }

  return shortMeta(item);
}

export function watchProgressPercentOf(item: KinoItem) {
  const total = numberValue(item.total);
  const watched = numberValue(item.watched);
  const media = resumeMediaOf(item);
  const time = media ? watchTimeOf(media) || itemWatchTimeOf(item) : itemWatchTimeOf(item);
  const duration = (media ? numberValue(media.duration) : undefined) ?? itemDurationOf(item);

  if (duration && time > 0) {
    return Math.min(100, Math.max(0, (time / duration) * 100));
  }

  if (total && watched !== undefined) {
    return Math.min(100, Math.max(0, (watched / total) * 100));
  }

  return 0;
}

export function synopsisOf(item: KinoItem) {
  return item.plot || item.description || item.tagline || "";
}

export function posterOf(item: KinoItem) {
  return posterCandidatesOf(item)[0] ?? "";
}

export function cardPosterOf(item: KinoItem) {
  return cardPosterCandidatesOf(item)[0] ?? "";
}

export function railPosterOf(item: KinoItem) {
  return railPosterCandidatesOf(item)[0] ?? "";
}

export function backdropOf(item: KinoItem) {
  return backdropCandidatesOf(item)[0] ?? "";
}

export function heroImageOf(item: KinoItem) {
  const wide = backdropOf(item);
  if (wide) {
    return { url: wide, mode: "wide" as const };
  }

  const fallback = posterOf(item);
  return fallback ? { url: fallback, mode: "poster" as const } : undefined;
}

export function posterCandidatesOf(item: KinoItem) {
  return imageCandidates(item.posters?.big, item.posters?.medium, item.posters?.small, item.posters?.poster, item.images?.poster, item.poster);
}

export function cardPosterCandidatesOf(item: KinoItem) {
  return imageCandidates(item.posters?.medium, item.posters?.small, item.posters?.poster, item.posters?.big, item.images?.poster, item.poster);
}

export function railPosterCandidatesOf(item: KinoItem) {
  return imageCandidates(item.posters?.big, item.posters?.medium, item.posters?.small, item.posters?.poster, item.images?.poster, item.poster);
}

export function backdropCandidatesOf(item: KinoItem) {
  return imageCandidates(item.posters?.wide, item.images?.wide, item.images?.full, item.fanart);
}

export function heroImageCandidatesOf(item: KinoItem) {
  return [
    ...backdropCandidatesOf(item).map((url) => ({ url, mode: "wide" as const })),
    ...posterCandidatesOf(item).map((url) => ({ url, mode: "poster" as const }))
  ];
}

export function mediaIdOf(media: KinoMedia) {
  return media.media_id ?? media.mid ?? media.id;
}

export function progressKeyOf(item: KinoItem, media: KinoMedia) {
  return `kino.pub.tv.progress.${item.id ?? titleOf(item)}.${mediaDomId(media)}`;
}

function localWatchTimeOf(item: KinoItem, media: KinoMedia) {
  try {
    const value = localStorage.getItem(progressKeyOf(item, media));
    const progress = numberValue(value);
    return progress && progress > 0 ? progress : undefined;
  } catch {
    return undefined;
  }
}

export function mediaDomId(media: KinoMedia | undefined) {
  if (!media) {
    return "";
  }

  return String(mediaIdOf(media) ?? `${media.season || 0}-${media.number || media.title || "media"}`);
}

export function historyTimeLabel(entry: KinoHistoryEntry) {
  const value = numberValue(entry.last_seen ?? entry.first_seen);
  if (!value) {
    return "Recently watched";
  }

  const ms = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return "Recently watched";
  }

  return `Watched ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function audiosOf(media: KinoMedia): AudioOption[] {
  return Array.isArray(media.audios)
    ? media.audios.map((audio, index) => {
        const option: AudioOption = {
          id: String(audio.id ?? index),
          label: trackLabel(audio, `Track ${index + 1}`),
          enabled: false
        };
        const lang = audio.lang || audio.language;

        if (lang) {
          option.lang = lang;
        }

        return option;
      })
    : [];
}

export function subtitlesOf(media: KinoMedia): SubtitleOption[] {
  if (!Array.isArray(media.subtitles)) {
    return [];
  }

  return media.subtitles.map((subtitle, index) => {
    const forced = booleanValue(subtitle.forced);
    const option: SubtitleOption = {
      id: String(subtitle.id ?? index),
      label: subtitleLabel(subtitle, `Subtitle ${index + 1}`),
      kind: "external"
    };
    const lang = subtitle.lang || subtitle.language;
    const url = subtitle.url || subtitle.urls?.vtt || subtitle.urls?.srt || subtitle.urls?.url || Object.values(subtitle.urls ?? {}).find(Boolean);
    const shift = numberValue(subtitle.shift);

    if (lang) {
      option.lang = lang;
    }

    if (url) {
      option.url = url;
    }

    if (shift !== undefined) {
      option.shift = shift;
    }

    if (forced !== undefined) {
      option.forced = forced;
    }

    return option;
  });
}

export function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", ""].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function imageCandidates(...urls: Array<string | undefined>) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const value of urls) {
    const url = value?.trim();
    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    values.push(url);
  }

  return values;
}

function seasonMedia(season: KinoSeason) {
  const episodes = mediaArray(season.episodes);
  return episodes.length ? episodes : mediaArray(season.videos);
}

function ratingOf(item: KinoItem) {
  const imdb = imdbRatingOf(item);
  if (imdb) {
    return imdb;
  }

  const fallback = numberValue(item.rating);
  if (fallback !== undefined && fallback > 0 && fallback <= 10) {
    return `Rating ${fallback}`;
  }

  return "";
}

function imdbRatingOf(item: KinoItem) {
  const value = item.imdb_rating;
  if (value !== undefined && value !== null && value !== "") {
    return `IMDb ${value}`;
  }

  return "";
}

function kinopoiskRatingOf(item: KinoItem) {
  const value = numberValue(item.kinopoisk_rating);
  return value ? `KinoPoisk ${value}` : "";
}

function genresOf(item: KinoItem) {
  return Array.isArray(item.genres)
    ? item.genres.map((genre) => (typeof genre === "string" ? genre : genre.title || genre.name || "")).filter(Boolean)
    : [];
}

function countriesOf(item: KinoItem) {
  return Array.isArray(item.countries)
    ? item.countries.map((country) => (typeof country === "string" ? country : country.title || country.name || "")).filter(Boolean)
    : [];
}

function qualityOf(item: KinoItem) {
  const quality = numberValue(item.quality);
  return quality ? `${quality}p` : "";
}

function voicesOf(item: KinoItem) {
  const langs = numberValue(item.langs);
  if (langs && langs > 1) {
    return `${langs} audio tracks`;
  }

  if (typeof item.voice === "string" && item.voice.trim()) {
    return item.voice.split(",").slice(0, 2).map((value) => value.trim()).filter(Boolean).join(" / ");
  }

  return "";
}

function runtimeOf(item: KinoItem) {
  const duration = item.duration;
  if (duration && typeof duration === "object") {
    const candidate = duration as { average?: unknown; total?: unknown };
    return candidate.average ?? candidate.total;
  }

  return item.runtime;
}

function itemDurationOf(item: KinoItem) {
  const duration = item.duration;
  if (duration && typeof duration === "object") {
    const candidate = duration as { average?: unknown; total?: unknown };
    return numberValue(candidate.average ?? candidate.total);
  }

  const runtime = numberValue(item.runtime);
  if (runtime === undefined) {
    return undefined;
  }

  return runtime > 600 ? runtime : runtime * 60;
}

function itemWatchTimeOf(item: KinoItem) {
  const watching = item.watching && typeof item.watching === "object" ? (item.watching as { time?: unknown }) : undefined;
  const direct = numberValue(watching?.time ?? item.time);
  if (direct) {
    return direct;
  }

  const media = flatMediaOf(item);
  return media.reduce((latest, candidate) => Math.max(latest, watchTimeOf(candidate)), 0);
}

function trackLabel(audio: { title?: string; name?: string; lang?: string; language?: string; codec?: string; type?: unknown; author?: unknown }, fallback: string) {
  const type = titleFromNested(audio.type);
  const author = titleFromNested(audio.author);
  const lang = audio.lang || audio.language;
  const codec = audio.codec?.toUpperCase();
  const parts = [audio.title || audio.name || type, author, lang?.toUpperCase(), codec].filter(Boolean);

  return parts.length ? parts.join(" ") : fallback;
}

function subtitleLabel(subtitle: { title?: string; name?: string; lang?: string; language?: string; forced?: unknown }, fallback: string) {
  const lang = subtitle.lang || subtitle.language;
  const forced = booleanValue(subtitle.forced) ? "Forced" : "";
  const parts = [subtitle.title || subtitle.name || lang?.toUpperCase(), forced].filter(Boolean);

  return parts.length ? parts.join(" ") : fallback;
}

function titleFromNested(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const item = value as { title?: unknown; short_title?: unknown };
  return typeof item.title === "string" ? item.title : typeof item.short_title === "string" ? item.short_title : "";
}

export function mediaMatchesSession(media: KinoMedia, session: PlaybackSession) {
  const id = String(mediaIdOf(media) ?? "");

  if (id && id === session.id) {
    return true;
  }

  const videoNumber = numberValue(media.number);
  const seasonNumber = numberValue(media.season);

  return (
    videoNumber !== undefined &&
    videoNumber === session.videoNumber &&
    (session.seasonNumber === undefined || seasonNumber === session.seasonNumber)
  );
}

function nextMediaByEpisodeNumber(media: KinoMedia[], session: PlaybackSession) {
  const sessionVideoNumber = numberValue(session.videoNumber);
  if (sessionVideoNumber === undefined) {
    return undefined;
  }

  const sessionSeasonNumber = numberValue(session.seasonNumber);
  return media.find((candidate) => {
    const videoNumber = numberValue(candidate.number);
    const seasonNumber = numberValue(candidate.season);

    if (videoNumber === undefined) {
      return false;
    }

    if (sessionSeasonNumber === undefined) {
      return videoNumber > sessionVideoNumber;
    }

    if (seasonNumber === undefined) {
      return false;
    }

    return seasonNumber > sessionSeasonNumber || (seasonNumber === sessionSeasonNumber && videoNumber > sessionVideoNumber);
  });
}

function previousMediaByEpisodeNumber(media: KinoMedia[], session: PlaybackSession) {
  const sessionVideoNumber = numberValue(session.videoNumber);
  if (sessionVideoNumber === undefined) {
    return undefined;
  }

  const sessionSeasonNumber = numberValue(session.seasonNumber);

  for (let index = media.length - 1; index >= 0; index -= 1) {
    const candidate = media[index];
    if (!candidate) {
      continue;
    }

    const videoNumber = numberValue(candidate.number);
    const seasonNumber = numberValue(candidate.season);

    if (videoNumber === undefined) {
      continue;
    }

    if (sessionSeasonNumber === undefined) {
      if (videoNumber < sessionVideoNumber) {
        return candidate;
      }
      continue;
    }

    if (seasonNumber === undefined) {
      continue;
    }

    if (seasonNumber < sessionSeasonNumber || (seasonNumber === sessionSeasonNumber && videoNumber < sessionVideoNumber)) {
      return candidate;
    }
  }

  return undefined;
}

function formatRuntime(value: number | string | undefined | unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  const minutes = numeric > 600 ? numeric / 60 : numeric;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);

  if (!hours) {
    return `${remainder}m`;
  }

  return `${hours}h ${remainder}m`;
}

function formatClock(seconds: number | undefined) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}
