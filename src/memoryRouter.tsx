import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface MemoryLocation {
  pathname: string;
  search: string;
  state: unknown;
}

interface HistoryState {
  entries: MemoryLocation[];
  index: number;
}

interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}

type NavigateFunction = {
  (delta: number): void;
  (to: string, options?: NavigateOptions): void;
};

interface RouterContextValue {
  location: MemoryLocation;
  navigate: NavigateFunction;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function MemoryRouterProvider({ initialEntry, children }: { initialEntry: string; children: ReactNode }) {
  const [history, setHistory] = useState<HistoryState>(() => ({
    entries: [locationFromPath(initialEntry)],
    index: 0
  }));

  useEffect(() => {
    setHistory({
      entries: [locationFromPath(initialEntry)],
      index: 0
    });
  }, [initialEntry]);

  const navigate = useCallback<NavigateFunction>((to: string | number, options?: NavigateOptions) => {
    setHistory((current) => {
      if (typeof to === "number") {
        const nextIndex = Math.max(0, Math.min(current.entries.length - 1, current.index + to));

        return nextIndex === current.index ? current : { ...current, index: nextIndex };
      }

      const nextLocation = locationFromPath(to, options?.state);

      if (options?.replace) {
        const entries = current.entries.slice();
        entries[current.index] = nextLocation;
        return { entries, index: current.index };
      }

      const entries = current.entries.slice(0, current.index + 1);
      entries.push(nextLocation);
      return { entries, index: entries.length - 1 };
    });
  }, []);

  const location = history.entries[history.index] ?? locationFromPath(initialEntry);
  const value = useMemo(() => ({ location, navigate }), [location, navigate]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function Navigate({ to, replace = false, state }: { to: string; replace?: boolean; state?: unknown }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace, state });
  }, [navigate, replace, state, to]);

  return null;
}

export function useLocation() {
  return useRouter().location;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useParams() {
  const { pathname } = useLocation();
  const detailMatch = /^\/detail\/([^/]+)$/.exec(pathname);

  if (detailMatch) {
    return { id: decodeURIComponent(detailMatch[1] ?? "") };
  }

  return {};
}

export function useSearchParams() {
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  return [params] as const;
}

function useRouter() {
  const value = useContext(RouterContext);

  if (!value) {
    throw new Error("Missing memory router context.");
  }

  return value;
}

function locationFromPath(path: string, state: unknown = null): MemoryLocation {
  const [pathnamePart = "/", searchPart = ""] = path.split("?", 2);
  const pathname = pathnamePart.startsWith("/") ? pathnamePart : `/${pathnamePart}`;

  return {
    pathname: pathname || "/",
    search: searchPart ? `?${searchPart}` : "",
    state
  };
}
