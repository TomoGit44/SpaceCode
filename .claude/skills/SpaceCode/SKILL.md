---
name: spacecode-design
description: Use this skill to generate well-branded interfaces and assets for SpaceCode (a Japanese-language, browser-based, code-driven space tower-defense game), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and a UI-kit recreation of the in-game canvas + program editor for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill first — it has the full content + visual foundations and a folder index. Then explore the other files as needed:

- `colors_and_type.css` — all design tokens (colors, type, spacing, motion) as CSS variables. Link this in any new HTML you create.
- `assets/` — entity primitives as SVG (Base, Ship, Enemy variants, Planet, starfield) + logo and wordmark. Copy these in directly; do not redraw.
- `preview/` — small reference cards for each concept (palettes, type, components). Useful to scan when picking a token.
- `ui_kits/game/` — a React + plain-HTML recreation of the actual game. Each component file (`Hud.jsx`, `ShopBar.jsx`, `ProgramEditor.jsx`, `primitives.jsx`, etc.) is self-contained and can be copied piecewise.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules in `README.md` to become an expert designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask a few clarifying questions (audience, surface, fidelity), and act as an expert designer who outputs HTML artifacts or production code, depending on the need.

## Quick orientation

- Voice: **Japanese-first**, technical, terse. UPPERCASE for code keywords (`MOVE_TO`, `PHASE`, `STAGE CLEAR`). Em-dashes flank clauses (`— … —`). Brackets `[ ]` carry keybinds.
- Color: 5 semantic accents on deep navy. **Base = purple, Ally = blue, Enemy = red, Resource = gold, Accent = teal.** Do not remap these.
- Shape: hard corners (radius 0 in canvas, 2px max on web), 1px strokes by default, halos at α 0.12-0.18 are the brand's signature.
- No emoji. No icon font. The full glyph set is `▶ ▼ ▲ ✕ + − → ↻`.
- Background: a sparse two-tone starfield. Never a gradient.
- Font: `system-ui` is the literal in-game stack — honor it. Noto Sans JP for Japanese cross-OS parity. Space Grotesk **only** for non-game display text.
