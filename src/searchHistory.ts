const KEY = "kino.pub.tv.search.history.v1";
const LIMIT = 8;

export function readSearchHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, LIMIT) : [];
  } catch {
    localStorage.removeItem(KEY);
    return [];
  }
}

export function saveSearchQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return;
  }

  const normalized = trimmed.toLowerCase();
  const history = [trimmed, ...readSearchHistory().filter((item) => item.toLowerCase() !== normalized)].slice(0, LIMIT);
  localStorage.setItem(KEY, JSON.stringify(history));
}
