const KEY = "kino.pub.tv.subtitle.appearance.v1";

export type SubtitleBackgroundMode = "shadow" | "box" | "off";

export interface SubtitleAppearance {
  sizeStep: number;
  positionStep: number;
  background: SubtitleBackgroundMode;
}

export type SubtitleAppearanceAction =
  | "size:down"
  | "size:up"
  | "position:down"
  | "position:up"
  | "background:cycle"
  | "reset";

export interface SubtitleAppearanceOption {
  id: SubtitleAppearanceAction;
  label: string;
  enabled: boolean;
  meta?: string;
}

const DEFAULT_APPEARANCE: SubtitleAppearance = {
  sizeStep: 0,
  positionStep: 0,
  background: "shadow"
};

const MIN_SIZE_STEP = -2;
const MAX_SIZE_STEP = 3;
const MIN_POSITION_STEP = -2;
const MAX_POSITION_STEP = 4;

export function readSubtitleAppearance(): SubtitleAppearance {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<SubtitleAppearance>;
    return normalizeSubtitleAppearance(stored);
  } catch {
    localStorage.removeItem(KEY);
    return DEFAULT_APPEARANCE;
  }
}

export function saveSubtitleAppearance(value: SubtitleAppearance) {
  localStorage.setItem(KEY, JSON.stringify(normalizeSubtitleAppearance(value)));
}

export function changeSubtitleAppearance(current: SubtitleAppearance, action: SubtitleAppearanceAction) {
  const value = normalizeSubtitleAppearance(current);

  switch (action) {
    case "size:down":
      return normalizeSubtitleAppearance({ ...value, sizeStep: value.sizeStep - 1 });
    case "size:up":
      return normalizeSubtitleAppearance({ ...value, sizeStep: value.sizeStep + 1 });
    case "position:down":
      return normalizeSubtitleAppearance({ ...value, positionStep: value.positionStep - 1 });
    case "position:up":
      return normalizeSubtitleAppearance({ ...value, positionStep: value.positionStep + 1 });
    case "background:cycle":
      return normalizeSubtitleAppearance({ ...value, background: nextBackground(value.background) });
    case "reset":
      return DEFAULT_APPEARANCE;
  }
}

export function subtitleAppearanceOptions(value: SubtitleAppearance): SubtitleAppearanceOption[] {
  const normalized = normalizeSubtitleAppearance(value);

  return [
    {
      id: "size:down",
      label: "Text smaller",
      enabled: normalized.sizeStep > MIN_SIZE_STEP,
      meta: sizeLabel(normalized.sizeStep)
    },
    {
      id: "size:up",
      label: "Text larger",
      enabled: normalized.sizeStep < MAX_SIZE_STEP,
      meta: sizeLabel(normalized.sizeStep)
    },
    {
      id: "position:up",
      label: "Move higher",
      enabled: normalized.positionStep < MAX_POSITION_STEP,
      meta: positionLabel(normalized.positionStep)
    },
    {
      id: "position:down",
      label: "Move lower",
      enabled: normalized.positionStep > MIN_POSITION_STEP,
      meta: positionLabel(normalized.positionStep)
    },
    {
      id: "background:cycle",
      label: "Background mode",
      enabled: true,
      meta: backgroundLabel(normalized.background)
    },
    {
      id: "reset",
      label: "Reset subtitle style",
      enabled: true,
      meta: "Default size and position"
    }
  ];
}

export function subtitleAppearanceCssVars(value: SubtitleAppearance) {
  const normalized = normalizeSubtitleAppearance(value);
  const fontSize = 2.75 + normalized.sizeStep * 0.35;
  const bottom = 18 + normalized.positionStep * 5;

  return {
    "--subtitle-font-size": `${fontSize.toFixed(2)}rem`,
    "--subtitle-bottom": `${bottom}%`
  };
}

export function subtitleAppearanceSummary(value: SubtitleAppearance) {
  const normalized = normalizeSubtitleAppearance(value);
  return `${sizeLabel(normalized.sizeStep)}, ${positionLabel(normalized.positionStep)}`;
}

export function subtitleBackgroundClass(value: SubtitleAppearance) {
  return `subtitle-background-${normalizeSubtitleAppearance(value).background}`;
}

function normalizeSubtitleAppearance(value: Partial<SubtitleAppearance>): SubtitleAppearance {
  return {
    sizeStep: clampNumber(value.sizeStep, MIN_SIZE_STEP, MAX_SIZE_STEP),
    positionStep: clampNumber(value.positionStep, MIN_POSITION_STEP, MAX_POSITION_STEP),
    background: isBackgroundMode(value.background) ? value.background : DEFAULT_APPEARANCE.background
  };
}

function nextBackground(value: SubtitleBackgroundMode): SubtitleBackgroundMode {
  if (value === "shadow") {
    return "box";
  }

  if (value === "box") {
    return "off";
  }

  return "shadow";
}

function isBackgroundMode(value: unknown): value is SubtitleBackgroundMode {
  return value === "shadow" || value === "box" || value === "off";
}

function sizeLabel(value: number) {
  if (value <= -2) {
    return "Small";
  }

  if (value === -1) {
    return "Compact";
  }

  if (value === 0) {
    return "Default";
  }

  if (value === 1) {
    return "Large";
  }

  if (value === 2) {
    return "XL";
  }

  return "XXL";
}

function positionLabel(value: number) {
  if (value <= -2) {
    return "Very low";
  }

  if (value === -1) {
    return "Low";
  }

  if (value === 0) {
    return "Default";
  }

  if (value === 1) {
    return "Higher";
  }

  if (value === 2) {
    return "High";
  }

  return "Very high";
}

function backgroundLabel(value: SubtitleBackgroundMode) {
  switch (value) {
    case "shadow":
      return "Shadow";
    case "box":
      return "Box";
    case "off":
      return "Off";
  }
}

function clampNumber(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}
