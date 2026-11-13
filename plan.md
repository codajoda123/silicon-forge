# Silicon Forge — Game Design & Implementation Plan

**Version:** 0.3 (replaces v0.2)
**Date:** 2026-11-11
**Status:** Planning only. Nothing is implemented yet.
**Genre:** UI-first CPU design & semiconductor manufacturing tycoon, starting in 1971.
**Working title:** *Silicon Forge* (placeholder)

---

## 0. How to read this document

This document is the **single source of truth** for building the game. It is written so an AI coding assistant can implement it milestone by milestone.

- **Part A (Sections 1–5):** what the game is, locked decisions, the core loop, new-game setup.
- **Part B (Sections 6–14):** every gameplay system, with the formulas the simulation uses.
- **Part C (Sections 15–19):** UI, tech stack, folder structure, data schemas, milestones with acceptance criteria, and rules for the implementer.
- **Part D (Sections 20–22):** decision record (alternatives with pros/cons), open questions (each with a default), glossary.

Markers used throughout:

- **[T]** = initial *tuning* value. It goes into `src/data/tuning.json` and is never hard-coded. Expect it to change during balancing.
- **[C]** = historical *calibration target* (approximate public figure). Used in calibration tests with a tolerance; it is not exact history and the game is not a documentary.
- **Phase 1 / 2 / 3** = content phase in which something appears (see Section 6.2). The *simulation code* must support all phases from the start; only the *data* is phased.

### 0.1 What changed from v0.2 and why

| # | Change | Why |
|---|---|---|
| 1 | **Default setting is now fictional companies** whose names and personalities only hint at real ones (no real names or logos) with an optional **"Real Names" data pack** that only swaps names. | v0.2 required licenses from real chip companies as a release gate. That will not happen for a project of this size, so the gate would never clear. The brand layer was already data-driven, so nothing is lost: the real-name pack works without code changes. |
| 2 | **Simulation is era-agnostic; content is phased.** Phase 1 content = 1971–1990. All modern examples (8-core 4.8 GHz SKUs, cloud segment, 1080p FPS with GPU cap) moved to Phase 2/3, and era-correct examples were added. | v0.2 said "first release is 1971–1985" but its designer, binning example, market segments and FPS example were all modern. That is a contradiction an implementer cannot resolve. |
| 3 | **Concrete math for every system** (dies per wafer, negative-binomial yield, Monte Carlo binning, CPI stack, timing, thermal grid, congestion, simulated-annealing auto-place, logit market model, discovery probability). | v0.2 said things like "tuned so no package dominates" without any model. An AI implementer would invent inconsistent formulas per screen. |
| 4 | **FPS model fixed.** v0.2's formula added memory stalls on top of a CPI that already contains them (double counting), and used x86 instructions-per-frame directly for a custom ISA. Now: ISA-neutral operation profiles → translated per ISA → CPI stack → frame time. Era-specific benchmark suites (there are no GPUs in the 1970s). | The FPS number is the main way the player "feels" chip power; it must be internally consistent. |
| 5 | **Real-game data path made concrete and legal:** measure a game on your own PC with hardware performance counters + a frame-time tool → JSON profile → import. Still no decompilation. | This delivers the original wish ("how many instructions per frame does a real game execute") without the problems of decompiling. |
| 6 | **Tech stack sequencing.** Still TypeScript + React, but it runs in the browser during development; Tauri desktop packaging moved to the last milestone. Svelte option dropped; React locked. | Removes the Rust toolchain from the critical path and keeps one language until the end. React has the most training data for AI assistants. |
| 7 | **Removed studio-only material** (Steam Workshop, business model, team roles, legal workstream, audience analysis, trailer). | Irrelevant to building the game and wastes the implementer's context. |
| 8 | **Research is gated by field knowledge levels and by physics, not a hidden tree.** | Keeps "no tech tree" honest while preventing nonsense (out-of-order execution in 1972) and still allowing the player to get ahead of history. |
| 9 | **Added era realism mechanics** missing in v0.2: microcoded vs hardwired control, datapath width vs operand width, package pin limits and bus multiplexing, NMOS static power vs CMOS, no pure-play foundries before ~1987, second-source demands by big customers, discrete logic as the "do nothing" competitor, register-file port cost of adding ALUs. | These are what make 1971–1990 decisions in-depth instead of "sliders go up". |
| 10 | The 40-question list was compressed into a **decision record** (Part D); only genuinely open questions remain, each with a default. | The implementer must never be blocked waiting for an answer. |
| 11 | Added **milestones with acceptance criteria, folder structure, TypeScript schemas, and implementer rules.** | Needed to hand this to an AI coder. |

---

# PART A — THE GAME

## 1. Pitch

The player founds a chip company in 1971, when the first microprocessors appear. They hire engineers, design CPUs block by block on a 2D floorplan, choose or invent an instruction set (including custom instructions that do several simple operations at once), pick a process and package, get chips made at someone else's fab or their own, sort defective dies into cheaper "weaker" products, and sell them into a realistic market against AI competitors.

The game is **UI-first**: it looks like an engineering workstation — floorplans, heatmaps, charts, tables, reports, news. Graphics serve information.

Core promise: **understandable depth.** Every chip is a chain of trade-offs, and the player can always ask "why is this chip slow / hot / expensive / low-yield?" and get an answer pointing at one of their decisions.

## 2. Design pillars

1. **Real trade-offs, no free sliders.** Every option has at least one real cost and one real benefit. The player can never max everything.
2. **Freedom of design.** Count, size and position of every block are the player's choice. Multiple strategies must be viable.
3. **History emerges from physics.** Caches become worth it when memory gets slower than the CPU clock; pipelining becomes worth it when the transistor budget allows; leakage becomes a problem at small nodes. The model produces these turning points; the game does not script them.
4. **Emergent research.** People, money, time, luck, competition. No tech tree.
5. **Manufacturing is strategy.** Yield, binning, capacity and cost decide what you can actually sell.
6. **Estimates, not certainty.** Every projection is a range with a confidence level and its reasons.
7. **Explainability.** Every important number has a "Why?" breakdown.

**Anti-pillars (do not build):** 3D graphics or walkable factories; a fixed tech tree; real-time action; transistor-level or RTL simulation; decompiling or shipping any third-party game code; black-box numbers without explanations.

## 3. Locked decisions

| Area | Decision |
|---|---|
| Platform | PC (Windows first; Linux/macOS come free with the stack). Runs in the browser during development; desktop build via Tauri at the end. |
| Tech stack | TypeScript (strict) + React + Vite + Zustand; HTML Canvas 2D for the floorplan; Recharts for charts; Vitest for tests; zod for data validation. Simulation is pure TypeScript with no UI imports. |
| Setting | Real historical timeline, **fictional parody companies by default**; optional "Real Names" data pack. Player company is always custom. |
| Start | 1971 by default; sandbox allows any start year that has content. |
| Content phases | Phase 1 = 1971–1990 (first full playable game). Phase 2 = 1990–2005. Phase 3 = 2005–present. |
| Default mode | Sandbox-first, campaign pressures (bankruptcy, aggressive AI, events) are toggles/presets. |
| Time | 1 tick = 1 week. Pause, 1×, 2×, 5×, 20×. Auto-pause on important events. |
| Money | Constant money, no inflation, values authored in "1971-equivalent dollars". UI may show an optional "≈ today's dollars" conversion. |
| ISA | Base ISA archetypes + custom macro-instructions at launch; full custom encoding editor later. |
| Benchmarks | Fictional era-specific workload suites; user-importable measured profiles; no decompilation. |
| Salvage SKUs | Defective/slower dies are binned into cheaper, weaker products (the "slabija verzija" idea). |
| Development | AI-assisted, milestone by milestone, with tests at every step (Section 18–19). |

## 4. Core loop and time

### 4.1 Loop

1. **Observe** — news, competitor launches, market reports, research results, cash.
2. **Plan** — choose a target segment and budget, assign engineers.
3. **Design** — floorplan + ISA + microarchitecture + process + package.
4. **Validate & tape out** — find bugs, pay mask costs, commit.
5. **Manufacture** — wafers → yield → test → binning → packaging.
6. **Productize** — define SKUs, prices, allocation, marketing.
7. **Sell** — design wins, reviews, sales, competitor response.
8. **Learn** — revenue, reputation, knowledge → next generation.

### 4.2 Design project lifecycle

`Concept → Floorplan → Validation → Tape-out → First silicon (bring-up) → Ramp → Production → End of life`

Design effort in engineer-weeks [T]:

```
effort = 0.9 * (transistors / 1000)^0.75 * novelty * (1 + 0.08 * customInstructionCount)
novelty = 1.0 for a new design; 0.3–0.6 when derived from a previous design (share of reused blocks)
weeks  = effort / effectiveTeamSize
effectiveTeamSize = n / (1 + 0.05 * (n - 1))      // coordination overhead (Brooks-style)
```

Late changes after Validation starts add a penalty: `extraEffort = changedBlockShare * effort * 0.5` [T].

### 4.3 Parallel projects

Phase 1 starts with one active design project. More projects are possible when the player has enough engineers; the UI shows team load per project.

## 5. New game setup

### 5.1 Setup screen fields

- Company name, color, logo glyph (simple generated icon — no art pipeline needed).
- Start year (default 1971).
- Difficulty preset or custom.
- History mode: **Guided** (default), **Dynamic**, or **Strict** (Section 13.6).
- Number of competitors (default 5).
- Random seed (shown, editable).
- First research facility.
- First manufacturing approach.

### 5.2 First research facility [T]

| Option | Cost | Engineer slots | Research multiplier | Weekly upkeep | Drawbacks |
|---|---:|---:|---:|---:|---|
| Garage lab | $60k | 3 | 0.7 | $1k | Slow hiring (fewer candidates), 1 research field at a time, +50% chance a failed experiment wastes the week |
| Small lab | $400k | 8 | 1.0 | $5k | None special |
| Corporate R&D center | $2.0M | 20 | 1.25 | $25k | High fixed cost, +10% coordination overhead, slower to reassign (1-week switch delay) |

