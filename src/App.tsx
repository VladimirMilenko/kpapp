import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Navigate, RouterProvider, createMemoryRouter, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyAppearanceSettings, readAppearanceSettings, saveAppearanceSettings, type AppearanceSettings } from "./appearance";
import type { PlayerRouteState, Section } from "./appTypes";
import { focusFirst } from "./dom";
import { useGlobalNavigation } from "./hooks/useGlobalNavigation";
import { AuthRequiredError, KinoApi } from "./kinoApi";
import {
  backdropOf,
  episodeNumber,
  flatMediaOf,
  mediaDomId,
  mediaFromHistoryEntry,
  mediaMatchesSession,
  mediaProgressOf,
  mediaRowsOf,
  mediaSubtitle,
  mediaTitle,
  nextMediaAfterSession,
  playbackSessionOf,
  posterOf,
  previousMediaBeforeSession,
  railPosterOf,
  resumeMediaOf
} from "./media";
import { kinoQueryKeys, QUERY_STALE_TIME } from "./queryClient";
import type { ShelfFocusContext } from "./components/Shelf";
import { BrowseScreen } from "./screens/BrowseScreen";
import { DetailScreen } from "./screens/DetailScreen";
import { DeviceSettingsScreen } from "./screens/DeviceSettingsScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { PlayerScreen } from "./screens/PlayerScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { AuthScreen, ErrorScreen, LoadingScreen, MissingConfig, PairScreen } from "./screens/SystemScreens";
import { saveSearchQuery } from "./searchHistory";
import { preloadImages } from "./hooks/useImagePreload";
import { hydrateMedia as hydratePlayableMedia } from "./services/mediaHydration";
import type {
  CatalogFilters,
  DeviceInfoInput,
  DeviceSettings,
  KinoHistoryEntry,
  KinoItem,
  KinoMedia,
  KinoRuntimeConfig,
  PlayerEpisodeCard,
  PlaybackProgress,
  PlaybackSession
} from "./types";
import { errorMessage } from "./ui";

const DEFAULT_API_BASE = "https://api.service-kp.com";
const DEFAULT_CLIENT_ID = "xbmc";
const DEFAULT_CLIENT_SECRET = "cgg3gtifu46urtfp2zp1nqtba0k2ezxh";
const SEARCH_PAGE_SIZE = 24;
const BROWSE_PAGE_SIZE = 30;
const CONTINUE_PREFETCH_LIMIT = 6;
const HERO_SELECTION_DELAY_MS = 320;
const EXIT_BACK_WINDOW_MS = 1800;

