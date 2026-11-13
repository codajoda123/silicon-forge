import { useEffect, useMemo, useState } from "react";

import { getGameData, getTuning } from "../../data/gameData";
import type { ConfigValue } from "../../data/schemas";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { getActiveDesign } from "../../sim/core/state";
import { defaultAspectRatio } from "../../sim/design/blocks";
import type { DesignCommand } from "../../sim/design/commands";
import { generateLinks } from "../../sim/design/links";
import { analyzePhysical } from "../../sim/design/physical";
import type { BlockRegion } from "../../sim/design/types";
import { AutoPlacePanel } from "../components/AutoPlacePanel";
import { BlockConfigPopover } from "../components/BlockConfigPopover";
import { BlockInspector } from "../components/BlockInspector";
import { BlockPalette } from "../components/BlockPalette";
import { DesignCanvasPanel } from "../components/DesignCanvasPanel";
import { DesignSettingsPanel } from "../components/DesignSettingsPanel";
import { DesignToolbar } from "../components/DesignToolbar";
import { EstimatesPanel } from "../components/EstimatesPanel";
import { PhysicalPanel } from "../components/PhysicalPanel";
import { DesignerPerformancePanel } from "../components/perf/DesignerPerformancePanel";
import type { OverlayMode } from "../components/canvas/colors";

