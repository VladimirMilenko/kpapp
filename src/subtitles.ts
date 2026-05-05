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

    const text = lines
      .slice(timingLineIndex + 1)
      .join("\n")
      .replace(/<\/?[^>]+>/g, "")
      .trim();

    if (text) {
      cues.push({ start, end, text });
    }
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function activeCue(cues: SubtitleCue[], time: number) {
  let low = 0;
  let high = cues.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];

    if (!cue) {
      break;
    }

    if (time < cue.start) {
      high = middle - 1;
    } else if (time > cue.end) {
      low = middle + 1;
    } else {
      return cue.text;
    }
  }

  return "";
}

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
