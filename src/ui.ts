import type { CSSProperties } from "react";

export function cssVars(value: Record<string, string>) {
  return value as CSSProperties;
}

export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