Facilities can be upgraded or extended later (equipment level, extra wings, specialized labs).

### 5.3 First manufacturing approach [T]

In 1971 pure-play foundries do not exist yet (they appear around 1987 as a world event). "Contract fab" means renting spare capacity from an established chipmaker.

| Option | Upfront | Capacity | Cost per wafer | Lead time | Drawbacks |
|---|---:|---|---:|---|---|
| Contract fab (rented capacity) | $0 | Whatever the partner offers each quarter | High (×1.6) | 10–14 weeks | Can be bumped when the partner is busy; partner learns about your design (competitor knowledge leak chance) |
| Reserved capacity contract | $300k deposit | Guaranteed wafers/week | Medium (×1.25) | 8–10 weeks | Take-or-pay: unused wafers are still paid |
| Own small fab | $3.5M | 30 wafers/week | Low (×1.0) at full utilization | Build: 52 weeks | Fixed costs whether used or not; must hire fab staff; yield starts poor |
| Own large fab | $12M | 120 wafers/week | Lowest (×0.85) at full utilization | Build: 78 weeks | Huge capex, nearly all starting cash on Standard |

### 5.4 Difficulty presets [T]

| Preset | Start cash | AI aggression | Research randomness | Yield variance | Economic cycles | Bankruptcy |
|---|---:|---|---|---|---|---|
| Sandbox (default) | $50M (or unlimited toggle) | Off/passive | Low | Low | Off | Off |
| Relaxed | $8M | Low | Low | Low | Mild | On |
| Standard | $5M | Medium | Medium | Medium | Normal | On |
| Hard | $3M | High | High | High | Severe | On |
| Realistic | $2M | Very high | High | High | Severe | On, optional ironman |

Custom difficulty exposes every parameter. Accessibility options (reduced randomness, longer deadlines, extra tooltips) are separate from difficulty.

**Balance goal:** on Standard, the player can afford roughly *one medium + one small* choice, or *two small*, or *one large with almost no cash left*. Garage lab + contract fab must be a viable "lean design house" strategy; R&D center + own fab must be a viable "vertically integrated" strategy with higher risk.

---

# PART B — SYSTEMS

## 6. Technology frontier and eras

### 6.1 The world frontier

Every process node, block type, packaging type, technique and market segment is a data record with a `historicalYear`. The *world frontier* is the set of things that exist somewhere in the world at the current date. Competitors push it forward (Section 13.6). The player can be ahead of it (through lucky research) or behind it.

### 6.2 Content phases

| Phase | Years | New mechanics introduced by data |
|---|---|---|
| 1 | 1971–1990 | 4/8/16/32-bit datapaths, microcode vs hardwired, pipelining (simple, in-order), small on-chip caches (late), on-chip FPU (late), MMU, PMOS→NMOS→CMOS, DIP→PLCC→PGA packages, contract fabs then pure-play foundries |
| 2 | 1990–2005 | Superscalar, out-of-order, branch predictors, L2 on die, SIMD, multi-level caches, flip-chip, power becomes a design limit, laptops, servers |
| 3 | 2005–present | Multicore, SMT, leakage/power walls, chiplets & advanced packaging, 3D cache, SoCs, accelerators, mobile, cloud, AI |

### 6.3 Process nodes — Phase 1 data [T]/[C]

Effective density is calibrated from the reference chips in Section 9.7, not from ideal scaling.