interface RuntimeContextValue {
  api: KinoApi;
  config: KinoRuntimeConfig;
  appearance: AppearanceSettings;
  setAppearance: (value: AppearanceSettings) => void;
  authRunRef: MutableRefObject<number>;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function App({ config }: { config: KinoRuntimeConfig }) {
  const apiRef = useRef<KinoApi | null>(null);
  const authRunRef = useRef(0);
  const lastHomeBackAtRef = useRef(0);
  const exitHintTimerRef = useRef<number | undefined>(undefined);
  const exitDialogRef = useRef<HTMLDivElement | null>(null);
  const [appearance, setAppearanceState] = useState(readAppearanceSettings);
  const [showExitHint, setShowExitHint] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  if (!apiRef.current) {
    apiRef.current = new KinoApi(config);
  }

  const api = apiRef.current;
  const setAppearance = useCallback((value: AppearanceSettings) => {
    setAppearanceState(value);
    saveAppearanceSettings(value);
  }, []);
  const context = useMemo(() => ({ api, config, appearance, setAppearance, authRunRef }), [api, appearance, config, setAppearance]);
  const initialEntry = !api.configured ? "/config" : api.authenticated ? "/home" : "/auth";
  const router = useMemo(
    () =>
      createMemoryRouter(
        [
          { path: "/", element: <Navigate to={initialEntry} replace /> },
          { path: "/config", element: <MissingConfig /> },
          { path: "/auth", element: <AuthRoute /> },
          { path: "/pair", element: <PairRoute /> },
          { path: "/home", element: <HomeRoute /> },
          { path: "/search", element: <SearchRoute /> },
          { path: "/browse", element: <BrowseRoute /> },
          { path: "/history", element: <HistoryRoute /> },
          { path: "/settings", element: <SettingsRoute /> },
          { path: "/detail/:id", element: <DetailRoute /> },
          { path: "/player", element: <PlayerRoute /> },
          { path: "*", element: <Navigate to={initialEntry} replace /> }
        ],
        { initialEntries: [initialEntry] }
      ),
    [initialEntry]
  );

  useGlobalNavigation(() => {
    const path = router.state.location.pathname;

    if (showExitConfirm) {
      setShowExitConfirm(false);
      return;
    }

    if (path === "/home") {
      const now = Date.now();

      if (now - lastHomeBackAtRef.current <= EXIT_BACK_WINDOW_MS) {
        lastHomeBackAtRef.current = 0;
        setShowExitHint(false);
        setShowExitConfirm(true);
        return;
      }

      lastHomeBackAtRef.current = now;
      setShowExitHint(true);
      window.clearTimeout(exitHintTimerRef.current);
      exitHintTimerRef.current = window.setTimeout(() => {
        lastHomeBackAtRef.current = 0;
        setShowExitHint(false);
      }, EXIT_BACK_WINDOW_MS);
      return;
    }

    lastHomeBackAtRef.current = 0;
    setShowExitHint(false);

    if (path === "/auth" || path === "/config") {
      return;
    }

    if (path === "/pair") {
      void router.navigate("/auth");
      return;
    }

    void router.navigate(-1);
  });

  useEffect(() => {
    if (!showExitConfirm) {
      return;
    }

    requestAnimationFrame(() => focusFirst(exitDialogRef.current ?? document));
  }, [showExitConfirm]);

  useEffect(
    () => () => {
      window.clearTimeout(exitHintTimerRef.current);
    },
    []
  );

  useEffect(() => {
    try {
      if (window.PalmSystem) {
        window.PalmSystem.screenOrientation = "landscape";
      }
    } catch {
      // webOS exposes this in packaged apps only.
    }
  }, []);

  useEffect(() => {
    applyAppearanceSettings(appearance);
  }, [appearance]);

  return (
    <RuntimeContext.Provider value={context}>
      <RouterProvider router={router} />
      {showExitHint && !showExitConfirm && <div className="exit-hint">Press Back again to close Kino.pub</div>}
      {showExitConfirm && (
        <ExitConfirmDialog
          ref={exitDialogRef}
          onCancel={() => {
            lastHomeBackAtRef.current = 0;
            setShowExitConfirm(false);
          }}
          onExit={() => exitApp()}
        />
      )}
    </RuntimeContext.Provider>
  );
}

function ExitConfirmDialog({
  ref,
  onCancel,
  onExit
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  onCancel: () => void;
  onExit: () => void;
}) {
  return (
    <div className="exit-confirm-backdrop" role="presentation">
      <div className="exit-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title" data-focus-scope="active" ref={ref}>
        <div className="kicker">Exit app</div>
        <h2 id="exit-confirm-title">Close Kino.pub?</h2>
        <p>Playback will stop and the app will close.</p>
        <div className="exit-confirm-actions">
          <button className="primary-action" type="button" data-focusable data-autofocus onClick={onCancel}>
            Stay
          </button>
          <button className="secondary-action" type="button" data-focusable onClick={onExit}>
            Close app
          </button>
        </div>
      </div>
    </div>
  );
}

function exitApp() {
  if (window.webOS?.platformBack) {
    window.webOS.platformBack();
    return;
  }

  window.close();
}

function HomeRoute() {
  const { api, config } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedHeroItemId, setSelectedHeroItemId] = useState<string | number>();
  const heroSelectionTimerRef = useRef<number | undefined>(undefined);
  const query = useQuery({
    queryKey: kinoQueryKeys.home(),
    queryFn: () => loadHomeSections(api, config, queryClient),
    staleTime: QUERY_STALE_TIME.home
  });
  const featuredItemId = selectedHeroItemId ?? query.data?.find((section) => section.items.length)?.items[0]?.id;
  const featuredQuery = useQuery({
    queryKey: featuredItemId ? kinoQueryKeys.item(featuredItemId) : ["kino", "featured-item", "missing"],
    queryFn: () => api.item(featuredItemId ?? ""),
    enabled: featuredItemId !== undefined,
    staleTime: QUERY_STALE_TIME.item
  });
  useAuthRedirect(query.error || featuredQuery.error);

