import { useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { TranslatePage } from "./TranslatePage";
import { SettingModal } from "./SettingModal";
import "./App.css";

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useLocalStorage("nansuka-api-key", "");

  return (
    <>
      <TranslatePage apiKey={apiKey} onSetting={() => setShowSettings(true)} />
      {showSettings && (
        <SettingModal
          apiKey={apiKey}
          setApiKey={setApiKey}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

export default App;
