import { useRef } from "react";
import type { FormEvent } from "react";

export function TopBar({
  active = "home",
  currentQuery = "",
  showSearchBox = true,
  onFocusWithin,
  onOpenSearch,
  onOpenBrowse,
  onOpenHistory,
  onOpenSettings,
  onLiveSearch,
  onSearch,
  onLogout
}: {
  active?: "home" | "search" | "browse" | "history" | "settings";
  currentQuery?: string;
  showSearchBox?: boolean;
  onFocusWithin?: () => void;
  onOpenSearch?: () => void;
  onOpenBrowse?: () => void;
  onOpenHistory?: () => void;
  onOpenSettings?: () => void;
  onLiveSearch?: (query: string) => void;
  onSearch: (query: string) => void;
  onLogout: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(inputRef.current?.value || "");
  }

  function focusSearch() {
    inputRef.current?.focus();
  }

  return (
    <header className={`top-bar${showSearchBox ? "" : " top-bar-compact"}`} onFocusCapture={onFocusWithin}>
      <div className="wordmark">Kino.pub</div>
      <nav className="top-nav" aria-label="Primary">
        <button className={`nav-button${active === "home" ? " is-active" : ""}`} type="button" data-focusable onClick={() => onSearch("")}>
          Home
        </button>
        <button className={`nav-button${active === "search" ? " is-active" : ""}`} type="button" data-focusable onClick={onOpenSearch || focusSearch}>
          Search
        </button>
        <button className={`nav-button${active === "browse" ? " is-active" : ""}`} type="button" data-focusable onClick={onOpenBrowse}>
          Browse
        </button>
        <button className={`nav-button${active === "history" ? " is-active" : ""}`} type="button" data-focusable onClick={onOpenHistory}>
          History
        </button>
        <button className={`nav-button${active === "settings" ? " is-active" : ""}`} type="button" data-focusable onClick={onOpenSettings}>
          Settings
        </button>
      </nav>
      {showSearchBox ? (
        <form className="search-box" onSubmit={submit}>
          <input
            ref={inputRef}
            className="search-input"
            name="q"
            type="search"
            placeholder="Search Kino.pub"
            autoComplete="off"
            defaultValue={currentQuery}
            data-focusable
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (active !== "search" && value.trim()) {
                (onLiveSearch || onSearch)(value);
              }
            }}
          />
          <button className="icon-text-button" type="submit" data-focusable>
            Search
          </button>
        </form>
      ) : (
        <div className="top-bar-spacer" />
      )}
      <button className="ghost-button" type="button" data-focusable onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}