| Node | ~Year | Logic family | Wafer | Effective density (transistors/mm²) | Transistors per floorplan tile |
|---|---|---|---|---:|---:|
| 10 µm | 1971 | PMOS | 50 mm (2") | ~190 | 50 |
| 8 µm | 1972 | PMOS | 50 mm | ~220 | 50 |
| 6 µm | 1974 | NMOS | 75 mm (3") | ~280 | 60 |
| 4 µm | 1976 | NMOS | 75 mm | ~500 | 100 |
| 3 µm | 1978 | HMOS (NMOS) | 100 mm (4") | ~880 | 150 |
| 2 µm | 1980 | HMOS | 100 mm | ~1,600 | 300 |
| 1.5 µm | 1982 | NMOS / early CMOS | 125–150 mm | ~2,700 | 500 |
| 1 µm | 1986 | CMOS | 150 mm (6") | ~6,500 | 1,500 |
| 0.8 µm | 1989 | CMOS | 150 mm | ~10,000 | 2,000 |

Each node record also has: `gateDelayPs`, `wireDelayPsPerMm`, `vddRange`, `vthV`, `staticPowerPerKTrW` (large for NMOS, ~0 for CMOS until Phase 3 leakage), `capPerKTrPf`, `waferCost`, `maskSetCost`, `d0Initial`, `d0Mature`, `maturityTauWeeks`, `sigmaFreq` (die-to-die frequency variation), `metalLayers`, `historicalYear`. All [T], calibrated by tests.

**Tile size:** `tileAreaMm2 = transistorsPerTile / density`. This keeps Phase 1 dies between ~7×7 and ~30×30 tiles so the grid stays readable. Later phases use hierarchical design (Section 7.10).

## 7. CPU Designer

The CPU Designer is the heart of the game: a 2D floorplan editor + a settings panel + a live estimates panel.

### 7.1 Workflow inside the designer

1. Choose target segment, node, and die size (W×H tiles). Die size can be changed later.
2. Place blocks from the palette (count and position are free). Or press **Auto-place**.
3. Tune settings (sliders/dropdowns, Section 7.6).
4. Read estimates and overlays; iterate.
5. Send to Validation, then Tape-out.

### 7.2 Floorplan grid

- The die core is a W×H grid of tiles. Around it is a thin **pad ring** (not part of the tile grid; its area = perimeter × pad depth [T]) holding the I/O pads. Pad count is limited by perimeter and by the package (Section 11.6). Blocks marked `edgeOnly` must touch the grid edge.
- A block occupies a rectangle of tiles: `tiles = ceil(blockTransistors / node.transistorsPerTile)`; the player chooses an aspect ratio from the valid options (e.g. 2×3 or 3×2), rotation allowed.
- Empty tiles are allowed (whitespace). Whitespace reduces congestion and hot spots but costs die area.
- Die area: `dieAreaMm2 = (W * H) * tileAreaMm2 + padRingArea + scribe`.

### 7.3 Block catalog

Each block type is data with: `transistors(config)`, `logicDepth(config)` (in gate delays), `activity` per operation class, `requiredLinks`, `edgeOnly`, `isMemoryArray`, `repairable`, `disableable`, `historicalYear`, `researchRequirement`.

**Phase 1 blocks** (transistor formulas are [T]):

| Block | Config options | Purpose / trade-off |
|---|---|---|
| Program counter & fetch | address width | Feeds instructions. Far from bus interface → slower fetch path. |
| Bus interface unit (BIU) | bus width, multiplexed address/data (yes/no), prefetch queue depth 0–8 bytes | Talks to memory. Multiplexing saves pins but costs bus cycles; a prefetch queue hides fetch time (the 8086 trick). |
| Decoder — hardwired | — | Fast, low CPI, but transistors grow with ISA complexity; hard to fix bugs (respin). |
| Decoder — microcoded | microcode ROM words × width | Slower (more cycles per instruction), but compact for complex ISAs and many bugs are fixable in microcode before tape-out. |
| Register file | registers × width; read/write ports derived from execution units | **Ports cost area quadratically**: `area ∝ regs * width * (1 + 0.15 * (ports - 3))^2` [T]. Each ALU needs 2 read + 1 write port. |
| ALU | width 4/8/16/32; carry: ripple / carry-lookahead | Ripple: few transistors, long logic depth (`2*bits + 4`). Lookahead: ~1.6× transistors, depth `4*log2(bits) + 6` [T]. |
| Shifter | simple (1 bit/cycle) / barrel | Barrel shifter is big but makes shifts 1 cycle. |
| Multiplier | none (software) / iterative / array | None = multiplies are software loops (many instructions). Array = large but fast. |
| Divider | none / iterative | Same trade-off as multiplier. |
| FPU (late Phase 1) | none / basic / with sqrt | Huge in Phase 1; essential only for scientific/CAD workloads. |
| MMU / address translation (1980s) | none / segmentation / paging | Required by some segments (multi-user, workstations). Adds latency on memory access. |
| Instruction cache (1980s) | 0–8 KB, line size, associativity | Only worth it once memory is slower than the clock (Section 9.4). |
| Data cache (late 1980s) | 0–8 KB, line size, associativity, write-through/back | Same. |
| Interrupt & timer unit | — | Required by embedded/industrial segments. |
| Clock generator | on-chip / external | On-chip saves board cost (customer likes it), costs area and adds a hot spot. |
| I/O pads | data, address, control | Edge only. Count limited by package. |
| Custom instruction unit | per custom instruction (Section 8.3) | Accelerates one operation pattern; dead area for workloads that don't use it. |

**Phase 2+ blocks** (data only, same code): branch predictor tables, reservation stations / scheduler, reorder buffer, multiple issue ports, L2/L3 slices, SIMD units, integrated memory controller, interconnect (bus/ring/mesh), power management unit, chiplet PHY.

### 7.4 Connections

The player does **not** route wires by hand (tedious, not fun). Required links are generated from block types (e.g. ALU ↔ register file, decoder ↔ every execution unit, BIU ↔ fetch, caches ↔ BIU). Each link has a bit width and a **timing class**: `critical` (inside the cycle), `normal`, or `relaxed`. Links are drawn as straight/L-shaped lines on an overlay. If several blocks of the same type exist (e.g. 2 ALUs), each one gets its own links.

### 7.5 Why placement matters (the formulas)

All distances use tile centers in mm: `L = (|dx| + |dy|) * sqrt(tileAreaMm2)` (Manhattan).

**(a) Wire delay → frequency.** For each `critical` link: `tWire = L * node.wireDelayPsPerMm`. It is added to the delay of the logic path that uses the link (Section 9.1). The player may mark a critical link as **pipelined**: the wire delay leaves the cycle, but the path gains +1 cycle latency (worse CPI). This is a real trade-off players can feel.

**(b) More ALUs is not free.** Each extra ALU adds register-file ports (area grows quadratically), adds bypass wires (the bypass network grows with `units²`), and every ALU must sit close to the register file or the cycle stretches. Two ALUs on opposite sides of the register file is a good layout; two ALUs far away is a slow chip.

**(c) Thermal coupling.** Steady-state heat on the tile grid (Section 9.3). Hot blocks next to each other create a hot spot; hot spot temperature limits the safe clock and raises leakage (later phases).

**(d) Routing congestion (RUDY estimate).** For each link with width `b` bits between tiles A and B, take the bounding box (min 1×1 tile). Add wire demand `b * (w + h) / (w * h)` to every tile in the box. Tile capacity = `node.metalLayers * tracksPerTile` [T]. Overflowing tiles cause: detour factor (+20% wire length per 10% overflow) [T] and a die-area penalty if the player chooses "fix congestion" (adds whitespace rows automatically).

**(e) Defects and yield by region.** Defects land at random positions (Section 11.3). A defect inside a `repairable` memory array can be fixed by spare rows; inside a `disableable` block it creates a salvage die; elsewhere it kills the die. So placing large caches with redundancy and keeping critical logic compact changes real yield.

**(f) Edge constraints.** Pads and the BIU drivers must touch the pad ring. Clock generator should be central-ish (clock skew penalty grows with the max distance from the clock generator to sequential blocks [T]).

**(g) Symmetry/reuse bonus.** Identical blocks placed in a regular arrangement reduce validation effort by up to 10% [T] (verification teams love regular structures).

### 7.6 Settings panel (sliders and choices)

Phase 1: process node · target clock · supply voltage (Vdd within node range) · pipeline stages (1 = not pipelined, up to 5 in Phase 1) · control style (hardwired/microcoded) · datapath width · register count · cache sizes/line/associativity · prefetch queue depth · bus multiplexing · package · cooling (none, heatsink) · test strategy (Section 11.5) · redundancy (spare rows in memory arrays) · on-chip clock generator.

Phase 2+: issue width · out-of-order window · branch predictor type · L2/L3 · SMT · clock/power gating · DVFS · core count · **monolithic vs chiplet vs multi-chip module** (MCM appears in data early for high-end systems; consumer chiplets in Phase 3).

Every slider shows its effect on the estimates panel immediately.

### 7.7 Estimates panel

Always visible next to the canvas:

- Transistor count, die area, dies per wafer, expected yield, cost per good die.
- Max frequency range (and which path limits it — "ALU ↔ register file wire, 41% of cycle").
- Power (dynamic + static), hot-spot temperature, cooling needed.
- Performance per workload of the target segment, as a **range** with confidence (Section 9.6), plus relative to: your previous chip and best known competitor chip.
- Validation risk (expected bug count).
- **"Why?"** button on every number → ordered list of top contributors.

Example (1976, 8-bit design):

> **Est. clock:** 2.6–3.1 MHz — limited by register file → ALU → register file loop (wire 18% of cycle).
> **Business ledger workload:** 0.34–0.41 MIPS-equivalent (1.15–1.35× your previous chip). Confidence: medium (compiler support for your BCD-add instruction is still basic).
> **Risk:** clock generator next to the ALU → hot spot 74 °C; plastic package needs ≤ 70 °C.

### 7.8 Auto-place

Auto-place must be good but not the best (target: 80–90% of a skilled human's score on the same blocks).

**Algorithm:** simulated annealing over block positions/rotations.

```
cost = w_wire * Σ(critical link length * width weight)
     + w_cong * Σ(overflow per tile)
     + w_heat * max(0, hotspotT - targetT)
     + w_area * boundingBoxArea
     + w_edge * edgeViolations * 1e6
modes:  performance (w_wire high), power/thermal (w_heat high), area/cost (w_area high)   [T]
iterations = 2000 * eda.level         // EDA tools research improves auto-place
temperature schedule: geometric, T0 = initial cost * 0.1, alpha = 0.995
```

- Locked blocks are never moved; the player can paint "region" constraints.
- Deterministic for a given seed.
- Produces a short report: top 3 reasons for its choices.
- Limited iterations (not artificial noise) are what make it "not the best"; better EDA research makes it better but never perfect.

### 7.9 Validation, bugs and tape-out [T]

```
expectedBugs = 0.6 * (transistors / 1000)^0.6 * novelty * (1 + 0.15 * customInstructionCount) * (hardwired ? 1.2 : 1.0)
actualBugs   ~ Poisson(expectedBugs)                                      // hidden from player
weekly find probability per remaining bug = 1 - exp(-validationSkillWeek / 400)
```

- The player sees **validation coverage %** and an estimated remaining-bugs range, never the exact number.
- At tape-out, each remaining bug gets a severity: cosmetic (60%), errata needing a workaround (30%), serious (10%) [T]. Microcoded designs can fix 50% of errata via a microcode patch before production; serious bugs after tape-out require a **respin** (new masks, +8–12 weeks) or shipping with an erratum (reputation hit, some customers cancel).
- Tape-out cost = mask set (node data) + design-tool cost + fixed engineering. Rushing (tape-out below 80% coverage) is allowed; it is the classic "ship it or fix it" gamble.

### 7.10 Hierarchical design (Phase 2+)

When chips grow beyond ~40×40 tiles, the designer becomes two-level: a **Core editor** (blocks inside one core, saved as a macro) and an **SoC editor** (place N cores, shared caches, interconnect, memory controller, I/O). Chiplets are separate dies placed in a **Package editor**. The same placement formulas apply at each level. Phase 1 does not need this, but data structures must allow nesting (a block can be a reference to a saved macro).

### 7.11 Worked example — the first chip (1971)

Available: fetch/PC, BIU (4-bit bus), microcoded decoder + small ROM, 4-bit ripple ALU, 16×4-bit register file, I/O pads. Node: 10 µm PMOS. The player builds ~2,300 transistors on a ~7×7 tile die (~12 mm² including the pad ring), puts the ALU right next to the register file, keeps the microcode ROM next to the decoder, and rents capacity at a contract fab. Result: ~0.6–0.8 MHz, slow and cheap. A calculator maker signs a small contract. The player uses the revenue to research 8-bit datapaths — and notices in the "Why?" panel that 8-bit numbers take two passes through a 4-bit ALU, which is exactly why the next chip should be 8-bit.

## 8. Architecture (ISA) Designer

### 8.1 Base archetypes

The simulation uses archetypes. In the default (fictional) pack they have fictional names that hint at real lineages; the Real Names pack can rename them.

| Archetype | Phase | Strengths | Weaknesses |
|---|---|---|---|
| Accumulator CISC (4004/8080-like) | 1 | Tiny hardware, dense code, cheap | Many loads/stores, poor for compilers, hard to pipeline |
| Register-memory CISC (8086/68000-like) | 1 | Dense code, rich addressing, strong compatibility story | Complex decode (needs microcode), variable instruction length hurts pipelining |
| Load/store RISC | 1 (concept appears ~1980 via research/events) | Simple decode, easy pipelining, compiler-friendly | Larger code (more memory bandwidth, bigger I-cache needed), needs a good compiler |
| Stack machine | 1 | Very compact code, simple hardware | Little parallelism, niche markets |
| VLIW | 2 | Parallelism with simple hardware | Brittle, compiler-heavy, bad on branchy code |
| Open modular ISA | 3 | No license fees, extensible | Fragmentation, weak early ecosystem |

Each archetype record contains:

- `opsToInstr[opClass]` — instructions needed per abstract operation (e.g. accumulator CISC: `load: 1.0, intAlu: 1.6` because results must be moved through the accumulator) [T].
- `bytesPerInstr` — average code size (affects fetch bandwidth and I-cache misses).
- `decodeDepth` — gate delays added to the decode path.
- `microcodeCyclesPerClass` — cycles per instruction class when not pipelined (Section 9.4).
- `pipelineFriendliness` 0–1 — hazards/stalls when pipelined.
- `compilerFriendliness` 0–1 — caps compiler quality.

### 8.2 ISA parameters

Word/datapath width (4/8/16/32; 64 later) · register count · address width (limits max memory → some segments require ≥ 20/24/32 bits) · instruction length (fixed/variable) · addressing modes (count; more = better density, more decode depth) · endianness (cosmetic + compatibility) · privilege modes (Phase 1 late: user/supervisor; required for multi-user segments) · extensions (multiply/divide, BCD, floating point, string ops).

**Datapath width vs operand width** is a core Phase 1 mechanic: if the workload's typical operand is 16 bits and the datapath is 8 bits, each arithmetic op costs `ceil(16/8) = 2` passes (instructions or cycles).

### 8.3 Custom macro-instructions

A custom instruction replaces a **pattern** of several simple operations with one instruction executed by a dedicated unit.

Catalog (data) — Phase 1 examples: BCD add/adjust · multiply-accumulate · block move / memory copy · block compare / string search · bit count / bit field extract · table lookup · integer square root · fixed-point multiply · compare-and-branch · loop counter decrement-and-branch. Phase 2+: FP sqrt/reciprocal, dot product/FMA, SIMD shuffles, CRC, AES round, matrix tile.

Each custom instruction record: `patternId`, `opsReplaced k`, `latencyCycles L`, `transistors`, `activity`, `opcodeCost` (bits of opcode space), `validationWeight`, `compilerEffort` (engineer-weeks to reach full compiler support), `patentRisk`.

**Effect on a workload** (the Amdahl trade-off is automatic):

```
c       = workload.patterns[patternId] ?? 0        // fraction of the workload's ops that belong to this pattern
c_eff   = c * compilerSupport(patternId)            // 0..1, grows as compiler engineers work on it; hand-written libraries give 0.3 instantly
removedOps = c_eff * totalOps * (1 - 1/k)           // k ops become 1 instruction
the remaining 1 instruction per pattern instance costs L cycles on the custom unit
```

- Workloads without the pattern get **nothing** but still pay area, power, opcode space and decode depth.
- Opcode budget: each ISA has a fixed opcode space; every custom instruction consumes some. Running out forces a longer encoding (code size grows) — the trade-off v0.2 mentioned but did not quantify.

### 8.4 Software ecosystem

Each ISA (including the player's) has an **ecosystem score 0–100** [T]:

```
ecosystem(t+1) = ecosystem(t) * 0.995
               + 2.0 * log10(1 + installedBaseUnits / 10000)
               + 0.5 * compilerEngineers + 0.3 * devKitProgram + 1.0 * osPortsCompleted
```

- Ecosystem affects segment utility (Section 13.2) via compatibility and "software available".
- **Backward compatibility:** a new ISA that is a superset of your previous one keeps the installed base; a new incompatible ISA starts at a low score (optionally with an emulation mode: runs old software at 20–40% speed [T]).
- A technically better ISA can lose to a worse one with a bigger ecosystem — this is intended.

### 8.5 Licensing and second sourcing

- The player can license a competitor's ISA when offered (cost + royalty per unit + restrictions such as "no incompatible extensions").
- The player can license their own ISA/design to others (royalty income, ecosystem grows, competitors get stronger).
- **Second-source demand (Phase 1 realism):** large customers (e.g. a big computer maker) may demand that the design is licensed to a second manufacturer before they sign. Accepting: big contract + ecosystem growth, but a competitor can now sell your chip. Refusing: lose the deal.

## 9. Performance model

The model is **analytical** (formulas), not cycle-accurate. It must be fast enough to recompute on every slider change (< 50 ms for a Phase 1 design).

### 9.1 Frequency

Logic paths are defined in data (Phase 1 examples): `regRead → ALU → regWrite` (execute loop), `fetch → decode`, `microcodeROM → control`, `BIU → pads`.

```
pathDelay  = Σ(block.logicDepth along path) * node.gateDelayPs * voltageFactor
           + Σ(critical link tWire along path not marked pipelined)
stageDelay = pathDelay / pipelineStagesOnPath + latchOverheadPs        // latchOverhead = 3 * gateDelay [T]
fMaxDesign = 1 / max(stageDelay over all paths)                         // then clock skew penalty applied
voltageFactor = ((V_nom - Vth)^1.3 / V_nom) / ((V - Vth)^1.3 / V)       // alpha-power law; higher V = faster
```

- The player sets a **target clock**. If target > fMax, the estimate shows the shortfall and yield at that bin drops (Section 11.3).
- Thermal limit: if hotspot > package limit at target clock, sustained clock = clock × derate (simple linear derate to the limit) [T].
- Deeper pipelines raise fMax but latch overhead gives diminishing returns, and branch/hazard penalties grow (Section 9.4) — the classic pipeline-depth optimum emerges.

### 9.2 Power

```
P_dynamic = Σ_blocks activity(block, workload) * capPerKTr * (transistors/1000) * V^2 * f
P_static  = node.staticPowerPerKTrW * (transistors/1000) * (V / V_nom)^2      // big for NMOS, ~0 for CMOS in Phase 1
P_total   = P_dynamic + P_static (+ I/O power per active pad [T])
```

NMOS chips burn power even when idle; CMOS (mid-1980s) makes power scale with activity — a historical turning point that should be visible in the "Why?" panel.

### 9.3 Thermal

Steady-state heat on the tile grid (Jacobi iteration, 60 iterations is enough for Phase 1 sizes):

```
p[i,j]   = power density of the block on that tile (W per tile)
g_v      = vertical conductance per tile from package + cooling   [T]
g_l      = lateral conductance between neighboring tiles           [T]
T[i,j]   = (p[i,j] + g_v*T_ambient + g_l*Σ T[neighbors]) / (g_v + n_neighbors*g_l)
hotspot  = max(T)
```

Package data defines `maxJunctionTempC` and `g_v`. A heatsink increases `g_v` and costs money per unit. Overlay: thermal heatmap.

### 9.4 CPI stack (cycles per instruction)

**Step 1 — instruction count.** From the ISA-neutral workload profile (Section 10.1):

```
instructions = Σ_opClass ops[opClass] * isa.opsToInstr[opClass] * widthPasses(opClass)
             - customInstructionRemovedOps                                              // Section 8.3
widthPasses  = ceil(workload.operandBits / datapathWidth)  for arithmetic/logic/load/store classes, else 1
             // missing hardware (no multiplier) means the op becomes a software routine: × softwareRoutineLength [T]
```

**Step 2 — core CPI.**

```
if pipelineStages == 1:                         // non-pipelined (typical early 1970s)
    CPI_core = Σ_class mix[class] * isa.microcodeCyclesPerClass[class] * controlFactor
    controlFactor = 1.0 hardwired, 1.35 microcoded  [T]
else:                                           // in-order pipeline (Phase 1), superscalar/OoO (Phase 2+)
    issueCPI      = 1 / min(issueWidth, ILP_available(window))
    unitCPI[u]    = Σ_class∈u mix[class] * occupancy[class] / unitCount[u]          // structural limit: this is why ALU COUNT matters
    hazardCPI     = Σ_class mix[class] * depProb * max(0, latency[class] - 1) * (1 - ooHide(window)) * (1 - isa.pipelineFriendliness*0.5)
    CPI_core      = max(issueCPI, max_u unitCPI[u]) + hazardCPI
ILP_available(window) = workload.ilpMax * (1 - exp(-window / workload.ilpScale))
ooHide(window) = 0 for in-order; 1 - exp(-window / 32) for out-of-order  [T]
```

**Step 3 — branch penalty.**

```
CPI_branch = branchFraction * (1 - predictorAccuracy(predictorType, workload.branchPredictability)) * mispredictPenalty
mispredictPenalty = frontEndStages + 1          // grows with pipeline depth; 0 extra for non-pipelined designs
```

**Step 4 — memory stalls (this is where caches start to matter).**

```
cycleNs        = 1000 / f_MHz
memWaitCycles  = max(0, ceil(memoryLatencyNs(year) / cycleNs) - 1) + busCycles(multiplexed?, busWidth)
missRate(sizeKB, footprintKB) = sizeKB >= footprintKB ? compulsoryFloor
                               : clamp(m0 * (sizeKB / 1)^(-0.5) * assocFactor, compulsoryFloor, 1)     // "√2 rule" power law [T]
CPI_mem = fetchesPerInstr * missRate_I * memWaitCycles
        + memOpsPerInstr  * missRate_D * memWaitCycles
        (no cache → missRate = 1; a prefetch queue hides up to queueDepth/bytesPerInstr of fetch waits)
cache hit latency adds cycles when cache access time > cycle time (access time ∝ sqrt(sizeKB)) [T]
bandwidth check: if requiredBytesPerSec > busBandwidth → scale CPI up proportionally
```

`memoryLatencyNs(year)` is world data [T] (≈ 600 ns in 1971, ≈ 250 ns in 1980, ≈ 120 ns in 1990, ≈ 70 ns in 2000s). At 1 MHz a memory access fits inside one cycle, so a cache is wasted area; at 33 MHz the same memory costs several wait states, so a cache becomes valuable. **The model creates the historical turning point by itself.**

**Step 5 — total.**

```
CPI   = CPI_core + CPI_branch + CPI_mem (+ custom-instruction cycles already included via mix)
time  = instructions * CPI / f
IPC   = 1 / CPI
```

Multi-core (Phase 3): `T_n = T_1 * ((1 - p) + p / n_eff)`, `n_eff = min(cores * smtGain, workload.maxThreads) * contention(sharedCache, bandwidth)`.

### 9.5 Performance outputs

- Per workload: time per work unit, throughput, FPS where relevant (Section 10.3), "MIPS-equivalent" for familiarity.
- **Segment score:** weighted geometric mean of workload speedups vs a per-era reference chip.
- **CPI stack chart:** bar split into core / structural / hazards / branch / memory — the best "Why is it slow?" visualization.

### 9.6 Uncertainty and confidence

Displayed range = `estimate * (1 ± u)`, with

```
u = 0.04 (base model error)
  + 0.10 * (1 - validationCoverage)
  + 0.08 * (1 - compilerMaturity)        // weighted by how much the workload relies on new instructions
  + workload.variance                     // e.g. games vary more than math kernels
```

Confidence label: high (u < 0.08), medium (< 0.15), low (≥ 0.15), with the top two reasons shown.

### 9.7 Calibration targets [C]

A "reference design" for each class must be buildable from the data, and the model must land within **±35%** on clock and MIPS (die area within ±30%). These are approximate commonly cited figures:

| Reference class | Year | Node | Transistors | Die | Clock | MIPS (approx.) |
|---|---|---|---:|---:|---|---|
| 4-bit calculator CPU (4004-class) | 1971 | 10 µm PMOS | ≈2,300 | ≈12 mm² | ≈0.74 MHz | ≈0.05–0.09 |
| 8-bit (8080-class) | 1974 | 6 µm NMOS | ≈4,500–6,000 | ≈20 mm² | 2 MHz | ≈0.3 |
| 16-bit (8086-class) | 1978 | 3 µm HMOS | ≈29,000 | ≈33 mm² | 5–10 MHz | ≈0.3–0.75 |
| 16-bit protected mode (80286-class) | 1982 | 1.5 µm | ≈134,000 | ≈49 mm² | 6–12.5 MHz | ≈1–2.7 |
| 32-bit (80386-class) | 1985 | 1.5 µm CMOS | ≈275,000 | ≈104 mm² | 16–33 MHz | ≈4–11 |
| 32-bit pipelined + cache + FPU (80486-class) | 1989 | 1 µm CMOS | ≈1.2 M | — | 25–50 MHz | ≈20–40 |

Calibration is a test file (`tests/calibration.test.ts`), not a hand-tweak. If a formula change breaks calibration, the test fails.

## 10. Workloads, benchmarks and FPS

### 10.1 Workload profile (ISA-neutral)

A workload describes *what the program does*, not its code:

```ts
interface WorkloadProfile {
  id: string; name: string; era: [number, number]; kind: "kernel" | "app" | "game";
  workUnit: "iteration" | "frame" | "job";
  opsPerUnit: Record<OpClass, number>;        // intAlu, intMul, intDiv, shift, bcd, fpAdd, fpMul, fpDiv, fpSqrt, load, store, branch, simd...
  operandBits: number;                         // typical data width (8, 16, 32...)
  patterns: Record<PatternId, number>;         // fraction of ops that match custom-instruction patterns
  branchPredictability: number;                // 0..1
  ilpMax: number; ilpScale: number;            // available instruction-level parallelism
  depProb: number;                             // chance an op depends on the previous one
  footprintKB: { instr: number; data: number };
  memBytesPerOp: number;
  parallelFraction: number; maxThreads: number;
  frameCapHz?: number;                         // for games: display refresh limit (50/60 Hz)
  gpuFrameMs?: number;                         // Phase 2+ only; undefined = no GPU limit
  variance: number;                            // scene-to-scene variation, feeds the uncertainty range
  source: "builtin" | "measured";              // measured = imported from a real measurement (Section 10.4)
}
```

### 10.2 Built-in suites (fictional names, era-specific)

**Phase 1 suite:** Calculator math (BCD) · Business ledger (16-bit integer, BCD) · Text editor (byte ops, branchy) · Terminal/I/O controller (interrupt-heavy) · *Galaxy Raiders* (1978-style arcade game, frame-locked 60 Hz) · *Dungeon Quest* (1983-style home computer game) · Spreadsheet recalculation · CAD / scientific (floating point) · Compiler build (branchy, larger footprint) · Multi-user time-sharing (needs MMU).

Each segment uses a weighted subset (Section 13.1).

### 10.3 FPS model (fixed from v0.2)

```
cpuFrameMs = instructionsPerFrame * CPI / f            // CPI already includes memory stalls — do not add them again
             (+ fixed system overhead per frame [T], e.g. interrupt handling)
frameMs    = max(cpuFrameMs, gpuFrameMs ?? 0)
FPS        = min(frameCapHz ?? Infinity, 1000 / frameMs)
```

- Phase 1 games have **no GPU**: the CPU does everything, so FPS is a direct reflection of the chip. Frame-locked games show "60 FPS (uses 72% of frame budget)" — headroom is useful information.
- Calibration [C]: an 8080-class 2 MHz design should run *Galaxy Raiders* at ~60 FPS (as real 1978 arcade games did on that class of chip); a 4004-class design should manage only single-digit FPS.
- Output always shows: FPS range, CPU-bound vs GPU/cap-bound, top bottleneck ("memory wait states 38%").

### 10.4 Real games: measured profiles instead of decompilation

The original idea was to decompile real games to learn how many instructions they execute per frame. **Decompiling does not give that** (it gives static code, not what actually runs per frame), and it carries legal problems. Measuring does give it:

1. On a real PC, run the game at fixed settings and a fixed scene.
2. Record **hardware performance counters** for the game process: instructions retired, cycles, branches, branch misses, cache misses (tools: Linux `perf stat`, AMD uProf, Intel VTune).
3. Record **frame times** at the same time (e.g. PresentMon on Windows).
4. `instructionsPerFrame = instructionsRetiredPerSecond / averageFPS` (main thread separately if the tool gives per-thread data).
5. Convert to an ISA-neutral profile with a small included script/page (`tools/profile-converter`): instructions → ops using `refIsa` ratios; branch-miss rate → `branchPredictability`; cache misses → `footprintKB` estimate; GPU-bound frame time → `gpuFrameMs`.
6. Import the JSON in-game (Workload Lab). It appears in benchmarks next to the built-in suite.

Notes: this is measurement on your own machine, not reverse engineering of code. The shipped game contains only fictional workloads; measured profiles are user files. A modern game profile makes sense only for Phase 2/3 chips (a 1975 chip will show 0.001 FPS — which can be a fun "time machine benchmark" button). (Not legal advice.)

### 10.5 Workload Lab

A screen where the player can view all profiles, duplicate and edit them with sliders, import/export JSON, and run any design against any profile.

## 11. Manufacturing

### 11.1 Make vs buy

Contract fab (rented capacity, Phase 1 early) · reserved capacity · pure-play foundry (world event ~1987: cheaper, more capacity, multiple customers) · own fab · hybrid (own fab for mature products, foundry for others). Pros/cons as in Section 5.3.

### 11.2 Dies per wafer

```
DPW = floor( π * (d/2)^2 / A  -  π * d / sqrt(2 * A) )      // d = wafer diameter (mm), A = die area incl. scribe (mm²)
```

### 11.3 Yield and defects

**Defect density over time** (process maturity + fab learning) [T]:

```
D0(t) = D0_mature + (D0_initial - D0_mature) * exp(-weeksSinceNodeIntro / tau) * fabSkillFactor
own fab: fabSkillFactor improves with cumulative wafers processed (learning curve: -10% per doubling) [T]
```

**Die yield (negative binomial, includes defect clustering):**

```
Y = (1 + A_cm2 * D0 / α) ^ (-α)        // α = clustering parameter [T], ~2–3; lower α = more clustering
```

**Per-die Monte Carlo (used for binning).** For each production lot, simulate a sample of 500 dies [T] and scale to the real wafer count:

1. Number of defects on the die `K ~ NegativeBinomial(mean = A·D0, α)`.
2. Each defect lands at a random position (area-weighted) → hits a block or whitespace.
3. Defect in whitespace: harmless (with probability 0.9 [T]).
4. Defect in a `repairable` array with spare rows left: repaired.
5. Defect in a `disableable` block (cache half, FPU, one core in Phase 3): die marked "salvage: block X disabled".
6. Any other defect: die is dead (scrap).
7. Frequency: `f_die ~ Normal(f_design, σ_node * f_design)`; static power correlates positively with `f_die` (fast dies leak more) [T].
8. Test escape: with probability depending on test strategy, a bad die passes test → field failure/RMA later.

### 11.4 Binning and SKUs (the "weaker version" system)

The player defines a **product stack** for each die: a list of SKUs with requirements and a price.

```ts
interface Sku { id; name; minFreqMHz; requiredBlocks: BlockId[]; disabledBlocks: BlockId[]; maxPowerW; price; }
```

- Each tested die goes to the **highest-priced SKU it qualifies for**, unless the player sets allocation targets (then good dies can be deliberately **down-binned** to fill demand for a cheaper SKU — realistic, and a real dilemma).
- The game suggests a sensible stack automatically (based on the frequency distribution and salvage counts); the player can edit or delete it.
- **Phase 1 example** (one 16-bit die, 1979):

| SKU | Requirement | Price [T] | Typical share |
|---|---|---:|---:|
| Pro-10 | ≥ 10 MHz, all blocks | $360 | ~15% |
| Std-8 | ≥ 8 MHz | $220 | ~45% |
| Value-5 | ≥ 5 MHz | $120 | ~30% |
| Lite (salvage) | ≥ 5 MHz, multiplier disabled (defective) | $70 | ~5% |
| Scrap | — | — | rest |

- Later phases add core-count and cache-size binning (e.g. a die with a dead core sold as a lower core count) and feature binning (e.g. a chip sold with its FPU disabled, as happened historically with "SX"-style parts).

### 11.5 Test and packaging

**Test strategies** [T]: basic functional (cheap, 3% escape rate) · at-speed (needed for accurate speed binning, 1% escapes) · burn-in (reliability for military/industrial, removes early failures, expensive) · system-level (Phase 2+).

**Packages (Phase 1):** ceramic DIP (reliable, expensive) · plastic DIP (cheap, worse thermals, cheaper customers accept it) · PLCC (1980s) · PGA (1980s, many pins, expensive). Each package has `maxPins`, `maxJunctionTempC`, thermal conductance, cost per unit, `historicalYear`. Phase 2+: flip-chip, BGA, MCM, interposer, 3D stacking.

### 11.6 Pins and buses (Phase 1 realism)

`pinsNeeded = dataBusWidth + addressBits + controlPins + power/ground`. If `pinsNeeded > package.maxPins`, the player must **multiplex** (share pins between address and data → extra bus cycles in Section 9.4), shrink the bus, or pay for a bigger package. This is exactly why many 1970s chips multiplexed their buses.

### 11.7 Own fab

- Build: pick location (labor cost, incentives, disaster risk), size, node. Construction time and staged payments.
- Staff: fab technicians and process engineers (affect fabSkillFactor).
- Costs: depreciation (capex / 5–7 years [T]), fixed weekly operating cost, variable cost per wafer. **Under-utilization is expensive**: fixed costs are paid whether wafers run or not.
- Node upgrade: retooling cost and downtime; old fabs can keep making mature/cheap products or sell capacity to others (become a contract fab for AI competitors = income).

### 11.8 Lead times and inventory

Wafer start → finished wafer: node-dependent cycle time (8–14 weeks [T]). Then test + packaging 2–3 weeks. Inventory costs holding cost per week and can become obsolete (price falls when a better chip launches).

## 12. Research and people

### 12.1 Fields

Process technology · Circuit design · Microarchitecture · Memory systems · Packaging & test · Software & compilers · Manufacturing science · Reliability & validation · (Phase 2+: Power management, Interconnect).

Each field has a **knowledge level** `L_f` (continuous, starts 0–2 depending on background).

### 12.2 Engineers

```ts
interface Engineer { id; name; age; skills: Record<FieldId, number /*0..100*/>; creativity: number; speed: number;
                     discipline: number; salaryPerWeek: number; morale: number; loyalty: number; burnout: number;
                     assignment: Assignment; traits: TraitId[]; }
```

Assignments: research a **single field** · **broad** research (all fields, more serendipity) · a **design project** (speeds design, finds bugs) · **validation** · **compiler/software** · **reverse engineering** a specific observed technology · **fab process engineering** (own fab).

Hiring: a candidate pool refreshes monthly; size depends on facility, reputation, salary offer. Competitors poach unhappy engineers. Crunch (overtime toggle) increases output +25% but raises burnout; burned-out engineers make more bugs and quit [T].

### 12.3 Research points and knowledge [T]

```
RP_f (per week) = Σ_engineers on f [ skill_f/50 * speed * morale * facilityMult * equipmentMult ] / (1 + 0.04*(n-1))
L_f += RP_f / (20 * (1 + L_f)^1.2)                      // diminishing returns
broad research: each engineer splits RP across all fields at 60% efficiency, but doubles serendipity weight
```

### 12.4 Technologies (data, not a tree)

```ts
interface Tech { id; name; fields: Record<FieldId, number /*min level*/>; difficulty: number; historicalYear: number;
                 effects: Effect[]; /* unlock block/config/node/package, or numeric improvement */ patentable: boolean; }
```

**Discovery chance per week** for each undiscovered tech:

```
readiness   = sigmoid( min_f(L_f - req_f) / 0.75 )          // soft requirement: near-ready techs are possible, far ones ~0
p_discover  = 0.004 * readiness * (relevantRP / difficulty) * (1 + creativityBonus + 0.5*serendipityWeight) * difficultyRandomness
```

- **Untargeted:** the player cannot pick a tech that nobody has shown. They only choose fields and people; discoveries arrive as events ("Dr. Novak's team found a way to make carry-lookahead adders 20% smaller").
- **Physics decides usefulness:** you *can* discover caches in 1973, but they are almost useless at 1 MHz (Section 9.4). Being "ahead of history" is allowed and rewarding only when it actually helps.
- **Incremental discoveries:** most results are small numeric improvements (+3% density, −5% gate delay, −8% D0). Rare ones unlock new blocks/configs.
- **Negative results** add knowledge (+0.2 levels) so the week is not wasted.
- **Pity timer:** if a field with high RP has no discovery for 26 weeks, the next week guarantees a small one (on/off by difficulty).

### 12.5 Competitor-triggered (targeted) research

A tech becomes **observed** when a competitor ships a product using it, publishes it (conference event) or files a patent. Only observed techs can be targeted.

Ways to get an observed tech:

| Path | Speed | Cost | Risk |
|---|---|---|---|
| Reverse engineering (buy their chips, teardown, analyze) | Medium | Engineers + chip purchases | Partial success possible; patent lawsuit risk if patented |
| Clean-room reimplementation | Slow (×1.6 effort) | Engineers | Patent risk low |
| License it | Instant–fast | Fee + royalty | Restrictions, money to a competitor |
| Hire an engineer from that competitor | Variable | High salary | Legal/ethics event chance, loyalty risk |

Reverse engineering progress: `progress += RP_relevant * (0.5 + 0.5*readiness)`; when `progress ≥ difficulty * 0.6`: roll success (70% full, 20% partial insight, 10% fail) [T].

### 12.6 Research UI

Fields with levels and trends · teams and assignments · "known unknowns" (observed but not owned techs) with readiness bars · per field a count of "?" (number of undiscovered things that are currently reachable, without names) · discovery log with failures · events from engineers requesting funding for odd ideas.

## 13. Market, sales, marketing, competitors

### 13.1 Segments (data with size curves by year)

**Phase 1 segments:**

| Segment | From | Cares about | Notes |
|---|---|---|---|
| Calculators & business machines | 1971 | price, BCD speed, low pin count | huge price sensitivity |
| Embedded / industrial control | 1972 | price, reliability, interrupts, longevity | long qualification, long product life |
| Terminals & peripherals | 1973 | price, I/O, byte ops | — |
| Military / aerospace | 1971 | reliability (burn-in, ceramic), temperature range | high prices, slow qualification, second-source required |
| Arcade & consoles | 1975 | game FPS, price, volume | very high volume, low margin, custom deals |
| Home computers | 1977 | price, game + text performance, ecosystem | brand and software library matter |
| Business PCs | 1981 | compatibility (ecosystem!), business workloads, MMU later | lock-in to an ISA once a platform wins |
| Workstations / multi-user | 1980 | 32-bit, MMU, FP, compiler performance | high margin |

Each segment: `sizeUnitsPerWeek(year)`, `priceCeiling(year)`, `weights` (perf, price, power, reliability, compatibility, availability, brand), `workloadMix`, `requirements` (min address bits, MMU, package, qualification weeks).

### 13.2 Demand: multinomial logit choice model

```
U_i   = w_perf*log(perfScore_i) - w_price*log(price_i) - w_power*power_i + w_rel*reliability_i
      + w_compat*compat_i + w_brand*awareness_i + w_review*reviewScore_i + w_avail*availability_i
share_i = exp(U_i/τ) / ( exp(U_0/τ) + Σ_j exp(U_j/τ) )
sales_i = segmentSize * share_i      (limited by your actual inventory; unmet demand partly waits as backlog, partly goes to competitors)
```

`U_0` is the **outside option**: in 1971 that is "keep using discrete logic chips / no microprocessor". As microprocessors improve, `U_0` loses — the market grows because chips get good, not because a timer says so.

### 13.3 Design wins and contracts

Named fictional customers (calculator maker, arcade company, home computer company, big business computer company, government agency) issue **RFQs**: requirements, volume, target price, deadline, sometimes exclusivity or second-source demands. Winning = sample chips + evaluation by their workload mix + price negotiation (simple offer/counteroffer with acceptance probability). Contracts lock volume and price; missing delivery → penalties.

### 13.4 Marketing

```
awareness_s(t+1) = awareness_s(t) * (1 - 0.02) + 0.15 * log(1 + spend_s / scale_s) * messageFit     [T]
```

Channels (Phase 1): trade press ads · trade shows · direct sales engineers (better for design wins) · developer/evaluation kits (grow ecosystem) · application notes. Diminishing returns are built in (log). Misleading claims (message far above actual review results) create a credibility penalty later.

### 13.5 Reviews and reputation

Trade-press reviewers (fictional magazines) each test a workload mix and have biases. A review = score + short generated text from templates ("fast at ledger work, runs hot, plastic package a concern"). Reputation = slow-moving average of reviews, reliability (RMA rate), delivery performance and errata.

### 13.6 Competitors (AI)

- 4–8 fictional companies with personalities: performance leader, cost leader, ecosystem builder, fast follower, vertically integrated giant, niche specialist.
- **Same rules as the player:** they create designs from block templates + auto-place, run the same performance/yield/cost models, price for a target margin, market, and react to the player's prices and launches.
- **History mode** controls their technology pace:
  - *Guided (default):* competitors gain techs near `historicalYear` (± up to 2 years, random), so history roughly replays unless the player disrupts it.
  - *Dynamic:* competitors research like the player; history can diverge completely.
  - *Strict:* key launches happen in their historical year (most "documentary-like").
- Fog of war: they don't know the player's design until launch; the player knows theirs only via launches, reviews, teardowns, rumors.
- Difficulty changes their money, information quality and aggression — never their basic competence.

### 13.7 Events (data-driven)

Economic cycles/recessions · oil shock · memory price crash · rise of home computers · a big business-computer platform choosing a CPU (huge design win event) · pure-play foundry appears (~1987) · trade disputes · lawsuits (patent, second-source disputes) · fab disasters. Events have conditions, probabilities, choices and effects.

## 14. Finance and failure

- Quarterly P&L: revenue, cost of goods sold (wafers, test, packaging, yield loss), gross margin, R&D (salaries, equipment), SG&A (marketing, sales), depreciation, interest, taxes [T].
- Cash flow statement and balance sheet (simplified): cash, inventory, receivables (customers pay after 30–60 days [T]), fixed assets, debt.
- Financing: bank loans (rate depends on reputation and cash), investors (sell equity for cash, they demand growth), IPO later.
- **Failure:** cash < 0 and no credit for 8 weeks → bankruptcy (if enabled). Warning signs shown early: runway weeks, inventory build-up, falling reputation, obsolete products.
- **Victory paths** (campaign): market leadership (share in N segments), technical leadership (fastest chip in a segment for 2+ years), financial (valuation target), legacy (survive to the end of the content). Sandbox: no victory; continue after winning.

---

# PART C — BUILDING IT

## 15. UI

### 15.1 Screens

1. **Dashboard** — date, cash, runway, alerts, news feed, active projects, products on sale.
2. **Chip Designer** — canvas, palette, settings panel, estimates panel, overlays.
3. **Architecture Lab** — ISA choice/parameters, custom instructions, compiler support, ecosystem.
4. **Validation & Tape-out** — coverage, bug estimate, tape-out button, respin decisions.
5. **Manufacturing** — fab/foundry contracts, wafer starts, yield over time, binning results, SKU editor, inventory.
6. **Research** — fields, engineers, assignments, known unknowns, discovery log, hiring.
7. **Market & Sales** — segments, shares, prices, RFQs/contracts, backlog.
8. **Marketing** — campaigns, awareness, reviews.
9. **Competitors** — known products, specs, prices, reviews, rumors.
10. **Finance** — P&L, cash flow, loans.
11. **Workload Lab** — profiles, import/export, benchmark any design.
12. **New Game / Load / Settings.**

Top navigation bar + keyboard shortcuts (1–9 for screens, Space = pause, +/- = speed).

### 15.2 Chip Designer wireframe

```
+-------------------------------------------------------------------------------------------+
| [Project: "Nova-8"]  Node: 6µm NMOS  Die: 10x10 (≈22 mm²)     [Auto-place ▾] [Validate ▸] |
+-----------+------------------------------------------------+------------------------------+
| PALETTE   |  CANVAS (grid, pad ring, blocks, link lines)   | ESTIMATES                    |
| Fetch     |  . . . . . . . . . .                           | Transistors   5,840          |
| BIU       |  . [ROM ][DEC ] . .                            | Clock      2.4–2.8 MHz  (?)  |
| Decoder   |  . [RF  ][ALU ][SHF] .                         | Power      1.1 W        (?)  |
| RegFile   |  . [BIU      ] . . .                           | Hotspot    68 °C        (?)  |
| ALU       |                                                | Yield      41%          (?)  |
| ...       |  Overlays: [None][Heat][Wires][Congestion]     | Cost/die   $38          (?)  |
|           |            [Timing][Defect risk]               | Ledger  0.30–0.36 MIPS  (?)  |
| SETTINGS  |                                                | Arcade   48–55 FPS      (?)  |
| sliders…  |                                                | CPI stack ███▒▒░            |
+-----------+------------------------------------------------+------------------------------+
```

### 15.3 Style

Technical blueprint look, evolving by era (warm paper/amber for the 1970s, cool blue for the 1980s, dark mode later). Colorblind-safe heatmaps (use patterns + a perceptual palette), UI scaling, reduced motion option. All text in a localization file (English first).

## 16. Tech stack and architecture

### 16.1 Stack

| Purpose | Choice |
|---|---|
| Language | TypeScript, `strict: true`, no `any` |
| Build/dev | Vite |
| UI | React (function components + hooks) |
| UI state | Zustand |
| Floorplan & heatmaps | HTML Canvas 2D (no game engine, no PixiJS needed for Phase 1) |
| Charts | Recharts |
| Data validation | zod schemas for every JSON data file |
| Tests | Vitest (unit, property-style, calibration, determinism) |
| Saves | IndexedDB (via `idb-keyval`) + export/import save as JSON file |
| Heavy sim (later) | Web Worker for the weekly tick and auto-place |
| Desktop (last milestone) | Tauri; Electron as fallback |

### 16.2 Architecture rules

- `src/sim/**` is **pure TypeScript**: no React, no DOM, no `Math.random`, no `Date.now`. All randomness via a seeded RNG object passed in (`mulberry32` or similar, with per-subsystem streams so adding one random call doesn't change everything).
- The game state is one serializable object (`GameState`). The UI sends **commands** (`placeBlock`, `setSlider`, `hireEngineer`, `startWaferLot`, …); `sim.step(state, commands, rng) → newState + events`.
- Pure calculation functions (estimate performance, yield, etc.) take a design + world data and return a result + a "Why?" breakdown (list of contributors). The UI never re-implements formulas.
- All constants live in `src/data/tuning.json` (validated by zod). Content in `src/data/*.json`.
- Determinism test: same seed + same commands → identical state hash after 520 weeks.
- Save format has `version`; write a migration function when the schema changes.

### 16.3 Folder structure

```
silicon-forge/
  package.json  vite.config.ts  tsconfig.json  PROGRESS.md
  src/
    main.tsx  App.tsx
    sim/
      core/       rng.ts  time.ts  state.ts  commands.ts  events.ts  step.ts  save.ts
      design/     floorplan.ts  blocks.ts  links.ts  area.ts  timing.ts  thermal.ts  congestion.ts  autoplace.ts  validation.ts
      arch/       isa.ts  customInstructions.ts  ecosystem.ts
      perf/       instructions.ts  cpi.ts  power.ts  workloads.ts  fps.ts  uncertainty.ts
      fab/        wafer.ts  yield.ts  binning.ts  foundry.ts  ownFab.ts  packaging.ts  test.ts
      research/   engineers.ts  knowledge.ts  discovery.ts  reverseEngineering.ts  hiring.ts
      market/     segments.ts  demand.ts  contracts.ts  marketing.ts  reviews.ts  pricing.ts
      ai/         competitors.ts  competitorDesign.ts  history.ts
      finance/    ledger.ts  loans.ts
      explain/    why.ts            // shared "contributor" types for the Why? panel
    data/
      tuning.json  nodes.json  blocks.json  isas.json  customInstructions.json  workloads.json
      segments.json  techs.json  packages.json  companies.json  customers.json  events.json
      difficulty.json  memoryLatency.json  names/  locale/en.json
      schemas.ts   // zod schemas
    ui/
      screens/    Dashboard  ChipDesigner  ArchitectureLab  Validation  Manufacturing  Research  Market  Marketing  Competitors  Finance  WorkloadLab  NewGame
      components/ Canvas  Overlay  Slider  StatWithWhy  CpiStackChart  Table  Modal  Toast
    store/        gameStore.ts  uiStore.ts
  tests/          unit/  calibration/  determinism/  balance/
  tools/          profile-converter/   // Section 10.4
```

## 17. Core data schemas (TypeScript, abbreviated)

```ts
type Year = number; type Money = number; type BlockTypeId = string;

interface ProcessNode { id: string; featureNm: number; historicalYear: Year; family: "PMOS"|"NMOS"|"CMOS";
  waferDiameterMm: number; densityTrPerMm2: number; transistorsPerTile: number; gateDelayPs: number;
  wireDelayPsPerMm: number; vddRange: [number, number]; vddNominal: number; vthV: number;
  staticPowerPerKTrW: number; capPerKTrPf: number; waferCost: Money; maskSetCost: Money;
  d0Initial: number; d0Mature: number; maturityTauWeeks: number; sigmaFreq: number; metalLayers: number; }

interface BlockType { id: BlockTypeId; name: string; category: string; historicalYear: Year;
  configSchema: Record<string, ConfigOption>;               // e.g. width: [4,8,16,32]
  transistors: Formula; logicDepth: Formula; activity: Partial<Record<OpClass, number>>;
  requiredLinks: { to: BlockTypeId; widthBits: Formula; timing: "critical"|"normal"|"relaxed" }[];
  edgeOnly?: boolean; isMemoryArray?: boolean; repairable?: boolean; disableable?: boolean;
  unitFor?: OpClass[]; requires?: { techId?: string }; }
// Formula = small expression string evaluated with config vars, e.g. "28 * width" — use a tiny safe evaluator, not eval()

interface PlacedBlock { uid: string; typeId: BlockTypeId; config: Record<string, number|string|boolean>;
  x: number; y: number; w: number; h: number; rotated: boolean; locked: boolean; }

interface ChipDesign { id: string; name: string; nodeId: string; dieW: number; dieH: number;
  blocks: PlacedBlock[]; pipelinedLinks: string[]; isa: IsaConfig; settings: DesignSettings;
  customInstructions: string[]; parentDesignId?: string; }

interface IsaConfig { archetypeId: string; wordBits: number; registers: number; addressBits: number;
  fixedLength: boolean; addressingModes: number; privilegeModes: boolean; extensions: string[]; }

interface DesignSettings { targetClockMHz: number; vdd: number; pipelineStages: number;
  control: "hardwired"|"microcoded"; packageId: string; cooling: "none"|"heatsink"; testStrategy: string;
  spareRows: boolean; busMultiplexed: boolean; prefetchQueueBytes: number; /* Phase 2+: issueWidth, oooWindow, predictor, cores, chiplets */ }

interface Estimate<T> { value: T; low: T; high: T; confidence: "high"|"medium"|"low"; why: Contributor[]; }
interface Contributor { label: string; share: number; detail?: string; }   // share = fraction of total (signed)

interface Product { id: string; designId: string; skus: Sku[]; launchedWeek?: number; }
interface Company { id: string; name: string; isPlayer: boolean; personality?: string; cash: Money;
  techs: string[]; knowledge: Record<string, number>; engineers: Engineer[]; products: Product[]; reputation: number; }

interface GameState { version: number; week: number; seed: number; settings: NewGameSettings;
  companies: Company[]; world: { frontierTechs: string[]; observedTechs: Record<string, string[]>; events: ActiveEvent[] };
  market: MarketState; fabs: FabState[]; lots: WaferLot[]; inventory: InventoryItem[]; ledger: LedgerEntry[]; log: GameEvent[]; }
```

## 18. Milestones (implement in this order)

Each milestone must end with: all tests green, `npm run dev` works, `PROGRESS.md` updated. Do not start the next milestone until the current one is accepted.

| M | Scope | Acceptance criteria |
|---|---|---|
| **M0** Skeleton | Vite + React + TS strict; folder structure; seeded RNG; `GameState`; weekly `step()`; pause/speed controls; top nav with empty screens; save/load (IndexedDB + JSON export). | App runs; clock advances weeks; save → reload → identical state; determinism test passes; RNG unit tests pass. |
| **M1** Data layer | zod schemas; Phase 1 `nodes`, `blocks`, `packages`, `isas`, `customInstructions`, `workloads`, `tuning`; safe formula evaluator. | All data files validate at startup with clear errors; formula evaluator tested (no `eval`). |
| **M2** Floorplan editor | Canvas grid with pad ring drawn around it; palette; place/move/rotate/delete/lock; block config popover; die resize; auto-generated links drawn; transistor count + die area. | Can build the 1971 example chip by hand; overlapping placement blocked; edge-only rule enforced; undo/redo (20 steps). |
| **M3** Physical analysis | Wire lengths; timing paths → fMax with limiting path; power; thermal grid; RUDY congestion; overlays (heat, wires, congestion, timing); "Why?" for clock/power/temp. | Moving ALU away from register file lowers fMax (test); spreading hot blocks lowers hotspot (test); overlays render; recompute < 50 ms on a 30×30 die. |
| **M4** Auto-place | Simulated annealing, 3 modes, locks, regions, report, deterministic per seed. | On 5 test designs (hand-tuned reference layouts stored in `tests/`), auto-place scores 75–95% of the reference and always beats random placement; same seed → same layout. |
| **M5** ISA & settings | Architecture Lab; archetypes; ISA params; custom instructions with opcode budget; settings panel (Section 7.6, Phase 1). | Changing archetype/width/registers changes instruction counts in a visible breakdown; opcode budget overflow forces longer encoding. |
| **M6** Performance | Instruction count, CPI stack, memory model, FPS, uncertainty ranges, Workload Lab (view/edit/import/export), CPI stack chart. | **Calibration tests (Section 9.7) pass within tolerance**; custom instruction speeds only workloads with its pattern (test); cache helps at 33 MHz but not at 1 MHz (test); no double-counted memory stalls (test). |
| **M7** Manufacturing | DPW, yield, D0 over time, Monte Carlo binning, SKU editor with auto-suggest, contract fab + reserved capacity, wafer lots with lead time, test strategies, packaging & pins, validation/bugs/tape-out/respin. | DPW and yield match reference values in tests; binning shares sum to 100%; down-binning works; pin limit forces multiplexing choice. |
| **M8** Research & people | Engineers, hiring pool, assignments, RP, knowledge, discovery events, pity timer, observed techs, reverse engineering/licensing. | Headless run of 10 years: discoveries happen at plausible rates, no tech with readiness ≈ 0 is ever discovered, targeting only allowed for observed techs (tests). |
| **M9** Market & finance | Segments, logit demand, outside option, pricing, inventory, backlog, RFQs/contracts, marketing awareness, reviews, reputation, P&L, cash flow, loans, bankruptcy. | A full loop is playable: design → manufacture → sell → profit/loss; Finance screen reconciles (cash change = sum of ledger entries) (test). |
| **M10** Competitors & history | AI companies using the same models; Guided/Dynamic/Strict modes; events system; news feed. | Headless AI-only run 1971–1990: AI ships plausible chips roughly on schedule in Guided mode; no company has negative inventory or NaN values (property tests). |
| **M11** New game, difficulty, tutorial | Setup screen (facilities, difficulty, seed, history mode); difficulty presets/custom; guided first-chip tutorial; advisor tips. | Each starting combination in Section 5 is survivable for 5 years by a scripted simple strategy on Standard (balance test). |
| **M12** Own fab & extras | Own fab (build, staff, utilization, learning, upgrades, selling capacity), second sourcing, real-game profile converter tool, Real Names pack loader. | Own fab breaks even only at good utilization (test); importing a measured profile works end to end. |
| **M13** Packaging & polish | Web Worker for tick/auto-place, performance profiling, Tauri desktop build, accessibility pass, era themes. | Desktop build runs on Windows; 20× speed stays smooth; colorblind mode works. |
| Later | Phase 2 and Phase 3 content (data + any new formulas), hierarchical/chiplet editors, modding docs. | — |

The first *playable* moment is the end of **M6** (a chip designer sandbox with performance numbers); the first full *tycoon* loop is the end of **M9**.

## 19. Rules for the AI implementer

1. Read this whole document before writing code. Implement **one milestone at a time** and stop at the end of it with a summary.
2. Before coding a milestone, list the files you will create or change and the tests you will write.
3. Simulation code (`src/sim`) is pure and deterministic (Section 16.2). No randomness or time outside the RNG/state.
4. **No magic numbers** in code — every [T] value goes into `tuning.json`. Calibration values [C] live in tests.
5. Every formula in Part B gets unit tests. Calibration and determinism tests must stay green forever.
6. Every number the UI shows comes from a sim function that also returns a `why` breakdown.
7. TypeScript strict, no `any`, no unused code, small files (< 400 lines; split otherwise).
8. Only use the libraries listed in Section 16.1. Ask before adding another.
9. When the spec is ambiguous, choose the simplest option consistent with the pillars, and record it in `PROGRESS.md` under **Assumptions**. Do not stop to wait.
10. When a spec formula produces obviously broken gameplay (e.g. one option always dominates), keep the formula structure, adjust [T] values, and record it under **Tuning changes**.
11. Keep `PROGRESS.md` updated: milestone status, files, assumptions, tuning changes, known bugs, next steps.
12. When writing files in a chat (not an agent tool), output **complete file contents** with the path as a heading — never "rest unchanged" fragments.
13. Do not implement Phase 2/3 content early, but do not write code that makes it impossible (e.g. allow block nesting, multiple cores, multiple dies in data structures).

---

# PART D — DECISIONS, OPEN QUESTIONS, GLOSSARY

## 20. Decision record (alternatives considered)

| Topic | Chosen | Alternatives (pros / cons) |
|---|---|---|
| Tech stack | **TypeScript + React web stack** | **Godot 4 (C#):** free, game-like feel / data-heavy UI (tables, charts, docking) must be built by hand. **Unity 6:** mature, C# / heavy, licensing history, overkill for 2D UI. **Unreal 5:** best 3D / huge overkill, C++. **Native (Avalonia/Qt/Rust egui):** fast, small / slower UI iteration, fewer chart libraries. **Custom engine:** perfect fit / enormous cost. Web wins because UI *is* the game, charting/tables are mature, and AI assistants write React/TS best. Cost: no built-in game systems (audio, input) — they are minor here. |
| Desktop wrapper | **Tauri at the end** | **Electron:** most mature, pure JS / big download (~100+ MB), more RAM. **Tauri:** small binaries / needs Rust toolchain; Steam integration needs extra work. |
| Setting | **Fictional parody companies + optional Real Names pack** | **Real companies by default:** authentic / needs licenses that won't be granted; legal risk if published. **Fully fictional timeline:** total freedom / loses the "dawn of the CPU" history the game is built on. |
| First content scope | **1971–1990 (Phase 1)** | **1971–today at once:** epic / 5× content and balance work before anything is playable. **1971–1985 only:** smaller / stops right before caches and pipelining matter, which are core to the requested depth. |
| Floorplan | **2D tile grid** | **Freeform:** more realistic / collision, scoring and UX far harder. **Abstract graph (no positions):** simple / removes the requested "positioning matters" gameplay. **3D:** out of scope. |
| Wiring | **Auto-generated links** | **Manual routing:** max realism / tedious, not fun, explodes scope. |
| Auto-place quality | **Simulated annealing with an iteration budget (≈80–90%)** | **Perfect optimizer:** removes the design game. **Random/weak:** useless. Iteration budget is an honest way to be "good but not best" and improves with EDA research. |
| Performance model | **Analytical CPI stack** | **Cycle-accurate simulator:** most accurate / far too slow and complex for live sliders. **Single score number:** simple / unexplainable, contradicts pillars. |
| Benchmarks | **Fictional era suites + measured-profile import** | **Decompiling games:** gives static code not runtime behavior; legal risk. **Licensed real benchmarks:** credible / cost, licenses. |
| Research | **Field knowledge + random discoveries + competitor-triggered targeting** | **Tech tree:** predictable / explicitly not wanted. **Pure random:** emergent / frustrating, save-scumming. |
| Time | **Weekly ticks** | **Monthly:** faster / loses scheduling and cash-flow detail. **Real-time:** pressure, harder balance. |
| Money | **Constant (no inflation)** | **Nominal with inflation:** historically flavorful / confusing comparisons across decades, more data. |
| Default mode | **Sandbox-first** | **Campaign-first:** classic tycoon pressure / punishing while learning a deep system. |
| Multiplayer | **None** | Leaderboards later at most; co-op/competitive multiply complexity. |
| Modding | **Data files are already JSON → data mods free; scripting later** | **No modding:** shorter lifespan. **Full scripting at launch:** security/support cost. |

## 21. Open questions (each has a default — implementation is never blocked)

| # | Question | Default if unanswered | Trade-off |
|---|---|---|---|
| Q1 | Should Guided history mode be the default, or Dynamic? | Guided | Guided = familiar history, competitors feel real / less surprise. Dynamic = every game different / history can become silly. |
| Q2 | Should the player be able to *build a real-name company* (play as a famous chipmaker) via the Real Names pack? | No (player company always custom) | Yes = fan service / scripted expectations, more data work. |
| Q3 | How harsh should respins be? | +8–12 weeks and full mask cost | Harsher = more tension / more frustration for new players. |
| Q4 | Should engineers have portraits? | No (name + initials avatar) | Portraits add attachment / art pipeline needed. |
| Q5 | Should the game end at the end of available content (1990 in Phase 1)? | Continue in sandbox with frozen frontier | Ending = closure / players want to keep going. |
| Q6 | Sound? | Minimal UI sounds only | Ambient/music = atmosphere / cost, licensing. |

## 22. Glossary

**ALU** arithmetic logic unit · **BIU** bus interface unit · **BCD** binary-coded decimal (decimal math used by calculators/business) · **CPI / IPC** cycles per instruction / instructions per cycle · **D0** defect density (defects per cm²) · **DPW** dies per wafer · **ISA** instruction set architecture · **ILP** instruction-level parallelism · **Microcode** internal ROM program that implements complex instructions in several cycles · **Hardwired control** instructions decoded directly by logic (faster, less flexible) · **MMU** memory management unit · **Node** manufacturing process generation (e.g. 3 µm) · **NMOS/PMOS/CMOS** transistor logic families (CMOS uses little power when idle) · **Pad ring** I/O connection area at the die edge · **Respin** new mask revision to fix bugs · **RUDY** simple routing-congestion estimate (rectangular uniform wire density) · **Salvage SKU** product made from a partially defective or slower die · **Second source** another company licensed to make your chip · **SKU** a sellable product variant · **Tape-out** final design handoff to make masks · **Yield** share of dies that work.

*End of plan v0.3.*
