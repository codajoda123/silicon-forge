import { useEffect } from "react";

import { useGameStore } from "./store/gameStore";
import { useUiStore } from "./store/uiStore";
import { StatusBar } from "./ui/components/StatusBar";
import { TopNav } from "./ui/components/TopNav";
import { useGameClock } from "./ui/hooks/useGameClock";
import { useKeyboardShortcuts } from "./ui/hooks/useKeyboardShortcuts";
import { ScreenView } from "./ui/ScreenView";

export default function App() {
  const screen = useUiStore((store) => store.screen);
  const hydrate = useGameStore((store) => store.hydrate);

  useGameClock();
  useKeyboardShortcuts();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="app-shell">
      <TopNav />
      <main className="app-main">
        <ScreenView screen={screen} />
      </main>
      <StatusBar />
    </div>
  );
}
