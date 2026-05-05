export type PreferredStream = "hls4" | "hls2" | "hls" | "http";

export interface KinoRuntimeConfig {
  clientId: string;
  clientSecret: string;
  apiBase?: string;
  deviceTitle?: string;
  deviceHardware?: string;
  deviceSoftware?: string;
  deviceId?: string | number;
  preferredStream?: PreferredStream;
}

export interface DeviceSettingListItem {
  id: string | number;
  label: string;
  description?: string;
  selected?: number | boolean;
}

export interface DeviceSetting {
  type?: "list" | string;
  label?: string;
  value: string | number | boolean | DeviceSettingListItem[];
}

export type DeviceSettings = Record<string, DeviceSetting>;

export interface DeviceInfoInput {
  title: string;
  hardware: string;
  software: string;
}

export interface DeviceInfo {
  id?: string | number;
  title?: string;
  hardware?: string;
  software?: string;
  created?: number | string;
  updated?: number | string;
  last_seen?: number | string;
  is_browser?: number | boolean;
  settings?: DeviceSettings;
}

export interface CatalogReference {
  id: string | number;
  title: string;
  type?: string;
}

export interface CatalogFilters {
  type?: string;
  genre?: string;
}

export interface KinoHistoryEntry {
  time?: number | string;
  counter?: number | string;
  first_seen?: number | string;
  last_seen?: number | string;
  item?: KinoItem;
  media?: KinoMedia;
}

declare global {
  interface Window {
    KINO_TV_CONFIG?: KinoRuntimeConfig;
    PalmSystem?: {
      screenOrientation?: string;
    };
    webOS?: {
      platformBack?: () => void;
    };
  }
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface DeviceCodeResponse {
  code?: string;
  device_code?: string;
  user_code: string;
  verification_uri?: string;
  verification_url?: string;
  expires_in?: number;
  interval?: number;
}

export interface KinoImageSet {
  poster?: string;
  big?: string;
  full?: string;
  wide?: string;
  [key: string]: string | undefined;
}

export interface KinoPerson {
  id?: number | string;
  name?: string;
}

export interface KinoItem {
  id?: number | string;
  title?: string;
  original_title?: string;
  year?: number | string;
  type?: string;
  subtype?: string;
  plot?: string;
  description?: string;
  tagline?: string;
  imdb?: number | string;
  imdb_rating?: number | string;
  rating?: number | string;
  runtime?: number | string;
  posters?: KinoImageSet;
  images?: KinoImageSet;
  poster?: string;
  fanart?: string;
  genres?: Array<string | { title?: string; name?: string }>;
  countries?: Array<string | { title?: string; name?: string }>;
  cast?: KinoPerson[];
  directors?: KinoPerson[];
  videos?: KinoMedia[];
  seasons?: KinoSeason[];
  total?: number | string;
  watched?: number | string;
  new?: number | string;
  [key: string]: unknown;
}

export interface KinoSeason {
  id?: number | string;
  number?: number | string;
  title?: string;
  episodes?: KinoMedia[];
  videos?: KinoMedia[];
  [key: string]: unknown;
}

export interface KinoMedia {
  id?: number | string;
  media_id?: number | string;
  mid?: number | string;
  number?: number | string;
  season?: number | string;
  title?: string;
  name?: string;
  files?: KinoFile[];
  audios?: KinoTrackMeta[];
  subtitles?: KinoSubtitleMeta[];
  watching?: { time?: number | string; status?: number | string; updated?: number | string };
  duration?: number | string;
  time?: number | string;
  status?: number | string;
  updated?: number | string;
  [key: string]: unknown;
}

export interface KinoFile {
  id?: number | string;
  file?: string;
  quality?: string;
  quality_id?: string;
  codec?: string;
  size?: number | string;
  w?: number | string;
  h?: number | string;
  width?: number | string;
  height?: number | string;
  url?: string | Partial<Record<PreferredStream | string, string>>;
  urls?: Partial<Record<PreferredStream | string, string>>;
  [key: string]: unknown;
}

export interface KinoTrackMeta {
  id?: number | string;
  lang?: string;
  language?: string;
  title?: string;
  name?: string;
  codec?: string;
  [key: string]: unknown;
}

export interface KinoSubtitleMeta extends KinoTrackMeta {
  url?: string;
  urls?: Record<string, string>;
  format?: string;
  shift?: number | string;
  forced?: boolean | number | string;
}

export interface MediaSourceOption {
  id: string;
  label: string;
  url: string;
  quality?: string;
  width?: number;
  height?: number;
  codec?: string;
}

export interface AudioOption {
  id: string;
  label: string;
  lang?: string;
  enabled: boolean;
}

export interface SubtitleOption {
  id: string;
  label: string;
  lang?: string;
  url?: string;
  shift?: number;
  forced?: boolean;
  kind: "off" | "hls" | "external";
}

export interface PlaybackSession {
  id: string;
  title: string;
  subtitle?: string;
  poster?: string;
  sources: MediaSourceOption[];
  audios: AudioOption[];
  subtitles: SubtitleOption[];
  resumeTime?: number;
  progressKey?: string;
  itemId?: string | number;
  seasonNumber?: number;
  videoNumber?: number;
}

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
  completed: boolean;
}

export interface PlayerSnapshot {
  title: string;
  subtitle?: string;
  paused: boolean;
  loading: boolean;
  currentTime: number;
  duration: number;
  bufferedUntil: number;
  activeCue: string;
  qualityOptions: Array<{ id: string; label: string; enabled: boolean }>;
  selectedQualityId: string;
  audioOptions: Array<{ id: string; label: string; enabled: boolean; lang?: string }>;
  selectedAudioId: string;
  subtitleOptions: Array<{ id: string; label: string; enabled: boolean; lang?: string; forced?: boolean }>;
  selectedSubtitleId: string;
  currentSourceId: string;
  currentSourceLabel?: string;
  nextSourceLabel?: string;
  canTryNextSource: boolean;
  ended: boolean;
  error?: string;
}