  useEffect(() => () => window.clearTimeout(heroSelectionTimerRef.current), []);

  if (!api.authenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (query.isPending) {
    return <LoadingScreen text="Loading Kino.pub" />;
  }

  if (query.error) {
    return <ErrorScreen message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  return (
    <HomeScreen
      sections={query.data}
      searchTitle={undefined}
      searchItems={undefined}
      heroItem={featuredQuery.data}
      selectedHeroItemId={selectedHeroItemId}
      onOpen={(id) => {
        if (id !== undefined) {
          navigate(`/detail/${id}`);
        }
      }}
      onContinue={(item) => void playResumeItem(item, api, config, queryClient, navigate)}
      onFocusItem={(item, context) => {
        if (item.id === undefined || String(item.id) === String(selectedHeroItemId)) {
          return;
        }

        window.clearTimeout(heroSelectionTimerRef.current);
        heroSelectionTimerRef.current = window.setTimeout(() => setSelectedHeroItemId(item.id), HERO_SELECTION_DELAY_MS);
        prefetchFocusedHomeItems(item, context);
      }}
      onOpenSearch={() => navigate("/search")}
      onOpenBrowse={() => navigate("/browse")}
      onOpenHistory={() => navigate("/history")}
      onOpenSettings={() => navigate("/settings")}
      onLiveSearch={(value) => {
        const trimmed = value.trim();
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
      }}
      onSearch={(value) => {
        const trimmed = value.trim();
        saveSearchQuery(trimmed);
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/home");
      }}
      onLogout={() => logout(api, queryClient, navigate)}
    />
  );
}

function SearchRoute() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const search = params.get("q")?.trim() ?? "";
  const query = useInfiniteQuery({
    queryKey: kinoQueryKeys.search(search),
    queryFn: ({ pageParam }) => api.search(search, pageParam, SEARCH_PAGE_SIZE),
    enabled: search.length >= 2,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.length >= SEARCH_PAGE_SIZE ? pages.length : undefined),
    staleTime: QUERY_STALE_TIME.search
  });

  useAuthRedirect(query.error);
  const items = query.data?.pages.flat() ?? [];

  return (
    <SearchScreen
      query={search}
      items={items}
      loading={query.isFetching && !query.isFetchingNextPage}
      loadingMore={query.isFetchingNextPage}
      hasMore={Boolean(query.hasNextPage)}
      waitingForMoreInput={Boolean(search) && search.length < 2}
      error={query.error ? errorMessage(query.error) : undefined}
      onOpen={(id) => {
        if (id !== undefined) {
          navigate(`/detail/${id}`);
        }
      }}
      onOpenBrowse={() => navigate("/browse")}
      onOpenHistory={() => navigate("/history")}
      onOpenSettings={() => navigate("/settings")}
      onLoadMore={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
      onSearch={(value) => {
        const trimmed = value.trim();
        saveSearchQuery(trimmed);
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/home");
      }}
      onLiveSearch={(value) => {
        const trimmed = value.trim();
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search", { replace: true });
      }}
      onLogout={() => logout(api, queryClient, navigate)}
      onRetry={() => void query.refetch()}
    />
  );
}

function BrowseRoute() {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const filters = readCatalogFilters(params);
  const query = useInfiniteQuery({
    queryKey: kinoQueryKeys.catalogSearch("", filters),
    queryFn: ({ pageParam }) => api.catalogItems(filters, pageParam, BROWSE_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.length >= BROWSE_PAGE_SIZE ? pages.length : undefined),
    staleTime: QUERY_STALE_TIME.search
  });
  const typesQuery = useQuery({
    queryKey: kinoQueryKeys.catalogTypes(),
    queryFn: () => api.contentTypes(),
    staleTime: QUERY_STALE_TIME.catalogFilters
  });
  const genresQuery = useQuery({
    queryKey: kinoQueryKeys.catalogGenres(filters.type),
    queryFn: () => api.genres(filters.type),
    staleTime: QUERY_STALE_TIME.catalogFilters
  });

  useAuthRedirect(query.error || typesQuery.error || genresQuery.error);
  const items = query.data?.pages.flat() ?? [];

  return (
    <BrowseScreen
      items={items}
      loading={query.isFetching && !query.isFetchingNextPage}
      loadingMore={query.isFetchingNextPage}
      hasMore={Boolean(query.hasNextPage)}
      error={
        query.error
          ? errorMessage(query.error)
          : typesQuery.error
            ? errorMessage(typesQuery.error)
            : genresQuery.error
              ? errorMessage(genresQuery.error)
              : undefined
      }
      filters={filters}
      types={typesQuery.data ?? []}
      genres={genresQuery.data ?? []}
      onOpen={(id) => {
        if (id !== undefined) {
          navigate(`/detail/${id}`);
        }
      }}
      onOpenSearch={() => navigate("/search")}
      onOpenHistory={() => navigate("/history")}
      onOpenSettings={() => navigate("/settings")}
      onChangeFilter={(key, value) => {
        const next = { ...filters };
        if (next[key] === value) {
          delete next[key];
        } else {
          next[key] = value;
          if (key === "type") {
            delete next.genre;
          }
        }
        navigate(browsePath(next));
      }}
      onLoadMore={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      }}
      onSearch={(value) => {
        const trimmed = value.trim();
        saveSearchQuery(trimmed);
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/home");
      }}
      onLogout={() => logout(api, queryClient, navigate)}
      onRetry={() => void query.refetch()}
    />
  );
}

