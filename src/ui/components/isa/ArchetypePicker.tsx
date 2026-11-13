import { getGameData } from "../../../data/gameData";
import type { IsaConfig } from "../../../sim/isa/types";

const data = getGameData();

export interface ArchetypePickerProps {
  isa: IsaConfig;
  onChoose: (archetypeId: string) => void;
}

/** Section 8.1: the four Phase 1 lineages, with their honest trade-offs. */
export function ArchetypePicker({ isa, onChoose }: ArchetypePickerProps) {
  return (
    <section className="panel archetype-panel">
      <h2>Base archetype</h2>
      <p className="muted">
        Choosing an archetype resets the parameters to its historical defaults. Your custom
        instructions stay selected.
      </p>
      <div className="archetype-grid">
        {data.isas.map((archetype) => {
          const selected = archetype.id === isa.archetypeId;
          return (
            <button
              key={archetype.id}
              type="button"
              className={`archetype-card${selected ? " is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onChoose(archetype.id)}
            >
              <span className="archetype-card-head">
                <span className="archetype-card-name">{archetype.name}</span>
                <span className="mono archetype-year">{archetype.historicalYear}</span>
              </span>
              <span className="archetype-card-description">{archetype.description}</span>
              <span className="archetype-card-tags">
                {archetype.strengths.slice(0, 2).map((strength) => (
                  <span key={strength} className="tag tag-good">
                    {strength}
                  </span>
                ))}
                {archetype.weaknesses.slice(0, 2).map((weakness) => (
                  <span key={weakness} className="tag tag-bad">
                    {weakness}
                  </span>
                ))}
              </span>
              <span className="archetype-card-stats mono">
                {String(archetype.defaultWordBits)}-bit · {String(archetype.defaultRegisters)} regs ·{" "}
                {archetype.defaultExtensions.length} ext · {String(archetype.opcodeSpaceBits)}-bit
                opcode
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
