import { useEffect } from "react";
import { focusFirst } from "../dom";
import { clickFocused, handleSpatialNavigation } from "../focus";

export function useGlobalNavigation(onBack?: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => handleGlobalKeyDown(event, onBack);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onBack]);
}

function handleGlobalKeyDown(event: KeyboardEvent, onBack: (() => void) | undefined) {
  const activeTag = document.activeElement?.tagName;

  if (isBackKey(event)) {
    event.preventDefault();
    onBack?.();
    return;
  }

  if (activeTag === "INPUT" && event.key !== "Enter" && event.key !== "Escape") {
    return;
  }

  const focusScope = document.querySelector<HTMLElement>("[data-focus-scope='active']");
  if (focusScope) {
    if (!focusScope.contains(document.activeElement)) {
      event.preventDefault();
      focusFirst(focusScope);
      return;
    }

    if (clickFocused(event)) {
      return;
    }

    handleSpatialNavigation(event, focusScope);
    return;
  }

  if (clickFocused(event)) {
    return;
  }

  handleSpatialNavigation(event, document);
}

function isBackKey(event: KeyboardEvent) {
  const keyCode = event.keyCode || event.which;
  return keyCode === 461 || event.key === "BrowserBack";
}