function HistoryRoute() {
  const { api, config } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: kinoQueryKeys.history(),
    queryFn: () => api.history(),
    staleTime: QUERY_STALE_TIME.history
  });

  useAuthRedirect(query.error);

  return (
    <HistoryScreen
      entries={query.data ?? []}
      loading={query.isPending}
      error={query.error ? errorMessage(query.error) : undefined}
      onResume={(entry) => void playHistoryEntry(entry, api, config, queryClient, navigate)}
      onOpen={(id) => {
        if (id !== undefined) {
          navigate(`/detail/${id}`);
        }
      }}
      onSearch={(value) => {
        const trimmed = value.trim();
        saveSearchQuery(trimmed);
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/home");
      }}
      onOpenSearch={() => navigate("/search")}
      onOpenBrowse={() => navigate("/browse")}
      onOpenSettings={() => navigate("/settings")}
      onLogout={() => logout(api, queryClient, navigate)}
      onRetry={() => void query.refetch()}
    />
  );
}

function SettingsRoute() {
  const { api, config, appearance, setAppearance } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [savingKey, setSavingKey] = useState<string>();
  const query = useQuery({
    queryKey: kinoQueryKeys.deviceSettings(),
    queryFn: () => api.deviceSettings(config),
    staleTime: QUERY_STALE_TIME.deviceSettings
  });
  const deviceInfoQuery = useQuery({
    queryKey: kinoQueryKeys.deviceInfo(),
    queryFn: () => api.currentDeviceInfo(),
    staleTime: QUERY_STALE_TIME.deviceSettings
  });
  const settingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number | boolean }) => api.updateDeviceSettings(config, { [key]: value }),
    async onMutate({ key, value }) {
      setSavingKey(key);
      await queryClient.cancelQueries({ queryKey: kinoQueryKeys.deviceSettings() });
      const previous = queryClient.getQueryData<DeviceSettings>(kinoQueryKeys.deviceSettings());
      queryClient.setQueryData<DeviceSettings>(kinoQueryKeys.deviceSettings(), (current) => optimisticDeviceSettings(current, key, value));
      return { previous };
    },
    onError(_error, _variables, context) {
      if (context?.previous) {
        queryClient.setQueryData(kinoQueryKeys.deviceSettings(), context.previous);
      }
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.deviceSettings() });
      void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.deviceInfo() });
    },
    onSettled() {
      setSavingKey(undefined);
    }
  });
  const deviceInfoMutation = useMutation({
    mutationFn: (value: DeviceInfoInput) => api.updateDeviceInfo(value),
    onMutate() {
      setSavingKey("__deviceInfo");
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.deviceSettings() });
      void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.deviceInfo() });
    },
    onSettled() {
      setSavingKey(undefined);
    }
  });

  useAuthRedirect(query.error || deviceInfoQuery.error || settingMutation.error || deviceInfoMutation.error);

  return (
    <DeviceSettingsScreen
      config={config}
      device={deviceInfoQuery.data}
      settings={query.data}
      appearance={appearance}
      loading={query.isPending}
      error={
        query.error
          ? errorMessage(query.error)
          : deviceInfoQuery.error
            ? errorMessage(deviceInfoQuery.error)
            : settingMutation.error
              ? errorMessage(settingMutation.error)
              : deviceInfoMutation.error
                ? errorMessage(deviceInfoMutation.error)
                : undefined
      }
      savingKey={savingKey}
      onChangeAppearance={setAppearance}
      onChangeSetting={(key, value) => settingMutation.mutate({ key, value })}
      onSaveDeviceInfo={(value) => deviceInfoMutation.mutate(value)}
      onSearch={(value) => {
        const trimmed = value.trim();
        navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/home");
      }}
      onOpenSearch={() => navigate("/search")}
      onOpenBrowse={() => navigate("/browse")}
      onOpenHistory={() => navigate("/history")}
      onLogout={() => logout(api, queryClient, navigate)}
      onRetry={() => void query.refetch()}
    />
  );
}

