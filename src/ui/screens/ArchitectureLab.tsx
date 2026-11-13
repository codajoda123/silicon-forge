import { getGameData } from "../../data/gameData";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { getActiveDesign } from "../../sim/core/state";
import type { DesignCommand } from "../../sim/design/commands";
import type { IsaConfig } from "../../sim/isa/types";
import { ArchetypePicker } from "../components/isa/ArchetypePicker";
import { CustomInstructionPanel } from "../components/isa/CustomInstructionPanel";
import { InstructionBreakdownPanel } from "../components/isa/InstructionBreakdownPanel";
import { IsaParamsPanel } from "../components/isa/IsaParamsPanel";
import { formatInteger } from "../format";

const data = getGameData();

/** M5: Section 8 Architecture Lab. Pure estimates only; no performance/CPI yet. */
export function ArchitectureLab() {
  const state = useGameStore((store) => store.state);
  const editDesign = useGameStore((store) => store.editDesign);
  const setStatus = useUiStore((store) => store.setStatus);
  const design = getActiveDesign(state);
  const archetype = data.isaById[design.isa.archetypeId];

  const apply = (command: DesignCommand): boolean => {
    const applied = editDesign(command);
    if (!applied) {
      return false;
    }
    return true;
  };

  const chooseArchetype = (archetypeId: string) => {
    const next = data.isaById[archetypeId];
    if (apply({ type: "setIsaArchetype", archetypeId })) {
      setStatus(`Switched to ${next?.name ?? archetypeId}; parameters reset to its defaults.`);
    }
  };

  const changeIsa = (patch: Partial<IsaConfig>) => {
    const next = { ...design.isa, ...patch };
    if (apply({ type: "setIsa", isa: next })) {
      setStatus("Updated ISA parameters; instruction counts recomputed.");
    }
  };

  const resetIsa = () => {
    if (apply({ type: "setIsaArchetype", archetypeId: design.isa.archetypeId })) {
      setStatus(`Reset parameters to ${archetype?.name ?? design.isa.archetypeId} defaults.`);
    }
  };

  const toggleCustom = (id: string) => {
    const instruction = data.customInstructionById[id];
    const selected = design.customInstructions.includes(id);
    const next = selected
      ? design.customInstructions.filter((current) => current !== id)
      : [...design.customInstructions, id];
    if (apply({ type: "setCustomInstructions", ids: next })) {
      setStatus(
        `${selected ? "Removed" : "Added"} ${instruction?.name ?? id}. ${String(next.length)} custom instruction(s) selected.`,
      );
    }
  };

  return (
    <section className="screen architecture-screen">
      <header className="screen-header">
        <h1>Architecture Lab</h1>
        <span className="milestone-tag">M5 · ISA &amp; settings</span>
      </header>

      <p className="lead architecture-lead">
        Working on <strong>{design.name}</strong> · {archetype?.name ?? design.isa.archetypeId} ·{" "}
        {String(design.isa.wordBits)}-bit · {formatInteger(design.isa.registers)} registers ·{" "}
        {String(design.customInstructions.length)} custom instruction
        {design.customInstructions.length === 1 ? "" : "s"}. Every parameter change recomputes
        instruction counts and encoding length immediately.
      </p>

      <ArchetypePicker isa={design.isa} onChoose={chooseArchetype} />
      <IsaParamsPanel isa={design.isa} onChange={changeIsa} onReset={resetIsa} />
      <CustomInstructionPanel design={design} onToggle={toggleCustom} />
      <InstructionBreakdownPanel design={design} />

      <div className="panel architecture-notes">
        <h2>What the instruction count feeds</h2>
        <ul className="plan-list">
          <li>
            M6 turns this instruction count into CPI, cache wait states, branch penalties and FPS
            in the Performance panel and Workload Lab; the count itself stays the Section 9.4 input.
          </li>
          <li>
            Software ecosystem, compiler engineers and backward compatibility are Section 8.4
            systems; the compiler-support assumption stays at{" "}
            {formatInteger(data.tuning.isa.customCompilerSupport * 100)}% until M8.
          </li>
          <li>
            Extension transistor/validation costs and custom-instruction bug risk are M7 concerns;
            only the opcode budget and instruction-count effect are modelled here.
          </li>
        </ul>
      </div>
    </section>
  );
}
