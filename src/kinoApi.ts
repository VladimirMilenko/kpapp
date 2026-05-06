import type {
  CatalogFilters,
  CatalogReference,
  DeviceCodeResponse,
  DeviceInfo,
  DeviceInfoInput,
  DeviceSettings,
  KinoHistoryEntry,
  KinoItem,
  KinoMedia,
  PlaybackProgress,
  KinoRuntimeConfig,
  OAuthTokens
} from "./types";
import type { Section } from "./appTypes";

type RequestOptions = RequestInit & { retry?: boolean; allowApiError?: boolean };

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

const TOKEN_KEY = "kino.pub.tv.tokens.v1";
const DEVICE_ID_KEY = "kino.pub.tv.device.id.v1";
const API_TIMEOUT_MS = 15_000;
const HOME_RAIL_LIMIT = 24;

export class AuthRequiredError extends Error {
  constructor(message = "Kino.pub session expired. Connect the TV again.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class KinoApi {
  private readonly apiBase: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private tokens: OAuthTokens | null;

  constructor(config: KinoRuntimeConfig) {
    this.apiBase = (config.apiBase || "https://api.service-kp.com").replace(/\/$/, "");
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokens = readTokens();
  }

  get configured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  get authenticated() {
    return Boolean(this.tokens?.accessToken || this.tokens?.refreshToken);
  }

  logout() {
    this.tokens = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);
  }

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const params = {
      grant_type: "device_code",
      client_id: this.clientId,
      client_secret: this.clientSecret
    };