function DetailRoute() {
  const { api, config } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { id } = useParams();
  const query = useQuery({
    queryKey: id ? kinoQueryKeys.item(id) : ["kino", "missing-item"],
    queryFn: () => api.item(id ?? ""),
    enabled: Boolean(id),
    staleTime: QUERY_STALE_TIME.item
  });

  useAuthRedirect(query.error);

  if (!id) {
    return <Navigate to="/home" replace />;
  }

  if (query.isPending) {
    return <LoadingScreen text="Loading title" />;
  }

  if (query.error) {
    return <ErrorScreen message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  return (
    <DetailScreen
      item={query.data}
      onHome={() => navigate("/home")}
      onPlay={(media) => void playItemMedia(query.data, media, api, config, queryClient, navigate)}
    />
  );
}

function PlayerRoute() {
  const { api, config } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as PlayerRouteState | null;
  const watchedMarkPromisesRef = useRef(new Map<string, Promise<void>>());
  const mutation = useMutation({
    mutationFn: ({ session, progress }: { session: PlaybackSession; progress: PlaybackProgress }) =>
      api.markWatching({
        itemId: session.itemId,
        seasonNumber: session.seasonNumber,
        videoNumber: session.videoNumber,
        progress
      }),
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.home() });
      void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.history() });
    }
  });

  if (!state?.session) {
    return <Navigate to="/home" replace />;
  }

  const playerState = state;

  function savePlaybackProgress(progress: PlaybackProgress) {
    const session = playerState.session;

    if (session.progressKey && progress.currentTime > 0) {
      localStorage.setItem(session.progressKey, String(Math.floor(progress.currentTime)));
    }

    if (progress.completed) {
      void markSessionWatched(session);
    }

    if (progress.currentTime < 10 && !progress.completed) {
      return;
    }

    mutation.mutate({ session, progress });
  }

  return (
    <PlayerScreen
      session={state.session}
      episodes={playerEpisodeCardsOf(playerState.item, playerState.session)}
      previousEpisode={playerAdjacentEpisodeCardOf(playerState.item, playerState.session, -1)}
      nextEpisode={playerAdjacentEpisodeCardOf(playerState.item, playerState.session, 1)}
      onClose={() => navigate(-1)}
      onProgress={savePlaybackProgress}
      onEnded={handlePlaybackEnded}
      onSelectEpisode={(media, options) =>
        void playItemMedia(
          playerState.item,
          media,
          api,
          config,
          queryClient,
          navigate,
          options?.restart ? { replace: true, resumeTime: 0 } : { replace: true }
        )
      }
    />
  );

  function handlePlaybackEnded() {
    void markSessionWatched(playerState.session);
    void playNextAfterPlayer(playerState, api, config, queryClient, navigate);
  }

  function markSessionWatched(session: PlaybackSession) {
    if (session.watched === true || session.itemId === undefined) {
      return Promise.resolve();
    }

    const key = watchedKeyOf(session);
    const existing = watchedMarkPromisesRef.current.get(key);
    if (existing) {
      return existing;
    }

    const promise = api
      .markWatched({
        itemId: session.itemId,
        seasonNumber: session.seasonNumber,
        videoNumber: session.videoNumber
      })
      .then((watched) => {
        if (watched === 1) {
          session.watched = true;
        }

        void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.home() });
        void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.history() });
        if (session.itemId !== undefined) {
          void queryClient.invalidateQueries({ queryKey: kinoQueryKeys.item(session.itemId) });
        }
      })
      .catch((error) => {
        console.warn("Unable to mark Kino.pub item as watched", error);
      })
      .finally(() => {
        watchedMarkPromisesRef.current.delete(key);
      });

    watchedMarkPromisesRef.current.set(key, promise);
    return promise;
  }
}

