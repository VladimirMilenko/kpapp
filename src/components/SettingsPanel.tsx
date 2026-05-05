import type { PlayerSnapshot } from "../types";
import { titleCase } from "../ui";

export type SettingsPanelKind = "quality" | "audio" | "subtitles" | "subtitleStyle";

interface SettingsOption {
  id: string;
  label: string;
  enabled: boolean;
  lang?: string;
  forced?: boolean;
  meta?: string;
}

export function SettingsPanel({
  snapshot,
  panel,
  subtitleStyleOptions = [],
  onSelect
}: {
  snapshot: PlayerSnapshot | null;
  panel: SettingsPanelKind | null;
  subtitleStyleOptions?: SettingsOption[];
  onSelect: (kind: SettingsPanelKind, value: string) => void | Promise<void>;
}) {
  if (!snapshot || !panel) {
    return <aside className="settings-panel" aria-hidden="true" />;
  }

  const options: SettingsOption[] =
    panel === "subtitleStyle"
      ? subtitleStyleOptions
      : panel === "quality"
        ? snapshot.qualityOptions
        : panel === "audio"
          ? snapshot.audioOptions
          : snapshot.subtitleOptions;
  const selected =
    panel === "subtitleStyle" ? "" : panel === "quality" ? snapshot.selectedQualityId : panel === "audio" ? snapshot.selectedAudioId : snapshot.selectedSubtitleId;

  return (
    <aside className="settings-panel is-open" aria-label={`${panelLabel(panel)} settings`}>
      <div className="settings-heading">
        <span>Playback</span>
        <h3>{panelLabel(panel)}</h3>
        <p>{descriptionFor(panel)}</p>
      </div>
      {options.length ? (
        options.map((option) => (
          <button
            key={option.id}
            className={`option-row${option.id === selected ? " is-selected" : ""}${option.id === "off" ? " is-off" : ""}`}
            type="button"
            disabled={!option.enabled}
            data-focusable={option.enabled || undefined}
            data-player-focus-zone="settings"
            onClick={() => void onSelect(panel, option.id)}
          >
            <span className="option-label">{option.label}</span>
            {(option.meta || option.lang) && <span className="option-meta">{option.meta || option.lang?.toUpperCase()}</span>}
            {option.id === selected && <span className="option-selected">Selected</span>}
          </button>
        ))
      ) : (
        <div className="settings-empty">No {panel} options are available for this stream.</div>
      )}
    </aside>
  );
}

function descriptionFor(panel: SettingsPanelKind) {
  switch (panel) {
    case "quality":
      return "Auto is usually best. Pick a lower stream if the TV starts buffering.";
    case "audio":
      return "The app remembers the selected language for the next title.";
    case "subtitles":
      return "Subtitle language and off state are saved across playback.";
    case "subtitleStyle":
      return "Adjust subtitle size, vertical position, and readability while playback is active.";
  }
}

function panelLabel(panel: SettingsPanelKind) {
  if (panel === "subtitleStyle") {
    return "Subtitle style";
  }

  return titleCase(panel);
}
