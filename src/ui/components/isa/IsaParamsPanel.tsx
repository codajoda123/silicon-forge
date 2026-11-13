import { getGameData, getTuning } from "../../../data/gameData";
import type { IsaConfig } from "../../../sim/isa/types";
import { NumberField } from "../NumberField";

const data = getGameData();
const tuning = getTuning();

export interface IsaParamsPanelProps {
  isa: IsaConfig;
  onChange: (patch: Partial<IsaConfig>) => void;
  onReset: () => void;
}

/** Section 8.2: word size, registers, address width, length, modes, extensions. */
export function IsaParamsPanel({ isa, onChange, onReset }: IsaParamsPanelProps) {
  const archetype = data.isaById[isa.archetypeId];
  const toggleExtension = (id: string) => {
    const next = isa.extensions.includes(id)
      ? isa.extensions.filter((extension) => extension !== id)
      : [...isa.extensions, id];
    onChange({ extensions: next });
  };

  return (
    <section className="panel isa-params-panel">
      <div className="panel-heading-row">
        <h2>ISA parameters</h2>
        <button type="button" className="secondary-button compact-button" onClick={onReset}>
          Reset to {archetype?.name ?? "archetype"}
        </button>
      </div>

      <div className="isa-field-grid">
        <label className="field field-compact">
          <span>Datapath width</span>
          <select
            value={isa.wordBits}
            onChange={(event) => onChange({ wordBits: Number(event.target.value) })}
          >
            {tuning.isa.wordBitsOptions.map((bits) => (
              <option key={bits} value={bits}>
                {bits} bits
              </option>
            ))}
          </select>
          <small>Operands wider than this take extra passes.</small>
        </label>

        <label className="field field-compact">
          <span>Registers</span>
          <select
            value={isa.registers}
            onChange={(event) => onChange({ registers: Number(event.target.value) })}
          >
            {tuning.isa.registerOptions.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
          <small>Too few registers forces spill loads and stores.</small>
        </label>

        <NumberField
          label="Address width"
          value={isa.addressBits}
          min={tuning.isa.addressBitsMin}
          max={tuning.isa.addressBitsMax}
          suffix="bits"
          onCommit={(value) => onChange({ addressBits: value })}
        />

        <NumberField
          label="Addressing modes"
          value={isa.addressingModes}
          min={tuning.isa.addressingModesMin}
          max={tuning.isa.addressingModesMax}
          onCommit={(value) => onChange({ addressingModes: value })}
        />

        <label className="field field-compact">
          <span>Instruction length</span>
          <select
            value={isa.fixedLength ? "fixed" : "variable"}
            onChange={(event) => onChange({ fixedLength: event.target.value === "fixed" })}
          >
            <option value="variable">Variable</option>
            <option value="fixed">Fixed</option>
          </select>
          <small>Fixed length trades density for decode simplicity.</small>
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={isa.privilegeModes}
            onChange={(event) => onChange({ privilegeModes: event.target.checked })}
          />
          <span>Privilege modes (user / supervisor)</span>
        </label>
      </div>

      <h3>Extensions</h3>
      <p className="muted">
        Without an extension the op class becomes a software routine, so instruction counts
        rise. Extensions are free in M5; their transistor and validation cost arrives with M6/M7.
      </p>
      <div className="extension-grid">
        {tuning.isa.extensions.map((extension) => (
          <label key={extension.id} className="extension-row">
            <input
              type="checkbox"
              checked={isa.extensions.includes(extension.id)}
              onChange={() => toggleExtension(extension.id)}
            />
            <span>
              <span className="strong">{extension.label}</span>
              <span className="extension-detail">
                {extension.description} Missing hardware ×{extension.missingHardwareFactor}.
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
