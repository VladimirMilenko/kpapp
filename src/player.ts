import { activeCue, loadSubtitle, type SubtitleCue } from "./subtitles";
import { readTrackPreferences, sameLanguage, saveAudioPreference, saveSubtitlePreference } from "./trackPreferences";
import type { PlaybackSession, PlayerSnapshot } from "./types";
import type Hls from "hls.js";

type PlayerEventHandler = (snapshot: PlayerSnapshot) => void;
type HlsConstructor = typeof import("hls.js").default;
type TrackOption = { id: string; label: string; enabled: boolean; lang?: string; forced?: boolean };
type VideoFrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const STARTUP_BUFFER_TIMEOUT_MS = 4_500;
const FIRST_FRAME_TIMEOUT_MS = 1_200;
const MIN_STARTUP_BUFFER_SECONDS = 0.45;
const TIMELINE_EMIT_INTERVAL_MS = 250;
const HAVE_CURRENT_DATA = 2;
const HAVE_FUTURE_DATA = 3;
const THROTTLED_VIDEO_EVENTS = new Set(["progress", "timeupdate"]);

export class TvPlayer {
  private hls: Hls | null = null;
  private HlsClass: HlsConstructor | null = null;
  private session: PlaybackSession | null = null;
  private currentSourceId = "";
  private externalCues: SubtitleCue[] = [];
  private selectedSubtitleId = "off";
  private appliedPreferredAudio = false;
  private appliedPreferredSubtitle = false;
  private fatalNetworkRecoveries = 0;
  private fatalMediaRecoveries = 0;
  private fatalFallbackPending = false;
  private error = "";
  private loading = false;
  private preparingPlayback = false;
  private needsFirstFrameGuard = false;
  private playIntent = 0;
  private suppressEmitDepth = 0;
  private emitTimer: number | undefined;
  private lastEmitAt = 0;
  private lastSnapshot: PlayerSnapshot | null = null;
  private readonly onState: PlayerEventHandler;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly subtitleOverlay: HTMLElement,
    onState: PlayerEventHandler
  ) {
    this.onState = onState;
    this.bindVideoEvents();
  }

  async load(session: PlaybackSession) {
    this.session = session;
    this.selectedSubtitleId = initialSubtitleId(session);
    this.appliedPreferredAudio = false;
    this.appliedPreferredSubtitle = false;
    this.currentSourceId = session.sources[0]?.id ?? "";
    this.error = "";
    this.externalCues = [];

    const source = session.sources[0];
    if (!source) {
      this.error = "No playable stream was returned for this title.";
      this.emit();
      return;
    }

    try {
      await this.loadSource(source.id, session.resumeTime ?? 0, true);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to start playback.";
      this.loading = false;
      this.emit();
    }
  }

  destroy() {
    this.playIntent += 1;
    this.preparingPlayback = false;
    this.loading = false;
    window.clearTimeout(this.emitTimer);
    this.destroyHls();
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
  }

  togglePlay() {
    if (this.video.paused) {
      void this.playWhenReady();
    } else {
      this.playIntent += 1;
      this.video.pause();
    }
  }

  seekBy(delta: number) {
    this.seekTo(this.video.currentTime + delta);
  }

  seekTo(time: number) {
    const target = Math.max(0, time);

    if (!Number.isFinite(this.video.duration)) {
      this.video.currentTime = target;
      return;
    }

    this.video.currentTime = Math.min(this.video.duration, target);
  }

  async retry(autoplay = !this.video.paused) {
    const sourceId = this.currentSourceId || this.session?.sources[0]?.id;

    if (!sourceId) {
      this.error = "No playable stream was returned for this title.";
      this.emit();
      return false;
    }

    try {
      await this.loadSource(sourceId, this.video.currentTime || this.session?.resumeTime || 0, autoplay);
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to retry playback.";
      this.loading = false;
      this.emit();
      return false;
    }
  }

  async tryNextSource(autoplay = !this.video.paused) {
    const next = this.nextSource();

    if (!next) {
      this.error = "No lower quality stream is available.";
      this.loading = false;
      this.emit();
      return false;
    }

    try {
      await this.loadSource(next.id, this.video.currentTime || this.session?.resumeTime || 0, autoplay);
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to switch to the next stream.";
      this.loading = false;
      this.emit();
      return false;
    }
  }

  async selectQuality(id: string) {
    if (id === "auto" && this.hls) {
      this.hls.currentLevel = -1;
      this.emit();
      return;
    }

    if (id.startsWith("level:") && this.hls) {
      this.hls.currentLevel = Number(id.slice("level:".length));
      this.emit();
      return;
    }

    if (id.startsWith("source:")) {
      try {
        await this.loadSource(id.slice("source:".length), this.video.currentTime, !this.video.paused);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Unable to switch quality.";
        this.loading = false;
        this.emit();
      }
    }
  }

  selectAudio(id: string, persist = true) {
    if (id.startsWith("hls:") && this.hls) {
      this.hls.audioTrack = Number(id.slice("hls:".length));
      if (persist) {
        saveAudioPreference(this.languageForAudioId(id));
      }
      this.emit();
      return;
    }

    const audioTracks = getHtmlAudioTracks(this.video);
    if (id.startsWith("html:") && audioTracks) {
      const index = Number(id.slice("html:".length));
      for (let i = 0; i < audioTracks.length; i += 1) {
        const track = audioTracks[i];
        if (track) {
          track.enabled = i === index;
        }
      }
      if (persist) {
        saveAudioPreference(this.languageForAudioId(id));
      }
      this.emit();
    }
  }

  async selectSubtitle(id: string, persist = true) {
    this.selectedSubtitleId = id;
    this.externalCues = [];
    this.subtitleOverlay.textContent = "";

    if (this.hls) {
      this.hls.subtitleTrack = -1;
      this.hls.subtitleDisplay = false;
    }

    if (id === "off") {
      if (persist) {
        saveSubtitlePreference(undefined, true);
      }
      this.emit();
      return;
    }

    if (id.startsWith("hls:") && this.hls) {
      this.hls.subtitleDisplay = true;
      this.hls.subtitleTrack = Number(id.slice("hls:".length));
      if (persist) {
        saveSubtitlePreference(this.languageForSubtitleId(id));
      }
      this.emit();
      return;
    }

    const option = this.session?.subtitles.find((subtitle) => subtitle.id === id);
    if (!option?.url) {
      this.emit();
      return;
    }

    if (persist) {
      saveSubtitlePreference(this.languageForSubtitleId(id));
    }

    this.loading = true;
    this.emit();

    try {
      this.externalCues = await loadSubtitle(option.url, option.shift ?? 0);
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Unable to load subtitles.";
    } finally {
      this.loading = false;
      this.updateSubtitle();
      this.emit();
    }
  }

  snapshot() {
    return this.createSnapshot();
  }

  private async loadSource(sourceId: string, resumeTime = 0, autoplay = true) {
    const source = this.session?.sources.find((item) => item.id === sourceId);
    if (!source) {
      return;
    }

    this.destroyHls();
    this.currentSourceId = sourceId;
    this.appliedPreferredAudio = false;
    this.appliedPreferredSubtitle = false;
    this.fatalNetworkRecoveries = 0;
    this.fatalMediaRecoveries = 0;
    this.fatalFallbackPending = false;
    this.error = "";
    this.loading = true;
    this.preparingPlayback = false;
    this.needsFirstFrameGuard = true;
    this.playIntent += 1;
    this.emit();

    this.video.pause();
    this.video.preload = "auto";
    this.video.removeAttribute("src");
    this.video.load();

    const onReady = async () => {
      if (resumeTime > 0) {
        this.video.currentTime = resumeTime;
      }

      if (autoplay) {
        await this.playWhenReady();
      } else {
        this.loading = false;
        this.emit();
      }
    };

    const HlsClass = await this.loadHls();

    if (HlsClass.isSupported()) {
      this.hls = new HlsClass({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        backBufferLength: 90,
        maxBufferLength: 45,
        autoStartLoad: false,
        startFragPrefetch: true,
        testBandwidth: true
      });

      this.hls.on(HlsClass.Events.MEDIA_ATTACHED, () => {
        this.hls?.loadSource(source.url);
      });
      this.hls.on(HlsClass.Events.MANIFEST_PARSED, async () => {
        this.selectMaxHlsQuality();
        await this.applyPreferredTracks(true);
        this.hls?.startLoad(resumeTime > 0 ? resumeTime : -1);
        await onReady();
      });
      this.hls.on(HlsClass.Events.LEVEL_SWITCHED, () => this.emit());
      this.hls.on(HlsClass.Events.AUDIO_TRACKS_UPDATED, () => {
        void this.applyPreferredTracks(false);
        this.emit();
      });
      this.hls.on(HlsClass.Events.AUDIO_TRACK_SWITCHED, () => this.emit());
      this.hls.on(HlsClass.Events.SUBTITLE_TRACKS_UPDATED, () => {
        void this.applyPreferredTracks(false);
        this.emit();
      });
      this.hls.on(HlsClass.Events.SUBTITLE_TRACK_SWITCH, () => this.emit());
      this.hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return;
        }

        if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
          if (this.fatalNetworkRecoveries >= 2) {
            void this.handleFatalPlaybackError(data.details || "Fatal HLS network error.");
            return;
          }

          this.fatalNetworkRecoveries += 1;
          this.loading = true;
          this.emit();
          this.hls?.startLoad();
          return;
        }

        if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
          if (this.fatalMediaRecoveries >= 2) {
            void this.handleFatalPlaybackError(data.details || "Fatal HLS media error.");
            return;
          }

          this.fatalMediaRecoveries += 1;
          this.loading = true;
          this.emit();
          this.hls?.recoverMediaError();
          return;
        }

        void this.handleFatalPlaybackError(data.details || "Fatal HLS playback error.");
      });
      this.hls.attachMedia(this.video);
      return;
    }

    this.video.src = source.url;
    this.video.addEventListener("loadedmetadata", () => void onReady(), { once: true });
    void this.applyPreferredTracks(false);
  }

  private async playWhenReady() {
    const intent = ++this.playIntent;
    this.preparingPlayback = true;
    this.loading = true;
    this.emit();

    try {
      await this.waitForStartupBuffer(intent);
      if (intent !== this.playIntent) {
        return;
      }

      await this.playWithFirstFrameGuard(intent);
    } catch (error) {
      if (isBenignPlayInterruption(error)) {
        return;
      }

      this.error = error instanceof Error ? error.message : "Unable to start playback.";
    } finally {
      if (intent === this.playIntent) {
        this.preparingPlayback = false;
        this.loading = false;
        this.emit();
      }
    }
  }

  private waitForStartupBuffer(intent: number) {
    if (this.hasStartupBuffer()) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let settled = false;
      const events = ["loadeddata", "canplay", "canplaythrough", "progress", "durationchange", "timeupdate"];
      const cleanup = () => {
        for (const eventName of events) {
          this.video.removeEventListener(eventName, check);
        }
        window.clearTimeout(timer);
      };
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };
      const check = () => {
        if (intent !== this.playIntent || this.hasStartupBuffer()) {
          finish();
        }
      };
      const timer = window.setTimeout(finish, STARTUP_BUFFER_TIMEOUT_MS);

      for (const eventName of events) {
        this.video.addEventListener(eventName, check);
      }

      check();
    });
  }

  private hasStartupBuffer() {
    if (this.video.readyState >= HAVE_FUTURE_DATA) {
      return true;
    }

    if (this.video.readyState < HAVE_CURRENT_DATA) {
      return false;
    }

    return bufferedAhead(this.video) >= MIN_STARTUP_BUFFER_SECONDS;
  }

  private async playWithFirstFrameGuard(intent: number) {
    const guardAudio = this.needsFirstFrameGuard;
    const wasMuted = this.video.muted;
    const firstFrame = guardAudio ? waitForFirstVideoFrame(this.video) : Promise.resolve();

    if (guardAudio) {
      this.video.muted = true;
    }

    try {
      await this.video.play();
      await firstFrame;
    } finally {
      if (guardAudio) {
        this.video.muted = wasMuted;
      }

      if (intent === this.playIntent) {
        this.needsFirstFrameGuard = false;
      }
    }
  }

  private async loadHls() {
    if (!this.HlsClass) {
      this.HlsClass = (await import("hls.js")).default;
    }

    return this.HlsClass;
  }

  private bindVideoEvents() {
    const events = [
      "timeupdate",
      "durationchange",
      "progress",
      "play",
      "pause",
      "waiting",
      "playing",
      "ended",
      "loadeddata",
      "canplay",
      "seeking",
      "seeked"
    ];

    for (const eventName of events) {
      const handler = () => {
        if (eventName === "waiting" || eventName === "seeking") {
          this.loading = true;
        } else if (!this.preparingPlayback && ["playing", "loadeddata", "canplay", "pause", "ended", "seeked"].includes(eventName)) {
          this.loading = false;
        }

        if (eventName === "playing" || eventName === "timeupdate") {
          this.clearResolvedError();
        }
        this.updateSubtitle();
        if (THROTTLED_VIDEO_EVENTS.has(eventName)) {
          this.emitThrottled();
        } else {
          this.emit();
        }
      };
      this.video.addEventListener(eventName, handler);
      this.unsubscribers.push(() => this.video.removeEventListener(eventName, handler));
    }

    const errorHandler = () => {
      void this.handleFatalPlaybackError(mediaErrorMessage(this.video.error));
    };
    this.video.addEventListener("error", errorHandler);
    this.unsubscribers.push(() => this.video.removeEventListener("error", errorHandler));
  }

  private destroyHls() {
    if (!this.hls) {
      return;
    }

    this.hls.destroy();
    this.hls = null;
  }

  private clearResolvedError() {
    if (!this.error || this.video.error || this.fatalFallbackPending) {
      return;
    }

    this.error = "";
  }

  private async applyPreferredTracks(silent: boolean) {
    const prefs = readTrackPreferences();

    await this.withOptionalEmitSuppression(silent, async () => {
      if (!this.appliedPreferredAudio && prefs.audioLang) {
        const audio = this.audioOptions().find((option) => option.enabled && sameLanguage(option.lang || option.label, prefs.audioLang));
        if (audio) {
          this.appliedPreferredAudio = true;
          this.selectAudio(audio.id, false);
        }
      }

      if (!this.appliedPreferredSubtitle && prefs.subtitlesOff) {
        this.appliedPreferredSubtitle = true;
        await this.selectSubtitle("off", false);
        return;
      }

      if (!this.appliedPreferredSubtitle && prefs.subtitleLang) {
        const subtitle = preferredSubtitle(this.subtitleOptions(), prefs.subtitleLang);
        if (subtitle) {
          this.appliedPreferredSubtitle = true;
          await this.selectSubtitle(subtitle.id, false);
          return;
        }
      }

      if (!this.appliedPreferredSubtitle) {
        const subtitle = preferredSubtitle(this.subtitleOptions(), "en");
        this.appliedPreferredSubtitle = true;

        if (subtitle) {
          await this.selectSubtitle(subtitle.id, false);
        }
      }
    });
  }

  private async withOptionalEmitSuppression(silent: boolean, run: () => Promise<void>) {
    if (!silent) {
      await run();
      return;
    }

    this.suppressEmitDepth += 1;
    try {
      await run();
    } finally {
      this.suppressEmitDepth -= 1;
    }
  }

  private selectMaxHlsQuality() {
    if (!this.hls?.levels.length) {
      return;
    }

    let bestIndex = 0;
    let bestScore = -1;

    this.hls.levels.forEach((level, index) => {
      const score = (level.height || 0) * 10_000_000 + (level.bitrate || 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    this.hls.currentLevel = bestIndex;
    this.hls.nextLevel = bestIndex;
    this.hls.loadLevel = bestIndex;
  }

  private languageForAudioId(id: string) {
    if (id.startsWith("hls:") && this.hls) {
      const track = this.hls.audioTracks[Number(id.slice("hls:".length))] as { lang?: string; name?: string } | undefined;
      return track?.lang || track?.name;
    }

    if (id.startsWith("html:")) {
      const track = getHtmlAudioTracks(this.video)?.[Number(id.slice("html:".length))];
      return track?.language || track?.label;
    }

    return this.session?.audios.find((audio) => audio.id === id)?.lang || this.session?.audios.find((audio) => audio.id === id)?.label;
  }

  private languageForSubtitleId(id: string) {
    if (id.startsWith("hls:") && this.hls) {
      const track = this.hls.subtitleTracks[Number(id.slice("hls:".length))] as { lang?: string; name?: string } | undefined;
      return track?.lang || track?.name;
    }

    const option = this.session?.subtitles.find((subtitle) => subtitle.id === id);
    return option?.lang || option?.label;
  }

  private updateSubtitle() {
    const text = this.externalCues.length ? activeCue(this.externalCues, this.video.currentTime) : "";
    if (this.subtitleOverlay.textContent !== text) {
      this.subtitleOverlay.textContent = text;
    }
  }

  private emit() {
    if (this.suppressEmitDepth > 0) {
      return;
    }

    window.clearTimeout(this.emitTimer);
    this.emitTimer = undefined;
    const snapshot = this.createSnapshot();
    this.lastSnapshot = snapshot;
    this.lastEmitAt = Date.now();
    this.onState(snapshot);
  }

  private emitThrottled() {
    if (this.suppressEmitDepth > 0) {
      return;
    }

    const remaining = TIMELINE_EMIT_INTERVAL_MS - (Date.now() - this.lastEmitAt);
    if (remaining <= 0) {
      this.emit();
      return;
    }

    if (this.emitTimer !== undefined) {
      return;
    }

    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = undefined;
      this.emit();
    }, remaining);
  }

  private createSnapshot(): PlayerSnapshot {
    const duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    const bufferedUntil = bufferedEnd(this.video);
    const qualityOptions = this.qualityOptions();
    const audioOptions = this.audioOptions();
    const subtitleOptions = this.subtitleOptions();
    const currentSource = this.currentSource();
    const nextSource = this.nextSource();

    const snapshot: PlayerSnapshot = {
      title: this.session?.title ?? "",
      paused: this.video.paused,
      loading: this.loading,
      currentTime: this.video.currentTime || 0,
      duration,
      bufferedUntil,
      activeCue: this.subtitleOverlay.textContent || "",
      qualityOptions,
      selectedQualityId: this.selectedQualityId(qualityOptions),
      audioOptions,
      selectedAudioId: this.selectedAudioId(audioOptions),
      subtitleOptions,
      selectedSubtitleId: this.selectedSubtitleId || this.bestDefaultSubtitleId(subtitleOptions),
      currentSourceId: this.currentSourceId,
      canTryNextSource: Boolean(nextSource),
      ended: this.video.ended
    };

    if (currentSource?.label) {
      snapshot.currentSourceLabel = currentSource.label;
    }

    if (nextSource?.label) {
      snapshot.nextSourceLabel = nextSource.label;
    }

    if (this.session?.subtitle) {
      snapshot.subtitle = this.session.subtitle;
    }

    if (this.error) {
      snapshot.error = this.error;
    }

    return snapshot;
  }

  private qualityOptions() {
    if (this.hls?.levels.length) {
      return [
        { id: "auto", label: "Auto", enabled: true },
        ...this.hls.levels.map((level, index) => ({
          id: `level:${index}`,
          label: levelLabel(level.height, level.bitrate),
          enabled: true
        }))
      ];
    }

    return (
      this.session?.sources.map((source) => ({
        id: `source:${source.id}`,
        label: source.label,
        enabled: true
      })) ?? []
    );
  }

  private selectedQualityId(options: Array<{ id: string }>) {
    if (this.hls?.levels.length) {
      const level = this.hls.currentLevel >= 0 ? this.hls.currentLevel : this.hls.nextLevel >= 0 ? this.hls.nextLevel : this.hls.loadLevel;
      return `level:${Math.max(0, level)}`;
    }

    const selected = `source:${this.currentSourceId}`;
    return options.some((option) => option.id === selected) ? selected : options[0]?.id ?? "";
  }

  private audioOptions(): TrackOption[] {
    if (this.hls?.audioTracks.length) {
      return this.hls.audioTracks.map((track, index) => {
        const typed = track as { lang?: string; name?: string };
        return optionWithLang({
          id: `hls:${index}`,
          label: typed.name || typed.lang || `Track ${index + 1}`,
          enabled: true
        }, typed.lang);
      });
    }

    const htmlTracks = getHtmlAudioTracks(this.video);
    if (htmlTracks?.length) {
      return Array.from({ length: htmlTracks.length }, (_item, index) => {
        const track = htmlTracks[index];
        return optionWithLang({
          id: `html:${index}`,
          label: track?.label || track?.language || `Track ${index + 1}`,
          enabled: true
        }, track?.language);
      });
    }

    return this.session?.audios.length
      ? this.session.audios.map((audio) => ({ ...audio, enabled: false }))
      : [{ id: "default", label: "Default", enabled: false }];
  }

  private selectedAudioId(options: Array<{ id: string }>) {
    if (this.hls?.audioTracks.length) {
      return `hls:${this.hls.audioTrack}`;
    }

    const htmlTracks = getHtmlAudioTracks(this.video);
    if (htmlTracks?.length) {
      for (let index = 0; index < htmlTracks.length; index += 1) {
        if (htmlTracks[index]?.enabled) {
          return `html:${index}`;
        }
      }
    }

    return options[0]?.id ?? "";
  }

  private bestDefaultSubtitleId(options: TrackOption[]) {
    const prefs = readTrackPreferences();

    if (prefs.subtitlesOff) {
      return "off";
    }

    if (prefs.subtitleLang) {
      const subtitle = preferredSubtitle(options, prefs.subtitleLang);
      if (subtitle) {
        return subtitle.id;
      }
    }

    return preferredSubtitle(options, "en")?.id ?? "off";
  }

  private subtitleOptions(): TrackOption[] {
    const hlsSubtitles =
      this.hls?.subtitleTracks.map((track, index) => {
        const typed = track as { lang?: string; name?: string; forced?: boolean };
        const label = typed.name || typed.lang || `Subtitle ${index + 1}`;
        return optionWithLang({
          id: `hls:${index}`,
          label,
          enabled: true,
          forced: typed.forced ?? subtitleLooksForced(label)
        }, typed.lang);
      }) ?? [];
    const externalSubtitles =
      this.session?.subtitles.map((subtitle) =>
        optionWithLang({
          id: subtitle.id,
          label: subtitle.label,
          enabled: Boolean(subtitle.url),
          forced: subtitle.forced ?? subtitleLooksForced(subtitle.label)
        }, subtitle.lang)
      ) ?? [];

    return [{ id: "off", label: "Off", enabled: true }, ...hlsSubtitles, ...externalSubtitles];
  }

  private currentSource() {
    return this.session?.sources.find((source) => source.id === this.currentSourceId);
  }

  private nextSource() {
    const sources = this.session?.sources ?? [];
    const index = sources.findIndex((source) => source.id === this.currentSourceId);

    if (index < 0) {
      return sources[1] ?? sources[0];
    }

    return sources[index + 1];
  }

  private async handleFatalPlaybackError(message: string) {
    if (this.fatalFallbackPending) {
      return;
    }

    this.fatalFallbackPending = true;
    this.loading = true;
    this.emit();

    const switched = await this.tryNextSource(true);

    if (!switched) {
      this.error = message;
      this.loading = false;
      this.emit();
    }

    this.fatalFallbackPending = false;
  }
}

