interface SettingModalProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  onClose: () => void;
}

export function SettingModal({ apiKey, setApiKey, onClose }: SettingModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
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
      </div>
    </div>
  );
}
