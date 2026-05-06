import { useEffect, useState } from "react";
import { DENSITY_OPTIONS, THEME_OPTIONS, type AppearanceSettings, type AppDensity, type AppTheme } from "../appearance";
import { TopBar } from "../components/TopBar";
import { useAutoFocus } from "../hooks/useAutoFocus";
import type { DeviceInfo, DeviceInfoInput, DeviceSetting, DeviceSettingListItem, DeviceSettings, KinoRuntimeConfig } from "../types";

const SETTING_ORDER = [
  "useSsl",
  "supportSsl",
  "supportHevc",
  "supportHdr",
  "support4k",
  "mixedPlaylist",
  "streamingType",
  "serverLocation"
];

const SETTING_LABELS: Record<string, string> = {
  useSsl: "Use SSL",
  supportSsl: "SSL support",
  supportHevc: "HEVC support",
  supportHdr: "HDR support",
  support4k: "UHD / 4K support",
  mixedPlaylist: "Mixed HLS4 playlist",
  streamingType: "Streaming type",
  serverLocation: "Server region"
};

const OPTION_LABELS: Record<string, string> = {
  Германия: "Germany",
  Нидерланды: "Netherlands",
  Франция: "France",
  Польша: "Poland",
  Россия: "Russia",
  Украина: "Ukraine",
  США: "United States",
  Канада: "Canada",
  "Великобритания": "United Kingdom"
};

export function DeviceSettingsScreen({
  config,
  device,
  settings,
  appearance,
  loading,
  error,
  savingKey,
  onChangeAppearance,
  onChangeSetting,
  onSaveDeviceInfo,
  onSearch,
  onOpenSearch,
  onOpenBrowse,
  onOpenHistory,
  onLogout,
  onRetry
}: {
  config: KinoRuntimeConfig;
  device: DeviceInfo | undefined;
  settings: DeviceSettings | undefined;
  appearance: AppearanceSettings;
  loading: boolean;
  error: string | undefined;
  savingKey: string | undefined;
  onChangeAppearance: (value: AppearanceSettings) => void;
  onChangeSetting: (key: string, value: string | number | boolean) => void;
  onSaveDeviceInfo: (value: DeviceInfoInput) => void;
  onSearch: (query: string) => void;
  onOpenSearch: () => void;
  onOpenBrowse: () => void;
  onOpenHistory: () => void;
  onLogout: () => void;
  onRetry: () => void;
}) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoInput>(() => deviceInfoFromRuntime(config, device));
  const entries = orderedSettings(settings ?? {});

  useAutoFocus([loading, entries.length]);

  useEffect(() => {
    setDeviceInfo(deviceInfoFromRuntime(config, device));
  }, [config, device]);

  return (
    <main className="settings-screen">
      <div className="ambient-orb" />
      <TopBar
        active="settings"
        showSearchBox={false}
        onSearch={onSearch}
        onOpenSearch={onOpenSearch}
        onOpenBrowse={onOpenBrowse}
        onOpenHistory={onOpenHistory}
        onLogout={onLogout}
      />
      <section className="settings-hero">
        <div className="kicker">Kino.pub</div>
        <h1>Settings</h1>
        <p>Adjust browser appearance and Kino.pub playback capabilities for this device.</p>
      </section>

      <section className="appearance-panel">
        <div>
          <h2>Appearance</h2>
          <p>Saved only on this browser.</p>
        </div>
        <AppearanceGroup
          label="Theme"
          options={THEME_OPTIONS}
          selected={appearance.theme}
          onSelect={(theme) => onChangeAppearance({ ...appearance, theme })}
        />
        <AppearanceGroup
          label="Density"
          options={DENSITY_OPTIONS}
          selected={appearance.density}
          onSelect={(density) => onChangeAppearance({ ...appearance, density })}
        />
      </section>

      <section className="device-info-panel">
        <div>
          <h2>Device identity</h2>
          <p>Used to register this webOS client through Kino.pub device notify.</p>
        </div>
        <label>
          <span>Name</span>
          <input
            value={deviceInfo.title}
            data-focusable
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDeviceInfo((current) => ({ ...current, title: value }));
            }}
          />
        </label>
        <label>
          <span>Hardware</span>
          <input
            value={deviceInfo.hardware}
            data-focusable
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDeviceInfo((current) => ({ ...current, hardware: value }));
            }}
          />
        </label>
        <label>
          <span>Software</span>
          <input
            value={deviceInfo.software}
            data-focusable
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDeviceInfo((current) => ({ ...current, software: value }));
            }}
          />
        </label>
        <button
          className={`primary-action${savingKey === "__deviceInfo" ? " is-busy" : ""}`}
          type="button"
          data-focusable
          disabled={savingKey === "__deviceInfo"}
          onClick={() => onSaveDeviceInfo(deviceInfo)}
        >
          Save device identity
        </button>
      </section>

      <section className="device-settings-list">
        <div className="settings-results-heading">
          <h2>Playback capabilities</h2>
          {loading ? <span>Loading</span> : <span>{entries.length} settings</span>}
        </div>

        {error && (
          <section className="message-strip">
            <p>{error}</p>
            <button className="secondary-action" type="button" data-focusable onClick={onRetry}>
              Retry
            </button>
          </section>
        )}

        {!error && loading && <section className="message-strip">Loading device settings...</section>}
        {!error && !loading && entries.length === 0 && <section className="message-strip">Kino.pub did not return any device settings.</section>}

        {!error &&
          entries.map(([key, setting], index) =>
            isListSetting(setting) ? (
              <ListSettingRow key={key} settingKey={key} setting={setting} savingKey={savingKey} autoFocus={index === 0} onChange={onChangeSetting} />
            ) : (
              <CheckboxSettingRow key={key} settingKey={key} setting={setting} savingKey={savingKey} autoFocus={index === 0} onChange={onChangeSetting} />
            )
          )}
      </section>
    </main>
  );
}

