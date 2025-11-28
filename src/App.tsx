import { useState } from "react";
import { TranslatePage } from "./TranslatePage";
import "./App.css";

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <TranslatePage onSetting={() => setShowSettings(true)} />
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            <p>API key is now managed by the server proxy.</p>
            <button onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
