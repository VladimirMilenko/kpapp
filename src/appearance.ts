export type AppTheme = "cinema" | "midnight";
export type AppDensity = "auto" | "comfortable" | "compact";

export interface AppearanceSettings {
  theme: AppTheme;
  density: AppDensity;
}

export interface AppearanceOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

export const THEME_OPTIONS: Array<AppearanceOption<AppTheme>> = [
  { id: "cinema", label: "Cinema", description: "Dark red" },
  { id: "midnight", label: "Midnight", description: "Cool dark" }
];

export const DENSITY_OPTIONS: Array<AppearanceOption<AppDensity>> = [
  { id: "auto", label: "Auto", description: "Adapts to screen" },
  { id: "comfortable", label: "Comfortable", description: "Touch-first" },
  { id: "compact", label: "Compact", description: "More on screen" }
];

const APPEARANCE_STORAGE_KEY = "kino.tv.appearance";
const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "cinema",
  density: "auto"
};

export function readAppearanceSettings(): AppearanceSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null") as Partial<AppearanceSettings> | null;
    return normalizeAppearance(parsed);
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearanceSettings(value: AppearanceSettings) {
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Appearance is a client preference; storage can fail in private browsing.
  }
}

export function applyAppearanceSettings(value: AppearanceSettings) {
  const root = document.documentElement;

  root.dataset.theme = value.theme;
  root.dataset.density = value.density;
  root.style.colorScheme = "dark";
}

function normalizeAppearance(value: Partial<AppearanceSettings> | null | undefined): AppearanceSettings {
  return {
    theme: isTheme(value?.theme) ? value.theme : DEFAULT_APPEARANCE.theme,
    density: isDensity(value?.density) ? value.density : DEFAULT_APPEARANCE.density
  };
}

function isTheme(value: unknown): value is AppTheme {
  return value === "cinema" || value === "midnight";
}

function isDensity(value: unknown): value is AppDensity {
  return value === "auto" || value === "comfortable" || value === "compact";
}
