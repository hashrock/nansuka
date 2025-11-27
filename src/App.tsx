import { useState } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { TranslatePage } from "./TranslatePage";
import { SettingPage } from "./SettingPage";
import "./App.css";

type Page = "translate" | "setting";

function App() {
  const [page, setPage] = useState<Page>("translate");
  const [apiKey, setApiKey] = useLocalStorage("nansuka-api-key", "");

  if (page === "setting") {
    return (
      <SettingPage
        apiKey={apiKey}
        setApiKey={setApiKey}
        onBack={() => setPage("translate")}
      />
    );
  }

  return (
    <TranslatePage apiKey={apiKey} onSetting={() => setPage("setting")} />
  );
}

export default App;