function AppearanceGroup<T extends AppTheme | AppDensity>({
  label,
  options,
  selected,
  onSelect
}: {
  label: string;
  options: Array<{ id: T; label: string; description: string }>;
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="appearance-group">
      <span>{label}</span>
      <div className="appearance-options">
        {options.map((option) => (
          <button
            key={option.id}
            className={`appearance-option${option.id === selected ? " is-selected" : ""}`}
            type="button"
            data-focusable
            aria-pressed={option.id === selected}
            onClick={() => onSelect(option.id)}
          >
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckboxSettingRow({
  settingKey,
  setting,
  savingKey,
  autoFocus,
  onChange
}: {
  settingKey: string;
  setting: DeviceSetting;
  savingKey: string | undefined;
  autoFocus: boolean;
  onChange: (key: string, value: boolean) => void;
}) {
  const enabled = booleanValue(setting.value);
  const saving = savingKey === settingKey;

  return (
    <article className={`device-setting-row${enabled ? " is-enabled" : ""}`}>
      <div>
        <h3>{settingLabel(settingKey, setting)}</h3>
        <p>{enabled ? "Enabled" : "Disabled"}</p>
      </div>
      <button
        className={`toggle-button${enabled ? " is-on" : ""}${saving ? " is-busy" : ""}`}
        type="button"
        data-focusable
        data-autofocus={autoFocus || undefined}
        disabled={saving}
        aria-pressed={enabled}
        onClick={() => onChange(settingKey, !enabled)}
      >
        {enabled ? "On" : "Off"}
      </button>
    </article>
  );
}

function ListSettingRow({
  settingKey,
  setting,
  savingKey,
  autoFocus,
  onChange
}: {
  settingKey: string;
  setting: DeviceSetting;
  savingKey: string | undefined;
  autoFocus: boolean;
  onChange: (key: string, value: string | number) => void;
}) {
  const options = listOptions(setting);
  const selected = options.find((option) => booleanValue(option.selected));
  const saving = savingKey === settingKey;

  return (
    <article className="device-setting-row device-setting-list-row">
      <div className="device-setting-list-heading">
        <div>
          <h3>{settingLabel(settingKey, setting)}</h3>
          <p>{selected ? optionLabel(selected.label) : "Choose a value"}</p>
        </div>
        {saving && <span className="saving-pill">Saving</span>}
      </div>
      <div className="device-list-options">
        {options.map((option, index) => {
          const isSelected = String(option.id) === String(selected?.id);
          const shouldAutoFocus = autoFocus && (isSelected || (!selected && index === 0));
          const description = optionDescription(option.description);
          return (
            <button
              key={String(option.id)}
              className={`device-list-option${isSelected ? " is-selected" : ""}`}
              type="button"
              data-focusable
              data-autofocus={shouldAutoFocus ? true : undefined}
              disabled={saving}
              aria-pressed={isSelected}
              onClick={() => {
                if (!isSelected) {
                  onChange(settingKey, option.id);
                }
              }}
            >
              <span>{optionLabel(option.label)}</span>
              {description && <small>{description}</small>}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function orderedSettings(settings: DeviceSettings) {
  return Object.entries(settings).sort(([a], [b]) => settingRank(a) - settingRank(b) || a.localeCompare(b));
}

function settingRank(key: string) {
  const index = SETTING_ORDER.indexOf(key);
  return index >= 0 ? index : SETTING_ORDER.length;
}

function isListSetting(setting: DeviceSetting) {
  return setting.type === "list" && Array.isArray(setting.value);
}

function listOptions(setting: DeviceSetting): DeviceSettingListItem[] {
  return Array.isArray(setting.value) ? setting.value : [];
}

function settingLabel(key: string, setting: DeviceSetting) {
  return SETTING_LABELS[key] || setting.label || key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

function optionLabel(label: string) {
  return OPTION_LABELS[label] || label;
}

function optionDescription(description: string | undefined) {
  if (!description || /[А-Яа-яЁё]/.test(description)) {
    return undefined;
  }

  return description;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return value === "1" || value.toLowerCase() === "true";
  }

  return false;
}

function deviceInfoFromRuntime(config: KinoRuntimeConfig, device: DeviceInfo | undefined): DeviceInfoInput {
  return {
    title: device?.title || config.deviceTitle || "LG webOS TV",
    hardware: device?.hardware || config.deviceHardware || "webOS",
    software: device?.software || config.deviceSoftware || "Kino.pub TV"
  };
}
