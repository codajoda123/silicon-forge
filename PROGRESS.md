# Silicon Forge — Progress

**Plan version:** 0.3
**Repository:** `D:\ai_cpu_designer` (WSL path `/mnt/D/ai_cpu_designer`)
**Current milestone:** **M7 — Manufacturing (complete; awaiting acceptance)**
**Next milestone:** **M8 — Research & people** (not started)

---

## 1. Milestone status

| M | Scope | Status |
|---|---|---|
| **M0** | Vite + React + TS strict, folder structure, seeded RNG, `GameState`, weekly `step()`, pause/speed, top nav, save/load | **Done** |
| M1 | zod schemas, Phase 1 data, safe formula evaluator | **Done** |
| M2 | Floorplan editor | **Done** |
| M3 | Physical analysis | **Done** |
| **M4** | Auto-place | **Done** |
| **M5** | ISA & settings | **Done** |
| **M6** | Performance | **Done** |
| **M7** | Manufacturing | **Done (awaiting acceptance)** |
| M8 | Research & people | Not started (next) |
| M9 | Market & finance | Not started |
| M10 | Competitors & history | Not started |
| M11 | New game, difficulty, tutorial | Not started |
| M12 | Own fab & extras | Not started |
| M13 | Packaging & polish | Not started |

---

## 2. What M2–M7 deliver

### M7 — manufacturing

- **Process economics (Sections 11.2–11.3).** `src/sim/fab/yield.ts` implements the exact dies-per-wafer formula, D0 decay from node introduction with an optional fab skill factor, and negative-binomial die yield. Reference tests pin `diesPerWafer(50, 12) = 131`, `diesPerWafer(75, 35) = 98`, `diesPerWafer(100, 20) = 343`, the 12 mm² / D0 5 / α 2.5 yield of **0.5840** and the 35 mm² / D0 2.5 yield of **0.4722**. The Manufacturing screen shows DPW, yield, good dies/wafer, D0, node life and cost per good die with “Why?” decompositions.
- **Monte Carlo binning (Sections 11.3–11.4).** Each lot samples 500 dies from a seeded `manufacturing` RNG stream. Defects are negative-binomial, land area-weighted on blocks or whitespace, are absorbed by spare rows in repairable arrays, disable a `disableable` block when possible, and otherwise scrap the die. Frequency is sampled around the design clock with node sigma; power scales with frequency. Dies route to the highest-priced qualifying SKU unless an allocation cap deliberately down-bins them. The reserved `scrap` bin is included, so every sample and every real lot has shares summing to exactly 100 %. Sampled counts are scaled to the real wafer count with largest-remainder rounding.
- **SKU editor and auto-suggest (Section 11.4).** Auto-suggest builds three frequency tiers (Pro/Standard/Value) plus a salvage tier when the design has a disableable block (FPU or cache). The editor exposes name, minimum frequency, price, power limit, required blocks, disabled blocks and an allocation cap; applying a stack is one validated atomic command. Tape-out and erratum acceptance create a suggested stack only when none exists, so a hand-edited stack is never overwritten. A new design can prepare its stack before release.
- **Fab contracts (Sections 5.3, 11.1).** New games start with one rented contract fab for the starting node. The player can sign a reserved-capacity contract for **$300k**, **50 wafers/week**, a **9-week** lead time and a **×1.25** wafer multiplier; rented capacity is **25 wafers/week**, **12 weeks** and **×1.6**. Reserved contracts are take-or-pay and earn the lower multiplier; cash is spent immediately and the lifetime wafer count is tracked. A contract is node-specific, so changing process nodes requires new capacity.
- **Wafer lots and inventory (Section 11.8).** Lots accept 1–100 wafers subject to weekly capacity. The wafer cost is paid at start; binning, DPW, yield, cost per good die and test escapes are frozen at start, so later design edits cannot change material already in the fab. Fabrication is `max(fab.leadTimeWeeks, node.cycleWeeks)`, followed by **2 weeks** of test and packaging. The lot moves `inFab → testing → completed`, then each positive bin becomes finished-goods inventory at its frozen lot cost.
- **Test strategies and packaging (Sections 11.5–11.6).** Test strategies now carry coverage, escape rate and cost per die (`none`, `functional`, `scan`, `full-scan-bist`, `at-speed`, `burn-in`). Package cost and cooling cost are folded into cost per good die. Pin usage counts every I/O pad plus power/ground against both package and die-perimeter capacity; multiplexing saves the larger of the data/address buses. Pin overflow is surfaced on the Estimates and Manufacturing panels and **blocks tape-out** until the player multiplexes, shrinks the bus or buys a larger package.
- **Validation and bugs (Section 7.9).** Expected bugs follow the transistor/novelty/custom-instruction/control formula; the exact Poisson draw is hidden. Each week of validation raises coverage by `1 − e^(−weeks × 8 / 400)` and finds hidden bugs probabilistically; the UI shows coverage, bugs found and a remaining-bug range, never the exact count. Tape-out charges the node mask set plus **$50k** tools and **$25k** engineering even at 0 % coverage.
- **Tape-out, respin and erratum.** Remaining bugs split **60 % cosmetic / 30 % errata / 10 % serious**. Microcoded control patches half of the errata before release. Serious bugs put the tape-out in `awaitingErratumDecision`: the player can pay for a new mask set and wait **10 weeks** for a respin, or ship with an accepted erratum (reputation damage is recorded for M9). A successful respin releases the design and launches a pre-launch product.
- **Design-approval invalidation.** Any silicon edit — including undo/redo — removes validation and tape-out records but preserves products, lots and inventory. A cosmetic `renameDesign` is the only edit that keeps approval. Save format is **v5**; v1–v4 saves migrate to an initial manufacturing state with the starting rented contract.
- **Integration and UI.** The weekly tick advances validation, lot status and respin completion deterministically. `Manufacturing` and `Validation` replace their placeholders with stats/Why panels, contract signing, product-stack editing, wafer starts/lot history, inventory and validation/tape-out actions. All manufacturing commands are pure and delegated through `applyManufacturingCommand`; no React or `Math.random` enters the simulation.

### M6 — performance

- **Instruction count is unchanged.** M6 consumes the M5 `buildInstructionBreakdown`; the new `buildCpiStack` adds only cycles. Every component is additive, and the panel/chart show the same seven keys: core/issue, structural, hazards, branch, memory, custom, bus bandwidth.
- **Core CPI.** Non-pipelined designs use the archetype's `microcodeCyclesPerClass × controlFactor` (hardwired 1.0, microcoded 1.5). Pipelined designs use `1 / min(issueWidth, max(1, ILP))`, where `ILP = workload.ilpMax × (1 − e^(−window/ilpScale))`; the M6 tuning has one-wide in-order issue and no OoO window yet.
- **Structural, hazard and branch.** Execution-unit capacity is resolved from the placed blocks' new `unitFor` tags (ALU, shifter, multiplier, divider, FPU, custom unit, load/store, branch). Structural CPI is `max(0, busiestUnitLoad − issueCPI)`; hazards use `depProb`, per-class latency, pipeline friendliness and OoO hiding; branch accuracy is `base + scale × predictability`, capped, with a `pipelineStages` mispredict penalty only when a pipeline exists.
- **Memory (Section 9.4).** `src/data/memoryLatency.json` provides 600/250/120/70 ns at 1971/1980/1990/2000, linearly interpolated. The miss-rate law is `m0 × sizeKB^(−0.5) × associativityFactor`, with a compulsory floor and a 1.0 miss rate with no cache. Wait cycles are `max(0, ceil(latency/cycle) − 1)`; bus transfer and multiplexing extras apply **only when that wait is positive**, so a cache cannot buy time at 1 MHz. The largest placed cache of each kind is used; prefetch hides `min(cap, queueBytes/bytesPerInstr × factor)` of instruction fetches. Bandwidth adds a CPI floor only when the bus cannot carry the required bytes.
- **FPS (Section 10.3).** `cpuFrameMs = instructions × CPI / (clock × 1000) + fixedOverheadMs`; the frame is `max(CPU, GPU)` and the FPS is clamped by `frameCapHz`. Memory stalls are already inside CPI, so the frame formula adds **no second memory term**. The 4004 reference renders Galaxy Raiders at **4.1 FPS**; the 1985 reference reaches the 60 Hz cap.
- **Uncertainty (Section 9.6).** Relative error is `baseModelError + validationWeight × (1 − testCoverage) + compilerWeight × (1 − compilerMaturity) + workload.variance`; custom instructions blend compiler maturity toward hand-written compiler support by custom reliance. The panel shows the top two reasons, coverage, compiler maturity and the MIPS/FPS ranges.
- **Workload Lab (Sections 10.1–10.5).** Full profile list (10 built-ins, plus custom), operation mix, pattern shares, duplicate, edit, delete, JSON import (single profile or array) and JSON export. Custom profiles live in `GameState.customWorkloads`; they are schema-validated against the same workload shape, cannot shadow built-ins, and are persisted in save v4. The benchmark table runs every company design against the selected profile.
- **UI.** The Chip Designer's Performance panel is first in the right column: workload selector, effective clock/target/fMax/thermal derate, MIPS with ± range, FPS or throughput, CPI, the additive CPI stack chart (pure CSS, no new library), cache/miss/prefetch/bus details, confidence and a “Why?” disclosure. The Workload Lab replaces the M5 placeholder; the editor exposes identity, all 13 op classes, all custom-instruction patterns, footprint, memory, branch, ILP, variance, frame cap and GPU frame time. Screenshots: `artifacts/m6-performance.png`, `artifacts/m6-performance-1985.png`, `artifacts/m6-workload-lab.png`, `artifacts/m6-workload-editor.png`, `artifacts/m6-workload-benchmark.png`.
- **Calibration (Section 9.7).** `tests/calibration/referenceDesigns.ts` builds six deterministic reference chips and `tests/calibration/calibration.test.ts` asserts ±35 % clock, ±35 % MIPS and ±30 % die area. Actual results: 4004 **0.57 MHz / 0.046 MIPS / 12.59 mm²**; 8080 **1.50 / 0.169 / 18.98**; 8086 **3.45 / 0.505 / 28.26**; 286 **6.36 / 0.973 / 52.23**; 386 **17.43 / 8.016 / 108.17**; 486 **33.58 / 17.848 / 151.34**. The 386/486 use the new active **fan + heatsink** option; without it the 1.5 µm/1 µm parts thermal-derate below their historical clocks.
- **Calibration-driven content fixes.** I/O pads now scale with all data/address/control pins; the bus interface includes bus width, multiplexing and prefetch queue; microcoded decoders include microcode storage; execution blocks carry `unitFor` tags; node densities were uniformised to 0.10 mm²/tile; 10 µm/6 µm/3 µm gate delays and 1 µm static power were adjusted; the 1971 Galaxy Raiders operation counts were scaled to the calibration frame budget. The M4 reference fixtures were re-packed around the new footprints and the auto-place thresholds remain green.

### M5 — ISA & settings

- **Architecture Lab is a screen, not a placeholder.** It edits the active design's ISA and shows the Section 9.4 step-1 instruction breakdown immediately after every change. The designer also gained a full-width **Design settings** panel (Section 7.6) above the floorplan.
- **Archetypes (Section 8.1):** the four Phase 1 lineages (Accumulator CISC, Register-memory CISC, Load/store RISC, Stack machine) are selectable cards with historical descriptions, strengths and weaknesses. Selecting one resets every parameter to that archetype's defaults in `isas.json`; custom instructions stay selected. The default new game picks the newest archetype at the start year.
- **ISA parameters (Section 8.2):** datapath width (4/8/16/32), register count (2/4/8/16/32), address width (8–32), addressing modes (1–12), fixed/variable instruction length, privilege modes and four extensions (multiply, divide, BCD adjust, floating point). Every range is `tuning.isa`, not a hard-coded UI list.
- **Instruction count (Section 9.4 step 1):** `buildInstructionBreakdown` decomposes each workload into `base = ops × opsToInstr`, width passes `ceil(operandBits / datapathWidth)`, missing-hardware software routines, register spills and address-space shortfall, then subtracts custom-instruction removal. The table shows every workload and an op-class detail table for the selected one. Changing archetype, width or registers visibly changes these rows.
- **Register pressure:** a workload's live-register demand is `ceil(ilpMax × registersPerIlp + baseWorkingRegisters)`; a smaller register file adds spill traffic to load/store instructions. This is the mechanism that makes the register-count acceptance criterion real instead of cosmetic.
- **Custom instructions (Section 8.3):** the full 11-instruction catalog is selectable, with pattern, `k`, latency, transistors, compiler effort, validation weight, patent risk and the workloads that carry its pattern. Removed instructions use `c × compilerSupport × totalOps × (1 − 1/k)`; compiler support is a tuning-level 30 % (hand-written libraries) until M8. Workloads without the pattern get nothing.
- **Opcode budget:** the archetype's 8-bit primary opcode space is extended by `opcodeSpaceMultiplier = 4` prefix pages (32 bits). Each catalog instruction costs 8 bits. Four fit; the fifth overflows by 8 bits and adds **1 byte per instruction** to every encoded instruction, visible as higher `bytes/instr` and code size. More overflow adds another byte per full opcode space.
- **Encoding size:** fixed-length ISAs use `ceil(wordBits / 8)` bytes; variable-length ISAs start from `archetype.bytesPerInstr`, scale with `(wordBits / 8)^0.5` and shrink with addressing-mode density. Opcode overflow bytes are added on top, and code size is `instructions × bytesPerInstruction`.
- **Design settings (Section 7.6 Phase 1):** target clock, supply voltage, pipeline stages (1–5), control style, cooling, test strategy, spare rows, bus multiplexing and prefetch queue. **Vdd, pipeline depth and cooling are already wired into `analyzePhysical`**, so the physical panel updates live (higher Vdd → higher fMax, deeper pipeline → higher fMax, heatsink → lower hotspot). Target clock is compared against fMax/sustained clock and shown as an over-target warning.
- **Single source of truth:** package stays the existing top-level `packageId` (edited in both toolbar and settings panel). Cache size/line/associativity and the on-chip clock generator remain block configs on the floorplan; the settings panel shows their count and says so. Test strategy, redundancy, bus mode and prefetch are persisted now and feed M6/M7 models.
- **Commands and validation:** `setIsa`, `setIsaArchetype`, `setDesignSettings` and `setCustomInstructions` are pure design commands. Invalid width/register/address/mode values, unknown extensions, duplicate custom ids, Vdd outside the node range, target clock outside tuning, bad pipeline depth and unknown cooling/test ids are rejected atomically. Switching process node clamps Vdd into the new node's range.
- **Persistence:** save format is **v3**. Version 2 designs migrate by adding ISA defaults inferred from the design's process-node year plus node-default settings; v1 still migrates through the default design path. Save validation rejects unknown archetypes, custom instructions, invalid settings and duplicate custom ids.
- **Presets carry an era-correct ISA:** `buildPresetDesign` gives each preset the ISA defaults for its historical year. Applying a preset from auto-place now passes its ISA/settings/custom instructions through `applyDesignContent`, so a 1985 preset does not keep a 1971 accumulator ISA.
- **UI smoke:** Chromium CDP drove the real controls. Changing width 4 → 16 and registers 4 on Calculator math changed the row from `310.8 instructions / 1.00 B per instr` to `157.4 / 1.99 B`; selecting the first five custom instructions showed `40 / 32 bits`, `Over budget by 8 bits → encoding grows by 1 byte`, and the row moved to `151.45 instructions / 2.99 B per instr / 453.45 B code`. No page exceptions.

### M4 — auto-place

- **Simulated annealing:** `src/sim/design/autoplace.ts` moves unlocked blocks one at a time, optionally swapping their footprint orientation, using a Metropolis acceptance rule. Every proposal is legally constrained: it must stay inside the die, avoid overlap, honour edge-only blocks and stay inside painted regions. The best layout seen is kept, so the result is never worse than the starting layout under the search objective.
- **Cost function (Section 7.8):** `src/sim/design/autoplaceCost.ts` evaluates
  `wire + congestion + heat + area + edge` with the plan’s structure. Critical link length is weighted by bit width; RUDY tile demand comes from every link; heat uses a Jacobi tile-grid proxy on block power; area uses the block bounding-box fraction of the die; edge violations carry the `1e6` penalty. Terms are normalised by `[T]` scales in `tuning.json` so the weights are meaningful.
- **Three modes:** Performance, Power / thermal and Area / cost each provide their own wire/congestion/heat/area/edge weights. The selected mode changes the layout, not just the panel label.
- **Locks:** locked blocks are excluded from the proposal set and are reported as anchors. The atomic layout command also rejects any attempt to move a locked block.
- **Regions:** each placed block can carry an optional axis-aligned `region`. Regions are painted by dragging on the canvas, constrain manual moves, rotations, config-driven resizes and auto-place, and are persisted in saves. Edge-only regions must touch the die edge.
- **Deterministic seed:** a seeded `autoplace` RNG stream drives every proposal. The same seed on the same layout returns an identical layout and report; the UI exposes the seed. The game RNG state is not consumed by this pure, UI-triggered calculation.
- **Iteration budget:** `2000 × edaLevel` iterations (Section 7.8). `edaLevel` defaults to 1 until M8 research exists; the option is already part of the API.
- **Report:** the exact final layout (full 60-iteration thermal solve) reports initial/final cost, improvement %, moved blocks, anchors, hotspot and the top three weighted cost contributors with shares and details.
- **UI:** the Chip Designer gains an Auto-place panel (design preset, mode, seed, run button, report), region painting in the block inspector, an amber dashed region overlay and a legend entry. Applying a custom result goes through the pure `setBlockPlacements` design command; applying a preset goes through `applyDesignContent`. Both are one undo step.
- **Processor presets:** the Design dropdown offers four complete processor designs from `src/data/designPresets.json`: 1971 Calculator, 1974 8-bit Consumer, 1978 16-bit and 1985 32-bit with caches. Each preset selects the node, package, die and full block/config set. Auto-place builds a deterministic first-fit legal layout from the selected parts and then runs the same annealing search. The preset path intentionally rebuilds the design and clears locks/regions; Custom mode keeps the existing lock/region semantics.
- **Die resize:** shrinking the die width or height automatically shifts edge-only blocks (I/O pads, bus interface) inward along the shrinking axis by the overflow amount, keeping them on the new edge and avoiding a delete/re-place cycle. The shift is accepted only if the entire resulting design stays legal; overlaps or a block wider than the new die reject the resize atomically. Expansion does not move blocks.
- **Acceptance fixtures:** five fixed reference layouts live in `tests/design/autoplaceFixtures.ts` (1971 calculator, 1974 8-bit consumer, 1978 16-bit, 1985 32-bit with caches, 1985 wide thermal design). Auto-place scores 86.9%, 87.6%, 88.5%, 86.7% and 92.7% of the reference cost respectively, and beats three independent random legal layouts per design. The references deliberately use hand-chosen aspect ratios, which auto-place cannot change (it only rotates), so a skilled layout can still win.

