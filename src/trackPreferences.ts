const KEY = "kino.pub.tv.track.preferences.v1";

export interface TrackPreferences {
  audioLang?: string;
  subtitleLang?: string;
  subtitlesOff?: boolean;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  английский: "en",
  англ: "en",
  ru: "ru",
  rus: "ru",
  russian: "ru",
  русский: "ru",
  рус: "ru",
  uk: "uk",
  ukr: "uk",
  ua: "uk",
  ukrainian: "uk",
  українська: "uk",
  украинский: "uk",
  укр: "uk",
  de: "de",
  ger: "de",
  deu: "de",
  german: "de",
  немецкий: "de",
  fr: "fr",
  fre: "fr",
  fra: "fr",
  french: "fr",
  французский: "fr",
  es: "es",
  spa: "es",
  spanish: "es",
  испанский: "es",
  nl: "nl",
  dut: "nl",
  nld: "nl",
  dutch: "nl",
  голландский: "nl",
  нидерландский: "nl"
};

export function readTrackPreferences(): TrackPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}") as unknown;
    return normalizeTrackPreferences(value);
  } catch {
    localStorage.removeItem(KEY);
    return {};
  }
}

export function saveAudioPreference(language: string | undefined) {
  const lang = normalizeLanguage(language);
  if (!lang) {
    return;
  }

  localStorage.setItem(KEY, JSON.stringify({ ...readTrackPreferences(), audioLang: lang }));
}

export function saveSubtitlePreference(language: string | undefined, off = false) {
  const current = readTrackPreferences();

  if (off) {
    localStorage.setItem(KEY, JSON.stringify({ ...current, subtitlesOff: true }));
    return;
  }

  const lang = normalizeLanguage(language);
  if (!lang) {
    return;
  }

  localStorage.setItem(KEY, JSON.stringify({ ...current, subtitleLang: lang, subtitlesOff: false }));
}

export function sameLanguage(a: string | undefined, b: string | undefined) {
  const left = normalizeLanguage(a);
  const right = normalizeLanguage(b);
  return Boolean(left && right && left === right);
}

export function normalizeLanguage(value: string | undefined) {
  if (!value) {
    return "";
  }

  const lowered = value.toLowerCase().replace(/_/g, "-");
  const direct = LANGUAGE_ALIASES[lowered] || LANGUAGE_ALIASES[lowered.split("-")[0] || ""];
  if (direct) {
    return direct;
  }

  const words = lowered.match(/\p{L}+/gu) ?? [];
  for (const word of words) {
    const mapped = LANGUAGE_ALIASES[word];
    if (mapped) {
      return mapped;
    }
  }

  return lowered.slice(0, 2);
}

function normalizeTrackPreferences(value: unknown): TrackPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Partial<Record<keyof TrackPreferences, unknown>>;
  const preferences: TrackPreferences = {};
  const audioLang = normalizeLanguage(typeof candidate.audioLang === "string" ? candidate.audioLang : undefined);
  const subtitleLang = normalizeLanguage(typeof candidate.subtitleLang === "string" ? candidate.subtitleLang : undefined);

  if (audioLang) {
    preferences.audioLang = audioLang;
  }

  if (subtitleLang) {
    preferences.subtitleLang = subtitleLang;
  }

  if (typeof candidate.subtitlesOff === "boolean") {
    preferences.subtitlesOff = candidate.subtitlesOff;
  }

  return preferences;
}
