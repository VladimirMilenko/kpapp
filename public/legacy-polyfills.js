(function () {
  if (typeof globalThis === "undefined") {
    var root = typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : this;
    root.globalThis = root;
  }

  if (typeof window !== "undefined" && typeof window.AbortController === "undefined") {
    var LegacyAbortSignal = function () {
      this.aborted = false;
      this.onabort = null;
      this._listeners = [];
    };

    LegacyAbortSignal.prototype.addEventListener = function addEventListener(type, listener) {
      if (type === "abort" && typeof listener === "function") {
        this._listeners.push(listener);
      }
    };

    LegacyAbortSignal.prototype.removeEventListener = function removeEventListener(type, listener) {
      if (type !== "abort") {
        return;
      }

      this._listeners = this._listeners.filter(function (candidate) {
        return candidate !== listener;
      });
    };

    LegacyAbortSignal.prototype.dispatchEvent = function dispatchEvent(event) {
      if (event.type !== "abort") {
        return true;
      }

      if (typeof this.onabort === "function") {
        this.onabort(event);
      }

      this._listeners.slice().forEach(function (listener) {
        listener(event);
      });

      return true;
    };

    var LegacyAbortController = function () {
      this.signal = new LegacyAbortSignal();
    };

    LegacyAbortController.prototype.abort = function abort() {
      if (this.signal.aborted) {
        return;
      }

      this.signal.aborted = true;
      this.signal.dispatchEvent({ type: "abort" });
    };

    window.AbortController = LegacyAbortController;
    window.AbortSignal = window.AbortSignal || LegacyAbortSignal;
  }

  function toObject(value) {
    if (value == null) {
      throw new TypeError("Cannot convert undefined or null to object");
    }
    return Object(value);
  }

  if (!Object.getOwnPropertyDescriptors) {
    Object.getOwnPropertyDescriptors = function getOwnPropertyDescriptors(object) {
      var source = toObject(object);
      var descriptors = {};
      var keys = Object.getOwnPropertyNames(source);

      if (Object.getOwnPropertySymbols) {
        keys = keys.concat(Object.getOwnPropertySymbols(source));
      }

      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
      }

      return descriptors;
    };
  }

  if (!Object.values) {
    Object.values = function values(object) {
      var source = toObject(object);
      var keys = Object.keys(source);
      var result = [];

      for (var index = 0; index < keys.length; index += 1) {
        result.push(source[keys[index]]);
      }

      return result;
    };
  }

  if (!Object.entries) {
    Object.entries = function entries(object) {
      var source = toObject(object);
      var keys = Object.keys(source);
      var result = [];

      for (var index = 0; index < keys.length; index += 1) {
        var key = keys[index];
        result.push([key, source[key]]);
      }

      return result;
    };
  }

  if (!Array.prototype.includes) {
    Object.defineProperty(Array.prototype, "includes", {
      value: function includes(searchElement, fromIndex) {
        var length = this.length >>> 0;
        var index = Math.max(fromIndex >= 0 ? fromIndex : length + (fromIndex || 0), 0);

        while (index < length) {
          var value = this[index];
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
      value: function flat(depth) {
        return flatten(this, Number(depth === undefined ? 1 : depth) || 0);
      }
    });
  }

  if (!Array.prototype.flatMap) {
    Object.defineProperty(Array.prototype, "flatMap", {
      value: function flatMap(callback, thisArg) {
        return flatten(Array.prototype.map.call(this, callback, thisArg), 1);
      }
    });
  }

  if (!Promise.allSettled) {
    Promise.allSettled = function allSettled(values) {
      return Promise.all(
        toArray(values).map(function (value) {
          return Promise.resolve(value).then(
            function (result) {
              return { status: "fulfilled", value: result };
            },
            function (reason) {
              return { status: "rejected", reason: reason };
            }
          );
        })
      );
    };
  }

  if (!Promise.prototype.finally) {
    Object.defineProperty(Promise.prototype, "finally", {
      value: function finallyPolyfill(onFinally) {
        var callback = typeof onFinally === "function" ? onFinally : function () {};

        return this.then(
          function (value) {
            return Promise.resolve(callback()).then(function () {
              return value;
            });
          },
          function (reason) {
            return Promise.resolve(callback()).then(function () {
              throw reason;
            });
          }
        );
      }
    });
  }

  if (!String.prototype.padStart) {
    Object.defineProperty(String.prototype, "padStart", {
      value: function padStart(targetLength, padString) {
        var value = String(this);
        var fill = String(padString || " ");
        var length = Math.floor(targetLength) - value.length;

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

  if (typeof Element !== "undefined" && !Element.prototype.remove) {
    Element.prototype.remove = function remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    };
  }

  if (typeof Element !== "undefined" && !Element.prototype.append) {
    Element.prototype.append = function append() {
      appendNodes(this, arguments);
    };
  }

  if (typeof DocumentFragment !== "undefined" && !DocumentFragment.prototype.append) {
    DocumentFragment.prototype.append = function append() {
      appendNodes(this, arguments);
    };
  }

  function appendNodes(parent, nodes) {
    for (var index = 0; index < nodes.length; index += 1) {
      var node = nodes[index];
      parent.appendChild(node instanceof Node ? node : document.createTextNode(String(node)));
    }
  }

  function toArray(values) {
    if (Array.from) {
      return Array.from(values);
    }

    return Array.prototype.slice.call(values);
  }

  function flatten(values, depth) {
    var result = [];

    for (var index = 0; index < values.length; index += 1) {
      var value = values[index];
      if (Array.isArray(value) && depth > 0) {
        result = result.concat(flatten(value, depth - 1));
      } else {
        result.push(value);
      }
    }

    return result;
  }
})();
