import type { ScreenId } from "../store/uiStore";
import { ArchitectureLab } from "./screens/ArchitectureLab";
import { ChipDesigner } from "./screens/ChipDesigner";
import { Competitors } from "./screens/Competitors";
import { Dashboard } from "./screens/Dashboard";
import { Finance } from "./screens/Finance";
import { Manufacturing } from "./screens/Manufacturing";
import { Market } from "./screens/Market";
import { Marketing } from "./screens/Marketing";
import { Research } from "./screens/Research";
import { Settings } from "./screens/Settings";
import { Validation } from "./screens/Validation";
import { WorkloadLab } from "./screens/WorkloadLab";

export interface ScreenViewProps {
  screen: ScreenId;
}

export function ScreenView({ screen }: ScreenViewProps) {
  switch (screen) {
    case "dashboard":
      return <Dashboard />;
    case "chipDesigner":
      return <ChipDesigner />;
    case "architectureLab":
      return <ArchitectureLab />;
    case "validation":
      return <Validation />;
    case "manufacturing":
      return <Manufacturing />;
    case "research":
      return <Research />;
    case "market":
      return <Market />;
    case "marketing":
      return <Marketing />;
    case "competitors":
      return <Competitors />;
    case "finance":
      return <Finance />;
    case "workloadLab":
      return <WorkloadLab />;
    case "settings":
      return <Settings />;
  }

  const unreachable: never = screen;
  return <p>Unknown screen: {String(unreachable)}</p>;
}
