import { CheckCircle } from "lucide-react";
import { DEFAULT_METADATA_BASE_URL } from "../utils";
import { SettingsInput } from "./SettingsField";
import PillToggle from "../../../components/PillToggle";

export function SettingsMetadataTab({
  settings,
  updateSettings,
  health,
  handleSaveSettings,
  hidePanelHeader = false,
}) {
  const form = (
    <form onSubmit={handleSaveSettings} className="settings-page__form" autoComplete="off">
      <div className="settings-page__section">
        <div className="settings-page__section-header">
          <h3 className="settings-page__section-title">Metadata server</h3>
          {health?.metadataConfigured && (
            <span className="settings-page__status">
              <CheckCircle className="settings-page__status-icon" />
              Configured
            </span>
          )}
        </div>
        <div className="settings-page__fields">
          <div className="settings-page__field">
            <label htmlFor="metadata-deezer">Include Deezer albums</label>
            <PillToggle
              id="metadata-deezer"
              aria-label="Include Deezer albums"
              checked={settings.integrations?.metadata?.supplementDeezer !== false}
              onChange={(event) => updateSettings({
                ...settings,
                integrations: {
                  ...settings.integrations,
                  metadata: { ...(settings.integrations?.metadata || {}), supplementDeezer: event.target.checked },
                },
              })}
            />
            <p className="artist-subtext">Include additional albums and artwork from Deezer. No account is required.</p>
          </div>
          <div className="settings-page__field">
            <label className="artist-field-label" htmlFor="metadata-base-url">
              Base URL
            </label>
            <SettingsInput
              id="metadata-base-url"
              type="url"
              placeholder={DEFAULT_METADATA_BASE_URL}
              autoComplete="off"
              value={settings.integrations?.metadata?.baseUrl || ""}
              onChange={(e) =>
                updateSettings({
                  ...settings,
                  integrations: {
                    ...settings.integrations,
                    metadata: {
                      ...(settings.integrations?.metadata || {}),
                      provider: "brainzmash",
                      baseUrl: e.target.value,
                    },
                  },
                })
              }
            />
          </div>
        </div>
      </div>
    </form>
  );

  if (hidePanelHeader) {
    return form;
  }

  return (
    <div className="settings-page__panel">
      <div className="settings-page__panel-header">
        <h2 className="settings-page__panel-title">Metadata</h2>
      </div>
      {form}
    </div>
  );
}
