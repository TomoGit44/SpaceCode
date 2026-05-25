# SpaceCode Design System

A design system distilled from **[SpaceCode](https://github.com/TomoGit44/SpaceCode)** — a Japanese-language, browser-based tower defense game where players **program their spaceships with visual code blocks** to defend their base from incoming enemy waves.

> 🛰  **`プログラムを組まないと Ship は動かない`** — "If you don't write a program, the ship won't move." This is the design system's spiritual center: every visual element exists to make code-as-gameplay feel inevitable, technical, and a little bit alive.

## Source

- **GitHub:** [TomoGit44/SpaceCode](https://github.com/TomoGit44/SpaceCode) (`main`)
- **Tech:** TypeScript 5.5 (strict) + Phaser 3.90 + Vite 5.4
- **Notable constraint:** **No image assets.** Every visual in the game is drawn at runtime with `Graphics`, `Shape`, and `Text` primitives — colors live in `src/config.ts` as a single `COLORS` table. The design language is therefore an inseparable mix of **palette + primitive shapes + motion**, not bitmaps.

If you have access to the repo, the most useful files for extending this system are:

| File | What it gives you |
|---|---|
| [`src/config.ts`](https://github.com/TomoGit44/SpaceCode/blob/main/src/config.ts) | The single source of truth for colors, sizes, and game tunables |
| [`src/utils/starfield.ts`](https://github.com/TomoGit44/SpaceCode/blob/main/src/utils/starfield.ts) | The "world background" recipe (sparse two-tone dots) |
| [`src/entities/Base.ts`](https://github.com/TomoGit44/SpaceCode/blob/main/src/entities/Base.ts) | Canonical example of the *halo + body + ring + range-ring* layering |
| [`src/ui/ProgramList.ts`](https://github.com/TomoGit44/SpaceCode/blob/main/src/ui/ProgramList.ts) | The Scratch-style indented bracket/scope drawing |
| [`src/scenes/ProgramEditorScene.ts`](https://github.com/TomoGit44/SpaceCode/blob/main/src/scenes/ProgramEditorScene.ts) | The reference "card" overlay — 3-column layout, palette / list / params |
| `CLAUDE.md` | Designer-facing brief in Japanese; explicit visual principles |

Read those for production-fidelity work. The files in this design system are derivative summaries plus reusable HTML/JSX.

---

## Product context

**SpaceCode** is a single-player browser game MVP. Players defend a **central Base** (the only object that can lose HP) against waves of enemies that walk directly toward it. The Base has one built-in turret with a fixed 260px range — *anything outside that ring is the player's responsibility.* To handle it, the player buys **Ships** ($70 each) and clicks them open to write a tiny imperative program (6 instruction types — `MOVE_TO`, `MINE`, `DEPOSIT`, `ATTACK_NEAREST`, `WAIT_UNTIL_FULL`, `REPEAT`). The program loops automatically; editing it edits live behavior.

Two products / surfaces share this language:

1. **The in-game canvas** (`GameScene`) — 1280×720, top HUD bar, bottom shop bar, dark starfield, vector entities.
2. **The Program Editor overlay** (`ProgramEditorScene`) — appears on top of the running game. 3-column card: palette (left) / nested program list (center) / parameter chips (right).

Everything else (`Menu`, `GameOver`, `Victory`, `ItemInventory`) is a variation on the same vocabulary.

---

## Brand identity

| Aspect | Value |
|---|---|
| **Name** | SpaceCode (one word, PascalCase) |
| **Tagline** | `— 宇宙タワーディフェンス × コードプログラミング —` (em-dash flanked, teal) |
| **Audience** | Japanese-speaking game designers and engineers prototyping mechanics |
| **Personality** | Technical, terse, instructional. Diagram-first. No marketing fluff. |
| **Genre cues** | Cyberpunk-adjacent navy + neon, but restrained — closer to a flight-computer HUD than to a Tron synthwave poster. |

---

## CONTENT FUNDAMENTALS

> *Japanese-first, English-keyword. Instructional, not promotional.*

### Voice and tone

- **Primary language is Japanese.** All player-facing copy is written in conversational Japanese — *not* katakana-heavy localization-speak. English appears only as **CODE KEYWORDS** (`MOVE_TO`, `ATTACK_NEAREST`, `PHASE`, `STAGE CLEAR`, `GAME OVER`) and **status labels** (`HP`, `PHASE`).
- **Curt and operational.** A subtitle is a single em-dash-flanked clause: `— 宇宙タワーディフェンス × コードプログラミング —`. A hint reads `クリック または SPACE でスタート`. No marketing adjectives, no hype.
- **Documentation voice carries through to UI.** The in-app strings sound like an engineer wrote them: `編集中もゲームは止まらない` ("editing doesn't pause the game"), `中身はリストでそのまま編集` ("edit children directly in the list"). Imperative > descriptive.
- **First person is absent.** No "you", no "I". The reader is always the implied subject of an imperative: `〜してください`, `〜できます`. Polite-plain (である / です-ます) is the default register.

### Casing

- **English keywords are UPPERCASE.** `MOVE_TO`, `REPEAT`, `PHASE 3 / 5`, `STAGE CLEAR`, `GAME OVER`. No lowercased code names.
- **Brand name is PascalCase:** `SpaceCode` — never `Spacecode`, never `SPACECODE`.
- **Japanese has no casing**, but spaces around English words are preserved: `Phase 3 で` (not `Phase3で`).

### Punctuation & symbols

- **Em dashes flank subtitles and clauses:** `— 宇宙タワーディフェンス × コードプログラミング —`, `納品 — 設定なし`.
- **Brackets `[ ]` carry keyboard shortcuts:** `[ R ] リトライ`, `[ ESC ] メニューに戻る`. Note the spaces inside the brackets.
- **Arrows are content, not decoration:**
  - `→` for direction / transition: `移動 → 惑星A`, `資源 1 → お金 2`
  - `▶` for "play / start": `▶ PHASE 1 / 5 開始`
  - `▼ ここから実行` for entry markers, `↻` for loop-back markers
  - `▲ ▼ ✕` are row-action buttons
- **Slashes carry ratios:** `${current} / ${total}`, `${hp}/${maxHp}`.
- **$ prefix is the unit of credits.** Always immediately attached: `$70`, `+5`.

### Worked examples (paste these as voice anchors)

| Surface | String |
|---|---|
| Title screen subtitle | `— 宇宙タワーディフェンス × コードプログラミング —` |
| Empty editor state | `(コードがありません — 左から追加してください)` |
| Loop marker | `↻ 末尾まで来たら先頭に戻る (自動ループ)` |
| Phase start banner | `▶ PHASE 1 / 5 開始` |
| Hint under start button | `宇宙船を購入・船をクリックしてプログラム編集ができます` |
| GameOver subhead | `基地が破壊された` |
| Victory subhead | `基地を守り抜いた` |
| Footer | `MVP v1.0 — Phase 5 完成` |

### Things to avoid

- **No emoji.** The codebase uses *one* — `📦 アイテム` in the inventory overlay — and even that feels out of system. Treat as a single exception, not a license. (For brand reasons we ban them outright in new surfaces.)
- **No exclamation marks.** Engineering tools do not yell.
- **No second-person address.** Don't write `あなた`. The implied subject is the game state or the player as a system.
- **No marketing prose.** "Powerful. Intuitive. Beautiful." has no place here.
- **No localization-style katakana padding.** `コードを組む` not `プログラムを作成する`.

---

## VISUAL FOUNDATIONS

> *Two halves: a deep navy canvas, and high-saturation accents that mean exactly one thing each. Almost everything is a circle, a triangle, or a 1px-stroked rectangle.*

### Color

The whole product runs on a **13-token palette** (see [`colors_and_type.css`](./colors_and_type.css)). The most important rule is **semantic role**: a color has one job.

| Role | Token | Hex | Where it appears |
|---|---|---|---|
| Canvas (deepest) | `--bg` | `#05070d` | Page background, backdrop fades |
| Canvas (panels) | `--bg-alt` | `#0a1020` | Card backgrounds, shop bar |
| Panel surface | `--panel-bg` | `#1a2540` | Every button background by default |
| Panel hover | `--panel-hover` | `#223151` | Same buttons on hover |
| Panel border | `--panel-border` | `#3a4a6a` | Faint dividers, inactive strokes |
| **Base** (purple) | `--base` | `#a07bff` | The Base — and *only* the Base |
| Base ring | `--base-ring` | `#5a3ec9` | Outer rotating ring on the Base |
| **Ally** (blue) | `--ally` | `#4ea1ff` | Ships, MOVE_TO labels, primary CTA strokes |
| **Enemy** (red) | `--enemy` | `#ff4d5a` | Enemies, destructive actions, danger, GameOver |
| **Resource** (gold) | `--resource` | `#ffd24a` | Credits, mined yield, planets, legendary rarity |
| **Accent** (teal) | `--accent` | `#3ee0c5` | Highlights, "active running" cursor, success, subtitles |
| Highlight | `--highlight` | `#ffffff` | The brightest core dot inside an entity |
| UI text | `--ui` | `#cfd6e6` | All body copy |
| UI dim | `--ui-dim` | `#6b7da0` | Labels above values, secondary text |

**Allyship is by color.** Blue = friendly, red = hostile, purple = the thing we protect, gold = the thing we want, teal = "now / active / good". Never use blue to mean enemy or red to mean accent — these mappings are sacred.

There are no gradients in the rendered game. The single exception is the **fade transition** between scenes (`fadeIn(380, 5, 7, 13)` — a 380ms ease-in from `#05070d`). Avoid bluish-purple background washes.

### Type

- **Primary stack:** `system-ui, "Segoe UI", sans-serif`. The game literally uses this string in every Phaser text style. We honor it: it's free, fast, and survives any localization. For web mocks we extend with **Noto Sans JP** (Google Fonts) so Japanese characters render the same way across systems.
- **Code stack:** **JetBrains Mono** is added by this design system for representations of code in marketing / docs surfaces. The game itself shows code as proportional sans-serif rows; only the *idea* of code uses mono.
- **Display stack:** **Space Grotesk** is used in this design system for hero titles in static (non-game) surfaces — landing pages, slides — to give long-form layouts a touch of identity that `system-ui` can't carry alone. The game itself never uses it.

**Type scale (game canvas, 1280×720):**

| Token | Size | Weight | Use |
|---|---|---|---|
| `--type-display` | 88-96px | 700 | Title screen, GameOver, Victory |
| `--type-banner` | 56px | 700 | Center banner on phase transitions |
| `--type-h1` | 22px | 400/700 | Section heads, primary buttons |
| `--type-h2` | 20px | 700 | HUD values (credits, phase) |
| `--type-h3` | 18px | 700 | HP values |
| `--type-body` | 14px | 400 | Buttons, row labels, code lines |
| `--type-meta` | 13px | 400 | Headers, hints |
| `--type-caption` | 12px | 400 | Sub-hints, footer, dim labels |
| `--type-micro` | 11px | 400 | Tiny captions under buttons |

**Bold is a state, not a flourish.** Headers (`PHASE`, `クレジット`) are dim and regular; the *value* underneath is bold and high-contrast. Use this contrast — label dim, value bold — anywhere a metric is shown.

**Italic** is reserved for system-spoken text only — the loop-back marker (`↻ 末尾まで来たら先頭に戻る (自動ループ)`) and similar metanotes. Never for emphasis inside body copy.

### Spacing & rhythm

- Base unit is **4px**. Most spacing is `4 / 8 / 12 / 16 / 24 / 32`.
- Row height for code/list items is **36px**, with a **4px gap**. This is the rhythm of the program editor.
- Indentation step is **18px** per nesting level (`INDENT_PX`).
- Card outer padding is **24px** (top/bottom 24, inner cols gap 16, side 24).

### Borders, strokes, corners

- **Hard corners.** Rectangles in the game canvas have **zero corner radius**. The web mocks may relax this to a `2px` radius for accessibility but not more — **never** bubble buttons or pill cards.
- **1px strokes** are the default. `2px` is reserved for emphasis (the active code row, the Base outer ring).
- Stroke colors use the same allyship rules. A blue button = ally action. A red border = destructive.
- Stroke **alpha** is the lever for hierarchy: `0.4` (subtle), `0.7` (default button), `1.0` (selected / running).

### Backgrounds

- **One background recipe.** A starfield: ~0.00018 dots per pixel (~166 dots at 1280×720), randomly placed. **82%** of them are dim `#1a2540` 0.55-alpha 0.8px circles; **18%** are bright `#6b7da0` 0.9-alpha 1.4px circles. No nebulae, no gradients, no parallax. Reproduce exactly with [`fonts/`](./fonts) + [`assets/starfield.svg`](./assets/starfield.svg).
- The bg-alt color `#0a1020` is for layered panels (the shop bar, the editor card) — it sits 1 step lighter than the canvas to imply depth without any shadow.

### Shadows & elevation

- **No box shadows in the game.** Elevation is communicated by:
  1. Slightly lighter panel fill (`bg-alt` over `bg`)
  2. A 1px stroke in the section's accent color at low alpha
  3. A semi-transparent backdrop behind modals (`#05070d` at 0.55)
- For web/marketing surfaces, **at most one** shadow level is allowed: `0 8px 24px rgba(5, 7, 13, 0.6)` — and only on the active element.

### Halos & glows

This is the *one* place SpaceCode deviates from pure flat. **Every entity has a halo:** a filled circle of the entity's color, alpha `0.12–0.18`, radius `body + 5..14px`, drawn *behind* the body. It's the design system's signature.

- Base halo: `--base` @ 0.18, radius `body + 14`
- Ship halo: `--ally` @ 0.18, radius `body + 5`
- Enemy halo: enemy color @ 0.18, radius `body + 5`
- Planet halo: `--resource` @ 0.12, radius `body + 10`

The halo is the only "glow" in the system. There is no inset shadow, no neon bloom shader.

### Range rings & dashed arcs

The Base broadcasts its range via a **two-pass dashed ring**: a faint solid circle at alpha 0.18, plus 48 short arcs at alpha 0.32 painted at every other segment — drawn on the `--accent` (teal) color. Use this exact pattern for any "area of effect" indicator.

### Animation

- **Cubic.easeOut** is the default ease for entrances (titles slide-fade in 420ms).
- **Back.easeOut** is reserved for the center banner only (scale `0.7 → 1.08`, 220ms).
- **Sine.easeInOut** for idle pulses (the start button scaling `1.0 → 1.04` and back, 720ms infinite).
- **Linear repeat** for ambient rotation (Base ring rotates 360° over 12000ms; Planet ring over 18000ms).
- **Cubic.easeOut** again for impact flashes (muzzle flash, planet respawn, hit flash) — alpha and scale together, 110–480ms.
- Scene fade in/out is **280–380ms** from/to the bg color.

Animations should feel **instrument-like, not character-like.** They communicate state changes (a turret fired, a row was selected), they don't perform emotion.

### Hover / press / disabled

- **Hover:** fill changes `panel-bg` → `panel-hover` (`#1a2540` → `#223151`). No size change, no shadow.
- **Press:** no separate press state in the game — the click fires immediately on `pointerdown`. For web mocks, optionally subtract 1px translateY and darken the fill 4%.
- **Disabled:** alpha 0.45, label color → `--ui-dim`, stroke color → `--ui-dim` @ 0.5.
- **Selected / running:** **fill** becomes the accent color at low alpha (0.16–0.22) **and** the stroke goes to full alpha. The text inside switches to bold or accent-colored.

### Transparency

- Backdrops (modal scrim): `--bg` @ 0.55.
- Panel backgrounds: `--bg-alt` @ 0.85–0.97 (cards heavier, bars lighter).
- Filled state on a button: accent color @ 0.16–0.28.

Blur is **never used** — there's no `backdrop-filter` anywhere in the game. Resist the urge to add it.

### Iconography & SVG

See [the **Iconography** section below](#iconography).

### Imagery

There is **no photographic imagery** in SpaceCode and there should not be any in extensions of this system. If a marketing surface absolutely needs a "photo", it should be a render or screenshot of the in-game canvas itself.

---

## ICONOGRAPHY

> SpaceCode has **no icon font**, **no SVG icon set**, and **no PNG sprites**.
> The product communicates entirely through **Unicode glyphs**, **vector-drawn entity primitives**, and **typography**. This is intentional — it preserves the "every pixel was placed by a programmer" feel.

### The full glyph inventory

These are the only "icons" the game uses:

| Glyph | Meaning | Where |
|---|---|---|
| `▶` | Play / start / running cursor | Start button, active row marker, Phase start |
| `▼` | Move down / "starts here" entry | Row reorder button, `▼ ここから実行` |
| `▲` | Move up | Row reorder button |
| `✕` | Close / delete | Modal close, row remove |
| `−` `+` | Decrement / increment | Spinner controls (REPEAT count) |
| `→` | Direction / transition | Inline: `移動 → 惑星A`, `資源 1 → お金 2` |
| `↻` | Loop / repeat | End-of-program loop marker |
| `›` | Breadcrumb separator (legacy, not in current build) | — |

That is the complete set. **Do not introduce new glyphs** without elevating them through this list.

### Drawn icons (entities)

These aren't icons in the traditional sense — they're **runtime-drawn entity primitives**. They appear in the game canvas only, never in UI chrome.

- **Base:** purple circle + rotating ring with 4 notches + central teal core + white cross + dashed range ring
- **Ship:** blue elongated triangle pointing in heading + teal core + halo
- **Enemy:** colored triangle pointing in heading + white core dot + halo (color per type: red `basic`, orange `fast`, dark red `tank`)
- **Planet:** dark-gold circle + 2 surface "crater" dots + gold center pulsing dot + gold arc ring showing remaining resources
- **Bullet:** small colored dot, homing
- **Muzzle flash:** white-teal circle, alpha 0.7→0, scale 1→1.6 over 160ms

When this design system is extended to web surfaces (marketing pages, slide decks), reuse **these same entity primitives** as illustrative SVGs — see `assets/` for static reproductions of each one.

### Substitutions & what to do if you need a UI icon

If a future surface genuinely needs UI iconography (e.g. a settings gear) and a Unicode glyph won't do, the rule is:

1. **Try to express it without an icon** — a typographic label almost always works (`設定` is shorter than a gear icon plus a tooltip).
2. If you really need a glyph, use **Lucide** at `stroke-width: 1.5` and the `--ui` color — it matches the minimal-vector feel. Flag the addition in a code comment.
3. **Never** use Material Icons (too rounded, too consumer), **never** use emoji.

This design system intentionally does **not** ship a CDN icon font. The void is the point.

---

## Folder index

```
SpaceCode/
├── README.md                     ← this file
├── SKILL.md                      ← agent skill manifest (Claude Code-compatible)
├── colors_and_type.css           ← all tokens (colors, type, spacing) as CSS vars
├── assets/                       ← entity primitives reproduced as static SVGs
│   ├── logo-wordmark.svg
│   ├── logo-mark.svg             ← the Base, used as the app mark
│   ├── starfield.svg             ← reusable bg recipe
│   ├── entity-base.svg
│   ├── entity-ship.svg
│   ├── entity-enemy-basic.svg
│   ├── entity-enemy-fast.svg
│   ├── entity-enemy-tank.svg
│   └── entity-planet.svg
├── preview/                      ← Design System tab cards (one per concept)
│   ├── 01-palette-core.html
│   ├── 02-palette-semantic.html
│   ├── …
└── ui_kits/
    └── game/                     ← the SpaceCode in-browser game UI kit
        ├── README.md
        ├── index.html            ← interactive recreation of the game canvas
        ├── styles.css
        ├── App.jsx               ← top-level state machine
        ├── GameCanvas.jsx        ← the playfield (Base + ships + planets + starfield)
        ├── Hud.jsx               ← top HUD bar
        ├── ShopBar.jsx           ← bottom shop bar
        ├── ProgramEditor.jsx     ← the 3-column overlay (palette / list / params)
        ├── Menu.jsx              ← title screen
        └── primitives.jsx        ← Base / Ship / Enemy / Planet / Starfield as React SVG
```

### Font substitution flag ⚠

The game uses `system-ui, "Segoe UI", sans-serif` — there are **no font files in the original repo**. For Japanese support we recommend **Noto Sans JP** via Google Fonts (already wired into [`colors_and_type.css`](./colors_and_type.css)). If the project ever ships custom typography, please drop the files into `fonts/` and update the `@font-face` blocks. Until then, treat the Google Fonts CDN imports as the canonical solution. **No substitutions have been made for game-canvas rendering** — that still uses `system-ui` directly to match the live build.

---

## Iterating

The cards in the Design System tab are the fastest way to scan the system. Open any card to inspect the live HTML. The `ui_kits/game/index.html` page is the source of truth for component appearance — start there when building new surfaces.
