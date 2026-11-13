import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initGameData } from "./data/gameData";
import { DataValidationError } from "./data/load";
import { DataErrorScreen } from "./ui/screens/DataErrorScreen";
import "./index.css";

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Missing #root element");
}

const root = createRoot(rootElement);

void (async () => {
  try {
    initGameData();
    const { default: App } = await import("./App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const issues = error instanceof DataValidationError ? error.issues : [];
    root.render(
      <StrictMode>
        <DataErrorScreen message={message} issues={issues} />
      </StrictMode>,
    );
  }
})();