    return this.postWithParams<DeviceCodeResponse>("/oauth2/device", params);
  }

  async pollDeviceCode(code: string): Promise<"pending" | "expired" | OAuthTokens> {
    const params = {
      grant_type: "device_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code
    };

    const response = await this.postWithParams<TokenResponse>("/oauth2/device", params, { retry: false, allowApiError: true });

    if (response.error && ["authorization_pending", "slow_down"].includes(response.error)) {
      return "pending";
    }

    if (response.error && ["code_expired", "authorization_expired"].includes(response.error)) {
      return "expired";
    }

    if (response.error) {
      throw new Error(response.error_description || response.error);
    }

    return this.saveTokenResponse(response);
  }

  async notifyDevice(config: KinoRuntimeConfig) {
    if (!this.authenticated) {
      return;
    }

    try {
      await this.updateDeviceInfo(deviceInfoFromConfig(config));
    } catch {
      // Device notification is useful account metadata, not a blocking app path.
    }
  }

  async updateDeviceInfo(params: DeviceInfoInput) {
    const data = await this.postAuthenticatedJson<unknown>("/v1/device/notify", { ...params });
    const id = extractDeviceId(data);

    if (id !== undefined) {
      localStorage.setItem(DEVICE_ID_KEY, String(id));
    }

    return id;
  }

  async currentDeviceInfo(): Promise<DeviceInfo> {
    const data = await this.get<unknown>("/v1/device/info");
    const device = extractDevice(data);
    const id = extractDeviceId(device);

    if (id !== undefined) {
      localStorage.setItem(DEVICE_ID_KEY, String(id));
    }

    return device;
  }

  async deviceSettings(config: KinoRuntimeConfig): Promise<DeviceSettings> {
    const deviceId = await this.ensureDeviceId(config);
    const data = await this.get<unknown>(`/v1/device/${deviceId}/settings`);
    return extractSettings(data);
  }

  async updateDeviceSettings(config: KinoRuntimeConfig, updates: Record<string, string | number | boolean>) {
    const deviceId = await this.ensureDeviceId(config);
    await this.postAuthenticatedJson<unknown>(`/v1/device/${deviceId}/settings`, updates);
  }

  private async ensureDeviceId(config: KinoRuntimeConfig) {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      return existing;
    }

    if (config.deviceId !== undefined && config.deviceId !== "") {
      localStorage.setItem(DEVICE_ID_KEY, String(config.deviceId));
      return config.deviceId;
    }

    const id = await this.updateDeviceInfo(deviceInfoFromConfig(config));
    if (id !== undefined) {
      return id;
    }

    const device = await this.currentDeviceInfo();
    const currentId = extractDeviceId(device);
    if (currentId !== undefined) {
      return currentId;
    }

    throw new Error("Kino.pub did not return a device id. Reconnect the TV account and try again.");
  }

  async homeSections(): Promise<Section[]> {
    const [watchingMovies, watchingSerials, watchlistSerials] = await Promise.all([
      this.optionalListItems("/v1/watching/movies", {}, 0, HOME_RAIL_LIMIT),
      this.optionalListItems("/v1/watching/serials", {}, 0, HOME_RAIL_LIMIT),
      this.optionalListItems("/v1/watching/serials", { subscribed: 1 }, 0, HOME_RAIL_LIMIT)
    ]);
    const continueItems = uniqueItems([...watchingMovies, ...watchingSerials]).slice(0, HOME_RAIL_LIMIT);
    const sections: Section[] = [];

    if (continueItems.length) {
      sections.push({ id: "continue-watching", title: "Continue where you left off", items: continueItems, mode: "continue" });
    }

    if (watchlistSerials.length) {
      sections.push({ id: "watching", title: "Watching", items: watchlistSerials.slice(0, HOME_RAIL_LIMIT) });
    }

    if (watchingSerials.length) {
      sections.push({ id: "watching-serials", title: "Series in progress", items: watchingSerials.slice(0, HOME_RAIL_LIMIT) });
    }

    return sections.filter((section) => section.items.length);
  }

  async watchlistSerials(page = 0, perpage = HOME_RAIL_LIMIT) {
    return this.listItems("/v1/watching/serials", { subscribed: 1 }, page, perpage);
  }

  async markWatching(params: {
    itemId: string | number | undefined;
    seasonNumber: number | undefined;
    videoNumber: number | undefined;
    progress: PlaybackProgress;
  }) {
    if (params.itemId === undefined) {
      return;
    }

    const time = Math.max(0, Math.floor(params.progress.completed ? params.progress.duration : params.progress.currentTime));
    if (!Number.isFinite(time)) {
      return;
    }

    const query: Record<string, string | number> = {
      id: params.itemId,
      time,
      video: params.videoNumber ?? 1
    };

    if (params.seasonNumber !== undefined) {
      query.season = params.seasonNumber;
    }

    await this.get("/v1/watching/marktime", query);
  }

  async markWatched(params: {
    itemId: string | number | undefined;
    seasonNumber: number | undefined;
    videoNumber: number | undefined;
  }) {
    const watched = await this.toggleWatched(params);

    if (watched === 0) {
      return this.toggleWatched(params);
    }

    return watched;
  }

  async toggleWatchlist(itemId: string | number | undefined) {
    if (itemId === undefined) {
      return undefined;
    }

    const data = await this.get<unknown>("/v1/watching/togglewatchlist", { id: itemId });
    return extractWatchlistValue(data);
  }

  private async toggleWatched(params: {
    itemId: string | number | undefined;
    seasonNumber: number | undefined;
    videoNumber: number | undefined;
  }) {
    if (params.itemId === undefined) {
      return undefined;
    }

    const query: Record<string, string | number> = {
      id: params.itemId,
      video: params.videoNumber ?? 1
    };

    if (params.seasonNumber !== undefined) {
      query.season = params.seasonNumber;
    }

    const data = await this.get<unknown>("/v1/watching/toggle", query);
    return extractWatchedValue(data);
  }

  private async optionalListItems(path: string, params: Record<string, string | number> = {}, page = 0, perpage = 24) {
    try {
      return await this.listItems(path, params, page, perpage);
    } catch (error) {
      console.warn(`Unable to load ${path}`, error);
      return [];
    }
  }

  async search(query: string, page = 0, perpage = 24) {
    return this.listItems("/v1/items/search", { q: query }, page, perpage);
  }

  async catalogItems(filters: CatalogFilters & { title?: string }, page = 0, perpage = 30) {
    const params: Record<string, string | number> = { sort: "updated-" };

    if (filters.type) {
      params.type = filters.type;
    }

    if (filters.genre) {
      params.genre = filters.genre;
    }

    if (filters.title && filters.title.length >= 3) {
      params.title = filters.title;
    }

    return this.listItems("/v1/items", params, page, perpage);
  }

  async history(): Promise<KinoHistoryEntry[]> {
    const data = await this.get<unknown>("/v1/history", { page: 1, perpage: 40 });
    return extractHistory(data);
  }

  async contentTypes(): Promise<CatalogReference[]> {
    const data = await this.get<unknown>("/v1/types");
    return extractReferences(data);
  }

  async genres(type: string | undefined): Promise<CatalogReference[]> {
    const params = type ? { type } : {};
    const data = await this.get<unknown>("/v1/genres", params);
    return extractReferences(data);
  }

  async item(id: string | number): Promise<KinoItem> {
    const data = await this.get<unknown>(`/v1/items/${id}`, { nolinks: 1 });
    return extractObject<KinoItem>(data);
  }

  async mediaLinks(mediaId: string | number): Promise<KinoMedia> {
    const data = await this.get<unknown>("/v1/items/media-links", { mid: mediaId });
    return extractObject<KinoMedia>(data);
  }

  async mediaVideoLink(file: string, type: string) {
    const data = await this.get<unknown>("/v1/items/media-video-link", { file, type });
    const value = extractObject<{ url?: string }>(data);

    if (!value.url) {
      throw new Error("Kino.pub did not return a playable video URL.");
    }

    return value.url;
  }

  private async listItems(path: string, params: Record<string, string | number> = {}, page = 0, perpage = 24) {
    const data = await this.get<unknown>(path, { perpage, page, ...params });
    return extractItems(data);
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}) {
    await this.ensureAccessToken();
    const url = new URL(`${this.apiBase}${path}`);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    url.searchParams.set("access_token", this.tokens?.accessToken ?? "");

    return this.fetchJson<T>(url);
  }

  private async postAuthenticatedJson<T>(path: string, body: Record<string, string | number | boolean>) {
    await this.ensureAccessToken();
    const url = new URL(`${this.apiBase}${path}`);
    url.searchParams.set("access_token", this.tokens?.accessToken ?? "");

    return this.fetchJson<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  private async ensureAccessToken() {
    if (!this.tokens?.accessToken && this.tokens?.refreshToken) {
      await this.refreshAccessToken();
      return;
    }

    if (!this.tokens?.accessToken) {
      throw new AuthRequiredError("Kino.pub account is not connected.");
    }

    if (!this.tokens.refreshToken || !this.tokens.expiresAt) {
      return;
    }

    if (Date.now() < this.tokens.expiresAt - 90_000) {
      return;
    }

    await this.refreshAccessToken();
  }

  private async refreshAccessToken() {
    if (!this.tokens?.refreshToken) {
      this.logout();
      throw new AuthRequiredError();
    }

    const params = {
      grant_type: "refresh_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokens.refreshToken
    };

    const response = await this.postWithParams<TokenResponse>("/oauth2/token", params, { retry: false, allowApiError: true });

    if (response.error) {
      this.logout();
      const message =
        response.error === "invalid_refresh_token"
          ? "Kino.pub session expired. Connect the TV again."
          : response.error_description || response.error;
      throw new AuthRequiredError(message);
    }

    this.saveTokenResponse(response);
  }

  private async postWithParams<T>(
    path: string,
    params: Record<string, string | number>,
    options: RequestOptions = {}
  ) {
    const url = new URL(`${this.apiBase}${path}`);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    return this.fetchJson<T>(url, { ...options, method: "POST" });
  }

  private async fetchJson<T>(pathOrUrl: string | URL, options: RequestOptions = {}): Promise<T> {
    const url = pathOrUrl instanceof URL ? pathOrUrl : new URL(`${this.apiBase}${pathOrUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body instanceof URLSearchParams
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...options.headers
        }
      });

      const text = await response.text();
      const json = text ? (JSON.parse(text) as unknown) : {};

      if (response.status === 401 && options.retry !== false && this.tokens?.refreshToken) {
        await this.refreshAccessToken();
        return this.fetchJson<T>(pathOrUrl, { ...options, retry: false });
      }

      if (!response.ok) {
        if (options.allowApiError) {
          return json as T;
        }

        if (response.status === 401) {
          this.logout();
          throw new AuthRequiredError();
        }

        const error = typeof json === "object" && json && "error" in json ? String(json.error) : text;
        throw new Error(error || `Kino.pub API returned ${response.status}.`);
      }

      if (!options.allowApiError && typeof json === "object" && json && "error" in json) {
        const error = String((json as { error: unknown }).error);
        throw new Error(error || "Kino.pub API returned an error.");
      }

      if (!options.allowApiError && typeof json === "object" && json && "status" in json) {
        const apiStatus = Number((json as { status: unknown }).status);

        if (Number.isFinite(apiStatus) && apiStatus !== 200) {
          if (apiStatus === 401) {
            this.logout();
            throw new AuthRequiredError();
          }

          const candidate = json as { error?: unknown; message?: unknown };
          throw new Error(String(candidate.error || candidate.message || `Kino.pub API returned ${apiStatus}.`));
        }
      }

      return json as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Kino.pub API request timed out.");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private saveTokenResponse(response: TokenResponse) {
    if (!response.access_token) {
      throw new Error(response.error_description || response.error || "Kino.pub did not return an access token.");
    }

    const tokens: OAuthTokens = {
      accessToken: response.access_token
    };
    const refreshToken = response.refresh_token || this.tokens?.refreshToken;

    if (refreshToken) {
      tokens.refreshToken = refreshToken;
    }

    if (response.expires_in) {
      tokens.expiresAt = Date.now() + response.expires_in * 1000;
    }

    this.tokens = tokens;
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    return tokens;
  }
}

function deviceInfoFromConfig(config: KinoRuntimeConfig): DeviceInfoInput {
  return {
    title: config.deviceTitle || "LG webOS TV",
    hardware: config.deviceHardware || "webOS",
    software: config.deviceSoftware || "Kino.pub TV"
  };
}

function readTokens(): OAuthTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as OAuthTokens) : null;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function extractItems(data: unknown): KinoItem[] {
  if (Array.isArray(data)) {
    return data as KinoItem[];
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const candidate = data as Record<string, unknown>;
  const keys = ["items", "results", "data"];

  for (const key of keys) {
    if (Array.isArray(candidate[key])) {
      return candidate[key] as KinoItem[];
    }

    if (candidate[key] && typeof candidate[key] === "object" && Array.isArray((candidate[key] as Record<string, unknown>).items)) {
      return (candidate[key] as Record<string, unknown>).items as KinoItem[];
    }
  }

  return [];
}

function extractHistory(data: unknown): KinoHistoryEntry[] {
  return historyArray(data).map((entry) => {
    if (!entry || typeof entry !== "object") {
      return {};
    }

    const candidate = entry as KinoHistoryEntry & KinoItem;
    return candidate.item ? candidate : { ...candidate, item: candidate as KinoItem };
  });
}

function historyArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const candidate = data as Record<string, unknown>;

  for (const key of ["history", "items", "data"]) {
    const value = candidate[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = historyArray(value);
      if (nested.length) {
        return nested;
      }
    }
  }

  return [];
}

function extractReferences(data: unknown): CatalogReference[] {
  const items = referenceArray(data);

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const id = primitiveId(candidate.id);
      const title = typeof candidate.title === "string" ? candidate.title : typeof candidate.name === "string" ? candidate.name : "";

      if (id === undefined || !title) {
        return null;
      }

      const reference: CatalogReference = { id, title };
      if (typeof candidate.type === "string") {
        reference.type = candidate.type;
      }
      return reference;
    })
    .filter((item): item is CatalogReference => Boolean(item));
}

function referenceArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const candidate = data as Record<string, unknown>;

  for (const key of ["items", "types", "genres", "countries", "data"]) {
    const value = candidate[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = referenceArray(value);
      if (nested.length) {
        return nested;
      }
    }
  }

  return [];
}

function uniqueItems(items: KinoItem[]) {
  const seen = new Set<string>();
  const unique: KinoItem[] = [];

  for (const item of items) {
    const key = String(item.id ?? item.title ?? unique.length);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function extractObject<T>(data: unknown): T {
  if (!data || typeof data !== "object") {
    return {} as T;
  }

  const candidate = data as Record<string, unknown>;

  for (const key of ["item", "media", "data"]) {
    if (candidate[key] && typeof candidate[key] === "object" && !Array.isArray(candidate[key])) {
      return candidate[key] as T;
    }
  }

  return candidate as T;
}

function extractDevice(data: unknown): DeviceInfo {
  if (!data || typeof data !== "object") {
    return {};
  }

  const candidate = data as Record<string, unknown>;
  const device = candidate.device;

  if (device && typeof device === "object" && !Array.isArray(device)) {
    return device as DeviceInfo;
  }

  const nested = candidate.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedDevice = (nested as Record<string, unknown>).device;
    if (nestedDevice && typeof nestedDevice === "object" && !Array.isArray(nestedDevice)) {
      return nestedDevice as DeviceInfo;
    }
  }

  return candidate as DeviceInfo;
}

function extractSettings(data: unknown): DeviceSettings {
  if (!data || typeof data !== "object") {
    return {};
  }

  const candidate = data as Record<string, unknown>;
  const settings = candidate.settings;

  if (settings && typeof settings === "object" && !Array.isArray(settings)) {
    return settings as DeviceSettings;
  }

  const nested = candidate.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const nestedSettings = (nested as Record<string, unknown>).settings;
    if (nestedSettings && typeof nestedSettings === "object" && !Array.isArray(nestedSettings)) {
      return nestedSettings as DeviceSettings;
    }
  }

  return {};
}

function extractDeviceId(data: unknown): string | number | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const candidate = data as Record<string, unknown>;
  const direct = primitiveId(candidate.id ?? candidate.device_id ?? candidate.deviceId);
  if (direct !== undefined) {
    return direct;
  }

  for (const key of ["device", "item", "data"]) {
    const nested = candidate[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      continue;
    }

    const value = nested as Record<string, unknown>;
    const id = primitiveId(value.id ?? value.device_id ?? value.deviceId);
    if (id !== undefined) {
      return id;
    }
  }

  return undefined;
}

function primitiveId(value: unknown): string | number | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function extractWatchedValue(data: unknown): 0 | 1 | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const candidate = data as Record<string, unknown>;
  const value = Number(candidate.watched);

  return value === 0 || value === 1 ? value : undefined;
}

function extractWatchlistValue(data: unknown): boolean | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const candidate = extractObject<Record<string, unknown>>(data);
  const value = candidate.watchlist ?? candidate.watching ?? candidate.subscribed;

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const numeric = Number(value);
    if (numeric === 0 || numeric === 1) {
      return Boolean(numeric);
    }
  }

  return undefined;
}
