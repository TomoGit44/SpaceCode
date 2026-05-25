# SpaceCode — Game UI kit

A modular, hi-fi recreation of the SpaceCode game in React + plain HTML/CSS — runs at the original 1280×720 design size, letterboxed to fit any viewport.

## Live demo

Open [`index.html`](./index.html). The prototype walks the same flow as the real game:

1. **Title screen** — `SpaceCode` wordmark + tagline + blinking prompt. Click anywhere to start.
2. **Game canvas** — central Base, two Planets, the dashed range ring, a starfield. Buy a Ship from the shop bar at the bottom; it spawns next to the Base with a callout pointing at it.
3. **Program editor** — click any Ship to open the 3-column overlay (palette / nested list / param chips). Edits live-update the underlying program. Includes REPEAT nesting with the Scratch-style teal bracket.
4. **Wave simulation** — pressing the pulsing Start button spawns enemies that march toward the Base. The HUD HP / Credits / Phase update. Reach `HP 0` → GameOver. Clear all 5 phases → Victory.

This is a click-through prototype — it does **not** ship the real game's executor. Ships don't actually run their programs; the editor is the focus.

## Components

| File | Exports | Notes |
|---|---|---|
| [`App.jsx`](./App.jsx) | `App` | Top-level state machine. Owns scene / hp / credits / ships / enemies. |
| [`primitives.jsx`](./primitives.jsx) | `BaseEntity`, `ShipEntity`, `ShipWithBars`, `EnemyEntity`, `PlanetEntity`, `Starfield`, `SC_COLORS` | Pure-SVG recreations of the in-game vector entities. Re-use anywhere a "SpaceCode thing" needs to be drawn statically. |
| [`Menu.jsx`](./Menu.jsx) | `Menu`, `GameOver`, `Victory` | Full-screen overlay scenes. |
| [`Hud.jsx`](./Hud.jsx) | `Hud` | Top HUD strip: HP / Phase / Credits with the label-dim / value-bold rhythm. |
| [`ShopBar.jsx`](./ShopBar.jsx) | `ShopBar`, `StartButton` | Bottom-of-screen action panel + pulsing center "start wave" button. |
| [`GameCanvas.jsx`](./GameCanvas.jsx) | `GameCanvas`, `BASE_X`, `BASE_Y`, `PLANETS` | The playfield (positions match `config.ts`). |
| [`ProgramEditor.jsx`](./ProgramEditor.jsx) | `ProgramEditor`, `sampleCodes`, `newCode`, `codeLabel`, `LOCATION_LABELS` | The 3-column editor card with full add / remove / reorder / nest / param editing. |

## Reading the source

- All entities are drawn with `<svg>`, never `<img>` — same constraint as the real game.
- Colors are imported via the shared [`../../colors_and_type.css`](../../colors_and_type.css) tokens.
- The stage at the root applies `transform: scale(...)` so the 1280×720 layout fits the host viewport without breaking pixel relationships.

## What this kit deliberately omits

- **Real program execution.** Ships are visual stand-ins; their `program` array is captured but no enemies are shot, no resources are mined.
- **Items / Inventory.** The Phase 6 item system (omni-cores, rarities) is documented in the design system cards but not implemented as React components here.
- **Sound.** The original game has no audio either — same.
- **Multi-Ship behavior.** You can buy several Ships and edit each; their `program` arrays are independent, but they don't pathfind or act.

The point of this UI kit is component fidelity for new surfaces (landing pages, slide screenshots, documentation imagery), not a playable port.

## Source of truth

If something looks slightly off from the live game, **the live game's `src/config.ts` wins** — that's the single COLORS table everything is derived from. Re-import it (or the relevant component file) from [github.com/TomoGit44/SpaceCode](https://github.com/TomoGit44/SpaceCode) before changing any of the values here.
