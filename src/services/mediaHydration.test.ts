import { describe, expect, test } from "bun:test";
import { hydrateMedia } from "./mediaHydration";
import type { KinoApi } from "../kinoApi";
import type { KinoMedia, KinoRuntimeConfig } from "../types";

const config: KinoRuntimeConfig = {
  clientId: "client",
  clientSecret: "secret",
  preferredStream: "hls2"
};

describe("hydrateMedia", () => {
  test("returns playable media without API calls", async () => {
    const calls: string[] = [];
    const media: KinoMedia = {
      id: 1,
      files: [{ id: "ready", url: { hls4: "https://cdn.example/ready.m3u8" } }]
    };
    const api = {
      async mediaLinks() {
        calls.push("mediaLinks");
        return {};
      },
      async mediaVideoLink() {
        calls.push("mediaVideoLink");
        return "";
      }
    } as unknown as KinoApi;

    await expect(hydrateMedia(api, config, media)).resolves.toBe(media);
    expect(calls).toEqual([]);
  });

  test("merges media links and resolves file links with the preferred stream", async () => {
    const videoLinkCalls: Array<[string, string]> = [];
    const media: KinoMedia = {
      id: 12,
      files: [{ id: "f1", file: "file-token" }],
      audios: [{ lang: "en" }],
      subtitles: [{ lang: "ru", url: "https://cdn.example/ru.srt" }]
    };
    const api = {
      async mediaLinks(id: string | number) {
        expect(id).toBe(12);
        return { duration: "3600" };
      },
      async mediaVideoLink(file: string, type: string) {
        videoLinkCalls.push([file, type]);
        return `https://cdn.example/${type}/${file}.m3u8`;
      }
    } as unknown as KinoApi;

    const hydrated = await hydrateMedia(api, config, media);

    expect(hydrated).toEqual({
      id: 12,
      duration: "3600",
      files: [{ id: "f1", file: "file-token", url: { hls2: "https://cdn.example/hls2/file-token.m3u8" } }],
      audios: [{ lang: "en" }],
      subtitles: [{ lang: "ru", url: "https://cdn.example/ru.srt" }]
    });
    expect(videoLinkCalls).toEqual([["file-token", "hls2"]]);
  });
});
