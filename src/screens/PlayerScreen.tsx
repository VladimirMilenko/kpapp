import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { SettingsPanel } from "../components/SettingsPanel";
import type { SettingsPanelKind } from "../components/SettingsPanel";
import { clamp, formatClock, getFocusable } from "../dom";
import { TvPlayer } from "../player";
import {
  changeSubtitleAppearance,
  readSubtitleAppearance,
  saveSubtitleAppearance,
  subtitleAppearanceCssVars,
  subtitleAppearanceOptions,
  subtitleAppearanceSummary,
  subtitleBackgroundClass
} from "../subtitleAppearance";
import type { SubtitleAppearanceAction } from "../subtitleAppearance";
import type { PlaybackProgress, PlaybackSession, PlayerSnapshot } from "../types";
import { cssVars } from "../ui";

type PlayerFeedback = {
  text: string;
  tone: "seek" | "status" | "error";
};

type PlayerCommand = "back" | "playpause" | "rewind" | "forward" | "left" | "right" | "up" | "down" | "enter";

export function PlayerScreen({
  session,
  onClose,
  onProgress,
  onEnded
}: {
  session: PlaybackSession;
  onClose: () => void;
  onProgress: (progress: PlaybackProgress) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subtitleRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const playerRef = useRef<TvPlayer | null>(null);
  const hideTimerRef = useRef<number | undefined>(undefined);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const panelRef = useRef<SettingsPanelKind | null>(null);
  const pausedRef = useRef(true);
  const controlsHiddenRef = useRef(false);
  const latestSnapshotRef = useRef<PlayerSnapshot | null>(null);
  const lastProgressRef = useRef({ sentAt: 0, currentTime: 0 });
  const endedHandledRef = useRef(false);
  const seekBurstRef = useRef({ direction: 0, stepIndex: 0, at: 0 });
  const timelineDragRef = useRef(false);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanelKind | null>(null);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [feedback, setFeedback] = useState<PlayerFeedback | null>(null);
  const [subtitleAppearance, setSubtitleAppearance] = useState(readSubtitleAppearance);

  useEffect(() => {
    panelRef.current = settingsPanel;
  }, [settingsPanel]);

  useEffect(() => {
    pausedRef.current = Boolean(snapshot?.paused);
    latestSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    controlsHiddenRef.current = controlsHidden;
  }, [controlsHidden]);

  useEffect(() => {
    if (!settingsPanel) {
      return;
    }

    showControls();
    const timer = window.setTimeout(() => focusSettingsOption(), 0);
    return () => window.clearTimeout(timer);
  }, [settingsPanel]);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
    reportProgress(false);
  }, [snapshot?.currentTime, snapshot?.duration, snapshot?.paused, snapshot?.ended]);

  useEffect(() => {
    const video = videoRef.current;
    const subtitle = subtitleRef.current;

    if (!video || !subtitle) {
      return;
    }

    const player = new TvPlayer(video, subtitle, setSnapshot);
    endedHandledRef.current = false;
    playerRef.current = player;
    void player.load(session);
    window.setTimeout(() => focusPrimaryControl(), 0);
    showControls();

    return () => {
      reportProgress(true);
      window.clearTimeout(hideTimerRef.current);
      window.clearTimeout(feedbackTimerRef.current);
      player.destroy();
      playerRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    if (!snapshot?.ended || endedHandledRef.current) {
      return;
    }

    endedHandledRef.current = true;
    const timer = window.setTimeout(onEnded, 1200);
    return () => window.clearTimeout(timer);
  }, [onEnded, snapshot?.ended]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const command = playerCommandOf(event);

      if (!command) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const wasControlsHidden = controlsHiddenRef.current;
      showControls();

      if (command === "back") {
        if (panelRef.current) {
          closeSettingsPanel();
        } else {
          onClose();
        }
        return;
      }

      if (command === "enter") {
        if (wasControlsHidden) {
          togglePlayWithFeedback();
          return;
        }

        activateFocusedControl();
        return;
      }

      if (command === "playpause") {
        togglePlayWithFeedback();
        return;
      }

      if (command === "rewind" || command === "left") {
        if (panelRef.current) {
          closeSettingsPanel();
          return;
        }
        if (!wasControlsHidden && !controlsHiddenRef.current && moveHorizontalControlFocus(-1)) {
          return;
        }
        seekWithAcceleration(-1);
        return;
      }

      if (command === "forward" || command === "right") {
        if (panelRef.current) {
          focusSettingsOption();
          return;
        }
        if (!wasControlsHidden && !controlsHiddenRef.current && moveHorizontalControlFocus(1)) {
          return;
        }
        seekWithAcceleration(1);
        return;
      }

      if (command === "up" || command === "down") {
        movePlayerFocus(command, wasControlsHidden);
      }
    };

    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [onClose]);

  function showControls() {
    controlsHiddenRef.current = false;
    setControlsHidden(false);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!panelRef.current && !pausedRef.current) {
        controlsHiddenRef.current = true;
        setControlsHidden(true);
      }
    }, 4500);
  }

  function hideControls() {
    window.clearTimeout(hideTimerRef.current);
    controlsHiddenRef.current = true;
    setControlsHidden(true);
    activeElementInPlayer()?.blur();
  }

  function reportProgress(force: boolean) {
    const value = latestSnapshotRef.current;
    if (!value?.duration || !Number.isFinite(value.duration) || value.currentTime <= 0) {
      return;
    }

    const now = Date.now();
    const completed = value.ended || value.currentTime / value.duration >= 0.96;
    const due =
      force ||
      completed ||
      value.paused ||
      now - lastProgressRef.current.sentAt > 15_000 ||
      Math.abs(value.currentTime - lastProgressRef.current.currentTime) > 30;

    if (!due) {
      return;
    }

    lastProgressRef.current = {
      sentAt: now,
      currentTime: value.currentTime
    };
    onProgress({
      currentTime: value.currentTime,
      duration: value.duration,
      completed
    });
  }

  async function selectOption(kind: SettingsPanelKind, value: string) {
    showControls();

    if (kind === "subtitleStyle") {
      applySubtitleAppearanceAction(value as SubtitleAppearanceAction);
      return;
    }

    closeSettingsPanel();

    if (kind === "quality") {
      await playerRef.current?.selectQuality(value);
    } else if (kind === "audio") {
      playerRef.current?.selectAudio(value);
    } else {
      await playerRef.current?.selectSubtitle(value);
    }
  }

  function applySubtitleAppearanceAction(action: SubtitleAppearanceAction) {
    setSubtitleAppearance((current) => {
      const next = changeSubtitleAppearance(current, action);
      saveSubtitleAppearance(next);
      return next;
    });
  }

  function showFeedback(text: string, tone: PlayerFeedback["tone"] = "status") {
    setFeedback({ text, tone });
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 900);
  }

  function seekByWithFeedback(delta: number) {
    playerRef.current?.seekBy(delta);
    showFeedback(`${delta > 0 ? "+" : "-"}${Math.abs(delta)}s`, "seek");
  }

  function seekToRatio(ratio: number, showSeekFeedback = true) {
    const duration = latestSnapshotRef.current?.duration || 0;

    if (!duration || !Number.isFinite(ratio)) {
      return;
    }

    const target = clamp(duration * ratio, 0, duration);
    playerRef.current?.seekTo(target);
    if (showSeekFeedback) {
      showFeedback(formatClock(target), "seek");
    }
  }

  function seekTimelineFromPointer(event: PointerEvent<HTMLDivElement>, showSeekFeedback = true) {
    const rect = event.currentTarget.getBoundingClientRect();
    seekToRatio((event.clientX - rect.left) / rect.width, showSeekFeedback);
  }

  function seekWithAcceleration(direction: -1 | 1) {
    const now = Date.now();
    const burst = seekBurstRef.current;
    const sameBurst = burst.direction === direction && now - burst.at < 700;
    const nextStep = sameBurst ? Math.min(burst.stepIndex + 1, 2) : 0;
    const seconds = [10, 30, 60][nextStep] ?? 60;

    seekBurstRef.current = { direction, stepIndex: nextStep, at: now };
    seekByWithFeedback(direction * seconds);
  }

  function togglePlayWithFeedback() {
    const paused = latestSnapshotRef.current?.paused ?? true;
    playerRef.current?.togglePlay();
    showFeedback(paused ? "Play" : "Pause");
  }

  function activateFocusedControl() {
    const active = activeElementInPlayer();

    if (active && !controlsHiddenRef.current && active.matches("button")) {
      active.click();
      return;
    }

    togglePlayWithFeedback();
  }

  function toggleSettingsPanel(kind: SettingsPanelKind) {
    showControls();

    if (panelRef.current === kind) {
      closeSettingsPanel();
      return;
    }

    setSettingsPanel(kind);
  }

  function closeSettingsPanel() {
    const closingPanel = panelRef.current;
    setSettingsPanel(null);

    if (closingPanel) {
      window.setTimeout(() => focusSettingsButton(closingPanel), 0);
    }
  }

  function focusPrimaryControl() {
    shellRef.current?.querySelector<HTMLElement>(".play-toggle")?.focus();
  }

  function focusTimeline() {
    shellRef.current?.querySelector<HTMLElement>(".timeline")?.focus();
  }

  function focusSettingsButton(kind: SettingsPanelKind) {
    shellRef.current?.querySelector<HTMLElement>(`[data-settings-button="${kind}"]`)?.focus();
  }

  function focusSettingsOption() {
    const panel = shellRef.current?.querySelector<HTMLElement>(".settings-panel.is-open");
    const selected = panel?.querySelector<HTMLElement>(".option-row.is-selected:not([disabled])");
    const first = panel ? getFocusable(panel)[0] : undefined;

    (selected ?? first)?.focus();
  }

  function movePlayerFocus(direction: "up" | "down", wasControlsHidden: boolean) {
    if (panelRef.current) {
      moveSettingsFocus(direction);
      return;
    }

    if (wasControlsHidden) {
      focusPrimaryControl();
      return;
    }

    const active = activeElementInPlayer();

    if (direction === "up") {
      if (active?.dataset.playerFocusZone === "timeline") {
        hideControls();
        return;
      }

      if (active?.dataset.playerFocusZone === "controls") {
        focusTimeline();
        return;
      }
    }

    focusPrimaryControl();
  }

  function moveSettingsFocus(direction: "up" | "down") {
    const panel = shellRef.current?.querySelector<HTMLElement>(".settings-panel.is-open");
    const options = panel ? getFocusable(panel) : [];

    if (!options.length) {
      return;
    }

    const active = activeElementInPlayer();
    const currentIndex = Math.max(0, options.findIndex((option) => option === active));
    const nextIndex = direction === "down" ? Math.min(options.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
    options[nextIndex]?.focus();
  }

  function moveHorizontalControlFocus(direction: -1 | 1) {
    const active = activeElementInPlayer();
    const row = active?.closest<HTMLElement>(".control-row, .error-action-row");

    if (!row) {
      return false;
    }

    const controls = getFocusable(row);
    const currentIndex = controls.findIndex((control) => control === active);

    if (currentIndex < 0) {
      return false;
    }

    const nextIndex = direction > 0 ? Math.min(controls.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
    controls[nextIndex]?.focus();
    return true;
  }

  function activeElementInPlayer() {
    const active = document.activeElement;
    return active instanceof HTMLElement && shellRef.current?.contains(active) ? active : null;
  }

  const duration = snapshot?.duration || 0;
  const progress = duration ? clamp(((snapshot?.currentTime || 0) / duration) * 100, 0, 100) : 0;
  const buffered = duration ? clamp(((snapshot?.bufferedUntil || 0) / duration) * 100, 0, 100) : 0;
  const selectedQuality = selectedOptionLabel(snapshot?.qualityOptions, snapshot?.selectedQualityId, snapshot?.currentSourceLabel || "Auto");
  const selectedAudio = selectedOptionLabel(snapshot?.audioOptions, snapshot?.selectedAudioId, "Default");
  const selectedSubtitle = selectedOptionLabel(snapshot?.subtitleOptions, snapshot?.selectedSubtitleId, "Off");
  const subtitleStyleSummary = subtitleAppearanceSummary(subtitleAppearance);
  const subtitleStyleOptions = subtitleAppearanceOptions(subtitleAppearance);

  return (
    <main ref={shellRef} className={`player-shell${controlsHidden ? " controls-hidden" : ""}`}>
      <video ref={videoRef} className="player-video" playsInline preload="auto" poster={session.poster} />
      <div
        ref={subtitleRef}
        className={`subtitle-overlay ${subtitleBackgroundClass(subtitleAppearance)}`}
        style={cssVars(subtitleAppearanceCssVars(subtitleAppearance))}
        aria-live="off"
      />
      {snapshot?.loading && <div className="player-loading" />}
      {feedback && <div className={`player-feedback is-visible is-${feedback.tone}`}>{feedback.text}</div>}
      <section className={`player-controls${snapshot?.error ? " has-error" : ""}${snapshot?.loading ? " is-loading" : ""}`}>
        <div className="player-title">{snapshot?.title || session.title}</div>
        <div className="player-subtitle">{snapshot?.subtitle || session.subtitle || ""}</div>
        <div
          className="timeline"
          role="slider"
          tabIndex={0}
          data-focusable
          data-player-focus-zone="timeline"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration)}
          aria-valuenow={Math.floor(snapshot?.currentTime || 0)}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            seekToRatio((event.clientX - rect.left) / rect.width);
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            timelineDragRef.current = true;
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            seekTimelineFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (timelineDragRef.current) {
              seekTimelineFromPointer(event, false);
            }
          }}
          onPointerUp={(event) => {
            if (timelineDragRef.current) {
              seekTimelineFromPointer(event);
            }
            timelineDragRef.current = false;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
          onPointerCancel={(event) => {
            timelineDragRef.current = false;
            event.currentTarget.releasePointerCapture?.(event.pointerId);
          }}
        >
          <div className="timeline-buffered" style={{ width: `${buffered}%` }} />
          <div className="timeline-filled" style={{ width: `${progress}%` }} />
          <div className="timeline-thumb" style={{ left: `${progress}%` }} />
        </div>
        <div className="time-row">
          <span className="time-current">{formatClock(snapshot?.currentTime || 0)}</span>
          <span className="time-duration">{formatClock(snapshot?.duration || 0)}</span>
        </div>
        <div className="control-row">
          <button className="round-button" type="button" data-focusable data-player-focus-zone="controls" onClick={onClose}>Back</button>
          <button className="round-button skip-button" type="button" data-focusable data-player-focus-zone="controls" onClick={() => seekByWithFeedback(-10)}>-10s</button>
          <button className="round-button play-toggle" type="button" data-focusable data-player-focus-zone="controls" onClick={togglePlayWithFeedback}>
            {snapshot?.paused ? "Play" : "Pause"}
          </button>
          <button className="round-button skip-button" type="button" data-focusable data-player-focus-zone="controls" onClick={() => seekByWithFeedback(10)}>+10s</button>
          <button className="pill-button track-button" type="button" data-focusable data-player-focus-zone="controls" data-settings-button="quality" onClick={() => toggleSettingsPanel("quality")}>
            <span>Quality</span>
            <strong>{selectedQuality}</strong>
          </button>
          <button className="pill-button track-button" type="button" data-focusable data-player-focus-zone="controls" data-settings-button="audio" onClick={() => toggleSettingsPanel("audio")}>
            <span>Audio</span>
            <strong>{selectedAudio}</strong>
          </button>
          <button className="pill-button track-button" type="button" data-focusable data-player-focus-zone="controls" data-settings-button="subtitles" onClick={() => toggleSettingsPanel("subtitles")}>
            <span>Subs</span>
            <strong>{selectedSubtitle}</strong>
          </button>
          <button className="pill-button track-button" type="button" data-focusable data-player-focus-zone="controls" data-settings-button="subtitleStyle" onClick={() => toggleSettingsPanel("subtitleStyle")}>
            <span>Style</span>
            <strong>{subtitleStyleSummary}</strong>
          </button>
        </div>
        {snapshot?.error && (
          <div className="player-error-card" role="alert">
            <div>
              <strong>Playback issue</strong>
              <p>{snapshot.error}</p>
            </div>
            <div className="error-action-row">
              <button className="pill-button" type="button" data-focusable data-player-focus-zone="controls" onClick={() => void playerRef.current?.retry(true)}>Retry</button>
              <button
                className="pill-button"
                type="button"
                disabled={!snapshot.canTryNextSource}
                data-focusable={snapshot.canTryNextSource || undefined}
                data-player-focus-zone="controls"
                onClick={() => void playerRef.current?.tryNextSource(true)}
              >
                {snapshot.nextSourceLabel ? `Try ${snapshot.nextSourceLabel}` : "Lower quality"}
              </button>
              <button className="pill-button" type="button" data-focusable data-player-focus-zone="controls" onClick={onClose}>Back</button>
            </div>
          </div>
        )}
        <SettingsPanel snapshot={snapshot} panel={settingsPanel} subtitleStyleOptions={subtitleStyleOptions} onSelect={selectOption} />
      </section>
    </main>
  );
}

function playerCommandOf(event: KeyboardEvent): PlayerCommand | undefined {
  const keyCode = event.keyCode || event.which;

  if (keyCode === 461 || event.key === "Escape" || event.key === "BrowserBack") {
    return "back";
  }

  if (keyCode === 415 || keyCode === 19 || event.key === "MediaPlayPause" || event.key === "MediaPlay" || event.key === "MediaPause") {
    return "playpause";
  }

  if (keyCode === 412 || event.key === "MediaRewind") {
    return "rewind";
  }

  if (keyCode === 417 || event.key === "MediaFastForward") {
    return "forward";
  }

  if (event.key === "ArrowLeft") {
    return "left";
  }

  if (event.key === "ArrowRight") {
    return "right";
  }

  if (event.key === "ArrowUp") {
    return "up";
  }

  if (event.key === "ArrowDown") {
    return "down";
  }

  if (event.key === "Enter" || event.key === " " || keyCode === 13) {
    return "enter";
  }

  return undefined;
}

function selectedOptionLabel(
  options: Array<{ id: string; label: string }> | undefined,
  selectedId: string | undefined,
  fallback: string
) {
  return options?.find((option) => option.id === selectedId)?.label || fallback;
}
