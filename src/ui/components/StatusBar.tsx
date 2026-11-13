import { useUiStore } from "../../store/uiStore";

export function StatusBar() {
  const status = useUiStore((state) => state.status);

  return (
    <footer className="status-bar">
      <span className="status-message">{status ?? "Ready."}</span>
      <span className="status-hints">Space pause · +/− speed · 1–9 screens</span>
    </footer>
  );
}
