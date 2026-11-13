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

  if (activeTag === "INPUT" && !inputAllowsNavigation(event, document.activeElement as HTMLInputElement)) {
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
  if (keyCode === 461 || event.key === "BrowserBack") {
    return true;
  }

  // Keyboard back for the browser build. Backspace never counts inside a text field (the webOS on-screen
  // keyboard's delete key sends it); Escape there only once the field is empty.
  const active = document.activeElement;
  const inTextField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  if (event.key === "Backspace") {
    return !inTextField && !event.repeat;
  }

  if (event.key === "Escape") {
    return !inTextField || active.value === "";
  }

  return false;
}

// Single-line inputs have no use for Up/Down, so those always move focus; Left/Right move the caret
// and only leave the field from its start/end. Without this a remote can get stuck in a text field.
function inputAllowsNavigation(event: KeyboardEvent, input: HTMLInputElement) {
  if (event.key === "Enter" || event.key === "ArrowUp" || event.key === "ArrowDown") {
    return true;
  }

  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null || start !== end) {
    return false;
  }

  if (event.key === "ArrowLeft") {
    return start === 0;
  }

  if (event.key === "ArrowRight") {
    return end === input.value.length;
  }

  return false;
}
