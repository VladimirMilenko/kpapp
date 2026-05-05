import { beforeEach, describe, expect, test } from "bun:test";
import {
  normalizeLanguage,
  readTrackPreferences,
  sameLanguage,
  saveAudioPreference,
  saveSubtitlePreference
} from "./trackPreferences";
import { installLocalStorage } from "./test/localStorage";

const KEY = "kino.pub.tv.track.preferences.v1";

beforeEach(() => {
  installLocalStorage();
});

describe("track preferences", () => {
  test("saves normalized audio and subtitle preferences", () => {
    saveAudioPreference("English commentary");
    saveSubtitlePreference("Russian");

    expect(readTrackPreferences()).toEqual({
      audioLang: "en",
      subtitleLang: "ru",
      subtitlesOff: false
    });

    saveSubtitlePreference(undefined, true);

    expect(readTrackPreferences()).toEqual({
      audioLang: "en",
      subtitleLang: "ru",
      subtitlesOff: true
    });
  });

  test("sanitizes corrupt persisted values", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        audioLang: "Русский",
        subtitleLang: 42,
        subtitlesOff: "yes"
      })
    );

    expect(readTrackPreferences()).toEqual({ audioLang: "ru" });
  });

  test("removes malformed JSON", () => {
    localStorage.setItem(KEY, "{bad json");

    expect(readTrackPreferences()).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("language normalization", () => {
  test("matches common ISO, English, and Cyrillic labels", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("Русский")).toBe("ru");
    expect(normalizeLanguage("українська доріжка")).toBe("uk");
    expect(sameLanguage("Английский", "eng")).toBe(true);
  });
});
