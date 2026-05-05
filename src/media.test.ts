import { beforeEach, describe, expect, test } from "bun:test";
import {
  cardPosterCandidatesOf,
  heroImageCandidatesOf,
  mediaProgressOf,
  nextMediaAfterSession,
  playbackSessionOf,
  previousMediaBeforeSession,
  resumeMediaOf,
  sourceUrl,
  sourcesOf
} from "./media";
import { installLocalStorage } from "./test/localStorage";
import type { KinoItem, KinoMedia, KinoRuntimeConfig } from "./types";

const config: KinoRuntimeConfig = {
  clientId: "client",
  clientSecret: "secret",
  preferredStream: "hls4"
};

beforeEach(() => {
  installLocalStorage();
});

describe("sourceUrl", () => {
  test("uses preferred stream order across both url and urls payloads", () => {
    expect(
      sourceUrl(
        {
          url: { hls: "https://cdn.example/fallback.m3u8" },
          urls: { hls4: "https://cdn.example/best.m3u8" }
        },
        ["hls4", "hls2", "hls", "http"]
      )
    ).toBe("https://cdn.example/best.m3u8");
  });

  test("falls back to direct string URLs", () => {
    expect(sourceUrl({ url: "https://cdn.example/movie.mp4" }, ["hls4", "hls2", "hls", "http"])).toBe(
      "https://cdn.example/movie.mp4"
    );
  });
});

describe("image candidates", () => {
  test("deduplicates poster fallbacks while preserving display order", () => {
    expect(
      cardPosterCandidatesOf({
        posters: {
          big: "https://cdn.example/big.jpg",
          medium: "https://cdn.example/medium.jpg",
          small: "https://cdn.example/small.jpg",
          poster: "https://cdn.example/medium.jpg"
        },
        images: { poster: "https://cdn.example/image.jpg" },
        poster: "https://cdn.example/root.jpg"
      })
    ).toEqual([
      "https://cdn.example/medium.jpg",
      "https://cdn.example/small.jpg",
      "https://cdn.example/big.jpg",
      "https://cdn.example/image.jpg",
      "https://cdn.example/root.jpg"
    ]);
  });

  test("uses wide hero art before poster fallbacks", () => {
    expect(
      heroImageCandidatesOf({
        posters: {
          wide: "https://cdn.example/wide.jpg",
          big: "https://cdn.example/big.jpg"
        },
        images: { full: "https://cdn.example/full.jpg" }
      })
    ).toEqual([
      { url: "https://cdn.example/wide.jpg", mode: "wide" },
      { url: "https://cdn.example/full.jpg", mode: "wide" },
      { url: "https://cdn.example/big.jpg", mode: "poster" }
    ]);
  });
});

describe("sourcesOf", () => {
  test("filters unplayable files and sorts playable sources by height", () => {
    const media: KinoMedia = {
      files: [
        { id: "sd", h: "480", url: { http: "https://cdn.example/sd.mp4" } },
        { id: "hd", height: "1080", quality: "Full HD", codec: "h264", url: { hls2: "https://cdn.example/hd.m3u8" } },
        { id: "broken" }
      ]
    };

    expect(sourcesOf(media, "hls4")).toEqual([
      {
        id: "hd",
        label: "Full HD",
        url: "https://cdn.example/hd.m3u8",
        quality: "Full HD",
        height: 1080,
        codec: "h264"
      },
      {
        id: "sd",
        label: "480p",
        url: "https://cdn.example/sd.mp4",
        quality: "480p",
        height: 480
      }
    ]);
  });
});

describe("playback session and progress", () => {
  test("builds playback sessions with local resume time and track metadata", () => {
    const item: KinoItem = { id: 42, title: "Series" };
    const media: KinoMedia = {
      id: 7,
      season: "2",
      number: "3",
      title: "Episode title",
      files: [{ id: "1080", height: "1080", url: { hls4: "https://cdn.example/episode.m3u8" } }],
      audios: [{ id: "a1", lang: "en", codec: "aac" }],
      subtitles: [{ id: "s1", lang: "ru", urls: { vtt: "https://cdn.example/ru.vtt" }, shift: "1.5", forced: "0" }]
    };

    localStorage.setItem("kino.pub.tv.progress.42.7", "123");

    expect(playbackSessionOf(item, media, config)).toEqual({
      id: "7",
      title: "Series",
      subtitle: "Episode title",
      sources: [
        {
          id: "1080",
          label: "1080p",
          url: "https://cdn.example/episode.m3u8",
          quality: "1080p",
          height: 1080
        }
      ],
      audios: [{ id: "a1", label: "EN AAC", enabled: false, lang: "en" }],
      subtitles: [
        {
          id: "s1",
          label: "RU",
          kind: "external",
          lang: "ru",
          url: "https://cdn.example/ru.vtt",
          shift: 1.5,
          forced: false
        }
      ],
      resumeTime: 123,
      progressKey: "kino.pub.tv.progress.42.7",
      itemId: 42,
      seasonNumber: 2,
      videoNumber: 3
    });
  });

  test("preserves known watched status on playback sessions", () => {
    const item: KinoItem = { id: 42, title: "Series" };
    const media: KinoMedia = {
      id: 8,
      season: 1,
      number: 4,
      status: 1,
      files: [{ id: "1080", height: "1080", url: { hls4: "https://cdn.example/episode.m3u8" } }]
    };

    expect(playbackSessionOf(item, media, config).watched).toBe(true);
  });

  test("uses local progress when computing resume media", () => {
    const item: KinoItem = {
      id: 9,
      title: "Show",
      seasons: [
        {
          number: 1,
          episodes: [
            { id: "e1", number: 1, duration: 100, watching: { time: 100, status: 1, updated: 1 } },
            { id: "e2", number: 2, duration: 100 }
          ]
        }
      ]
    };

    localStorage.setItem("kino.pub.tv.progress.9.e2", "25");

    expect(mediaProgressOf(item, item.seasons?.[0]?.episodes?.[1] as KinoMedia).label).toBe("Resume at 0:25");
    expect(resumeMediaOf(item)?.id).toBe("e2");
  });

  test("finds the next episode after the active playback session", () => {
    const item: KinoItem = {
      id: 11,
      title: "Show",
      seasons: [
        {
          number: 1,
          episodes: [
            { id: "e1", number: 1, files: [{ url: "https://cdn.example/1.mp4" }] },
            { id: "e2", number: 2, files: [{ url: "https://cdn.example/2.mp4" }] }
          ]
        }
      ]
    };
    const first = item.seasons?.[0]?.episodes?.[0] as KinoMedia;
    const session = playbackSessionOf(item, first, config);

    expect(nextMediaAfterSession(item, session)?.id).toBe("e2");
  });

  test("finds the previous episode before the active playback session", () => {
    const item: KinoItem = {
      id: 12,
      title: "Show",
      seasons: [
        {
          number: 1,
          episodes: [
            { id: "e1", number: 1, files: [{ url: "https://cdn.example/1.mp4" }] },
            { id: "e2", number: 2, files: [{ url: "https://cdn.example/2.mp4" }] }
          ]
        }
      ]
    };
    const second = item.seasons?.[0]?.episodes?.[1] as KinoMedia;
    const session = playbackSessionOf(item, second, config);

    expect(previousMediaBeforeSession(item, session)?.id).toBe("e1");
  });
});
