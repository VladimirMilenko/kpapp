export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export async function loadSubtitle(url: string, shift = 0): Promise<SubtitleCue[]> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Subtitle request failed with ${response.status}.`);
  }

  const text = await response.text();
  return parseSubtitles(text).map((cue) => ({
    ...cue,
    start: cue.start + shift,
    end: cue.end + shift
  }));
}

export function parseSubtitles(input: string): SubtitleCue[] {
  const blocks = input
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => !line.startsWith("NOTE") && !line.startsWith("STYLE"));
    const timingLineIndex = lines.findIndex((line) => line.includes("-->"));

    if (timingLineIndex < 0) {
      continue;
    }

    const timing = lines[timingLineIndex];
    if (!timing) {
      continue;
    }

    const [startRaw, endRaw] = timing.split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseTime(startRaw);
    const end = parseTime(endRaw);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }

    const text = cleanCueText(lines.slice(timingLineIndex + 1).join("\n"));

    if (text) {
      cues.push({ start, end, text });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function activeCue(cues: SubtitleCue[], time: number) {
  // Cues can overlap (signs, songs, multi-speaker lines), so collect every active one.
  // Some files repeat the same line in separate cues; show it only once.
  const lines: string[] = [];

  for (const cue of cues) {
    if (cue.start > time) {
      break;
    }

    if (time < cue.end && !lines.includes(cue.text)) {
      lines.push(cue.text);
    }
  }

  return lines.join("\n");
}

export function cleanCueText(value: string) {
  return value
    .replace(/\{[\\/][^}]*\}/g, "")
    .replace(/\\[Nn]/g, "\n")
    .replace(/\\h/g, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos|nbsp|lrm|rlm|#\d+|#x[\da-f]+);/gi, decodeEntity)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function decodeEntity(entity: string, name: string) {
  const lower = name.toLowerCase();

  if (lower.startsWith("#x")) {
    return String.fromCodePoint(parseInt(lower.slice(2), 16));
  }

  if (lower.startsWith("#")) {
    return String.fromCodePoint(Number(lower.slice(1)));
  }

  return ENTITIES[lower] ?? entity;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lrm: "",
  rlm: ""
};

function parseTime(value: string | undefined) {
  if (!value) {
    return Number.NaN;
  }

  const normalized = value.replace(",", ".");
  const pieces = normalized.split(":").map(Number);

  if (pieces.some((piece) => !Number.isFinite(piece))) {
    return Number.NaN;
  }

  if (pieces.length === 3) {
    const [hours = 0, minutes = 0, seconds = 0] = pieces;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (pieces.length === 2) {
    const [minutes = 0, seconds = 0] = pieces;
    return minutes * 60 + seconds;
  }

  return Number.NaN;
}
