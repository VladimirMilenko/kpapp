import { QueryClient } from "@tanstack/react-query";
import { AuthRequiredError } from "./kinoApi";
import type { CatalogFilters, KinoMedia, PreferredStream } from "./types";
import { mediaDomId } from "./media";

export const QUERY_STALE_TIME = {
  home: 45_000,
  rails: 15 * 60_000,
  search: 5 * 60_000,
  history: 45_000,
  catalogFilters: 6 * 60 * 60_000,
  deviceSettings: 60_000,
  item: 6 * 60 * 60_000,
  playableMedia: 2 * 60_000
};

export const kinoQueryKeys = {
  all: ["kino"] as const,
  home: () => [...kinoQueryKeys.all, "home"] as const,
  search: (query: string) => [...kinoQueryKeys.all, "search", query] as const,
  catalogSearch: (query: string, filters: CatalogFilters) =>
    [...kinoQueryKeys.all, "catalog-search", query, filters.type || "", filters.genre || ""] as const,
  history: () => [...kinoQueryKeys.all, "history"] as const,
  catalogTypes: () => [...kinoQueryKeys.all, "catalog-types"] as const,
  catalogGenres: (type: string | undefined) => [...kinoQueryKeys.all, "catalog-genres", type || "all"] as const,
  deviceInfo: () => [...kinoQueryKeys.all, "device-info"] as const,
  deviceSettings: () => [...kinoQueryKeys.all, "device-settings"] as const,
  item: (id: string | number) => [...kinoQueryKeys.all, "item", String(id)] as const,
  playableMedia: (media: KinoMedia, preferredStream: PreferredStream | undefined) =>
    [...kinoQueryKeys.all, "playable-media", mediaDomId(media), preferredStream || "hls4"] as const
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 30 * 60_000,
      experimental_prefetchInRender: true,
      refetchOnWindowFocus: false,
      retry(failureCount, error) {
        if (error instanceof AuthRequiredError) {
          return false;
        }

        return failureCount < 1;
      }
    },
    mutations: {
      retry: false
    }
  }
});
