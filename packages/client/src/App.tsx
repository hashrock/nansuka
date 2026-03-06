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
            <div className="modal-header">
              <h2>Settings</h2>
              <button
                className="close-btn"
                onClick={() => setShowSettings(false)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <a
                href="https://github.com/hashrock/nansuka"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
