type UnknownRecord = Record<string, unknown>;

if (typeof globalThis === "undefined") {
  const root = typeof self !== "undefined" ? self : window;
  (root as Window & { globalThis?: unknown }).globalThis = root;
}

if (typeof AbortController === "undefined") {
  type LegacyAbortEvent = { type: "abort" };
  type LegacyAbortListener = (event: LegacyAbortEvent) => void;

  class LegacyAbortSignal {
    aborted = false;
    onabort: LegacyAbortListener | null = null;
    private listeners: LegacyAbortListener[] = [];

    addEventListener(type: string, listener: LegacyAbortListener) {
      if (type === "abort" && typeof listener === "function") {
        this.listeners.push(listener);
      }
    }

    removeEventListener(type: string, listener: LegacyAbortListener) {
      if (type !== "abort") {
        return;
      }

      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    }

    dispatchEvent(event: LegacyAbortEvent) {
      if (event.type !== "abort") {
        return true;
      }

      this.onabort?.(event);
      this.listeners.slice().forEach((listener) => listener(event));
      return true;
    }
  }

  class LegacyAbortController {
    readonly signal = new LegacyAbortSignal();

    abort() {
      if (this.signal.aborted) {
        return;
      }

      this.signal.aborted = true;
      this.signal.dispatchEvent({ type: "abort" });
    }
  }

  const abortTarget = window as unknown as { AbortController?: typeof globalThis.AbortController; AbortSignal?: typeof globalThis.AbortSignal };
  abortTarget.AbortController = LegacyAbortController as unknown as typeof AbortController;
  abortTarget.AbortSignal = abortTarget.AbortSignal || (LegacyAbortSignal as unknown as typeof AbortSignal);
}

if (!Object.getOwnPropertyDescriptors) {
  Object.getOwnPropertyDescriptors = function getOwnPropertyDescriptors<T>(object: T) {
    const source = Object(object);
    const descriptors: Record<PropertyKey, PropertyDescriptor> = {};
    const keys: Array<string | symbol> = Object.getOwnPropertyNames(source);

    if (Object.getOwnPropertySymbols) {
      keys.push(...Object.getOwnPropertySymbols(source));
    }

    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (descriptor) {
        descriptors[key] = descriptor;
      }
    }

    return descriptors as { [P in keyof T]: TypedPropertyDescriptor<T[P]> } & { [x: string]: PropertyDescriptor };
  };
}

if (!Object.values) {
  Object.values = function values(object: object) {
    return Object.keys(Object(object) as UnknownRecord).map((key) => (object as UnknownRecord)[key]);
  };
}

if (!Object.entries) {
  Object.entries = function entries(object: object) {
    return Object.keys(Object(object) as UnknownRecord).map((key) => [key, (object as UnknownRecord)[key]] as [string, unknown]);
  };
}

if (!Array.prototype.includes) {
  Object.defineProperty(Array.prototype, "includes", {
    value(searchElement: unknown, fromIndex = 0) {
      const length = this.length >>> 0;
      let index = Math.max(fromIndex >= 0 ? fromIndex : length + fromIndex, 0);

      while (index < length) {
        const value = this[index];
        if (value === searchElement || (value !== value && searchElement !== searchElement)) {
          return true;
        }
        index += 1;
      }

      return false;
    }
  });
}

if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, "flat", {
    value(depth = 1) {
      return flattenArray(this, Number(depth) || 0);
    }
  });
}

if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, "flatMap", {
    value(callback: (value: unknown, index: number, array: unknown[]) => unknown, thisArg?: unknown) {
      return flattenArray(Array.prototype.map.call(this, callback, thisArg), 1);
    }
  });
}

if (!Promise.allSettled) {
  Promise.allSettled = function allSettled<T>(values: Iterable<T | PromiseLike<T>>) {
    return Promise.all(
      Array.from(values).map((value) =>
        Promise.resolve(value).then(
          (result) => ({ status: "fulfilled", value: result }) as PromiseFulfilledResult<Awaited<T>>,
          (reason) => ({ status: "rejected", reason }) as PromiseRejectedResult
        )
      )
    );
  };
}

if (!Promise.prototype.finally) {
  Object.defineProperty(Promise.prototype, "finally", {
    value<T>(this: Promise<T>, onFinally?: (() => unknown) | null) {
      const callback = typeof onFinally === "function" ? onFinally : () => {};

      return this.then(
        (value) => Promise.resolve(callback()).then(() => value),
        (reason) =>
          Promise.resolve(callback()).then(() => {
            throw reason;
          })
      );
    }
  });
}

if (!String.prototype.padStart) {
  Object.defineProperty(String.prototype, "padStart", {
    value(targetLength: number, padString = " ") {
      const value = String(this);
      let fill = String(padString || " ");
      const length = Math.floor(targetLength) - value.length;

      if (length <= 0) {
        return value;
      }

      while (fill.length < length) {
        fill += fill;
      }

      return fill.slice(0, length) + value;
    }
  });
}

if (!Element.prototype.remove) {
  Element.prototype.remove = function remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  };
}

if (!Element.prototype.append) {
  Element.prototype.append = function append(...nodes: Array<Node | string>) {
    appendNodes(this, nodes);
  };
}

if (typeof DocumentFragment !== "undefined" && !DocumentFragment.prototype.append) {
  DocumentFragment.prototype.append = function append(...nodes: Array<Node | string>) {
    appendNodes(this, nodes);
  };
}

function flattenArray(values: unknown[], depth: number): unknown[] {
  const flattened: unknown[] = [];

  for (const value of values) {
    if (Array.isArray(value) && depth > 0) {
      flattened.push(...flattenArray(value, depth - 1));
    } else {
      flattened.push(value);
    }
  }

  return flattened;
}

function appendNodes(parent: Node, nodes: Array<Node | string>) {
  for (const node of nodes) {
    parent.appendChild(node instanceof Node ? node : document.createTextNode(String(node)));
  }
}