### M3 — physical analysis

- **Wire lengths:** every auto-generated link is measured from block-centre to block-centre with Manhattan geometry. The congestion estimate adds a detour multiplier, and the resulting per-wire delay is shown (length, ps, bits, detour) in the physical panel.
- **Timing paths → fMax:** `src/data/timingPaths.json` defines six templates (execute loop, decode→execute, fetch→decode, fetch→bus, microcode, bus→pads) with `link` or implicit `wire` legs. The analysis enumerates matching block instances, applies gate logic depth, voltage scaling, wire delay, latch overhead and clock skew, and reports fMax plus the limiting path, its stages, legs and latency.
- **Pipelining:** critical wires can be toggled from the wire list. Pipelining removes that wire's delay from the cycle and adds one cycle of latency; the command rejects non-critical links.
- **Power:** dynamic power uses workload-weighted switching activity from the reference `calculator-math` workload, capacitance, voltage² and the sustained clock; static power scales with transistor count and voltage; I/O power scales per active pad.
- **Thermal grid:** a steady-state tile-grid solve (Section 9.3 Jacobi) using package vertical conductance and lateral spreading. The hotspot, average, margin, per-block contributions and “Why?” list are derived from the same grid, so contributions sum to the hotspot rise. If the junction limit is exceeded, the clock is derated and power/thermal are re-solved.
- **RUDY congestion:** each link adds `widthBits × (w + h) / (w × h)` demand to every tile in its bounding box; tiles report demand, overflow, peak ratio and a “Why?” list. Average overflow in a link's box feeds its detour.
- **Overlays:** Floorplan, Heat, Wires, Congestion and Timing modes render on the same canvas, with legends, a hotspot marker and timing-path stage outlines.
- **“Why?” disclosures:** sustained clock (timing contributors), power (per-block) and hotspot (per-block temperature rise) each have an expandable list with shares and details, plus a congestion breakdown.
- **Responsiveness:** physical analysis is memoized per design and the full 30×30 all-block acceptance design recomputes in under 50 ms (tested).

### M2 — floorplan editor

- **Floorplan canvas:** HTML Canvas 2D grid with a visible pad ring, tile grid, link overlay and block labels. The canvas fits the largest 40×40 die and maps pointer coordinates through its CSS-scaled backing store.
- **Block palette:** all 17 Phase 1 block types with their default footprint and transistor count; click a block, then click a tile to place it. `Configure…` opens the block config/aspect popover before placement. Placement preview turns green/red for valid/invalid tiles.
- **Place / move / rotate / delete / lock:** drag to move, inspector buttons for rotation, locking and deletion, keyboard Delete/Backspace, and a lock state that rejects every edit command until unlocked.
- **Block configuration popover:** typed controls generated from `configSchema` (enum, integer, boolean), aspect-shape buttons (Square/Wide/Tall), live transistor/tile/footprint preview, and validation before applying. It works both on placed blocks and as a pre-placement draft from the palette; the draft only stores pending config/aspect until placement, so it creates no undo entry. A config change may resize the block; the command is rejected if the new footprint would overlap or leave the die.
- **Die and process controls:** resizable die (3×3 to 40×40 tiles) and process-node/package selection. Shrinking the die or changing node is rejected if existing blocks would overlap, leave the die, or strand an edge-only block.
- **Auto-generated links:** links come from block `requiredLinks`, not hand routing. Every matching destination instance gets a link; width is evaluated from the source block's config; critical/normal/relaxed links use distinct canvas styles.
- **Estimates:** total transistor count, die area with core/pad-ring/scribe breakdown, tile utilization/whitespace, link counts and pin usage against both package and perimeter capacity.
- **Undo/redo:** immutable design snapshots with a tuned 20-step limit, toolbar buttons and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y shortcuts. History is UI-session state and is cleared by load/import/new game.
- **Persistence:** `GameState.designs[]` + `activeDesignId`; design edits flow through the pure `editDesign` command. Save format is v2; v1 saves migrate by adding an empty default design for the save's start year.

---

## 3. What M0 delivers