const data = getGameData();
const tuning = getTuning();

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function ChipDesigner() {
  const state = useGameStore((store) => store.state);
  const designPast = useGameStore((store) => store.designPast);
  const designFuture = useGameStore((store) => store.designFuture);
  const editDesign = useGameStore((store) => store.editDesign);
  const undoDesign = useGameStore((store) => store.undoDesign);
  const redoDesign = useGameStore((store) => store.redoDesign);
  const setStatus = useUiStore((store) => store.setStatus);
  const setScreen = useUiStore((store) => store.setScreen);

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [pendingConfig, setPendingConfig] = useState<Record<string, ConfigValue> | null>(null);
  const [pendingAspect, setPendingAspect] = useState<number | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [configUid, setConfigUid] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayMode>("none");
  const [regionPaintUid, setRegionPaintUid] = useState<string | null>(null);

  const design = getActiveDesign(state);
  const node = data.nodeById[design.nodeId];
  const selectedBlock = design.blocks.find((block) => block.uid === selectedUid);
  const configBlock = design.blocks.find((block) => block.uid === configUid);
  const configBlockType =
    configBlock === undefined ? undefined : data.blockById[configBlock.typeId];
  const pendingType =
    pendingTypeId === null ? undefined : data.blockById[pendingTypeId];
  const links = useMemo(() => generateLinks(design, data), [design]);
  const analysis = useMemo(
    () =>
      node === undefined
        ? null
        : analyzePhysical(design, data, tuning, {
            voltageV: design.settings.vdd,
            pipelineStages: design.settings.pipelineStages,
            cooling: design.settings.cooling,
          }),
    [design, node],
  );
  const clearPending = () => {
    setPendingTypeId(null);
    setPendingConfig(null);
    setPendingAspect(null);
    setDraftOpen(false);
  };
  useEffect(() => {
    if (selectedUid !== null && !design.blocks.some((block) => block.uid === selectedUid)) {
      setSelectedUid(null);
    }
    if (configUid !== null && !design.blocks.some((block) => block.uid === configUid)) {
      setConfigUid(null);
    }
    if (
      regionPaintUid !== null &&
      !design.blocks.some((block) => block.uid === regionPaintUid)
    ) {
      setRegionPaintUid(null);
    }
  }, [configUid, design.blocks, regionPaintUid, selectedUid]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redoDesign();
        } else {
          undoDesign();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoDesign();
        return;
      }
      if (event.key === "Escape") {
        clearPending();
        setConfigUid(null);
        setRegionPaintUid(null);
        setSelectedUid(null);
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedUid !== null) {
        event.preventDefault();
        if (editDesign({ type: "deleteBlock", uid: selectedUid })) {
          setSelectedUid(null);
          setConfigUid(null);
          setStatus("Deleted the selected block.");
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editDesign, redoDesign, selectedUid, setStatus, undoDesign]);

  if (node === undefined || analysis === null) {
    return (
      <section className="screen">
        <header className="screen-header">
          <h1>Chip Designer</h1>
          <span className="milestone-tag">M6 · performance</span>
        </header>
        <div className="panel">
          <p className="validation-message">
            This design references an unknown process node ({design.nodeId}).
          </p>
        </div>
      </section>
    );
  }

  const handleEdit = (command: DesignCommand): boolean => {
    const applied = editDesign(command);
    if (!applied) {
      return false;
    }
    if (command.type === "setLinkPipelined") {
      setStatus(
        command.pipelined
          ? "Pipelined the critical wire; its delay leaves the cycle and latency grows by one."
          : "Removed wire pipelining; the wire delay returns to the clock cycle.",
      );
    } else if (command.type === "resizeDie") {
      const updated = getActiveDesign(useGameStore.getState().state);
      const shifted = updated.blocks.filter((block, index) => {
        const before = design.blocks[index];
        return (
          before !== undefined &&
          (before.x !== block.x || before.y !== block.y)
        );
      }).length;
      setStatus(
        shifted > 0
          ? `Resized the die to ${String(updated.dieW)}×${String(updated.dieH)} and shifted ${String(shifted)} edge block${shifted === 1 ? "" : "s"} inward.`
          : `Resized the die to ${String(updated.dieW)}×${String(updated.dieH)}.`,
      );
    }
    return applied;
  };

  const handlePlace = (x: number, y: number) => {
    if (pendingTypeId === null) {
      return;
    }
    const blockType = data.blockById[pendingTypeId];
    if (
      !editDesign({
        type: "placeBlock",
        blockTypeId: pendingTypeId,
        x,
        y,
        config: pendingConfig ?? undefined,
        aspectRatio: pendingAspect ?? undefined,
      })
    ) {
      return;
    }
    const updated = getActiveDesign(useGameStore.getState().state);
    const placed = updated.blocks.at(-1);
    if (placed !== undefined) {
      setSelectedUid(placed.uid);
    }
    clearPending();
    setStatus(`Placed ${blockType?.name ?? pendingTypeId} at ${String(x)},${String(y)}.`);
  };

  const handleMove = (uid: string, x: number, y: number) => {
    if (editDesign({ type: "moveBlock", uid, x, y })) {
      setStatus(`Moved block to ${String(x)},${String(y)}.`);
    }
  };

  const handleRegionPainted = (uid: string, region: BlockRegion) => {
    if (editDesign({ type: "setBlockRegion", uid, region })) {
      setRegionPaintUid(null);
      setStatus(
        `Constrained block to region ${String(region.x)},${String(region.y)} ${String(region.w)}×${String(region.h)}.`,
      );
    }
  };

  return (
    <section className="screen designer-screen">
      <header className="screen-header">
        <h1>Chip Designer</h1>
        <span className="milestone-tag">M6 · performance</span>
      </header>

      <DesignToolbar
        design={design}
        nodes={data.nodes}
        packages={data.packages}
        canUndo={designPast.length > 0}
        canRedo={designFuture.length > 0}
        onEdit={handleEdit}
        onUndo={undoDesign}
        onRedo={redoDesign}
      />

      <DesignSettingsPanel
        design={design}
        analysis={analysis}
        onEdit={handleEdit}
        onOpenArchitectureLab={() => {
          setScreen("architectureLab");
        }}
      />

      <div className="designer-layout">
        <aside className="designer-side">
          <BlockPalette
            blocks={data.blocks}
            node={node}
            pendingTypeId={pendingTypeId}
            onChoose={(typeId) => {
              setPendingTypeId(typeId);
              setPendingConfig(null);
              setPendingAspect(null);
              setDraftOpen(false);
              setConfigUid(null);
            }}
            onConfigurePending={() => {
              setConfigUid(null);
              setDraftOpen(true);
            }}
          />
          <BlockInspector
            block={selectedBlock}
            node={node}
            regionPaintUid={regionPaintUid}
            onEdit={handleEdit}
            onConfigure={(uid) => {
              setDraftOpen(false);
              setConfigUid(uid);
            }}
            onPaintRegion={(uid) => {
              setSelectedUid(uid);
              setRegionPaintUid(uid);
              setStatus("Drag a rectangle on the grid to set this block's auto-place region.");
            }}
            onCancelRegionPaint={() => {
              setRegionPaintUid(null);
              setStatus("Cancelled region painting.");
            }}
          />
        </aside>

        <div className="designer-canvas-column">
          <DesignCanvasPanel
            design={design}
            node={node}
            links={links}
            analysis={analysis}
            overlay={overlay}
            selectedUid={selectedUid}
            pendingTypeId={pendingTypeId}
            pendingConfig={pendingConfig}
            pendingAspectRatio={pendingAspect}
            regionPaintUid={regionPaintUid}
            onOverlayChange={setOverlay}
            onSelect={(uid) => {
              setSelectedUid(uid);
              if (uid !== configUid) {
                setConfigUid(null);
              }
            }}
            onPlace={handlePlace}
            onMove={handleMove}
            onConfigure={(uid) => {
              setDraftOpen(false);
              setConfigUid(uid);
            }}
            onRegionPainted={handleRegionPainted}
          />
        </div>

        <aside className="designer-side designer-right">
          <DesignerPerformancePanel
            design={design}
            analysis={analysis}
            customWorkloads={state.customWorkloads}
            onOpenWorkloadLab={() => {
              setScreen("workloadLab");
            }}
          />
          <AutoPlacePanel
            design={design}
            onApply={(command) => {
              const applied = editDesign(command);
              if (applied && command.type === "applyDesignContent") {
                setSelectedUid(null);
                setConfigUid(null);
                setRegionPaintUid(null);
                setDraftOpen(false);
              }
              return applied;
            }}
            onStatus={setStatus}
          />
          <PhysicalPanel design={design} analysis={analysis} onEdit={handleEdit} />
          <EstimatesPanel design={design} links={links} />
          <div className="panel designer-tips">
            <h2>Physical rules</h2>
            <ul className="plan-list">
              <li>Blocks may not overlap or leave the die.</li>
              <li>BIU and I/O pads must touch the die edge.</li>
              <li>Moving ALU work away from the register file adds wire delay and lowers fMax.</li>
              <li>Spreading hot blocks lowers the hotspot; the package limit can derate the clock.</li>
              <li>Pipelining a critical wire frees the cycle but adds one cycle of latency.</li>
              <li>Auto-place keeps locked blocks fixed and honors painted regions.</li>
              <li>Same auto-place seed on the same layout gives the same result.</li>
              <li>Undo/redo keeps the last 20 floorplan edits.</li>
            </ul>
          </div>
        </aside>
      </div>

      {configBlock !== undefined && configBlockType !== undefined && (
        <BlockConfigPopover
          key={configBlock.uid}
          block={configBlock}
          blockType={configBlockType}
          node={node}
          initialAspectRatio={configBlock.w / configBlock.h}
          onClose={() => {
            setConfigUid(null);
          }}
          onApply={(config, aspectRatio) =>
            editDesign({
              type: "setBlockConfig",
              uid: configBlock.uid,
              config,
              ...(aspectRatio === null ? {} : { aspectRatio }),
            })
          }
        />
      )}

      {pendingType !== undefined && draftOpen && (
        <BlockConfigPopover
          key={`draft:${pendingType.id}`}
          block={undefined}
          blockType={pendingType}
          node={node}
          initialAspectRatio={pendingAspect ?? defaultAspectRatio()}
          onClose={() => {
            setDraftOpen(false);
          }}
          onApply={(config, aspectRatio) => {
            setPendingConfig(config);
            setPendingAspect(aspectRatio ?? defaultAspectRatio());
            return true;
          }}
        />
      )}
    </section>
  );
}
