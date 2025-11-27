interface SettingPageProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  onBack: () => void;
}

export function SettingPage({ apiKey, setApiKey, onBack }: SettingPageProps) {
  return (
    <div className="setting-page">
      <button className="back-button" onClick={onBack}>
        Back
      </button>
      <h2>Settings</h2>
      <label>
        Claude API Key
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
        />
      </label>
    </div>
  );
}