function optionWithLang(option: { id: string; label: string; enabled: boolean; forced?: boolean }, lang: string | undefined): TrackOption {
  return lang ? { ...option, lang } : option;
}

function preferredSubtitle(options: TrackOption[], language: string) {
  const candidates = options.filter((option) => option.id !== "off" && option.enabled && sameLanguage(option.lang || option.label, language));

  if (!candidates.length) {
    return undefined;
  }

  return candidates.find((option) => !subtitleLooksForced(option.label) && option.forced !== true) ?? candidates[0];
}

function initialSubtitleId(session: PlaybackSession) {
  const prefs = readTrackPreferences();

  if (prefs.subtitlesOff) {
    return "off";
  }

  const externalOptions = session.subtitles.map((subtitle) =>
    optionWithLang({
      id: subtitle.id,
      label: subtitle.label,
      enabled: Boolean(subtitle.url),
      forced: subtitle.forced ?? subtitleLooksForced(subtitle.label)
    }, subtitle.lang)
  );

  if (prefs.subtitleLang) {
    return preferredSubtitle(externalOptions, prefs.subtitleLang)?.id ?? preferredSubtitle(externalOptions, "en")?.id ?? "off";
  }

  return preferredSubtitle(externalOptions, "en")?.id ?? "off";
}