function watchedKeyOf(session: PlaybackSession) {
  return [session.itemId ?? "", session.seasonNumber ?? "", session.videoNumber ?? 1].join(":");
}

function playerEpisodeCardsOf(item: KinoItem, session: PlaybackSession): PlayerEpisodeCard[] {
  const media = flatMediaOf(item);
  if (media.length <= 1) {
    return [];
  }

  const currentIndex = media.findIndex((candidate) => mediaMatchesSession(candidate, session));
  const current = currentIndex >= 0 ? currentIndex : 0;
  const start = Math.max(0, Math.min(current - 2, media.length - 6));

  return media.slice(start, start + 6).map((candidate, index) => {
    return playerEpisodeCardOf(item, candidate, start + index, start + index === currentIndex);
  });
}

function playerAdjacentEpisodeCardOf(item: KinoItem, session: PlaybackSession, direction: -1 | 1) {
  const candidate = direction < 0 ? previousMediaBeforeSession(item, session) : nextMediaAfterSession(item, session);

  if (!candidate) {
    return undefined;
  }

  return playerEpisodeCardOf(item, candidate, 0, false);
}

function playerEpisodeCardOf(item: KinoItem, candidate: KinoMedia, index: number, active: boolean): PlayerEpisodeCard {
  const progress = mediaProgressOf(item, candidate);
  const subtitle = mediaSubtitle(candidate);

  return {
    id: mediaDomId(candidate) || `${index}`,
    media: candidate,
    title: mediaTitle(candidate),
    meta: active ? "Now playing" : subtitle || episodeNumber(candidate),
    progressLabel: progress.label,
    progressPercent: progress.percent,
    active,
    watched: progress.completed
  };
}

function AuthRoute() {
  const { api, authRunRef } = useRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const message = (location.state as { message?: string } | null)?.message;

  if (api.authenticated && !busy) {
    return <Navigate to="/home" replace />;
  }

  async function startAuth() {
    const runId = ++authRunRef.current;
    setBusy(true);

    while (runId === authRunRef.current) {
      try {
        const device = await api.requestDeviceCode();
        const code = device.device_code || device.code;

        if (!code || !device.user_code) {
          throw new Error("Kino.pub did not return a device login code.");
        }

        navigate("/pair", {
          replace: true,
          state: {
            userCode: device.user_code,
            verificationUri: device.verification_uri || device.verification_url || "kino.pub/device"
          }
        });

        const result = await pollAuth(api, code, Math.max(3, device.interval ?? 5), Date.now() + (device.expires_in ?? 300) * 1000, runId, authRunRef);
        if (result === "authorized") {
          navigate("/home", { replace: true });
          return;
        }

        if (result === "cancelled") {
          setBusy(false);
          return;
        }
      } catch (error) {
        if (runId === authRunRef.current) {
          navigate("/auth", { replace: true, state: { message: errorMessage(error) } });
          setBusy(false);
        }
        return;
      }
    }
  }

  return busy ? <LoadingScreen text="Requesting device code" /> : <AuthScreen message={message} onConnect={() => void startAuth()} />;
}

function PairRoute() {
  const { authRunRef } = useRuntime();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { userCode?: string; verificationUri?: string } | null;

  if (!state?.userCode) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <PairScreen
      userCode={state.userCode}
      verificationUri={state.verificationUri || "kino.pub/device"}
      onCancel={() => {
        authRunRef.current += 1;
        navigate("/auth", { replace: true });
      }}
    />
  );
}

async function playResumeItem(
  item: KinoItem,
  api: KinoApi,
  config: KinoRuntimeConfig,
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>
) {
  const detail = mediaRowsOf(item).some((row) => row.items.length) || item.id === undefined ? item : await fetchItem(item.id, api, queryClient);
  const media = resumeMediaOf(detail);

  if (!media) {
    navigate(`/detail/${detail.id ?? item.id}`);
    return;
  }

  await playItemMedia(detail, media, api, config, queryClient, navigate);
}