- **Stack:** Vite 8 + React 19 + TypeScript 5.9 (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`), Zustand 5, zod 4, idb-keyval 6, Vitest 5.
- **Pure simulation core** in `src/sim/core/` with no React/DOM/`Date`/`Math.random` imports.
- **Seeded RNG:** mulberry32 with independently derived named streams and a serializable snapshot stored in `GameState.rng`.
- **Game state:** `version`, `week`, `seed`, `settings`, `companies`, `eventSeq`, `rng`, `log`; M2 adds `designs` and `activeDesignId`.
- **Weekly tick:** `step(state, commands)` advances exactly one week, applies commands first, emits a year-change event at every calendar boundary, and caps the event log.
- **Commands:** `setCompanyName` flows through a pure reducer. The UI can dispatch immediately while paused; `step()` also accepts a command batch for headless runs.
- **Clock UI:** 0/1/2/5/20× speeds, pause/resume, keyboard shortcuts (`Space`, `+`/`-`, `1`–`9`).
- **Top navigation:** all 12 screens from Section 15.1; 10 are explicit placeholders, Dashboard and Settings are functional.
- **Save/load:** browser save in IndexedDB, JSON export/import, auto-load on startup (paused), zod-validated save format (currently v2; M0 shipped v1).
- **Data validation:** every JSON file is parsed by a zod schema at startup; M0 originally validated only `tuning.json`, M1 extends this to all Phase 1 files.

### How to run (Windows)

```bat
cd /d D:\ai_cpu_designer
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

```bat
npm test
npm run typecheck
npm run build
```

---

## 4. Files created

### Root / config
```
package.json
tsconfig.json
vite.config.ts
vitest.config.ts
index.html
.gitignore
PROGRESS.md
```

### Data
```
src/data/tuning.json
src/data/nodes.json
src/data/blocks.json
src/data/packages.json
src/data/isas.json
src/data/customInstructions.json
src/data/workloads.json
src/data/timingPaths.json
src/data/memoryLatency.json
src/data/opClass.ts
src/data/tuningSchema.ts
src/data/timingValidation.ts
src/data/schemas.ts
src/data/autoplaceTuning.ts
src/data/presetSchema.ts
src/data/designPresets.json
src/data/load.ts
src/data/validation.ts
src/data/gameData.ts
src/data/formula/errors.ts
src/data/formula/tokenize.ts
src/data/formula/parse.ts
src/data/formula/evaluate.ts
src/data/formula/index.ts
```

### Simulation core (pure)
```
src/sim/core/rng.ts
src/sim/core/time.ts
src/sim/core/events.ts
src/sim/core/state.ts
src/sim/core/commands.ts
src/sim/core/step.ts
src/sim/core/save.ts
src/sim/core/saveErrors.ts
src/sim/core/saveSchemas.ts
src/sim/core/saveValidation.ts
src/sim/core/hash.ts
```

### Design (pure)
```
src/sim/design/types.ts
src/sim/design/blocks.ts
src/sim/design/floorplan.ts
src/sim/design/links.ts
src/sim/design/area.ts
src/sim/design/geometry.ts
src/sim/design/congestion.ts
src/sim/design/timing.ts
src/sim/design/timingTypes.ts
src/sim/design/timingClock.ts
src/sim/design/timingPaths.ts
src/sim/design/timingWhy.ts
src/sim/design/thermal.ts
src/sim/design/physical.ts
src/sim/design/defaults.ts
src/sim/design/commands.ts
src/sim/design/commandResult.ts
src/sim/design/layoutCommands.ts
src/sim/design/contentCommands.ts
src/sim/design/configCommands.ts
src/sim/isa/types.ts
src/sim/isa/defaults.ts
src/sim/isa/params.ts
src/sim/isa/opcode.ts
src/sim/isa/instructionCount.ts
src/sim/design/autoplace.ts
src/sim/design/autoplaceCost.ts
src/sim/design/autoplaceTypes.ts
src/sim/design/presets.ts
src/sim/design/history.ts
src/sim/explain/why.ts
src/sim/perf/power.ts
src/sim/perf/types.ts
src/sim/perf/cpi.ts
src/sim/perf/memory.ts
src/sim/perf/fps.ts
src/sim/perf/uncertainty.ts
src/sim/perf/performance.ts
src/sim/perf/workloads.ts
```

### Manufacturing (pure)
```
src/sim/fab/types.ts
src/sim/fab/analysis.ts
src/sim/fab/statistics.ts
src/sim/fab/yield.ts
src/sim/fab/test.ts
src/sim/fab/skus.ts
src/sim/fab/binning.ts
src/sim/fab/validation.ts
src/sim/fab/wafer.ts
src/sim/fab/state.ts
src/sim/fab/step.ts
src/sim/fab/commandTypes.ts
src/sim/fab/commandHelpers.ts
src/sim/fab/commands.ts
src/sim/fab/contractCommands.ts
src/sim/fab/productCommands.ts
src/sim/fab/approvalCommands.ts
src/sim/fab/waferCommands.ts
src/sim/fab/approval.ts
```

### Store / persistence
```
src/store/gameStore.ts
src/store/uiStore.ts
src/store/persistence.ts
src/store/fileIO.ts
```

### UI
```
src/main.tsx
src/App.tsx
src/index.css
src/ui/styles/base.css
src/ui/styles/nav.css
src/ui/styles/screens.css
src/ui/styles/designer.css
src/ui/styles/autoplace.css
src/ui/styles/isa.css
src/ui/styles/settings.css
src/ui/styles/performance.css
src/ui/styles/manufacturing.css
src/ui/navigation.ts
src/ui/format.ts
src/ui/ScreenView.tsx
src/ui/hooks/useGameClock.ts
src/ui/hooks/useKeyboardShortcuts.ts
src/ui/components/TopNav.tsx
src/ui/components/SpeedControls.tsx
src/ui/components/StatusBar.tsx
src/ui/components/Placeholder.tsx
src/ui/components/FloorplanCanvas.tsx
src/ui/components/canvas/colors.ts
src/ui/components/canvas/draw.ts
src/ui/components/canvas/regions.ts
src/ui/components/StatWithWhy.tsx
src/ui/components/PhysicalPanel.tsx
src/ui/components/AutoPlacePanel.tsx
src/ui/components/DesignCanvasPanel.tsx
src/ui/components/BlockConfigPopover.tsx
src/ui/components/BlockInspector.tsx
src/ui/components/BlockPalette.tsx
src/ui/components/DesignToolbar.tsx
src/ui/components/EstimatesPanel.tsx
src/ui/components/NumberField.tsx
src/ui/components/DesignSettingsPanel.tsx
src/ui/components/isa/OpcodeBudgetBar.tsx
src/ui/components/isa/ArchetypePicker.tsx
src/ui/components/isa/IsaParamsPanel.tsx
src/ui/components/isa/CustomInstructionPanel.tsx
src/ui/components/isa/InstructionBreakdownPanel.tsx
src/ui/components/perf/CpiStackChart.tsx
src/ui/components/perf/PerformancePanel.tsx
src/ui/components/perf/DesignerPerformancePanel.tsx
src/ui/components/perf/WorkloadEditor.tsx
src/ui/components/perf/WorkloadFormSections.tsx
src/ui/components/perf/WorkloadList.tsx
src/ui/components/perf/WorkloadBenchmarkTable.tsx
src/ui/components/fab/ManufacturingStatsPanel.tsx
src/ui/components/fab/FabContractsPanel.tsx
src/ui/components/fab/ProductStackPanel.tsx
src/ui/components/fab/WaferStartPanel.tsx
src/ui/components/fab/InventoryPanel.tsx
src/ui/components/fab/ValidationPanel.tsx
src/ui/screens/Dashboard.tsx
src/ui/screens/ChipDesigner.tsx
src/ui/screens/ArchitectureLab.tsx
src/ui/screens/Validation.tsx
src/ui/screens/Manufacturing.tsx
src/ui/screens/Research.tsx
src/ui/screens/Market.tsx
src/ui/screens/Marketing.tsx
src/ui/screens/Competitors.tsx
src/ui/screens/Finance.tsx
src/ui/screens/WorkloadLab.tsx
src/ui/screens/Settings.tsx
src/ui/screens/DataErrorScreen.tsx
```

### Tests
```
tests/unit/rng.test.ts
tests/unit/time.test.ts
tests/unit/step.test.ts
tests/unit/save.test.ts
tests/unit/hash.test.ts
tests/unit/formula.test.ts
tests/unit/designBlocks.test.ts
tests/unit/designFloorplan.test.ts
tests/unit/designLinks.test.ts
tests/unit/designArea.test.ts
tests/unit/designCommands.test.ts
tests/unit/designHistory.test.ts
tests/unit/why.test.ts
tests/unit/congestion.test.ts
tests/unit/timing.test.ts
tests/unit/power.test.ts
tests/unit/thermal.test.ts
tests/unit/physicalAnalysis.test.ts
tests/unit/autoplace.test.ts
tests/unit/autoplaceCost.test.ts
tests/unit/autoplaceCommands.test.ts
tests/unit/designPresets.test.ts
tests/unit/isaConfig.test.ts
tests/unit/isaInstructionCount.test.ts
tests/unit/isaOpcodeBudget.test.ts
tests/unit/designSettings.test.ts
tests/unit/cpi.test.ts
tests/unit/memoryModel.test.ts
tests/unit/performance.test.ts
tests/unit/uncertainty.test.ts
tests/unit/workloads.test.ts
tests/unit/manufacturingYield.test.ts
tests/unit/manufacturingBinning.test.ts
tests/unit/manufacturingFlow.test.ts
tests/calibration/referenceDesigns.ts
tests/calibration/calibration.test.ts
tests/design/helpers.ts
tests/design/autoplaceFixtures.ts
tests/design/autoplaceFixtureData.ts
tests/data/helpers.ts
tests/data/dataValidation.test.ts
tests/data/phase1Content.test.ts
tests/determinism/determinism.test.ts
```

**File-size rule (Section 19.7):** every TypeScript source and test file is under 400 lines. The largest code file is now `src/ui/screens/ChipDesigner.tsx` at 399 lines, followed by `canvas/draw.ts` at 398; M3 split `timing.ts` and `load.ts`, M4 split layout commands into `layoutCommands.ts`, M5 split ISA/settings commands into `configCommands.ts` and preset/content application into `contentCommands.ts`, M6 split performance schemas/validation (`opClass.ts`, `tuningSchema.ts`, `timingValidation.ts`), the Workload Lab (`WorkloadList`, `WorkloadEditor` + form sections, `WorkloadBenchmarkTable`) and the fixture layout data, and M7 split manufacturing commands into `contractCommands.ts`, `productCommands.ts`, `approvalCommands.ts`, `waferCommands.ts`, `commandHelpers.ts`, `commandTypes.ts` and `approval.ts`, and split save schemas/validation into `saveSchemas.ts`, `saveValidation.ts` and `saveErrors.ts`. **Non-code** files exceed 400 lines and are exempt: `src/ui/styles/designer.css`, `src/ui/styles/performance.css`, `src/ui/styles/manufacturing.css`, `PROGRESS.md`, `src/data/blocks.json` and `src/data/isas.json`. CSS is split when a screen family grows enough to justify a new stylesheet; content JSON is data, not logic.

---

## 5. Tests and acceptance mapping

| Acceptance criterion | Tests / evidence |
|---|---|
| App runs | Production build succeeds; dev server rendered in Chromium with zero console errors; screenshots taken |
| Clock advances weeks | `tests/unit/time.test.ts` (calendar math), `tests/unit/step.test.ts` (one week per call, year boundary); browser check at 20× and 1× |
| Save → reload → identical state | `tests/unit/save.test.ts` (serialize/deserialize deep equality); browser check: saved week 107 → page reload → auto-loaded week 107, paused |
| Determinism test passes | `tests/determinism/determinism.test.ts`: 520 weeks twice with scheduled commands → identical hash; save/load at week 200 then continue 320 weeks → identical hash |
| RNG unit tests pass | `tests/unit/rng.test.ts`: same seed/stream, seed separation, stream independence, snapshot restore, ranges, `chance`, `pick`, invalid inputs |
| **M1:** all data files validate at startup with clear errors | `tests/data/dataValidation.test.ts` loads the bundle, checks duplicate IDs, link targets, malformed formulas, negative formulas, unknown workload patterns, missing files, and aggregated error reports; browser check with a deliberately corrupted `nodes.json` showed the error screen instead of the app |
| **M1:** formula evaluator tested, no `eval` | `tests/unit/formula.test.ts` (14 tests): precedence, powers/unary, functions, comparisons, lazy ternary, strings, type errors, non-finite results, malformed input, arity, nesting, length; injection attempts are rejected; source scan asserts no `eval(`/`new Function(` |
| **M1:** Phase 1 content present | `tests/data/phase1Content.test.ts`: 9 nodes, 17 blocks, 4 packages, 4 ISA archetypes, 11 custom instructions, 10 workloads; every block formula evaluates for its defaults; all op classes costed |
| **M2:** canvas grid + pad ring, palette, place/move/rotate/delete/lock | `tests/unit/designFloorplan.test.ts` covers placement, movement, rotation, locking (all edit commands rejected), deletion, die bounds and deterministic uids; browser smoke test placed, selected, rotated, locked/unlocked and deleted blocks on the canvas |
| **M2:** block config popover | `tests/unit/designBlocks.test.ts` validates typed config/defaults and footprint changes; `tests/unit/designFloorplan.test.ts` checks config-driven resize and atomic config+aspect; browser smoke opened `Configure…` before placement, changed ALU width 8 → 16 and shape Square → Wide (356 tr / 8 tiles / 3×3 → 532 / 11 / 3×4 → 4×3), applied without creating a history entry, then placed the configured 4×3 / 532 tr block; undo, redo and reselect preserved it |
| **M2:** die resize | `tests/unit/designFloorplan.test.ts` accepts a legal shrink and rejects out-of-range or block-stranding resizes; browser smoke shrinking 10×10 → 8×8 was rejected because the BIU would no longer fit |
| **M2:** auto-generated links | `tests/unit/designLinks.test.ts`: one link per matching destination instance, unique ids, config-derived widths, timing-class counts; links render on the canvas with critical/normal/relaxed styles |
| **M2:** transistor count + die area | `tests/unit/designArea.test.ts`: sums block formulas, tile usage, core/pad-ring/scribe area, package/perimeter pin limits; estimates panel rendered 448 tr and 36.30 mm² in the browser smoke test |
| **M2:** build the 1971 example by hand | `tests/unit/designCommands.test.ts` places the six Section 7.11 block types on a 10×10 die (decoder, pads, BIU, register file, PC, ALU) and validates geometry plus 6 critical / 1 normal link |
| **M2:** overlapping placement blocked | `tests/unit/designFloorplan.test.ts` and `tests/unit/designCommands.test.ts` both reject an overlapping placement and leave the previous design unchanged; browser smoke showed `Placement overlaps program-counter (block-1)` |
| **M2:** edge-only rule enforced | `tests/unit/designFloorplan.test.ts` rejects interior placement and movement of the edge-only BIU and rejects a die resize that strands it; browser smoke showed `This block is edge-only and must touch the die edge.` |
| **M2:** undo/redo (20 steps) | `tests/unit/designHistory.test.ts` proves the 20-snapshot cap, LIFO undo, redo order, and redo-stack clearing; browser smoke undid/redid block placement; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are wired in `ChipDesigner` |
| **M2:** design persistence | `tests/unit/save.test.ts` round-trips a floorplan, migrates v1 saves by adding a default design, and rejects unknown references; browser smoke saved v2 and reloaded the same design paused |
| **M3:** moving the ALU away from the register file lowers fMax | `tests/unit/physicalAnalysis.test.ts` and `tests/unit/timing.test.ts` compare near/far placements on a 30×30 die; wire length and detour rise, so the limiting-path cycle lengthens and fMax falls |
| **M3:** spreading hot blocks lowers the hotspot | `tests/unit/thermal.test.ts` and `tests/unit/physicalAnalysis.test.ts` compare adjacent vs. separated ALUs; lateral spreading lowers the peak temperature |
| **M3:** heat, wires, congestion and timing overlays render | Browser smoke placed RF + ALU + decoder + PC, switched all five overlay modes, verified each became active, and captured a heat-overlay screenshot (`/tmp/opencode/chip-designer-m3.png`); canvas produced a non-empty bitmap |
| **M3:** recompute under 50 ms on a 30×30 die | `tests/unit/physicalAnalysis.test.ts` times a full 17-block, 30×30 `analyzePhysical` call after a warm-up and asserts `< 50 ms` |
| **M3:** wire lengths and critical-link pipelining | `tests/unit/timing.test.ts` checks wire lengths, detours, pipelined legs and +1 latency; `tests/unit/designCommands.test.ts` toggles only critical links; the wire list exposes the same toggle in the browser |
| **M3:** timing path → fMax with limiting path | `tests/unit/timing.test.ts`: execute loop, data-driven leg kinds, voltage scaling, pipeline stages, clock-generator skew source and empty-design zero fMax; the panel shows the limiting path name, stages and latency |
| **M3:** power model | `tests/unit/power.test.ts`: workload-weighted dynamic power, voltage²/frequency scaling, static power at zero clock, and per-active-pad I/O power |
| **M3:** thermal grid + derate | `tests/unit/thermal.test.ts` checks ambient-only, hotspot rise, Why shares summing to the rise, spreading and junction margin; `tests/unit/physicalAnalysis.test.ts` forces a 30 °C limit and verifies sustained clock < fMax with power re-solved at the derated clock |
| **M3:** RUDY congestion | `tests/unit/congestion.test.ts`: zero demand without links, `widthBits × (w + h) / (w × h)` demand, overflow/detour values and congested-tile “Why?” rows |
| **M3:** “Why?” for clock, power and temperature | `tests/unit/why.test.ts` covers ordering, share normalization and “Other”; `tests/unit/physicalAnalysis.test.ts` asserts all three share lists sum to 1; browser smoke opened an enabled Why list (7 rows) |
| **M3:** timing-path data validation | `tests/data/phase1Content.test.ts` validates the six templates; `tests/data/dataValidation.test.ts` rejects unknown block types, wrong leg counts, missing critical links and duplicate template ids |
| **M4:** five reference designs score 75–95% of the reference | `tests/unit/autoplace.test.ts` is parameterized over `AUTOPLACE_FIXTURES`; the 1971/1974/1978/1985/1985-thermal fixtures score **82.5, 78.5, 87.2, 82.4, 86.4%** against a fixed performance-mode scoring context. Each reference is a fixed layout in `tests/design/autoplaceFixtures.ts`; the score is `100 × referenceCost / autoCost` |
| **M4:** auto-place always beats random placement | The same acceptance tests build three independent random legal layouts per fixture (seeds 201–203) and assert `autoCost < randomCost` for every one. Costs are compared in the same context as the reference |
| **M4:** same seed → same layout | `tests/unit/autoplace.test.ts` runs the same start layout twice with seed 1234 and asserts identical blocks and report; a different seed is asserted to change the layout |
| **M4:** locks are respected | `tests/unit/autoplace.test.ts` locks two blocks, runs auto-place, and asserts both blocks are byte-for-byte unchanged and `report.lockedBlocks = 2`; `tests/unit/autoplaceCommands.test.ts` rejects a layout that moves a locked block |
| **M4:** regions constrain auto-place | `tests/unit/autoplace.test.ts` paints two regions through the real command, runs auto-place and checks every constrained block remains inside its region; `tests/unit/autoplaceCommands.test.ts` covers setting/clearing regions, malformed regions, manual movement and atomic layout application |
| **M4:** report | `tests/unit/autoplace.test.ts` asserts a finite initial/final cost, a positive improvement, at most three reasons, positive shares whose total is ≤ 1, and non-empty detail text; the UI smoke test rendered the report with mode, seed, cost, improvement, moved, anchors, hotspot and top reasons |
| **M4:** three modes | `tests/unit/autoplace.test.ts` asserts thermal weights raise the heat term while lowering the wire term, area weights raise the area term, thermal mode ends at a lower hotspot than performance mode, and area mode produces a smaller bounding box |
| **M4:** cost formula | `tests/unit/autoplaceCost.test.ts` checks critical-only wire weighting, bounding-box area, edge-only penalty, RUDY overflow, target-temperature clamping and relative scoring |
| **M4:** one undoable layout command | `tests/unit/autoplaceCommands.test.ts` applies a whole auto-place layout through `setBlockPlacements`, rejects overlaps/footprint changes/locked moves/region escapes atomically, accepts rotation, preserves regions and round-trips a region through save/load |
| **M4:** processor presets choose the parts | `tests/unit/designPresets.test.ts` builds all four presets, checks node/package/die/block-set fidelity and legal geometry, runs preset auto-place deterministically, and applies the result through `applyDesignContent`; `tests/data/phase1Content.test.ts` checks the four preset records and references, and `tests/data/dataValidation.test.ts` rejects unknown preset nodes/blocks/configs/aspect ratios |
| **M4:** preset apply is atomic | `tests/unit/designPresets.test.ts` rejects overlapping/malformed generated designs, verifies the previous design is untouched on failure, preserves the project id/name, clears pipelined links, and is idempotent |
| **M4:** die shrink moves edge blocks | `tests/unit/designFloorplan.test.ts` shrinks width, height and both around a bus interface at (5,4) on a 10×10 die and checks the block moves to (2,4), (5,2) and (2,2); it also rejects a shift that would overlap and a block wider than the new die, leaving the design unchanged |

| **M5:** changing archetype/width/registers changes instruction counts | `tests/unit/isaInstructionCount.test.ts`: accumulator vs load/store RISC change base and total instructions; 8-bit vs 16-bit datapath on a 16-bit workload turns two width passes into one; 4 vs 32 registers changes spill extra; a narrow address space adds bank-switching work. Every change is visible in the Architecture Lab table |
| **M5:** instruction breakdown is visible and internally consistent | `tests/unit/isaInstructionCount.test.ts` checks every workload: row sum = base + width + missing-HW + spills + address, total = components − custom removal, code bytes = instructions × bytes/instr, and the op-class detail rows carry the same numbers. Browser CDP smoke read the rendered table before/after controls |
| **M5:** opcode budget overflow forces longer encoding | `tests/unit/isaOpcodeBudget.test.ts`: 32-bit budget from 8 bits × 4, four catalog instructions fit with no extra bytes, the fifth overflows by 8 bits and adds 1 byte/instr and more code bytes, the sixth adds a second byte, and trimming back to three removes the penalty. The UI renders the red budget bar and the same byte increase |
| **M5:** archetypes, ISA parameters and commands | `tests/unit/isaConfig.test.ts`: newest-archetype default by year, resets to archetype defaults, rejects unknown archetype/width/register/address/modes/extension/duplicate, normalises extension order, toggles custom instructions, validates settings and clamps Vdd on a node switch |
| **M5:** custom instructions affect only matching workloads | `tests/unit/isaInstructionCount.test.ts`: selecting multiply-accumulate removes 0 instructions from Calculator math but a positive amount from Galaxy Raiders, and the effect names the `multiply-accumulate` pattern |
| **M5:** design settings panel and physical wiring | `tests/unit/designSettings.test.ts`: defaults from node/tuning, target-clock vs fMax, deeper pipeline raises fMax, higher Vdd raises fMax, heatsink lowers hotspot, and settings survive package/ISA edits. The designer panel exposes target clock, Vdd, pipeline, control, cooling, package, test strategy, prefetch, bus mode and spare rows |
| **M5:** persistence and migration | `tests/unit/save.test.ts`: v3 round-trip preserves ISA/settings/custom instructions, v2 designs migrate with ISA defaults inferred from the node year and node-default settings, and an unknown ISA archetype is rejected |
| **M5:** ISA data and extensions validate at startup | `tests/data/phase1Content.test.ts` checks every archetype's default width/registers/address/modes/extensions against the tuning ranges; `tests/data/dataValidation.test.ts` rejects an unknown default extension and a default width outside the tuning options |
| **M5:** presets carry an era-correct ISA | `tests/unit/designPresets.test.ts` asserts every built preset equals `createDefaultIsaConfig(preset.historicalYear, data)`; the auto-place preset command passes those fields through `applyDesignContent` |

| **M6:** Section 9.7 calibration within ±35 % clock/MIPS, ±30 % area | `tests/calibration/calibration.test.ts` builds the six reference chips in `tests/calibration/referenceDesigns.ts` and asserts each fMax, MIPS and die area against its published band extended by the tolerance. Measured: 4004 0.57 MHz / 0.046 MIPS / 12.59 mm²; 8080 1.50 / 0.169 / 18.98; 8086 3.45 / 0.505 / 28.26; 286 6.36 / 0.973 / 52.23; 386 17.43 / 8.016 / 108.17; 486 33.58 / 17.848 / 151.34 |
| **M6:** custom instructions speed only matching workloads | `tests/unit/cpi.test.ts` adds `ci-multiply-accumulate` to the 386 reference: Galaxy Raiders loses instructions and frame time, Calculator math keeps exactly the same instruction count and time, and the custom share is zero there |
| **M6:** cache helps at 33 MHz but not at 1 MHz | `tests/unit/memoryModel.test.ts` compares the 386 reference with its two caches removed: at 1 MHz both total CPI values are identical and wait cycles are zero; at 33 MHz the cached CPI is 3.75 vs 6.82 uncached. It also checks the wait/bus rules directly |
| **M6:** no double-counted memory stalls | `tests/unit/memoryModel.test.ts` asserts `timePerUnitMs = instructions × CPI / (clock × 1000)` and `cpuFrameMs = timePerUnitMs + fixedOverheadMs`; the CPI components sum to `total` and memory is one additive component. `tests/calibration/calibration.test.ts` repeats the frame-time check on a reference design |
| **M6:** CPI stack is additive and explains every cycle | `tests/unit/cpi.test.ts` checks all seven components, zero/positive components, microcode > hardwired control, structural pressure from one ALU vs two, and branch penalties only when pipelined |
| **M6:** uncertainty ranges and reasons | `tests/unit/uncertainty.test.ts`: validation strategy changes coverage and relative error, bounds are `1 ± relative`, reason shares sum to 1 and include the base model error; custom instructions move compiler maturity |
| **M6:** FPS model | `tests/unit/performance.test.ts`: 4004 < 10 FPS, 1985 design capped at 60 FPS with `frame-cap` bound, MIPS/time ranges contain the point estimate, target/fMax clock capping, non-frame workload has no overhead, and all-workload estimation is deterministic |
| **M6:** Workload Lab view/edit/import/export and persistence | `tests/unit/workloads.test.ts` covers profile combination, unique deep-copy duplication, id/schema/dedup validation, single/array import, JSON export round trip, add/update/delete commands, built-in protection, v4 save round trip and v3→v4 migration; browser CDP duplicated Galaxy Raiders and opened the editor |
| **M6:** UI smoke | Chromium CDP loaded the 1971 calculator preset and read the Performance panel (0.58 MHz, 0.06 MIPS, 4.0 FPS, CPI 9.03), loaded the 1985 preset and read its cache/miss/thermal rows, opened the Workload Lab, duplicated a profile, opened the editor, and rendered the benchmark table. Screenshots: `artifacts/m6-performance.png`, `artifacts/m6-performance-1985.png`, `artifacts/m6-workload-lab.png`, `artifacts/m6-workload-editor.png`, `artifacts/m6-workload-benchmark.png` |
| **M7:** DPW and yield match reference values | `tests/unit/manufacturingYield.test.ts` asserts the Section 11.2 formula at 50/75/100 mm wafers (**131 / 98 / 343** DPW), the negative-binomial yields **0.5840** at 12 mm²/D0 5/α 2.5 and **0.4722** at 35 mm²/D0 2.5, D0 decay from 8 to 4.523 at 80 weeks, fab learning to 3.512 at skill 0.5, and rejects zero/negative inputs |
| **M7:** binning shares sum to 100% and down-binning works | `tests/unit/manufacturingBinning.test.ts` samples 1,000 dies, asserts every die is in a SKU or the reserved `scrap` bin and shares sum to 1; a 25% allocation cap on the premium SKU yields ≤250 Pro dies and down-bins the rest to Value; a defective FPU routes dies to the salvage SKU; the same seed reproduces byte-identical bins |
| **M7:** pin limit forces a multiplexing choice | `tests/unit/manufacturingFlow.test.ts` places I/O pads with 24 data / 16 address / 4 control pins on the 10 µm node: **46 needed vs 40 capacity**, 6 over. Tape-out is rejected with `Pin overflow: 6 pins`; enabling multiplexing gives `max(24,16) + 4 + 2 = 30`, saves 16 pins, clears overflow and allows tape-out. The Manufacturing and Validation panels show the same warning/block |
| **M7:** SKU auto-suggest and editor validation | `tests/unit/manufacturingFlow.test.ts` covers auto-suggest creating a stack during release; `src/sim/fab/skus.ts` validation rejects empty stacks, duplicate/reserved ids, bad frequencies/prices/power/allocation, unknown blocks and required/disabled overlap. The editor applies changes only through `setProductSkus`; tape-out/erratum only fill a missing stack, preserving hand edits |
| **M7:** contract fab, reserved capacity and lead time | `tests/unit/manufacturingFlow.test.ts` signs reserved capacity and asserts the **$300k** deposit, **50/week** capacity and event; `tests/unit/manufacturingFlow.test.ts` runs a lot and asserts finish week `max(fab.leadTimeWeeks, node.cycleWeeks) + 2`, capacity enforcement, upfront wafer cash and lifetime wafer counts |
| **M7:** wafer lot → test → inventory end to end | `tests/unit/manufacturingFlow.test.ts` tapes out, auto-creates the product, starts 10 wafers, runs to `waferReadyWeek` (testing), then to `finishWeek` (completed), asserts real total dies = wafers × DPW, shares sum to 1, and inventory quantities sum to the lot's good dies; the completed state round-trips through save v5 |
| **M7:** validation, bugs, tape-out and respin/erratum | `tests/unit/manufacturingFlow.test.ts` checks weekly coverage `1 − e^(−4×8/400)`, hidden actual bugs, the 60/30/10 severity split, microcode patching half the errata, respin cost = node mask set with a **10-week** wait and clean release, and shipping with an accepted erratum |
| **M7:** design edits invalidate approval | `tests/unit/manufacturingFlow.test.ts` starts validation, tapes out, then places a block: validation and tape-out records disappear, the product remains; `src/store/gameStore.ts` applies the same invalidation on undo/redo, while `renameDesign` is exempt |
| **M7:** save v5 and v4 migration | `tests/unit/save.test.ts` round-trips manufacturing state; `tests/unit/manufacturingFlow.test.ts` rewrites a v5 save as version 4, deletes `manufacturing`, and asserts migration creates the starting rented contract on the design's node with the tuned 25/week capacity |

### How to verify M7 manually in the running app

Run `npm run dev` and start a fresh **1971** game. Manufacturing has two screens: **Validation** (nav screen 4) and **Manufacturing** (screen 5). The default game starts with one rented contract fab for the 10 µm node.

1. **Pin overflow forces multiplexing.** Chip Designer → palette **I/O pads** → **Configure…** → data **24**, address **16**, control **4** → place at `(0,0)` on the 10×10 die. Open **Design settings** and untick **Bus multiplexing**. The Estimates panel and Manufacturing stats show **46 needed / 40 capacity** and **6 pins over**. Go to **Validation**: the tape-out button reads **Fix pin overflow to tape out** and is disabled. Return to Design settings, tick **Bus multiplexing**: pins become `max(24,16) + 4 + 2 = 30`, the warning clears and tape-out becomes available. The automated equivalent is in `tests/unit/manufacturingFlow.test.ts`.
2. **Build a real production design.** Chip Designer → Auto-place → Preset **1971 Calculator CPU** → **Auto-place**. This replaces the pin-test design with six blocks on the 10 µm node. (Load the **1985 32-bit CPU with Caches** preset later if you want to see the salvage SKU: its FPU/cache blocks are `disableable`.)
3. **Validate and tape out.** Validation → **Start validation**. Run about **40 weeks** at 20×; coverage should pass **55 %** and the remaining-bug range should narrow. **Tape out** (mask set `$30k` + `$50k` tools + `$25k` engineering = **$105k** on the 10 µm node). If the result is `serious bugs`, either **Respin** (new masks + **10 weeks**) or **Ship with erratum** (immediate release, reputation risk recorded for M9). A clean result releases immediately. Editing the floorplan after tape-out removes the validation and tape-out records; a cosmetic rename does not.
4. **SKUs, contract and wafer lot.** Open **Manufacturing**. **Suggest product stack** builds the Pro/Standard/Value tiers (plus Salvage when a disableable block exists). Set the premium SKU's **Allocation cap** to `25`, press **Apply stack**, and confirm the table shows fewer premium dies than an uncapped run. Under Foundry contracts press **Reserve · $300,000**: cash drops, and a second card appears with **50 wafers/week**, **9-week** lead time and **×1.25**. In **Wafer starts**, choose the reserved contract, enter **10** wafers and press **Start 10 wafers**. The lot cost is charged immediately and the row shows `in fab`, the finish week (`max(lead time, node cycle) + 2`) and its frozen D0/yield.
5. **Wait for output.** Run to `waferReadyWeek`: the lot status becomes **test + package**. Run two more weeks: **completed**, with good/scrap counts, yield, cost per good die and per-SKU bins. **Finished-goods inventory** now lists each positive bin; quantities sum to the lot's good dies. Later design edits do not change this lot. Save and reload: the fab, lot, bins and inventory survive in save **v5**.

### How to verify M6 manually in the running app

Run `npm run dev`, open the app, and use the top nav. The M6 features are the **Performance** panel at the top of the Chip Designer's right column and the **Workload Lab** screen.

1. **Calibration (automated).** Run `npx vitest run tests/calibration/calibration.test.ts`. Six reference chips must satisfy every band. To see the actual numbers, temporarily add `console.log` in the test or read the table above; the accepted points are 4004 0.57 MHz / 0.046 MIPS / 12.59 mm², 8080 1.50 / 0.169 / 18.98, 8086 3.45 / 0.505 / 28.26, 286 6.36 / 0.973 / 52.23, 386 17.43 / 8.016 / 108.17 and 486 33.58 / 17.848 / 151.34.
2. **CPI stack + FPS.** Chip Designer → Auto-place → Preset **1971 Calculator CPU** → **Auto-place**. The Performance panel shows **0.58 MHz**, **0.06 MIPS**, **4.0 FPS**, **CPI 9.03** and a one-segment Core CPI stack; the memory rows say 0 wait cycles because a 600 ns access fits inside the 1.7 µs cycle. Switch **Workload** to **Business ledger**: the same chip now shows throughput and a different CPI/time. Open **Why?** under CPI to see the same component shares.
3. **Cache transition at 33 MHz vs 1 MHz.** Load preset **1985 32-bit CPU with Caches**, run Auto-place, then in Design settings set **Pipeline stages 3**, **Control style Hardwired**, **Cooling Fan + heatsink**, **Target clock 33** (the panel caps it at fMax). Select **Spreadsheet recalculation** in Performance. At 33 MHz the cache rows show finite miss rates and **wait cycles > 0**; set **Target clock 1**, and wait cycles fall to **0** and CPI stops depending on the caches. To see the counterfactual, select each cache block on the canvas, delete it, and compare the memory component; **Undo** restores both caches. The automated version is `tests/unit/memoryModel.test.ts`.
4. **Custom instruction selectivity.** Architecture Lab → select **Multiply-accumulate**. Workload Lab → **Galaxy Raiders** benchmark row loses instructions/frame time; select **Calculator math** and its instruction count and time are unchanged. In the Performance panel the **Custom** CPI component is positive only for Galaxy Raiders.
5. **Workload Lab edit/import/export.** Workload Lab → **Duplicate** Galaxy Raiders → **Edit** → change the name, `intAlu` or footprint → **Save changes**. The profile appears under **Custom & measured** and the benchmark table recomputes. Click **Export** to download JSON, then **Import** the same file; it becomes a second custom profile with a unique id. Deleting a custom profile never touches built-ins.
6. **No double-counted memory stalls.** Open **Model details** in the Performance panel: the displayed frame time is `instructions × CPI / (clock × 1000) + 0.4 ms`, and the CPI stack components add to the total. The same equality is asserted for a reference design in `tests/calibration/calibration.test.ts`; there is no second memory latency term in `fps.ts`.
7. **Save v5.** Add a custom profile, then use **New Game / Settings** → save/export and reload. The custom profile survives; an old v4 save opens with a default manufacturing state. The JSON shows `"version": 5`, `"customWorkloads": [...]` and `"manufacturing": {...}`.

### How to verify M5 manually in the running app

Run `npm run dev`, open the app, press `2` (or use the top nav) to open **Chip Designer**, and start from a fresh 1971 game on the default 10×10 die. The **Auto-place** panel is at the top right of the designer.

1. **Preset rebuild.** In the Auto-place panel set **Preset** to **1974 8-bit Consumer CPU** and click **Auto-place**. The node, package and die switch to 6 µm NMOS / Plastic DIP / 16×16, the canvas gets 10 preset blocks, and the report says `Preset · 1974 8-bit Consumer CPU` with a positive improvement. **Undo** restores the previous design.
2. **Build a starting layout.** Set **Preset** back to **Custom · current blocks**. Place **Register file** at (0,0), **ALU** at (5,0), **Hardwired decoder** at (0,5) and **Bus interface unit** at (5,4). The status bar confirms each placement and the estimates report four blocks.
3. **Shrink the die around an edge block.** The bus interface is 5×6 at (5,4), touching the right and bottom edges. Set **Die size** to `7 × 10` and click **Apply**: the bus shifts left to x=2 and stays on the new right edge; no delete/re-place is needed. **Undo**. Set `10 × 8`: the bus shifts up to y=2. **Undo**. Set `7 × 8`: it shifts to (2,2), still touching both edges. **Undo** before continuing. If the inward shift would overlap another block or the block is wider than the new die, the resize is rejected atomically and the old layout stays.
4. **Run auto-place.** Keep mode **Performance** and seed **1971**, click **Auto-place**. The panel shows `Cost <before> → <after>`, a positive improvement, 3 moved blocks, the anchors line (0 locked · 0 regions) and the top three reasons with share bars. The canvas redraws the new layout; **Undo** restores the previous one.
5. **Same seed, same result.** Click **Undo** (the hand-built layout returns), then **Auto-place** again with the same seed. The resulting block rectangles and report are identical. **Undo** back to the hand-built layout, change the seed to another whole number, and run again; this layout differs from the first result. **Undo** back to the hand-built layout before the lock/region checks.
6. **Locks.** Select the bus interface on the canvas, click **Lock** in the inspector, then **Auto-place**. The report's **Anchors** line shows `1 locked`; the bus keeps its exact rectangle while the other blocks rearrange. A locked block cannot be moved, rotated, configured or deleted; **Unlock** restores editing. (If the current layout is already optimal, the report may say no better layout was found; **Undo** first and rerun to see the other blocks move.)
7. **Regions.** Select the register file, click **Paint region**, then drag a rectangle around it on the grid (for example tiles 0,0 to 7,7). A dashed amber region outline appears and the inspector shows `0,0 · 8×8`. Run **Auto-place**; the register file stays inside that rectangle and the report's **Anchors** line reports `1 region`. **Clear** removes the constraint. Manual movement outside a painted region is rejected with a status-bar message. If no further cost improvement is possible, the run reports 0% but the block still cannot leave the rectangle.
8. **Modes.** Switch mode to **Power / thermal** and run again with the same blocks; the report label and reason mix change, and the hotspot is lower than the same seed in Performance mode. Switch to **Area / cost**; the compact-footprint share grows and the block bounding box shrinks. The mode affects the layout, not only the report label.

Current result: **276 tests in 38 files, all green**; `npm run typecheck` clean; `npm run build` clean.

### How to verify M3 manually in the running app

Run `npm run dev`, open the app, press `2` (or use the top nav) to open **Chip Designer**, and start from a fresh 1971 game on the default 10×10 die. The **Physical analysis** panel is to the right of the canvas; the overlay selector sits above the canvas.

1. **Moving the ALU away from the register file lowers fMax.** Place **Register file** at (0,0) and **ALU** at (5,0). Note **Sustained clock** and **Timing limit (fMax)**, and the **Limiting path** name under the canvas/panel. Drag the ALU to the far side (e.g. (5,5)) and let go. Both clocks drop, the limiting path and the first rows of **Wire lengths & pipelining** change, and the execute-loop wire length/ps increase.
2. **Spreading hot blocks lowers the hotspot.** Place two **ALU**s adjacent (e.g. (0,0) and (3,0)). Note **Hotspot** in the physical panel. Move one ALU to the opposite corner. The hotspot temperature falls (the **Heat** overlay visibly loses its hot blob).
3. **Overlays render.** Switch the overlay selector through **Floorplan → Heat → Wires → Congestion → Timing**. Each mode repaints the canvas and shows its own legend (heat scale, wire timing classes, congestion demand scale, timing-path stage outlines). The selected mode stays highlighted.
4. **“Why?” lists.** Click **Why?** on **Sustained clock**, **Power** and **Hotspot**. Each opens an ordered list of contributors with a share bar; the listed shares sum to about 100 % (timing: stages, counted wires, latch overhead, skew; power: per block; heat: per-block temperature rise).
5. **Pipelining trade-off.** In **Wire lengths & pipelining**, click **Pipeline wire** on a **critical** wire. The button changes to **Pipelined (+1 cycle)**, fMax/sustained clock rise (or the limiting path changes), and the limiting path's **cycle latency** increases by one. Non-critical wires show no toggle; the command rejects non-critical links.
6. **Recompute budget.** The UI does not display elapsed analysis time; `tests/unit/physicalAnalysis.test.ts` times a full 17-block 30×30 design after warm-up and asserts `< 50 ms`.

Determinism hashing uses canonical JSON (recursively sorted keys) plus FNV-1a; `tests/unit/hash.test.ts` proves key-order independence.

---

## 6. Assumptions

Recorded per Section 19.9. Each choice is the simplest one consistent with the design pillars.

1. **Calendar:** week 0 is **Jan 1 of the start year**; every tick is exactly 7 proleptic-Gregorian days, so leap years are handled by calendar math rather than a fixed 52-week year. The UI shows both the real date and elapsed weeks. This makes multi-year runs drift from 52 weeks/year (53 weeks in some stretches), which is realistic and needs no special casing.
2. **No `Date` in simulation:** all date conversion is integer day arithmetic in `src/sim/core/time.ts`.
3. **`step()` signature:** M0 uses `step(state, commands)` because no M0 subsystem consumes randomness. The seeded RNG state is already persisted in `GameState.rng`; subsystems will receive named streams (`rng.stream("fab")`, etc.) from M2/M7 onward. This avoids consuming no-op randomness purely to satisfy a signature.
4. **Commands:** commands are pure data. The UI may apply one immediately (while paused) through the same reducer `step()` uses; `step()` accepts a batch so headless/replay runs are deterministic.
5. **Pause/speed are presentation state**, not part of `GameState`; the saved game never records wall-clock pacing. Speeds are locked to 0/1/2/5/20 by Section 3.
6. **Auto-load:** the app loads the latest browser save at startup and stays paused. No autosave yet.
7. **Save format:** M2 bumps the schema to version 2 by adding `designs` and `activeDesignId`. Version 1 saves migrate by creating an empty default design for the save's start year. Unknown/newer versions fail with a readable error. Save JSON is validated with zod after a version probe. The browser storage key stays `silicon-forge.save.v1` so existing browser saves are still found and migrated; changing the key would silently orphan them.
8. **Company name:** trimmed, max 40 characters (`tuning.newGame.companyNameMaxLength`), blank names ignored/fallback to the default. Default fictional name is “Meridian Microsystems”.
9. **Start years:** 1900–2100 for M0 so the setup form is testable; Phase 1 content still begins in 1971 with M1.
10. **Seed:** any safe integer is accepted. RNG derivation normalizes it to uint32 (`seed >>> 0`), so equivalent 32-bit values produce the same streams.
11. **Event log:** capped at the most recent 200 entries; deterministic event ids come from a monotonic `eventSeq` in state.
12. **Starting cash:** $50M from the Sandbox preset (Section 5.4). No weekly money flow exists yet; the cash figure is static until M9.
13. **Empty screens:** all 12 Section 15.1 screens are routed; ten show a placeholder naming their milestone, to keep navigation real without pre-building later features.
14. **`src/data/schemas.ts`** now covers every Phase 1 data file; `tuning.json` is still validated by the same aggregated loader, and `getTuning()` replaced the module-level `tuning` export so validation can run before the app imports.
15. **Sim folder structure:** only `src/sim/core/` exists in M0; empty subsystem folders (`design/`, `perf/`, …) are created when their milestone starts rather than as empty placeholders.
16. **M1 data validation is all-or-nothing.** `main.tsx` validates in `initGameData()` before dynamically importing `App`. Any schema or semantic failure renders `DataErrorScreen` with every issue (file, JSON path, record id); the game never runs with partial data.
17. **Safe formula language:** a hand-written tokenizer + recursive-descent parser + AST evaluator. It supports `+ - * / % ^`, comparisons, `&&`, `||`, `!`, lazy `?:`, numeric variables, string/boolean variables, and the functions `min`, `max`, `ceil`, `floor`, `round`, `abs`, `sqrt`, `pow`, `log2`, `clamp`. String values are only usable with `==`/`!=` and ternaries. No `eval`, `new Function`, property access, or array indexing exists in the grammar. Nesting is capped at 64, expression length at 2048.
18. **Formula scope:** block `transistors`, `logicDepth`, and link `widthBits` are formulas evaluated with that block's config defaults at load time. Nonsensical results (negative transistors, non-positive logic depth/width) are load errors. Activity values are static data, not formulas.
19. **Config options are tagged** (`enum`, `integer`, `boolean`) with labels and defaults. This lets validation evaluate formulas immediately and lets M2 render the right control without guessing.
20. **Phase 1 node electrical/economic values are provisional content**, chosen as plausible 1971–1989 figures. They are not calibration; M6's calibration tests will adjust them within the plan's tolerances.
21. **Formula coefficients live in content JSON**, not `tuning.json`, because Section 17 defines them as part of `BlockType` data. `tuning.json` still holds every global gameplay constant; no formula coefficient is hard-coded in TypeScript.
22. **Lookup maps:** `GameData` exposes both ordered arrays (for content order) and `*ById` maps (`nodeById`, `blockById`, `patternById`, …) for later sim code. `patternById` maps `patternId` to the custom-instruction record.
23. **Schema strictness:** duplicate IDs, duplicate link targets, self-links, unknown link targets, unknown workload pattern IDs, workloads with no positive op count, frame caps on non-games, and empty data files are rejected. New optional fields stay optional so Phase 2 content does not require schema changes.
24. **Designs live in `GameState`:** `designs[]` plus `activeDesignId`, with `editDesign` as the only UI write path. M2 creates and exposes one design; the array leaves room for parallel projects (Section 4.3) without changing the saved shape.
25. **Design shape vs. the plan:** the persisted `ChipDesign` contains the M2 fields (`id`, `name`, `nodeId`, `packageId`, `dieW`, `dieH`, `blocks`, `pipelinedLinks`); M4 adds the optional per-block `region` field. ISA and design settings will be added by M5; no empty placeholder objects were invented now. `packageId` is top-level rather than nested in settings for the same reason.
26. **Default project:** a new game starts with one empty 10×10 design using the newest node and package whose `historicalYear` is at or before the start year. If no record qualifies, the earliest record is used. This keeps a 1984 game from starting on a 1971 process without adding research gating.
27. **Undo/redo is presentation/session state**, not `GameState`. It stores the last 20 design snapshots in `gameStore`, is cleared by new game/load/import, and is not saved. This matches the plan's UI-level requirement and avoids inflating every save with edit history.
28. **Block footprint:** `tiles = max(minBlockTiles, ceil(transistors / node.transistorsPerTile))`. `minBlockTiles = 1` lets zero-transistor configurations (e.g. multiplier = none) remain placeable and visible instead of disappearing. Aspect fitting derives `h = ceil(sqrt(tiles / ratio))` and `w = ceil(tiles / h)`, so the rectangle always covers the budget and may have one or two spare tiles. Rotation swaps `w`/`h` and toggles `rotated`.
29. **Die area interpretation of Section 7.2:** `tileArea = transistorsPerTile / densityTrPerMm2`; core area = `W × H × tileArea`; pad-ring area = core perimeter × `padDepthMm`; scribe area = outer perimeter × `scribeWidthMm`; total = core + pad ring + scribe. The plan's “padRingArea + scribe” does not define the pad-ring's outer edge, so using the core perimeter for the ring and the outer perimeter for the scribe is the simplest consistent reading.
30. **Pad ring in the canvas is illustrative:** it draws the configured I/O pins (or two power/ground pins when no I/O block exists), capped at 64 decorative pads. Exact pin capacity is a separate calculation from the real perimeter, `padPitchMm` and package `maxPins`; overflow is a warning in M2 and becomes an enforcement/tape-out concern in M7.
31. **The 1971 example is interpreted as its block set and relative placement, not its exact historical totals.** The test builds decoder, pads, BIU, register file, PC and ALU on the default 10×10 die. Current provisional content formulas produce about 4.4k transistors and a 36 mm² die at 10 µm rather than the plan's illustrative ~2,300 transistors / 7×7 / ~12 mm². M6 calibration will reconcile the worked-example figures.
32. **Node and package pickers show all content**, including records after the game's start year. Year/research gating is an M8 concern; M2 only validates that a selected node/package exists and that blocks still fit after a node change.
33. **Config changes and shape are one command:** editing a placed block offers Square/Wide/Tall. Choosing one recomputes the footprint and changes the aspect; leaving the shape untouched preserves the block's current `w / h` proportion. From the palette, `Configure…` opens the same popover as a draft, with the default square aspect preselected. Applying the draft stores pending config/aspect only — no design mutation or undo entry — and placement consumes both atomically. If a new footprint would overlap another block or leave the die, the command is rejected and the popover stays open so the player can try another value.
34. **Lock semantics:** a locked block cannot be moved, rotated, reconfigured, reshaped or deleted. Unlocking is always allowed. Every rejection is reported in the status bar, and double-click configuration is also blocked while locked.
35. **Link duplication is intentional:** each `requiredLinks` entry generates a link to every matching placed instance. A bidirectional pair such as ALU ↔ register file therefore yields one link in each direction and appears twice in the timing counts. Link width comes from the source block configuration; ids are `${fromUid}:${toTypeId}:${toUid}`.
36. **`pipelinedLinks` is persisted and now functional.** M2 added the field so the save format would not need a bump; M3 adds `setLinkPipelined`, the wire-list toggles and timing effect. A pipelined critical link contributes zero wire delay to the current cycle and adds one cycle of latency.
37. **Canvas pixel constants are presentation, not gameplay tuning.** `PAD_RING_TILES = 0.7`, canvas size caps and minimum tile pixels live in `FloorplanCanvas.tsx`; every gameplay value (pad depth, scribe, pin pitch, die bounds, aspect ratios, undo limit) is in `tuning.json`.
38. **Save validation checks references, not full geometry.** v2 loads are rejected for duplicate design ids, unknown nodes/packages/block types, or a missing active design. Hand-edited saves with overlapping or out-of-bounds blocks are not re-simulated on load; the command surface is the placement authority.
39. **No autosave:** saving remains an explicit button. Browser saves are per-profile; JSON export is the portable path.
40. **History is scoped to the active design by convention.** M2 has one design, so the store does not yet key undo stacks by design id. When parallel projects arrive, history must become per-design or be cleared on activation.
41. **Two Phase 1 defaults were reduced so every default block fits the starting 10×10 die.** The microcoded decoder defaults to 128 ROM words × 16 bits (1,217 tr, 5×5), and I/O pads default to 4 data / 0 address / 2 control pins (1,080 tr, 5×5). Both remain configurable across their full schema ranges; only the starting defaults changed. `tests/unit/designBlocks.test.ts` guards that every block's default footprint fits the starting die.
42. **Timing paths are content, not code.** `src/data/timingPaths.json` defines six templates with stage block-type lists and `link` or implicit `wire` legs. `link` legs require a matching critical required link; `wire` legs use block-centre Manhattan distance. Path enumeration is capped by `timing.maxPathInstances`.
43. **M3 fixes nominal voltage and one pipeline stage.** `analyzeTiming` takes optional `voltageV` and `pipelineStages`; the UI uses the node's `vddNominal` and `physical.defaultPipelineStages = 1`. M5 can pass design settings without changing the sim API.
44. **Voltage delay factor** follows Section 9.1: `((Vdd - Vth)^1.3 / Vdd)` normalized against nominal, applied to `logicDepth × node.gateDelayPs`.
45. **Clock skew is one global clock.** The source is the first clock generator, else the best-positioned I/O-pads block, else the die centre. The penalty is the maximum Manhattan distance from that source to any block centre, multiplied by `timing.clockSkewPsPerMm`.
46. **Wire delay and congestion are coupled directionally.** Link delay is `length × node.wireDelayPsPerMm × detour`, where `detour = 1 + detourPerOverflowRatio × averageOverflowRatio` over the link's bounding box. This is a planning estimate, not a router.
47. **“Why?” decomposition uses one shared helper.** `buildContributors` normalizes positive inputs, sorts descending, caps rows (six for clock/power/heat) and folds the rest into “Other”. Timing divides stage logic by pipeline depth and includes counted wires, latch overhead and skew; power lists per-block total; thermal sums one linear temperature-rise field per block, which exactly reconstructs the hotspot rise.
48. **Power reference workload:** dynamic activity is the workload-weighted sum of each block's activity weights, using `tuning.power.referenceWorkloadId` (`calculator-math`). Static power scales with voltage²; I/O power is per active pad and scales with sustained clock against `ioReferenceClockMHz`.
49. **Thermal grid:** steady-state Section 9.3 Jacobi on the tile grid, 60 iterations or 0.001 °C tolerance. Package `gVerticalWPerC` is interpreted **per tile**; `physical.lateralConductanceWPerC` spreads heat between neighbouring tiles. Block power is distributed uniformly over its footprint; empty tiles stay at ambient when no power flows.
50. **Thermal derating is quasi-static.** If the hotspot exceeds the package junction limit, the clock is scaled by `(limit − ambient) / (hotspot − ambient)` clamped to `minimumClockFraction..1`, then power and thermal are re-solved for up to six iterations. This is not a transient thermal simulation; it finds a stable operating point.
51. **Analysis order:** congestion and timing are position-only and solved once; power uses the sustained clock; thermal uses that power. Derating changes only clock/power/thermal, not placement or timing paths.
52. **Pipelining semantics:** a pipelined critical wire leaves the current cycle and adds +1 cycle latency. `pipelinedLinks` was already saved in v2; M3 adds the command and wire-list toggles. Non-critical links are rejected.
53. **Congestion units:** RUDY demand is in tracks, capacity is `node.metalLayers × congestion.tracksPerTile`, and the overlay color scale is presentation only. Overflow is a warning in M3; enforcing routability remains a tape-out/manufacturing concern.
54. **`analyzePhysical` is the single M3 orchestrator** and stays pure. It returns timing, wires, congestion, power, thermal, sustained clock, thermal-limited flag and human-readable warnings. The designer memoizes it per design; an empty design returns zero fMax with a warning.
55. **Package vertical conductance interpretation:** the plan fixes the field name but not its unit. M3 stores per-tile W/°C values (ceramic DIP 0.00022, plastic DIP 0.0001, PLCC 0.00016, PGA 0.0002). This makes package choice and die size both matter without a separate package-area model.
56. **Phase 1 wire-delay values were scaled ×12 for M3** (for example, 10 µm PMOS 500 → 6000 ps/mm). At the original values, repositioning the ALU changed fMax by less than the UI could show and the acceptance contrast was unreliable. M6 calibration must revisit interconnect delay alongside the Section 9.7 targets.
57. **Canvas colors and “Why?” bars are presentation constants**, not gameplay tuning. The simulation never imports UI code; the canvas reads the analysis arrays and design data.
58. **M3 did not start M4.** At M3 close there was no auto-place, placement scoring or search heuristic; M4 began only after M3 acceptance. This note is retained as history.
59. **Code is split by responsibility to stay under 400 lines.** `src/sim/design/timing.ts` re-exports the public timing API and owns `analyzeTiming`; `timingTypes.ts` holds result types, `timingClock.ts` the clock-source/skew source, `timingPaths.ts` path enumeration and leg construction, and `timingWhy.ts` the clock "Why?" list. `src/data/load.ts` keeps schemas/bundle assembly and delegates semantic validation to `src/data/validation.ts`. No behaviour, public export or import site changed; only module boundaries did. M4 grew `commands.ts` past 400 lines and extracted the region/layout cases into `layoutCommands.ts` with shared result helpers in `commandResult.ts`.
60. **M4 cost normalisation:** Section 7.8 gives one cost formula but the terms have incompatible units (mm·bits, overflow tracks, °C, tiles). The implementation keeps the formula structure and normalises each raw term by a `[T]` scale: `wireScaleMmBits`, `congestionScaleTracks`, `heatScaleC`, and the die area for `area`. Mode weights are therefore dimensionless. The “score” used by the acceptance tests is `100 × referenceCost / candidateCost`, so the fixed reference is 100% and a worse layout scores below 100%.
61. **Auto-place scoring clock is fixed at 1 MHz.** M5 owns the design target clock, so M4 cannot use the real sustained clock without changing the comparison between layouts. Block power for the heat proxy and the report is evaluated at `autoplace.scoringClockMHz = 1` using the existing reference workload. The physical panel still shows the real sustained clock/power/thermal for the chosen layout.
62. **Search uses a coarse thermal proxy; the report uses the full solve.** Jacobi iterations are the hot cost inside 2,000 annealing steps, so the search uses `searchThermalIterations = 10`. Once a winner is chosen, the report and all acceptance comparisons use the normal `physical.thermalIterations = 60`. Both use the same Section 9.3 equations and target temperature; the proxy only makes the search faster.
63. **Thermal target:** the plan names `targetT` without a value. M4 uses `min(ambient + thermalTargetRiseC, package.maxJunctionTempC − thermalTargetMarginC)`, clamped to ambient. This makes the thermal mode spread heat even when the package limit is not exceeded, while still respecting the package limit.
64. **Iteration budget:** `2000 × edaLevel` exactly as Section 7.8. Research/EDA does not exist until M8, so the default level is 1 and the UI shows 2,000 iterations. `AutoPlaceOptions.edaLevel` is ready for M8; the `iterations` override exists only for tests/tooling.
65. **The search only accepts legal layouts.** Proposed moves that overlap, leave the die, violate edge-only rules or leave a region are rejected rather than cost-penalised. The `edge` cost term is still evaluated for scoring and catches illegal imported layouts. Blocks are moved one at a time (no swaps), which is part of why 2,000 iterations are “good but not best”; dense layouts can reach a local optimum early.
66. **Auto-place rotates but does not change aspect ratios.** Section 7.8 specifies annealing over positions/rotations. The hand reference fixtures deliberately use different Square/Wide/Tall choices, so a skilled layout can beat the search even when the search finds a good arrangement. This is an intentional human advantage, not a bug.
67. **Regions are optional per-block rectangles.** `PlacedBlock.region` is an axis-aligned whole-tile rectangle, persisted as an optional save field (no save-version bump). A region must fit on the die and contain the block's current footprint; edge-only regions must touch an edge. Regions constrain manual movement, rotation, config-driven resizing and auto-place. The UI paints a rectangle by dragging and draws an amber dashed outline; **Clear** removes it. There is no freeform painting.
68. **Applying auto-place is one atomic command.** `setBlockPlacements` accepts the result as plain data, verifies every uid, footprint/orientation, lock, region and overlap, then replaces the whole block list once. One undo step restores the previous layout. This keeps the UI from writing multiple move commands or bypassing the command surface.
69. **Report semantics:** the report shows the exact final-layout cost (full thermal), initial exact cost, improvement percentage, moved blocks, anchors and the three largest weighted cost contributors. Shares are fractions of the final weighted cost; they are not the same numbers as the physical panel's “Why?” shares (which decompose timing/power/temperature, not the placement cost). Because the search uses the coarse thermal proxy, the exact final cost is checked against the exact starting cost: if the proxy-selected layout is worse under the full solve, the starting layout is returned unchanged (0% improvement, 0 moved).
70. **Acceptance score:** “scores 75–95% of the reference” is implemented as a relative cost score, not an absolute 0–100 design rating. With `referenceCost` fixed by the fixture and `candidateCost` from the same performance-mode/full-thermal context, the reference always scores 100%. The five fixture results are 82.5%, 78.5%, 87.2%, 82.4% and 86.4%.
71. **Reference fixtures are fixed test data, not generated at test time.** The five layouts in `tests/design/autoplaceFixtures.ts` were tuned offline with varied aspect ratios and a longer annealing budget, then frozen. Each has a deterministic random start, a fixed auto-place seed and three random baseline seeds. The fixtures are legal under the same geometry rules as player designs and use only editor-valid block shapes. They are an acceptance yardstick, not a claim that the search reaches the global optimum.
72. **Auto-place randomness is isolated.** The search uses `createRngSet(seed).stream("autoplace")` and never reads or mutates `GameState.rng`. This makes the UI action pure and repeatable without consuming weekly simulation randomness; the seed is display state, not saved game state.
73. **Auto-place report state is session-only.** The report lives in `AutoPlacePanel` and is not persisted; undo/redo or manual edits leave the last report visible as a “last run” record. The layout itself is saved through the normal design save.
74. **M4 does not start M5.** There is no ISA/architecture editor, no design settings panel and no performance/CPI model in this milestone. `PROGRESS.md` lists M5 as the next milestone, not started.
75. **Presets are complete designs, not block fragments.** Each `DesignPreset` carries its own node, package, die and full block/config/aspect set. Selecting a preset and running auto-place therefore rebuilds the design, switches the process/package/die and replaces the block list. This is deliberate: the request was for auto-place to choose the parts of a processor, and a preset is the simplest readable definition of “which parts”.
76. **Preset rebuild clears locks and regions.** Locked blocks and painted regions protect the current custom layout, but a preset is a different chip. The UI states this in the panel hint, and tests cover the generated-design command. Custom mode keeps the original lock/region semantics exactly.
77. **Preset initial layout is deterministic first-fit.** `buildPresetDesign` places edge-only blocks first, then interior blocks in preset order, scanning row-major candidates. The resulting legal layout is only a starting point; the same annealer then optimises it. The builder uses no RNG, so a preset build is reproducible before the seeded search even starts.
78. **Preset content lives in `src/data/designPresets.json`.** The four presets are data, not tuning constants: 1971 Calculator, 1974 8-bit Consumer, 1978 16-bit and 1985 32-bit with caches. They use only editor-valid block shapes and are checked at startup against nodes, packages, block types, config ranges and aspect ratios. Historical-year gating is an M8 research concern; M4 exposes all four.
79. **Auto-place does not invent a block set inside a preset.** The preset chooses the parts; the search chooses positions/rotations. “Auto-place chooses which parts” is implemented as choosing the complete preset block set, not as a free component-selection optimiser. That keeps the result predictable and data-driven.
80. **Generated design application is atomic.** `applyDesignContent` validates every block/config/shape, node, package, die and region, then replaces the design content in one command. It preserves the project id/name, resets `pipelinedLinks` (the new block graph has new link ids), and is a single undo step. Reapplying identical content is a no-op.
81. **Preset selection is UI session state.** The dropdown remembers the last selection while the panel is mounted, but the preset id is not stored in `GameState`; the resulting design content is saved normally. Reopening a save does not re-run the preset.
82. **Die-shrink auto-shift is narrow and exact.** Only edge-only blocks move, only on an axis that is shrinking, and only by the amount needed to bring them back inside and onto the new edge (`x = newW - w` for right-edge overflow, `y = newH - h` for bottom-edge overflow). The block's region shifts by the same delta. The command does not search for an alternative free slot: if the exact inward position overlaps or has no room, the resize is rejected and the player can shrink less or move the block manually. Expansion does not auto-move edge blocks; that keeps the requested “only where the area shrinks” rule. Non-edge blocks are never moved automatically, so an interior block outside the new die still rejects the resize.
83. **The ISA is per design, not per company.** `ChipDesign.isa`, `.settings` and `.customInstructions` are persisted with the floorplan. A new design starts from the newest archetype at the start year and that archetype's defaults; selecting an archetype later resets only the ISA parameters and keeps the custom-instruction selection. There is no separate company-wide ISA record yet, which keeps parallel-project support (Section 4.3) and preset application simple.
84. **`packageId` stays top-level.** Section 17 places `packageId` under `DesignSettings`, but M2 already stored it on `ChipDesign` and the toolbar edits it there. M5 keeps the existing field to avoid two sources of truth and records this deviation. Cache size/line/associativity and the on-chip clock generator also stay on their block types (M2 block configs) instead of being duplicated in the settings panel; the panel shows their count and points at the floorplan. `DesignSettings` therefore contains target clock, Vdd, pipeline, control, cooling, test strategy, spare rows, bus multiplexing and prefetch queue.
85. **Instruction counts follow Section 9.4 step 1 with explicit terms.** `base = ops × archetype.opsToInstr`, `widthExtra = base × (ceil(operandBits/wordBits) − 1)` for the classes listed in `tuning.isa.widthPassClasses`, missing-hardware extra for op classes whose extension is absent, and spill extra on load/store. Rows sum to the component subtotal; `total = subtotal − customRemoved`. Custom-instruction cycles are **not** counted in M5; the remaining instruction per pattern instance and its latency belong to the M6 CPI stack.
86. **Register pressure is derived from workload ILP.** `requiredRegisters = ceil(workload.ilpMax × registersPerIlp + baseWorkingRegisters)`, `spillFraction = clamp((required − registers)/required, 0, 1)`, and spill instructions are `(loadInstructions + storeInstructions) × spillFraction × spillTrafficFactor`. The plan does not define register pressure, so these are `[T]` values chosen so 4 registers spill and 32 registers do not on Phase 1 workloads. Address-space shortfall adds `log2(footprint/addressable) × addressShortfallPenaltyPerDoubling` to the same load/store traffic, which makes small address widths matter before the M6 memory model exists.
87. **Opcode-budget interpretation.** The data gives every Phase 1 archetype `opcodeSpaceBits = 8` and every catalog instruction `opcodeCost = 8`. Taken literally, one instruction fills the whole space, which makes the catalog unplayable. M5 reads the 8 bits as the **primary page size** and uses `opcodeSpaceMultiplier = 4` prefix pages (32 bits), so four catalog instructions fit and the fifth overflows. Overflow of one full opcode space adds one byte to every instruction; more overflow adds more bytes. This is the “longer encoding” of Section 8.3 and is recorded as a tuning interpretation, not a plan change.
88. **Instruction bytes model.** Fixed-length ISAs use `ceil(wordBits/8)` bytes. Variable-length ISAs use `archetype.bytesPerInstr × (wordBits/referenceWordBits)^variableBytesWidthExponent × (1 − min(maxAddressingDensityReduction, (addressingModes − 1) × addressingModesDensityPerMode))`. More addressing modes therefore mean denser code (the plan's density benefit); their decode-depth cost remains a future refinement (not modelled by the M6 CPI stack). Opcode-overflow bytes are added after that. Code size is `instructions × bytesPerInstruction`; fractional instruction counts are displayed with compact formatting.
89. **Settings validation is atomic and node-aware.** Vdd must lie inside the node's `vddRange`; switching nodes clamps it into the new range instead of rejecting the node change. Target clock, pipeline stages, prefetch bytes, cooling and test strategy are validated against `tuning.isa`. Invalid settings leave the design byte-for-byte unchanged and report the reason in the status bar.
90. **Settings wiring in M5.** `analyzePhysical` now receives `voltageV`, `pipelineStages` and `cooling` from the design, so Vdd/pipeline/cooling change fMax, power, hotspot and thermal derate immediately. Cooling multiplies the package vertical conductance (heatsink ×3, fan ×40). Target clock is stored and compared with fMax/sustained clock; M6 feeds it into FPS. M6 also simulates control style, test-strategy coverage, bus mode and prefetch; M7 adds spare-row repair during binning and packaging/test economics.
91. **Compiler support is fixed at 30 %.** Section 8.3 says compiler support grows with engineers and hand-written libraries give 0.3 instantly. M5 has no compiler team, so `tuning.isa.customCompilerSupport = 0.3` for every custom instruction and is shown in the panel. M8 replaces it with the per-instruction compiler effort/engineer model.
92. **M6 save v4 and migration (superseded by M7 v5).** At M6 close, `SAVE_VERSION` was 4. M5 introduced v3 with `isa`, `settings` and `customInstructions`; M6 adds `customWorkloads`. The v4 design schema is otherwise unchanged. Version 3 saves migrate by adding an empty custom-workload list; version 2 designs still choose the newest ISA archetype at their **process-node historical year** (not the game start year), node-default settings and no custom instructions. Version 1 still creates a complete default design. The browser storage key remains `silicon-forge.save.v1` so old saves are found and migrated rather than orphaned.
93. **Presets are ISA-aware.** `buildPresetDesign` now fills the ISA/settings defaults for the preset's historical year, and the AutoPlace panel passes those fields through the atomic `applyDesignContent` command. A preset applied to an existing design therefore replaces the architecture as well as the floorplan; this is consistent with the M4 decision that a preset is a complete chip.
94. **The Architecture Lab works on the active design only.** There is no design switcher in M5, matching M2–M4's single-design UI; the state shape already supports several designs. Switching screens does not reset pending edits, because all edits are already committed through the design commands.
95. **Ecosystem and compatibility are deferred.** Section 8.4's ecosystem score, licensing, second sourcing and emulation mode are not simulated in M5. The Architecture Lab says so explicitly; the M5 acceptance criteria cover archetypes, parameters, custom instructions/opcode budget and the Phase 1 settings panel only. M5 does not start the M6 performance/CPI model.

---

96. **Section 9.7 tolerance is applied to the published band, not its midpoint.** A value passes if it lies inside `[low × 0.65, high × 1.35]` for clock/MIPS and `[low × 0.70, high × 1.30]` for area. The plan gives a 4004 clock of 0.74 MHz and an 8086 MIPS range of 0.3–0.7; using the midpoint would be a different, harsher test. The reference chips are calibration fixtures, not player presets.
97. **Phase-1 CPI model is deliberately simple.** Issue width is one, the OoO window is zero, and CPI components are additive. The issue/hazard formulas already read `perf.issueWidth`, `perf.oooWindow`, `perf.oooHidingScale`, `ilpMax` and `ilpScale`, so later OoO research can raise the window without changing the stack shape. Non-pipelined CPI uses `microcodeCyclesPerClass × controlFactor`; pipelined CPI uses `1 / min(issueWidth, ILP)` plus structural/hazard components.
98. **The memory wait formula and the 1 MHz turning point.** `latencyWait = max(0, ceil(latencyNs / cycleNs) − 1)`; bus transfer/multiplexing extras are added **only when `latencyWait > 0`**. This is the simplest interpretation that makes a cache exactly useless at 1 MHz (where a 600–224 ns access fits in a 1000 ns cycle) and useful at 33 MHz. It is also why the cache acceptance test isolates cache size while holding clock fixed.
99. **Cache selection and miss law.** Only the largest placed instruction cache and the largest placed data cache are used; multiple caches of the same kind do not stack. Miss rate is `m0 × sizeKB^(−0.5) × max(0, 1 − assocReduction × (assoc − 1))`, clamped to `[compulsoryMissFloor, 1]`; a cache at least as large as the footprint still pays the compulsory floor; no cache means miss rate 1. Cache access time adds `ceil(accessTimeNs / cycleNs) − 1` hit cycles.
100. **Prefetch and bandwidth.** Prefetch hides `min(maxHidden, (queueBytes / bytesPerInstr) × perBufferedInstr)` of instruction fetches; this changes fetch count, not CPI directly. The bus-bandwidth floor is `max(0, requiredBytesPerInstr / busBytesPerCycle − CPI before bandwidth)`, so it only adds cycles when the bus is genuinely narrower than the instruction/data stream. Neither term is repeated in `fps.ts`.
101. **Branch and structural costs are estimates.** Branch accuracy is `clamp(base + predictabilityScale × workload.branchPredictability, 0, maxAccuracy)`; the mispredict penalty is `pipelineStages` and is zero when there is no pipeline. Structural CPI uses the busiest unit load above issue CPI; execution capacity comes from placed blocks' `unitFor` tags, with the tuning fallback unit and a one-unit penalty when a required block is missing. These are Section 9.5 approximations, not a cycle-accurate simulator.
102. **Custom-instruction CPI is charged only on top of the replaced work.** Non-pipelined designs add `customShare × averageLatency`; pipelined designs add `customShare × max(0, averageLatency − issueCPI)`. The M5 instruction count has already removed the replaced operations, so this avoids both ignoring custom latency and charging the full latency to every instruction.
103. **Uncertainty is a visible estimate, not a confidence interval.** `relative = baseModelError + validationWeight × (1 − testCoverage) + compilerWeight × (1 − compilerMaturity) + workload.variance`, clamped to 1. Compiler maturity blends the archetype's friendliness with the fixed 30 % hand-written compiler support by custom reliance. “High/medium/low” comes from `perf.uncertainty.highThreshold` and `mediumThreshold`; a 25 % variance game therefore remains low confidence even with a full-scan tester, which is intentional.
104. **Workload Lab profiles use the existing schema and state.** Custom profiles are ordinary `WorkloadProfile` objects stored in `GameState.customWorkloads`; `source: "builtin" | "measured"` records provenance, not editability. A profile is editable iff it is in `customWorkloads`, so duplicating a built-in creates a custom copy that still says `builtin` until the player changes the source. Save v4 adds `customWorkloads`; v3 saves migrate with `[]`. Built-in workloads cannot be overwritten or deleted.
105. **Calibration references are approximations, not physical replicas.** The 4004 uses a 4-bit PC config to fit the 8×9 die; the 286 uses an on-die 2 KB I-cache even though the real 286 did not; the 386/486 reference chips select the new **fan + heatsink** cooling option because the 1.5 µm/1 µm parts otherwise thermal-derate below their historical clocks. The point is to hit the Section 9.7 bands with the same model players use, not to reproduce every historical floorplan.
106. **M6 content calibration changes are intentional and documented.** I/O pads now count all data/address/control pins; the bus interface includes bus width, multiplexing and prefetch bytes; microcoded decoders include microcode storage; execution blocks carry `unitFor`; node densities are uniformised to 0.10 mm² per tile; 10 µm/6 µm/3 µm gate delays and 1 µm static power were adjusted; a `fan` cooling option was added; and the Galaxy Raiders operation counts were reduced to the 1970s frame budget. These are content/tuning changes, not hidden formula constants, and all are listed in Section 7.
107. **FPS runs at the achievable clock.** `estimatePerformanceForDesign` uses `min(targetClockMHz, sustainedClockMHz)`; target-over-fMax and thermal derate are shown, not silently ignored. This is why the 1985 preset at its default settings can show 1 MHz even though fMax is higher.
108. **M6 does not start M7.** Manufacturing, yield, test cost, packaging economics and research stay out of scope. The new `fan` cooling option is a design setting used for thermal calibration, not an M7 manufacturing feature.
109. **Manufacturing is one serializable `ManufacturingState`.** Fabs, lots, products/SKUs, inventory, validation records and tape-outs live under `GameState.manufacturing`; no manufacturing data is held only in React. New games create one rented contract fab for the starting design's node, so the Manufacturing screen is usable immediately and changing process nodes later requires signing a new contract.
110. **A lot freezes its result at wafer start.** DPW, D0, yield, bin counts, test escapes and cost per good die are computed from the design at the moment wafers start, using the seeded `manufacturing` stream. Later design edits cannot change material already in the fab; they instead invalidate validation/tape-out as silicon changes. This makes lead time meaningful and prevents save/load or undo from rewriting history.
111. **DPW uses total die area including pad ring and scribe.** The Section 11.2 formula is applied to `dieAreaBreakdown(...).totalAreaMm2`, not core area alone. This is the same area used by yield and by the Manufacturing stats.
112. **D0 is process maturity times rented skill.** `D0(t) = D0_mature + (D0_initial − D0_mature) × exp(−weeksSinceNodeIntro / maturityTauWeeks) × fabSkillFactor`. Rented/reserved contracts use `skillFactor = 1`; the field exists for M12 own-fab learning, where cumulative wafers can lower it. `weeksSinceNodeIntro` counts from the node's historical year, including pre-game time.
113. **Binning is a sampled model, not a per-wafer defect map.** Each lot samples **500** dies (tuning `monteCarloDies`), draws a negative-binomial defect count from area × D0 and clustering α, then places each defect area-weighted. Whitespace is harmless with 90 % probability; a repairable array consumes up to two spare rows; a `disableable` block is disabled and the die becomes salvage; any other hit scraps the die. Frequency is normal around the design's sustained clock with node `sigmaFreq`; power scales with frequency. The `disableable` flag is content on the FPU and caches, so salvage SKUs exist only where a real block can be switched off.
114. **Routing and allocation.** Qualifying dies go to the highest-priced SKU unless an allocation target caps that bin at a share of the sample; capped dies down-bin to the next qualifying SKU, then to any uncapped SKU, then scrap. The `scrap` key is always present in `shares`, so shares sum to exactly 1. Real lot counts use largest-remainder scaling to the exact `wafers × DPW`, keeping inventory totals integral and exact.
115. **SKU auto-suggest is a tuning-driven first draft.** It creates Pro/Standard/Value at 95/80/60 % of the design clock and a Salvage tier at 45 % when a disableable block exists. Prices are `(25 + 35 × MHz) × tier multiplier`, rounded to $5; the first tier requires every block type, and the salvage tier disables the first disableable type. Power caps are empty by default. The player can edit or replace the stack; tape-out/erratum only auto-create a missing product, so hand-built stacks survive release.
116. **Test strategies carry escape and cost data.** `isa.testStrategies` now includes `escapeRate` and `costPerDie` for all six Phase 1 strategies; escape rate is used for the lot's field-failure estimate, and cost per die enters cost per good die. Pin capacity is `min(package.maxPins, die perimeter / padPitch)`, and pin overflow blocks tape-out, so the player must multiplex, shrink the bus or buy a larger package rather than merely ignoring a warning.
117. **Validation is an information purchase.** Expected bugs = `0.6 × (transistors/1000)^0.6 × novelty × (1 + 0.15 × customInstructions) × controlFactor`, with hardwired control ×1.2. The exact count is a hidden Poisson draw. Coverage is `1 − exp(−validatedWeeks × 8 / 400)`, each hidden bug is found with weekly chance `1 − exp(−8/400)`, and the UI shows only coverage, found bugs and a ±1σ remaining range. Tape-out costs node `maskSetCost` + `$50k` + `$25k`; remaining bugs split 60 % cosmetic / 30 % errata / 10 % serious. Microcoded designs patch 50 % of errata before release.
118. **Serious bugs gate release.** A tape-out with serious bugs is `awaitingErratumDecision`. A respin charges the node mask-set cost (not tools/engineering again), takes 10 weeks, clears serious bugs and releases the design; accepting the erratum releases immediately and records the reputation risk for M9. A pre-launch product's `launchedWeek` is set when tape-out/respin/erratum first releases it.
119. **Silicon edits invalidate approval, material does not.** Any design edit except `renameDesign` removes validation and tape-out records; undo/redo applies the same invalidation. Products, lots and inventory are preserved, so already-started wafers keep their frozen result. This is intentionally stricter than “cosmetic” edits: a renamed project is still the same silicon, but any placement/config/ISA change is not.
120. **Reserved capacity is a deposit plus a lower multiplier; take-or-pay billing is deferred.** The $300k deposit, 50 wafers/week, 9-week lead and ×1.25 are charged/stored now. The “unused slots are still paid” promise is recorded on the contract (`takeOrPay: true`) but weekly capacity billing belongs to M9 finance; M7 does not invent a second cash drain. Rented capacity is 25/week, 12 weeks and ×1.6.
121. **Save v5.** `SAVE_VERSION` is 5. Version 4 saves gain `manufacturing` with a starting rented contract; v3 gains an empty custom-workload list plus manufacturing; v2 upgrades designs to ISA/settings defaults and then manufacturing; v1 creates a complete default design and manufacturing state. The storage key stays `silicon-forge.save.v1`, and `save.ts` delegates schemas/reference checks to `saveSchemas.ts`/`saveValidation.ts` so each module stays small. (Assumption 92 describes the M6-era v4 format; it is superseded by this entry.)
122. **M7 does not start M8.** Research, engineers, EDA levels and own-fab construction/learning remain out of scope. The Manufacturing and Validation screens edit the active design only, matching the single-design UI; multiple contracts/SKUs/lots are supported, but there is no design switcher yet.


## 7. Tuning changes

No values from the plan were changed. New M0-only `[T]` values were added to `src/data/tuning.json`:

| Key | Value | Why |
|---|---:|---|
| `time.baseTickMsPerWeek` | 1000 | 1× wall-clock cadence (1 week/second); 2/5/20× divide this |
| `time.defaultStartYear` | 1971 | Section 3 locked default start |
| `newGame.defaultCompanyName` | “Meridian Microsystems” | Fictional default (Section 3 setting) |
| `newGame.defaultSeed` | 1971 | Deterministic default |
| `newGame.startingCash` | 50,000,000 | Sandbox preset, Section 5.4 |
| `newGame.earliestStartYear` / `latestStartYear` | 1900 / 2100 | UI bounds for M0 |
| `newGame.companyNameMaxLength` | 40 | UI/state guard |
| `log.maxEntries` | 200 | Bounded event log |
| `save.storageKey` | `silicon-forge.save.v1` | IndexedDB key |

**M1:** no existing tuning value was changed. The Phase 1 content tables live in `src/data/*.json`; their electrical, cost and formula-coefficient values are new `[T]`-class content and are provisional until M6 calibration. The 2048-character formula cap and 64-level nesting cap are engineering safety limits, not gameplay tuning, so they stay in the evaluator.

**M2:** no existing value was changed; the `design` block is new `[T]`:

| Key | Value | Why |
|---|---:|---|
| `design.defaultName` | `Project Nova-1` | Non-empty name for the starting project |
| `design.nameMaxLength` | 40 | Matches company-name guard; prevents layout overflow |
| `design.defaultDieWidth` / `defaultDieHeight` | 10 / 10 | Comfortable starting canvas; the 1971 example fits |
| `design.minDieWidth` / `minDieHeight` | 3 / 3 | Smallest die that can still hold useful blocks |
| `design.maxDieWidth` / `maxDieHeight` | 40 / 40 | Phase 1 canvas bound; also keeps pointer math sane |
| `design.minBlockTiles` | 1 | Zero-transistor options still need a visible footprint |
| `design.aspectRatios` | 1, 2, 0.5 | Square, wide and tall shape choices from Section 7.2 |
| `design.padDepthMm` | 0.35 | Pad-ring depth used by the area formula and canvas |
| `design.scribeWidthMm` | 0.12 | Scribe strip outside the pad ring |
| `design.padPitchMm` | 0.25 | Perimeter pad-capacity estimate (Section 11.6) |
| `design.powerGroundPins` | 2 | Minimum required pins before I/O blocks |
| `design.undoLimit` | 20 | Section 18 M2 acceptance criterion |

The M2 area constants are provisional `[T]` values (0.35 mm pad depth, 0.12 mm scribe, 0.25 mm pitch). They are plausible for 1971–1989 ceramic/plastic packages and were not revised in M7; they remain a candidate for a later package-data pass. No formula coefficient or gameplay constant was hard-coded in TS.

**M3:** new `physical`, `timing`, `power` and `congestion` blocks are `[T]` values; no plan-level tuning constant was replaced. Two provisional Phase 1 content fields were revised: node `wireDelayPsPerMm` was scaled ×12, and package `gVerticalWPerC` was rewritten as per-tile values (see assumptions 55–56).

| Key | Value | Why |
|---|---:|---|
| `physical.voltageExponent` | 1.3 | Section 9.1 voltage-delay curve; provisional until M6 |
| `physical.latchOverheadGateDelays` | 3 | Latch/flop overhead expressed in gate delays |
| `physical.defaultPipelineStages` | 1 | M3 baseline; M5 will supply design settings |
| `physical.ambientTempC` | 25 | Room-temperature baseline for all thermal runs |
| `physical.thermalIterations` | 60 | Jacobi cap for a 40×40 grid; tolerance usually stops earlier |
| `physical.thermalToleranceC` | 0.001 | Steady-state convergence threshold |
| `physical.lateralConductanceWPerC` | 0.0002 | Tile-to-tile heat spreading; provisional |
| `physical.thermalDerateIterations` | 6 | Stable clock/power/thermal feedback without unbounded loops |
| `physical.minimumClockFraction` | 0.02 | Floor so a pathological design cannot derate to zero |
| `timing.clockSkewPsPerMm` | 300 | Plan-level skew sensitivity; one global clock |
| `timing.maxPathInstances` | 20000 | Enumeration guard for many same-type blocks |
| `power.referenceWorkloadId` | `calculator-math` | Representative integer/FP workload for activity |
| `power.ioPowerPerPadW` | 0.0005 | Per active pad at the reference clock |
| `power.ioReferenceClockMHz` | 1 | I/O power scales linearly with sustained clock |
| `congestion.tracksPerTile` | 24 | RUDY tile capacity per metal layer |
| `congestion.detourPerOverflowRatio` | 2.0 | Wire detour per unit average overflow ratio |
| `nodes[].wireDelayPsPerMm` | ×12 | Original provisional values made placement effects too small; e.g. 10 µm 500 → 6000 ps/mm |
| `packages[].gVerticalWPerC` | per tile | Ceramic 0.00022, plastic 0.0001, PLCC 0.00016, PGA 0.0002 W/°C |

M3 thermal and interconnect constants are provisional. M6 reconciled the node gate delays/density and added active cooling for the 386/486 calibration. M7 uses package cost, pin count and thermal limits, but package thermal resistance still needs real package data in a later content pass.

**M4:** no existing value was changed; the `autoplace` block is new `[T]` except where Section 7.8 fixes a value. The plan fixes 2,000 iterations, `T0 = initial cost × 0.1`, `alpha = 0.995`, the `1e6` edge penalty and the shape of the cost; the rest are provisional weights/scales.

| Key | Value | Why |
|---|---:|---|
| `autoplace.defaultSeed` | 1971 | Deterministic UI default, matching the default game seed |
| `autoplace.baseIterations` | 2000 | Section 7.8: iterations = 2000 × eda.level |
| `autoplace.defaultEdaLevel` | 1 | M8 research does not exist yet; the API already accepts a level |
| `autoplace.initialTemperatureFraction` | 0.1 | Section 7.8: T0 = initial cost × 0.1 |
| `autoplace.coolingRate` | 0.995 | Section 7.8 geometric schedule |
| `autoplace.attemptsPerIteration` | 12 | Legality retries before one cost evaluation; keeps one move per iteration |
| `autoplace.localMoveFraction` | 0.5 | Half local jitter, half global relocation |
| `autoplace.localMoveRadiusTiles` | 4 | Local search neighbourhood in tiles |
| `autoplace.rotationChance` | 0.25 | Section 7.8 searches rotations as well as positions |
| `autoplace.searchThermalIterations` | 10 | Coarse Jacobi proxy so 2,000 steps stay interactive |
| `autoplace.scoringClockMHz` | 1 | Fixed comparison clock until M5 owns the target clock |
| `autoplace.thermalTargetRiseC` | 15 | Comfortable hotspot target: 25 °C ambient + 15 °C |
| `autoplace.thermalTargetMarginC` | 5 | Target stays below the package junction limit |
| `autoplace.edgePenalty` | 1,000,000 | Section 7.8 edge violation penalty |
| `autoplace.wireScaleMmBits` | 100 | Normalises critical-wire mm·bits into cost points |
| `autoplace.congestionScaleTracks` | 100 | Normalises total RUDY overflow tracks |
| `autoplace.heatScaleC` | 10 | Normalises °C above target |
| `autoplace.reportReasons` | 3 | Section 7.8 “top 3 reasons” |
| `autoplace.modes.performance` | wire 1 · congestion .35 · heat .2 · area .15 · edge 1 | Wire-dominant mode |
| `autoplace.modes.thermal` | wire .35 · congestion .2 · heat 1 · area .1 · edge 1 | Heat-dominant mode |
| `autoplace.modes.area` | wire .25 · congestion .15 · heat .1 · area 1 · edge 1 | Compactness-dominant mode |

The M4 weights and normalisation scales are provisional. The acceptance fixtures are the tuning guard for now: changing the weights must be re-validated against all five references and their random baselines. M8 may revisit them alongside EDA research.

**M4 presets:** no tuning keys were added for presets. Their node, package, die, block configs and aspect ratios are content in `src/data/designPresets.json`, validated against the existing tuning bounds. The preset list is deliberately short; adding a preset is a content change, not a code change.

**M5:** no plan value was replaced. The new `isa` block holds every numeric range and coefficient the Architecture Lab uses, and the per-archetype defaults (`defaultWordBits`, `defaultRegisters`, `defaultAddressBits`, `defaultAddressingModes`, `defaultFixedLength`, `defaultPrivilegeModes`, `defaultExtensions`) are content added to `isas.json`. The settings panel values are `[T]` gameplay constants, not UI constants.

| Key | Value | Why |
|---|---:|---|
| `isa.wordBitsOptions` | 4, 8, 16, 32 | Section 8.2 Phase 1 widths; 64 is later |
| `isa.registerOptions` | 2, 4, 8, 16, 32 | Register counts from accumulator-tiny to 32-bit register file |
| `isa.addressBitsMin` / `Max` | 8 / 32 | Validate the address-width input; Phase 1 segments need 20/24/32 |
| `isa.addressingModesMin` / `Max` | 1 / 12 | Mode-count range; more modes trade decode depth for density |
| `isa.referenceWordBits` | 8 | Width exponent base for variable-length instruction bytes |
| `isa.widthPassClasses` | all arithmetic/logic/FP/memory classes | Section 8.2: branches do not take datapath passes |
| `isa.opcodeSpaceMultiplier` | 4 | Interpretation of the 8-bit opcode page as 4 prefix pages (see assumption 87) |
| `isa.extraEncodingBytesPerOverflowChunk` | 1 | One extra byte per full opcode space of overflow |
| `isa.customCompilerSupport` | 0.3 | Hand-written library support until M8 compiler engineers (Section 8.3) |
| `isa.maxCustomRemovalShare` | 0.75 | Guard so overlapping pattern shares can never remove the whole program |
| `isa.registersPerIlp` | 2 | Live registers demanded per unit of workload ILP |
| `isa.baseWorkingRegisters` | 4 | Minimum working set for any workload |
| `isa.spillTrafficFactor` | 0.5 | Fraction of load/store traffic added at full register pressure |
| `isa.variableBytesWidthExponent` | 0.5 | Wider datapaths need wider immediates, but sub-linearly |
| `isa.addressingModesDensityPerMode` | 0.02 | Code-density gain per extra addressing mode |
| `isa.maxAddressingDensityReduction` | 0.3 | Cap on the density gain |
| `isa.minimumInstructionBytes` | 1 | A variable-length ISA cannot encode a zero-byte instruction |
| `isa.addressShortfallPenaltyPerDoubling` | 0.5 | Bank-switch traffic added per doubling the address space cannot hold |
| `isa.targetClockMinMHz` / `Max` | 0.01 / 200 | Settings input bounds; Phase 1 clocks land well inside |
| `isa.defaultTargetClockMHz` | 1 | Neutral starting target before the physical panel is consulted |
| `isa.pipelineStagesMin` / `Max` | 1 / 5 | Section 7.6 Phase 1 pipeline range |
| `isa.prefetchQueueMinBytes` / `Max` | 0 / 64 | Settings input bounds; M6 consumes the value |
| `isa.defaultControl` | `microcoded` | Historical 1971 starting point; the player can switch to hardwired |
| `isa.defaultCooling` | `none` | No heatsink on the first chip |
| `isa.defaultTestStrategy` | `functional` | Cheapest Phase 1 tester |

**M6:** no plan-level formula was removed, but calibration required new `perf` tuning and several content changes. These are the M6 values and why they exist.

| Key | Value | Why |
|---|---:|---|
| `perf.issueWidth` | 1 | Phase 1 in-order issue; the field is ready for later OoO research |
| `perf.oooWindow` | 0 | No OoO in M6; the formula still supports a positive window |
| `perf.oooHidingScale` | 32 | Hides dependency stalls when the window opens in later research |
| `perf.controlFactors.hardwired` / `microcoded` | 1.0 / 1.5 | Plan's control multiplier; 1.5 makes the 4004 microcode CPI match its single-digit FPS |
| `perf.unitOccupancy` | ALU/shift/load/store/branch 1, BCD 2, FP add/mul 4, int mul 4, div 8, FP div 8, sqrt 12 | Relative execution-unit throughput per op class |
| `perf.fallbackUnitClass` / `missingUnitCount` | `intAlu` / 1 | Classes without a dedicated unit fall back to the ALU, or pay one missing unit |
| `perf.branch.baseAccuracy` / `predictabilityScale` / `maxAccuracy` | 0.4 / 0.45 / 0.95 | Section 9.5 branch estimate; 4004-era chips land near 72 %, modern code nearer 90 % |
| `perf.memory.compulsoryMissFloor` | 0.02 | A cache as large as the footprint still misses cold lines |
| `perf.memory.missRateCoefficient` / `missRateExponent` | 0.7 / 0.5 | Square-root miss law from the plan's cache discussion |
| `perf.memory.associativityMissReduction` | 0.08 | Each extra way reduces misses 8 %, capped at zero |
| `perf.memory.cacheAccessTimePsPerSqrtKB` | 1200 | Hit latency grows with √size; 1 KB ≈ 1.2 ns |
| `perf.memory.multiplexedExtraBusCycles` | 1 | Multiplexed bus adds one transfer cycle |
| `perf.memory.prefetchHiddenSharePerBufferedInstr` / `maxPrefetchHiddenShare` | 0.25 / 0.75 | Prefetch queue hides up to 75 % of fetches |
| `perf.fps.fixedOverheadMs` | 0.4 | Per-frame system overhead outside the CPU instruction budget |
| `perf.uncertainty.baseModelError` | 0.04 | Analytical model error floor |
| `perf.uncertainty.validationWeight` / `compilerWeight` | 0.10 / 0.08 | Missing test coverage and immature compilers add error |
| `perf.uncertainty.highThreshold` / `mediumThreshold` | 0.08 / 0.15 | Confidence bands |
| `perf.uncertainty.shownReasons` | 2 | Section 9.6 asks for the top two reasons |
| `isa.testStrategies[].coverage` | none 0, functional 0.5, scan 0.8, full-scan-bist 0.95 | Validation coverage that feeds M6 uncertainty |
| `isa.pipelineLatencyPerClass` (content) | per archetype, 1–8 cycles | Execution latency for hazards and custom CPI |
| `memoryLatency.json` | 1971 600 ns, 1980 250, 1990 120, 2000 70 | Section 9.4 world table; linearly interpolated |
| `nodes[].densityTrPerMm2` | `transistorsPerTile × 10` | Uniform 0.10 mm² tile at every node, so die area is comparable |
| `10um-pmos.gateDelayPs` | 40000 (was 60000) | Calibrate the 4004 to its 0.74 MHz class |
| `6um-nmos.gateDelayPs` | 16000 (was 22000) | Calibrate the 8080 class |
| `3um-hmos.gateDelayPs` | 5000 (was 8000) | Calibrate the 8086 class |
| `1um-cmos.staticPowerPerKTrW` | 0.0002 (was 0.002) | 1M-transistor 486 would otherwise be static-power/thermal limited to ~3 MHz |
| `isa.coolingOptions.fan` | conductance ×40 | Active cooling for the 386/486 references; heatsink remains ×3 |
| `io-pads.transistors` | `(data + address + control pins) × 50` | Pin count now drives pad area |
| `bus-interface.transistors` | `500 + 30 × busWidth + (multiplexed ? 60 : 0) + 40 × prefetchBytes` | Bus width/multiplexing/prefetch now have area cost |
| `decoder-microcoded.transistors` | `500 + 0.1 × microcodeWords × microcodeWidth` | Microcode storage is part of the decoder area |
| Block `unitFor` tags | ALU, shifter, multiplier, divider, FPU, custom unit, load/store, branch | Structural CPI resolves execution units from the floorplan |
| Galaxy Raiders ops | intAlu 1440, intMul 72, intDiv 10, shift 144, bcd 12, load 1080, store 600, branch 360 | 4004 lands at ~4 FPS and the 8080/8086 class reaches the 60 Hz cap |
| `isa.defaultSpareRows` / `defaultBusMultiplexed` / `defaultPrefetchQueueBytes` | false / true / 0 | Conservative starting settings; all three are editable |
| `isa.extensions[].missingHardwareFactor` | multiply 2.0 · divide 2.0 · BCD 1.6 · FP 2.5 | Software-routine multiplier per op class when the extension is absent |
| `isa.coolingOptions[heatsink].verticalConductanceMultiplier` | 3 | Heatsink roughly triples package vertical conductance (provisional) |

The M5 coefficients are provisional. The acceptance guard is qualitative and test-backed (more width/registers/extensions/opcode overflow must move the expected term), not a historical calibration; M6 keeps the counts and calibrates the resulting CPI/clock/MIPS against the Section 9.7 targets.

**M7:** no plan value was replaced. The new `manufacturing` block holds the Section 11 `[T]` constants, and the foundry/validation/wafer numbers are all data-driven.

| Key | Value | Why |
|---|---:|---|
| `manufacturing.waferDefect.clusteringAlpha` | 2.5 | Section 11.3 clustering α (~2–3); lower α means more clustered defects |
| `manufacturing.waferDefect.monteCarloDies` | 500 | Section 11.3 sample size |
| `manufacturing.waferDefect.spareRowsPerArray` | 2 | Spare rows absorbed before a repairable array dies |
| `manufacturing.waferDefect.whitespaceHarmlessChance` | 0.9 | Section 11.3 whitespace is usually harmless |
| `manufacturing.waferDefect.minimumFrequencyMHz` | 0.001 | Floor so a below-threshold die is still a valid number |
| `manufacturing.waferDefect.powerFrequencyExponent` | 1.0 | Static/leakage power tracks frequency in the binning model |
| `manufacturing.foundry.contract` | ×1.6 · 25/week · 12 weeks · $0 · no take-or-pay | Rented Phase 1 capacity |
| `manufacturing.foundry.reserved` | ×1.25 · 50/week · 9 weeks · $300k · take-or-pay | Guaranteed capacity trades deposit for multiplier/queue priority |
| `manufacturing.foundry.testAndPackageWeeks` | 2 | Section 11.8 test + packaging time |
| `manufacturing.foundry.minWaferLot` / `maxWaferLot` | 1 / 100 | Whole-wafer lot input bounds |
| `manufacturing.skuAuto.high/mid/lowFrequencyFraction` | 0.95 / 0.80 / 0.60 | Pro/Standard/Value tiers relative to the design clock |
| `manufacturing.skuAuto.salvageFrequencyFraction` | 0.45 | Salvage tier is slower but still sellable |
| `manufacturing.skuAuto.priceBase` / `pricePerMHz` | 25 / 35 | Provisional price curve; rounded to $5 |
| `manufacturing.skuAuto.salvagePriceMultiplier` | 0.55 | Salvage parts sell at a discount |
| `manufacturing.skuAuto.priceRounding` | 5 | Keeps the suggested stack readable |
| `manufacturing.validation.baseBugCoefficient` | 0.6 | Section 7.9 bug-count scale |
| `manufacturing.validation.bugTransistorExponent` | 0.6 | Bugs grow sub-linearly with transistor count |
| `manufacturing.validation.noveltyFactor` | 1.0 | Phase 1 designs are all “new”; M8 can raise/lower by research |
| `manufacturing.validation.customInstructionBugFactor` | 0.15 | Each selected custom instruction adds 15 % expected bugs |
| `manufacturing.validation.hardwiredBugFactor` | 1.2 | Hardwired control has more validation risk than microcode |
| `manufacturing.validation.weeklySkill` / `coverageScaleWeeks` | 8 / 400 | Coverage `1 − e^(−weeks×8/400)`; ~80 % at 80 weeks |
| `manufacturing.validation.rangeSigma` | 1.0 | UI remaining-bug range is ±1σ |
| `manufacturing.validation.severityCosmeticShare` / `severityErrataShare` | 0.60 / 0.30 | Remaining 10 % is serious |
| `manufacturing.validation.microcodeErrataFixShare` | 0.5 | Microcode patches half the errata before release |
| `manufacturing.validation.tapeoutToolCost` / `tapeoutEngineeringCost` | $50k / $25k | Added to the node mask-set cost |
| `manufacturing.validation.coverageWarning` / `fullCoverageThreshold` | 0.80 / 0.999 | Rush warning and “all bugs found” cutoff |
| `manufacturing.respinWeeks` | 10 | Section 7.9 respin lead time |
| `manufacturing.coolingCostPerUnit` | none 0 · heatsink 1.5 · fan 6 | Cooling adds package cost per unit |
| `isa.testStrategies[].escapeRate` | none 1.0 · functional 0.03 · scan 0.01 · full-scan-bist 0.002 · at-speed 0.01 · burn-in 0.005 | Section 11.5 test escapes |
| `isa.testStrategies[].costPerDie` | none 0 · functional 0.05 · scan 0.15 · full-scan-bist 0.35 · at-speed 0.20 · burn-in 0.50 | Test cost enters cost per good die |
| `nodes[].cycleWeeks` | 8–14 | Section 11.8 node cycle time; max'd with fab lead |
| `blocks[].disableable` | FPU and caches | Salvage bins need a block that can be switched off |
| `SAVE_VERSION` | 5 | M7 manufacturing state |

The M7 prices, bug coefficients and contract terms are provisional `[T]` content. The acceptance guards are the reference DPW/yield tests, the 100 % bin share test, the down-binning/salvage tests, the pin-blocking test and the end-to-end lot flow. M9 will tune prices and demand; M12 will add own-fab learning and real capacity economics.

---

## 8. Known bugs / limitations

- **M7 charges cash but there is still no economic loop.** Contract deposits, tape-outs, wafer starts and respins subtract from the player's cash; there is no revenue, weekly operating cost, take-or-pay billing or price erosion yet. M9 owns the market/finance side, so a long game can run out of cash with no way to earn it back.
- RNG streams are now consumed by manufacturing (lot binning, validation bugs, tape-out severities); the M0-era “0 initialized” note no longer applies. Named streams remain isolated per subsystem.
- Save migration now covers v1 → v2 → v3 → v4 → v5. Future schema changes still need their own migrations; unknown/newer versions fail.
- Browser saves are per-browser-profile; export JSON is the portable path.
- On a 1680 px-wide window the top navigation wraps to two rows. Intentional: all 12 screens stay reachable without horizontal scrolling.
- The New Game form fields do not resync after loading a save while the Settings screen is open; they are captured at mount.
- No Web Worker yet; the tick is cheap enough, and M3 physical analysis is memoized and measured under 50 ms on the 30×30 acceptance design. A 40×40 all-block design has not been benchmarked.
- Phase 1 data is consumed by the Chip Designer, architecture editor, physical analysis, performance model, Workload Lab, Validation and Manufacturing. Research, Market, Marketing, Competitors and Finance remain placeholders.
- M2/M3 have one design per game and no UI to create, delete, duplicate or switch designs. The state shape already supports multiple designs; M7 supports multiple products/lots but still edits only the active design.
- M7 implements redundancy, bus-mode/pin enforcement and packaging/test economics. Cache size/line/associativity and the on-chip clock generator remain block configs rather than settings-panel fields.
- Thermal analysis is steady-state only. There is no transient warm-up, heatsink, fan or ambient-temperature control beyond the cooling multiplier; the package limit derates the clock quasi-statically.
- RUDY congestion is an estimate, not a router. Overflow is a warning and feeds wire detours; routability does not block placement or tape-out.
- The Wires overlay draws the logical Manhattan link geometry, not detailed metal tracks. The congestion overlay shows tile demand/overflow from RUDY, so the two views are related but not a route visualization.
- Clock skew uses one global clock source and the farthest block centre. There is no clock tree, useful-skew optimisation or per-region skew.
- The Phase 1 wire-delay table was scaled ×12 to make placement effects visible. It is provisional; M7 did not revisit package thermal/wire data, so that remains a later content pass.
- Pin overflow blocks tape-out but not placement or design editing. The player can still save a design that cannot be manufactured until the bus/package is fixed; the Validation and Manufacturing panels both state the reason.
- Undo history is not saved and is not yet scoped per design; loading or starting a new game clears it.
- Save loading validates design references but not hand-edited geometry or block configs. Invalid geometry can only enter through a crafted/imported save, not through the editor commands.
- The canvas is mouse/pointer driven; there is no keyboard-only placement or screen-reader description of individual blocks yet.
- `Settings` still displays the M1 milestone tag; the data-layer panel is retained, and the screen itself has not been redesigned for M2/M3.
- Phase 1 content values are plausible, not calibrated. M6 checks the six Section 9.7 reference classes.
- Formulas are compiled on every validation call; no parse cache exists yet. This is irrelevant at 45 formulas and can be cached later if data reloads become hot.
- The data error screen lists every issue but has no “copy diagnostics” button; the browser console/browser error message contains the same text.
- **M4 auto-place limitations:**
  - The search moves one block at a time and never swaps two blocks. In dense/almost-full dies it can get stuck in a legal but mediocre local optimum; limited iterations are intentional, but this can be felt.
  - Aspect ratios are fixed before auto-place runs. Two ALUs with awkward shapes may stay awkward; only Square/Wide/Tall changes from the player help.
  - The heat term uses a 10-iteration Jacobi proxy during search; the report and physical panel use the full 60-iteration solve, so the search objective and the displayed cost can differ slightly.
  - The scoring clock is fixed at 1 MHz until M5 supplies the design target clock; thermal priorities therefore do not scale with the player's eventual clock target.
  - EDA level is fixed at 1 in the UI because research is M8; 2,000 iterations is the only budget reachable by hand.
  - No Web Worker yet (M13). Observed runtime is roughly 30–140 ms for the five fixtures at 2,000 iterations; a full 40×40, 17-block design has not been profiled.
  - Regions are rectangles, must contain the block when painted, and cannot be painted freehand. A block's region is not visibly highlighted while dragging other blocks, only by its dashed outline.
  - Locked blocks can still be given a region, but auto-place never moves them, so the region has no effect until unlocked.
  - The last auto-place report is session UI state and is not saved. It can be stale after manual edits or undo.
  - The five acceptance references are fixed fixtures produced offline; they are not a global-optimum benchmark, and random baselines are three deterministic layouts rather than an exhaustive random sample.
  - Preset auto-place rebuilds the design and clears locks/regions; it is not possible to keep a hand-placed locked block inside a preset rebuild.
  - Presets are fixed block sets. Auto-place chooses positions/rotations within the chosen preset, not an arbitrary subset of the block catalog; there is no component-selection optimiser.
  - There are four presets, all selectable regardless of the game year. Historical availability/technology gating is M8.
  - The preset first-fit layout is intentionally simple. Some presets (notably the 1971 calculator) start at a local optimum, so the report can show 0.0% further improvement even though the preset content was just applied.
  - Die resize auto-shifts edge-only blocks only when shrinking. Expanding the die can still make an edge-only block lose its edge contact and reject the resize; the player must move it manually. This matches the requested scope but is a known asymmetry.
  - The shrink shift is exact, not a search: if the inward position overlaps, the command reports the conflict instead of trying a different gap along the edge.
- **M5 ISA/settings limitations:**
  - Instruction counts are analytical, not obtained from generated code. The width-pass, spill, missing-hardware, address-shortfall and custom-removal terms are `[T]` models; M6 calibration checks them against the Section 9.7 reference classes.
  - Custom-instruction cycles (`latencyCycles` per remaining pattern instance) are not in the M5 count. The M6 CPI stack adds them once, without double-counting the removed instructions.
  - Compiler support is fixed at 30 % for every custom instruction. Compiler engineers, per-instruction effort and mature compilers are M8 systems, so all custom instructions look equally mature for now.
  - The opcode budget uses the `opcodeSpaceMultiplier` interpretation (assumption 87). If a later data pack changes `opcodeSpaceBits`/`opcodeCost`, re-check the “four fit, fifth overflows” acceptance example.
  - Extensions are free in M5: they change instruction counts but add no transistors, area, power, decode depth or validation bugs yet. Those costs belong to M6/M7.
  - Address-width shortfall only adds load/store traffic. MMU/page-fault behaviour, segment size checks and multi-user compatibility are M6/M9 concerns.
  - Target clock drives M6 performance (capped by fMax/thermal sustain) and M7 frequency bins; the binning model samples around that sustained clock.
  - Control style changes M6 CPI (hardwired 1.0 vs microcoded 1.5) and M7 validation risk (hardwired ×1.2 expected bugs, microcode patches half of errata).
  - Test strategy coverage feeds M6 uncertainty; prefetch feeds the M6 memory model. M7 adds test escape rate and cost per die; spare rows repair memory arrays during binning.
  - Cache size/line/associativity and on-chip clock generation are block configs, not settings-panel fields. This avoids two sources of truth but means the Section 7.6 cache list is split between the panel (count/status) and the block inspector (values).
  - The Architecture Lab edits only the active design; there is no ISA library, design switcher, cloning or per-company standard ISA yet.
  - The instruction table is wide and relies on horizontal scrolling on narrow windows; the op-class detail table is narrower but still dense.
  - The designer settings panel uses commit-on-blur number fields for target clock/Vdd/prefetch, so those three do not update on every keystroke. Selects, checkboxes and sliders still update immediately.
  - `isa.coolingOptions[heatsink] = 3×` vertical conductance is provisional; real heatsink curves depend on package, airflow and power. M7 uses the cooling cost per unit and the same conductance multiplier, but does not add package thermal data.
  - No instruction-count performance profiling has been done for all ten workloads on a 40×40 design; the function is O(workloads × op classes) and currently imperceptible, but it is recomputed on every render of the panel.
  - The M5 Architecture Lab does not show an ecosystem score, compatibility matrix or licensing offers; those are Section 8.4 and M8/M10 work.
- **M7 manufacturing limitations:**
  - There is no demand or revenue yet. Inventory is produced at cost and never sold, so allocation caps only shape the bin mix; the market price/demand loop is M9.
  - Reserved capacity records `takeOrPay`, but unused slots are not billed weekly. The $300k deposit and wafer multiplier are real; the recurring take-or-pay charge is deferred to M9 finance.
  - Only rented and reserved contract capacity exist. Pure-play foundries, own fabs, construction, node upgrades and capacity resale are M12.
  - Contract capacity is enforced per week, but there is no queue scheduling beyond the start week and no penalty/renegotiation for missing a slot. Changing process nodes leaves the old contract in the list; it simply cannot be used by the new design.
  - Binning samples 500 dies and scales with largest-remainder rounding. It does not model wafer-position clustering, lot-to-lot process drift, burn-in latent failures or per-die leakage bins beyond the frequency/power correlation.
  - Test escape counts are estimated from the strategy and shown on the lot, but they do not yet create field failures, RMAs or reputation damage. That is M9.
  - Expected bugs use one transistor/novelty/custom/control formula; there is no bug-difficulty triage, per-block bug localization, validation cash cost or bug-fixing work. Validation advances with weeks only, and test strategy does not accelerate it.
  - A respin always clears serious bugs after 10 weeks and cannot fail or discover new ones. There is no voluntary respin for cosmetic/errata fixes or a yield-learning respin.
  - SKU auto-suggest is a single heuristic (three frequency tiers plus the first disableable block as salvage). It does not optimize prices against demand, and the player can create an arbitrary number of overlapping SKUs.
  - Pin enforcement is at tape-out only. There is no per-pin electrical check, signal-integrity model, package thermal derate by pin count, or automatic package recommendation.
  - Editing a released design invalidates approval but does not refund tape-out cost or recall/repurpose existing inventory. Products and launched-week history stay attached to the design.
  - Manufacturing and Validation operate on the active design only; there is no design switcher or per-product dashboard. The state shape supports multiple designs, but the UI does not expose them yet.
  - The Manufacturing stats estimate uses the cheapest eligible fab for wafer cost; if the player has only an expensive contract, the headline cost updates to that contract. If no contract exists for the node, the estimate falls back to the rented multiplier while wafer starts remain disabled.

---

## 9. Verification log

- `npm run typecheck` — pass.
- `npm test` — 6 files / 38 tests pass.
- `npm run build` — pass (Vite production build).
- Browser smoke test (Chromium via OpenCode):
  - Dashboard renders; no console errors.
  - 20× advanced 12 weeks in ~0.6 s; 1× advanced 1 week in ~1.2 s; Space paused/resumed.
  - Save to browser → page reload → auto-loaded the same week/date, paused.
  - Export JSON completed without error.
  - New Game (1975, seed 4242, “Nova Microsystems”) reset the clock to week 0 / Jan 1, 1975.
  - Keyboard shortcuts `1`–`9` switch screens.

### M1 verification log

- `npm run typecheck` — pass.
- `npm test` — 9 files / 77 tests pass.
- `npm run build` — pass (Vite production build; data is bundled into the entry chunk).
- Browser smoke test (Chromium via OpenCode):
  - App loaded with zero console errors; startup validation succeeded.
  - Settings → **Data layer** panel showed 9 nodes, 17 blocks, 4 packages, 4 ISA archetypes, 11 custom instructions and 10 workloads.
  - Temporarily removing `vthV` from `nodes.json` (and setting `vddNominal` to 99) replaced the app with the red **“Silicon Forge cannot start”** screen naming `nodes.json: 0.vthV: Invalid input: expected number, received undefined`.
  - Restoring the file and reloading returned to the normal Dashboard; validation ran again and passed.

### M2 verification log

- `npm run typecheck` — pass.
- `npm test` — 15 files / 108 tests pass.
- `npm run build` — pass (Vite production build).
- Browser smoke test (Chromium via OpenCode, fresh 1971 game):
  - Chip Designer rendered the 10×10 grid, pad ring, 17-block palette and estimates panel; zero console warnings/errors.
  - Placed blocks from the palette; an overlapping placement was rejected, and the edge-only BIU was rejected in the interior but accepted on the die edge.
  - Rotated, locked/unlocked, configured and deleted blocks; the Delete key removed the selection and undo restored it.
  - A 10×10 → 8×8 shrink was rejected because the BIU would have fallen outside the die.
  - Pre-placement `Configure…` on the ALU changed width 8 → 16 and Square → Wide, updating the live preview from 356 tr / 8 tiles / 3×3 to 532 / 11 / 3×4 and then 4×3. Applying the draft created no undo entry; placement at (2,2) produced a 4×3 / 532 tr block; undo removed it, redo restored it, and reselect showed the configured values.
  - Save to browser wrote save format v2; reload restored the design paused.

### M3 verification log

- `npm run typecheck` — pass.
- `npm test` — 21 files / 142 tests pass, including the ALU-near/far fMax, hotspot-spreading, Why-share sums, thermal derate and 30×30 `< 50 ms` acceptance tests.
- `npm run build` — pass (Vite production build; 190 modules transformed).
- Browser smoke test (Chromium via OpenCode, fresh profile, 1440×1000):
  - Opened Chip Designer; the M3 tag, overlay selector, physical panel and empty-design warning rendered with zero page exceptions.
  - Placed Register file (0,0), ALU (5,0), Hardwired decoder (0,5) and Program counter & fetch (5,5) through the real palette/canvas pointer path; the panel read 4 blocks.
  - Physical results: sustained clock 390 kHz, fMax 390 kHz (1 pipeline stage / 2,567,092 ps cycle), power 0.18 W, hotspot 42.0 °C with 83.0 °C margin, clock skew 923 ps, 0 congested tiles. Limiting path: “Decoder → ALU → register file” through Hardwired decoder → ALU → Register file, 1 cycle latency.
  - Three Why? buttons were enabled (clock, power, hotspot); opening the clock list showed 7 contributor rows (stage delays, latch overhead, wires, other).
  - Switched Floorplan, Heat, Wires, Congestion and Timing overlays; each became the active mode and the canvas bitmap stayed non-empty.
  - Screenshot saved to `/tmp/opencode/chip-designer-m3.png`.

### M4 verification log

- `npm run typecheck` — pass.
- `npm test` — **193 tests in 25 files**, including the five reference/random/score acceptance tests, determinism, locks, regions, modes, report, cost-formula, four-preset and die-shrink tests.
- `npm run build` — pass (Vite production build; 205 modules transformed).
- Browser smoke test (Chromium headless via CDP, 1500×1100, fresh profile):
  - Dashboard loaded and the top-nav **Chip Designer** opened the M4 tag, overlay bar, Auto-place panel and physical panel with no page exceptions.
  - Placed **Register file** (0,0), **ALU** (5,0), **Hardwired decoder** (0,5) and **Bus interface unit** (5,4) through the real palette/canvas pointer path.
  - **Performance** run with seed 1971: cost `1.032 → 0.798` (22.6% improvement), 3/4 blocks moved, anchors `0 locked · 0 regions`, hotspot 42.4 °C, top reasons `Critical wire budget 77%`, `Compact footprint 17%`, `Thermal headroom 6%`. Undo restored the pre-auto layout.
  - Painted an `0,0 · 8×8` region on the register file by dragging; the dashed amber region outline rendered, the inspector showed the region, and **Clear** removed it. A run with the region reported `1 region` and the block stayed inside.
  - **Power / thermal** run with seed 1971: cost `0.692 → 0.532` (23.2%), 3/4 blocks moved, hotspot 42.2 °C, reasons `Critical wire budget 43%`, `Thermal headroom 42%`, `Compact footprint 15%`.
  - Locked/unlocked the bus through the inspector; the inspector state changed to **Locked**, the report exposed the anchors line, and the tests prove the locked rectangle is unchanged.
  - Selected the **1974 8-bit Consumer CPU** preset and ran auto-place: the design switched to 6 µm NMOS / Plastic DIP / 16×16, built 10 blocks, reported `Preset · 1974 8-bit Consumer CPU`, cost `2.670 → 1.696` (36.5%), 9/10 blocks moved and hotspot 60.4 °C. **Undo** restored the prior design. The 1971 Calculator preset built 6 blocks on 10×10 and was already at its best legal layout (0.0% further improvement, but the design content still changed).
  - Placed the bus interface at (5,4) on a 10×10 die and shrank to 7×10, 10×8 and 7×8 through the toolbar. Each success reported `Resized the die to … and shifted 1 edge block inward`; the die inputs and block count stayed correct and there were no page exceptions.
  - Screenshots saved to `artifacts/smoke-final.png`, `artifacts/preset-result.png` and `artifacts/resize-shrink.png` (workspace artifacts, not part of the build).
- Acceptance numbers: the five fixtures score **82.5 / 78.5 / 87.2 / 82.4 / 86.4%** of their reference cost and beat all three random baselines per fixture.

### M5 verification log

- `npm run typecheck` — pass.
- `npm test` — **226 tests in 29 files** at M5 acceptance, including the M5 ISA/data tests and the unchanged M0–M4 suites.
- `npm run build` — pass (Vite production build).
- Browser smoke test (Chromium headless via CDP, 1440×1100, fresh profile, dev server on 127.0.0.1:5175):
  - Opened **Architecture Lab** from the top nav with zero page exceptions. The M5 tag, 4 archetype cards, ISA parameter grid, 4 extensions, 11 custom instructions, opcode budget and 10-workload breakdown rendered.
  - Fresh 1971 accumulator, 4-bit, 4 registers: Calculator math row `base 132.4 · width +128.4 · missing HW +44 · spills +6 · total 310.8 · 1.00 B/instr`.
  - Set datapath width to 16 and registers to 4 through the real selects: Calculator math row became `base 132.4 · width — · missing HW +22 · spills +3 · total 157.4 · 1.99 B/instr`; the missing-HW term changed because the wider datapath removed width passes before the extension check.
  - Selected the first five custom instructions: the budget turned red, `40 / 32 bits`, `Over budget by 8 bits → encoding grows by 1 byte per instruction`; Calculator math became `151.45 instructions · 2.99 B/instr · 453.45 B code`, proving both custom removal and the longer encoding in the rendered table.
  - Switched to **Chip Designer**: the M5 tag, full-width **Design settings** panel and physical panel rendered. The panel showed target clock/Vdd/pipeline/control/cooling/package/test strategy/prefetch/bus/spare rows and the `Calculator math · 151.45 instructions · 453.45 B code` summary. No complete timing path was present because the design was empty, so the panel correctly showed `no complete timing path yet`.
  - Screenshots saved to `artifacts/m5-architecture.png` and `artifacts/m5-designer.png` (workspace artifacts, not part of the build).
- The manual verification sequence in Section 5 covers the same acceptance criteria for a human player, including a design with a real timing path for the Vdd/pipeline/cooling checks.

### M6 verification log

- `npm run typecheck` — pass.
- `npm test` — **259 tests in 35 files**, including the six calibration references, CPI/memory/FPS/uncertainty tests, Workload Lab import/edit/export/persistence tests, and the unchanged M0–M5 suites.
- `npm run build` — pass (Vite production build; 235 modules transformed).
- Browser smoke test (Chromium headless via CDP, 1600×1000, dev server on localhost:5173):
  - Loaded a fresh 1971 game, opened **Chip Designer**, selected the **1971 Calculator CPU** preset and ran auto-place. The Performance panel (now first in the right column) showed **0.58 MHz**, target 1 / fMax 0.58, **0.06 MIPS ±39 %**, **4.0 FPS / 250.08 ms per frame**, **CPI 9.03**, a 100 % Core microcode segment, 600 ns memory latency with 0 wait cycles, and no caches. The status bar reported 6 blocks / 34.6 % improvement.
  - Opened **Workload Lab** with the same design: built-in suites and custom section rendered, Galaxy Raiders detail showed the 3.72 K operation mix and five pattern shares, and the benchmark table showed `Project Nova-1 ★ · 0.58 MHz · 9.03 CPI · 0.06 MIPS · 4.0 FPS · low`.
  - Clicked **Duplicate**, then **Edit**: the editor rendered identity, all 13 op classes, all 11 pattern inputs, footprint/memory/branch/ILP/variance/frame-cap/GPU fields and Save/Cancel. No page exceptions and the status bar reported the duplicate.
  - Loaded the **1985 32-bit CPU with Caches** preset and ran auto-place: 16 blocks, 82.7 % improvement, Performance showed 1.00 MHz (thermal derate), fMax 7.34, CPI 2.36, caches 1 KB / 64.4 % miss and 0 wait cycles at the 1 MHz target. This is the expected low-clock cache-is-useless case; the 33 MHz comparison is in `tests/unit/memoryModel.test.ts`.
  - Screenshots saved to `artifacts/m6-performance-final.png`, `artifacts/m6-performance.png`, `artifacts/m6-performance-1985.png`, `artifacts/m6-workload-lab.png`, `artifacts/m6-workload-editor.png` and `artifacts/m6-workload-benchmark.png`.
- The M5 manual verification remains valid; performance values are now live in the Performance panel and Workload Lab.

### M7 verification log

- `npm run typecheck` — pass.
- `npm test` — **276 tests in 38 files**, including the DPW/yield reference tests, Monte Carlo binning/shares/down-binning/salvage/determinism tests, pin-overflow tape-out blocking, full lot flow, validation/respin/erratum, design invalidation and v4→v5 migration. The unchanged M0–M6 suites remain green.
- `npm run build` — pass (Vite production build; 262 modules transformed after the command/save split).
- No browser smoke test was run in this session. The UI was typechecked and built; the manual sequence in Section 5 is the acceptance path. M7 adds no screenshot artifact.
- The pin test was tightened during final verification: tape-out now rejects a 46-pin design on the 40-pin limit with `Pin overflow: 6 pins`, and succeeds after multiplexing reduces demand to 30 pins. The test count stays 276 because this extends the existing flow test.
- File-size audit: `src/sim/fab/commands.ts` was split into `commandTypes.ts`, `commandHelpers.ts`, `contractCommands.ts`, `productCommands.ts`, `approvalCommands.ts`, `waferCommands.ts` and `approval.ts`; `src/sim/core/save.ts` was split into `saveSchemas.ts`, `saveValidation.ts` and `saveErrors.ts`. Every TypeScript source/test file is again under 400 lines; the largest remains `ChipDesigner.tsx` at 399.

### Post-M3 split verification (timing.ts / load.ts refactor)

- `npm run typecheck` — pass.
- `npm test` — 21 files / 142 tests pass (unchanged).
- `npm run build` — pass (194 modules transformed, up from 190 because five modules were extracted).
- No public export or import site changed; `src/sim/design/timing.ts` still exports `analyzeTiming` and all result types, and `src/data/load.ts` still exports the same bundle/validation surface.
- Largest TypeScript file after the split: `src/ui/components/canvas/draw.ts` at 395 lines. All code files are under 400 lines.

---

## 10. Next steps (after M7 acceptance)

M7 is complete and awaiting acceptance. Do **not** start M8 until the user accepts M7.

1. **M8 — Research & people:** research fields, EDA level, engineers, compiler maturity and technology gating. The manufacturing model already accepts an `edaLevel` API and a fab `skillFactor` field, but M7 does not populate them.
2. Keep `npm test` and the determinism suite green at every milestone.
3. If M7 tuning changes, re-run `manufacturingYield.test.ts`, `manufacturingBinning.test.ts` and `manufacturingFlow.test.ts` first; then re-check the M4 auto-place fixtures (score range 75–95 % and auto < random) and the six calibration references if package/node data changed.
4. M9 should connect the existing lot/inventory/product data to demand, revenue, price erosion, holding cost and take-or-pay billing; M12 can add own fabs and learning curves using the existing `skillFactor` and `cumulativeWafers` fields.
5. M13 should add the browser smoke/accessibility pass, including the Manufacturing/Validation screens, once the remaining screens are real.