function subtitleLooksForced(label: string | undefined) {
  if (!label) {
    return false;
  }

  return /\bforced\b|форс|forced only/i.test(label);
}

function levelLabel(height: number | undefined, bitrate: number | undefined) {
  const quality = height ? `${height}p` : "Level";
  const mbps = bitrate ? ` ${(bitrate / 1_000_000).toFixed(1)} Mbps` : "";
  return `${quality}${mbps}`;
}

function bufferedEnd(video: HTMLVideoElement) {
  if (!video.buffered.length) {
    return 0;
  }

  return video.buffered.end(video.buffered.length - 1);
}

function bufferedAhead(video: HTMLVideoElement) {
  const currentTime = video.currentTime || 0;

  for (let index = 0; index < video.buffered.length; index += 1) {
    const start = video.buffered.start(index);
    const end = video.buffered.end(index);

    if (start <= currentTime + 0.08 && end > currentTime) {
      return end - currentTime;
    }
  }

  return 0;
}

function waitForFirstVideoFrame(video: HTMLVideoElement) {
  const framedVideo = video as VideoFrameCallbackVideo;

  return new Promise<void>((resolve) => {
    let settled = false;
    let frameHandle: number | undefined;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timer);
      if (frameHandle !== undefined) {
        framedVideo.cancelVideoFrameCallback?.(frameHandle);
      }
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("loadeddata", finish);
      resolve();
    };
    const onPlaying = () => window.setTimeout(finish, 140);
    const timer = window.setTimeout(finish, FIRST_FRAME_TIMEOUT_MS);

    if (framedVideo.requestVideoFrameCallback) {
      frameHandle = framedVideo.requestVideoFrameCallback(finish);
    } else {
      video.addEventListener("playing", onPlaying, { once: true });
      video.addEventListener("loadeddata", finish, { once: true });
    }
  });
}

function mediaErrorMessage(error: MediaError | null) {
  switch (error?.code) {
    case 1:
      return "Playback was aborted.";
    case 2:
      return "The stream could not be downloaded.";
    case 3:
      return "The stream could not be decoded.";
    case 4:
      return "This stream format is not supported by the TV.";
    default:
      return "The video stream could not be played.";
  }
}

function isBenignPlayInterruption(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("play() request was interrupted") ||
    message.includes("interrupted by a call to pause") ||
    message.includes("interrupted by a new load request")
  );
}

interface HtmlAudioTrack {
  enabled: boolean;
  label?: string;
  language?: string;
}

interface HtmlAudioTrackList {
  length: number;
  [index: number]: HtmlAudioTrack | undefined;
}

function getHtmlAudioTracks(video: HTMLVideoElement) {
  return (video as HTMLVideoElement & { audioTracks?: HtmlAudioTrackList }).audioTracks;
}