async function loadHomeSections(api: KinoApi, config: KinoRuntimeConfig, queryClient: ReturnType<typeof useQueryClient>) {
  await api.notifyDevice(config);
  const sections = await api.homeSections();
  return hydrateVisibleContinueSections(sections, api, queryClient);
}

async function hydrateVisibleContinueSections(
  sections: Section[],
  api: KinoApi,
  queryClient: ReturnType<typeof useQueryClient>
) {
  const continueIndex = sections.findIndex((section) => section.mode === "continue");
  const continueSection = sections[continueIndex];

  if (!continueSection) {
    return sections;
  }

  const visibleItems = visibleContinueItemsOf(sections);
  preloadImages(visibleItems.map(railPosterOf), CONTINUE_PREFETCH_LIMIT);

  const results = await Promise.allSettled(
    visibleItems.map((item) =>
      item.id === undefined
        ? Promise.resolve(item)
        : queryClient.fetchQuery({
            queryKey: kinoQueryKeys.item(item.id),
            queryFn: () => api.item(item.id ?? ""),
            staleTime: QUERY_STALE_TIME.item
          })
    )
  );
  const authError = results.find((result) => result.status === "rejected" && result.reason instanceof AuthRequiredError);

  if (authError?.status === "rejected") {
    throw authError.reason;
  }

  const detailsById = new Map<string, KinoItem>();

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.id !== undefined) {
      detailsById.set(String(result.value.id), result.value);
    }
  }

  const items = continueSection.items.map((item, index) => {
    if (index >= CONTINUE_PREFETCH_LIMIT || item.id === undefined) {
      return item;
    }

    const detail = detailsById.get(String(item.id));
    return detail ? { ...item, ...detail } : item;
  });
  preloadImages(items.slice(0, CONTINUE_PREFETCH_LIMIT).map(railPosterOf), CONTINUE_PREFETCH_LIMIT);

  return sections.map((section, index) => (index === continueIndex ? { ...section, items } : section));
}

function prefetchFocusedHomeItems(item: KinoItem, context: ShelfFocusContext) {
  const candidates = [item, ...context.items.slice(context.index + 1, context.index + 3)];
  preloadImages(candidates.map(railPosterOf), 4);
}

function visibleContinueItemsOf(sections: Section[] | undefined) {
  return (
    sections
      ?.find((section) => section.mode === "continue")
      ?.items.filter((item) => item.id !== undefined)
      .slice(0, CONTINUE_PREFETCH_LIMIT) ?? []
  );
}

async function playItemMedia(
  item: KinoItem,
  media: KinoMedia,
  api: KinoApi,
  config: KinoRuntimeConfig,
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>,
  options: { replace?: boolean; resumeTime?: number } = {}
) {
  const hydrated = await queryClient.fetchQuery({
    queryKey: kinoQueryKeys.playableMedia(media, config.preferredStream),
    queryFn: () => hydratePlayableMedia(api, config, media),
    staleTime: QUERY_STALE_TIME.playableMedia,
    gcTime: 5 * 60_000
  });
  const session = playbackSessionOf(item, hydrated, config);
  if (options.resumeTime !== undefined) {
    session.resumeTime = options.resumeTime;
  }

  navigate("/player", { replace: options.replace ?? false, state: { item, session } satisfies PlayerRouteState });
}

async function playHistoryEntry(
  entry: KinoHistoryEntry,
  api: KinoApi,
  config: KinoRuntimeConfig,
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>
) {
  const item = entry.item;
  if (!item) {
    return;
  }

  const detail = item.id === undefined ? item : await fetchItem(item.id, api, queryClient);
  const media = mediaFromHistoryEntry(entry);
  const detailMedia = media ? matchingMedia(detail, media) : undefined;
  const playable = detailMedia ?? resumeMediaOf(detail) ?? flatMediaOf(detail)[0] ?? media;

  if (!playable) {
    navigate(`/detail/${detail.id ?? item.id}`);
    return;
  }

  await playItemMedia(detail, playable, api, config, queryClient, navigate);
}

