type Child = Node | string | number | boolean | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number | boolean | undefined | null> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) {
      continue;
    }

    if (key === "class") {
      element.className = String(value);
    } else if (key === "text") {
      element.textContent = String(value);
    } else if (key === "html") {
      element.innerHTML = String(value);
    } else if (value === true) {
      element.setAttribute(key, "");
    } else {
      element.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }

    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return element;
}

export function clear(node: Element) {
  while (node.firstChild) {
    node.firstChild.remove();
  }
}

export function focusFirst(container: ParentNode = document) {
  const focusables = getFocusable(container);
  const first = focusables.find((node) => node.dataset.autofocus !== undefined) ?? focusables[0];
  first?.focus();
}

export function getFocusable(container: ParentNode = document): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-focusable]:not([disabled])")).filter(
    (node) => node.offsetParent !== null || node.dataset.focusHidden === "true"
  );
}

export function setBusy(container: HTMLElement, busy: boolean) {
  container.toggleAttribute("aria-busy", busy);
  container.classList.toggle("is-busy", busy);
}

export function formatRuntime(minutes: number | string | undefined) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  const hours = Math.floor(value / 60);
  const remainder = Math.round(value % 60);

  if (!hours) {
    return `${remainder}m`;
  }

  return `${hours}h ${remainder}m`;
}

export function formatClock(seconds: number | undefined) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