async function playNextAfterPlayer(
  state: PlayerRouteState,
  api: KinoApi,
  config: KinoRuntimeConfig,
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>
) {
  const next = nextMediaAfterSession(state.item, state.session);
  if (!next) {
    return;
  }

  await playItemMedia(state.item, next, api, config, queryClient, navigate, { replace: true });
}

function matchingMedia(item: KinoItem, media: KinoMedia) {
  const mediaId = mediaDomId(media);
  return flatMediaOf(item).find((candidate) => mediaDomId(candidate) === mediaId);
}

async function fetchItem(id: string | number, api: KinoApi, queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.fetchQuery({
    queryKey: kinoQueryKeys.item(id),
    queryFn: () => api.item(id),
    staleTime: QUERY_STALE_TIME.item
  });
}

function useRuntime() {
  const value = useContext(RuntimeContext);

  if (!value) {
    throw new Error("Missing Kino runtime context.");
  }

  return value;
}

function useAuthRedirect(error: unknown) {
  const { api } = useRuntime();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!error || !isAuthError(error)) {
      return;
    }

    api.logout();
    queryClient.clear();
    navigate("/auth", { replace: true, state: { message: "Kino.pub session expired. Connect the TV again." } });
  }, [api, error, navigate, queryClient]);
}

function logout(api: KinoApi, queryClient: ReturnType<typeof useQueryClient>, navigate: ReturnType<typeof useNavigate>) {
  api.logout();
  queryClient.clear();
  navigate("/auth", { replace: true });
}

async function pollAuth(
  api: KinoApi,
  deviceCode: string,
  intervalSeconds: number,
  expiresAt: number,
  runId: number,
  authRunRef: MutableRefObject<number>
) {
  while (runId === authRunRef.current && Date.now() < expiresAt) {
    await sleep(intervalSeconds * 1000);

    const result = await api.pollDeviceCode(deviceCode);
    if (result === "expired") {
      return "expired" as const;
    }

    if (result !== "pending") {
      return "authorized" as const;
    }
  }

  return runId === authRunRef.current ? ("expired" as const) : ("cancelled" as const);
}

function readConfig(): KinoRuntimeConfig {
  const config: Partial<KinoRuntimeConfig> = window.KINO_TV_CONFIG ?? {};
  const runtime: KinoRuntimeConfig = {
    clientId: config.clientId || DEFAULT_CLIENT_ID,
    clientSecret: config.clientSecret || DEFAULT_CLIENT_SECRET,
    apiBase: config.apiBase || DEFAULT_API_BASE,
    deviceTitle: config.deviceTitle || "LG webOS TV",
    deviceHardware: config.deviceHardware || "webOS",
    deviceSoftware: config.deviceSoftware || "Kino.pub TV",
    preferredStream: config.preferredStream || "hls4"
  };

  if (config.deviceId !== undefined) {
    runtime.deviceId = config.deviceId;
  }

  return runtime;
}

function optimisticDeviceSettings(
  current: DeviceSettings | undefined,
  key: string,
  value: string | number | boolean
): DeviceSettings | undefined {
  if (!current?.[key]) {
    return current;
  }

  const setting = current[key];
  const next: DeviceSettings = { ...current };

  if (setting.type === "list" && Array.isArray(setting.value)) {
    next[key] = {
      ...setting,
      value: setting.value.map((option) => ({
        ...option,
        selected: String(option.id) === String(value) ? 1 : 0
      }))
    };
    return next;
  }

  next[key] = { ...setting, value };
  return next;
}

export function createRuntimeConfig() {
  return readConfig();
}

function readCatalogFilters(params: URLSearchParams): CatalogFilters {
  const filters: CatalogFilters = {};
  const type = params.get("type")?.trim();
  const genre = params.get("genre")?.trim();

  if (type) {
    filters.type = type;
  }

  if (genre) {
    filters.genre = genre;
  }

  return filters;
}

function browsePath(filters: CatalogFilters) {
  const params = new URLSearchParams();

  if (filters.type) {
    params.set("type", filters.type);
  }

  if (filters.genre) {
    params.set("genre", filters.genre);
  }

  const value = params.toString();
  return value ? `/browse?${value}` : "/browse";
}

function isAuthError(error: unknown) {
  const message = errorMessage(error).toLowerCase();

  return (
    error instanceof AuthRequiredError ||
    message.includes("invalid_refresh_token") ||
    message.includes("unauthorized") ||
    message.includes("session expired")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
