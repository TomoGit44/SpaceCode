# Phase 2 — ブロック編集 UI

## Context

Phase 1 でブロック実行系 (`Block`/`Program`/`Executor`) は完成したが、プレイヤーがブロックを組む手段が無い状態だった。Phase 2 はその編集 UI を載せて**コア体験を初めて触れる状態**にする。

完了条件: **Ship をクリック → 編集オーバーレイが開く → ブロックの追加・削除・並び替え・パラメータ変更ができ、その場で走行中の Ship に反映される。**

## ユーザー確定済みの設計判断 (2026-05-15)

1. **編集中もゲームは止めない** — `ProgramEditorScene` は GameScene を pause しない並行オーバーレイ。
2. **MOVE_TO は名前付き地点を指定** — `{x,y}` ではなく `{target: 'base'|'planet0'|'planet1'}`。MINE も `planetIndex:number` → `target: PlanetId` に統一。
3. **並び替えは ▲▼ ボタン** — ドラッグ&ドロップは使わない。

追加判断: 新規購入 Ship は**空 Program 開始** (コア原則「組まなければ動かない」)。サンプル投入はパレットのボタンで提供。編集はライブ反映 (Program インスタンスをその場で破壊的編集)。

## 主な実装

### 1. Block 型リファクタ (名前付き地点)

- 新規 `src/program/locations.ts` — `LocationId`/`PlanetId` 型 + ラベル + `resolveLocation`/`resolvePlanet` (`ShipWorld` を type-only import)
- `src/program/Block.ts` — `MOVE_TO`→`{target: LocationId}`, `MINE`→`{target: PlanetId}`。`BlockType` 列挙と `createBlock(type)` ファクトリを追加
- `src/program/blocks/MoveTo.ts` / `Mine.ts` — resolver 経由でターゲット解決、null なら `blocked`
- `src/program/Executor.ts` — switch は block を渡すだけなのでコード変更なし。`never` 網羅チェックも維持
- `src/program/samples.ts` — 引数なしに簡略化。`sampleBlocks()` を export (パレットの「サンプル読み込み」用、毎回新規オブジェクト)

### 2. Program ミューテーション API

`src/program/Program.ts` に追加 (`blocks` は `private readonly` のまま配列中身を破壊的に編集):
- 読取: `getBlocks()` / `cursorIndex`
- 編集: `append` / `insert(i, block)` / `removeAt(i)` / `replaceBlock(i, block)` / `moveUp(i)` / `moveDown(i)`
- **カーソル追従ルール**:
  - `insert(i)`: `i <= cursor` なら `cursor += 1`
  - `removeAt(i)`: `i < cursor` なら `cursor -= 1`、`i === cursor` なら据え置き (= 次へ進む、末尾なら停止)
  - `swap(a,b)` (moveUp/moveDown): cursor が `a` か `b` なら相手側に追従 (= 乗っているブロックを追う)
  - `append` / `replaceBlock`: 不変

### 3. Ship に Program 参照

`src/entities/Ship.ts`:
- `private program: Program | null = null`
- `getProgram()` / `setProgram(program, behavior)` — 保存値と稼働 Executor のズレを防ぐラッパ
- `import type { Program }` のみ (Executor を import すると循環)

### 4. ProgramEditorScene

新規 `src/scenes/ProgramEditorScene.ts`:
- `scene.launch('ProgramEditorScene', {ship})` で並行 active に起動
- 全画面 interactive バックドロップ (depth 0) でオブジェクトレベルのクリックを吸収 + 中央カード (depth 1) もクリックでも閉じないよう interactive 化
- 3 カラム: 左 BlockPalette / 中 ProgramList / 右 BlockParamEditor + ✕ 閉じるボタン
- `selectedIndex: number | null` で編集対象を追跡。`refresh()` が唯一の再描画経路
- ハンドラ: addBlock (選択中なら次へ insert、無ければ append) / loadSample (Program 中身だけ入れ替え) / remove / select / moveUp/Down / paramChange
- ESC / バックドロップクリック / ✕ ボタン で `scene.stop()`、SHUTDOWN イベントで全 GameObject 破棄

### 5. UI コンポーネント 3 種

すべて HUD/ShopPanel パターン準拠 (`scene.add.rectangle/.text` + `setInteractive` + `Phaser.Events.EventEmitter` + 型つき `on`/`destroy`):
- `src/ui/BlockPalette.ts` — ブロック追加ボタン × 3 + サンプル読み込み + 閉じる
- `src/ui/ProgramList.ts` — `render(blocks, selectedIndex, cursorIndex)`。走行中ブロックに「▶」マーカー、行ごとに ▲▼✕ + select。行 GameObject は再描画ごと全破棄
- `src/ui/BlockParamEditor.ts` — `render(block | null)`。LocationId/PlanetId のチップ選択 UI。元 block を変更せず新 block を construct して `change` emit

### 6. GameScene 改修

`src/scenes/GameScene.ts`:
- `editorOpen: boolean` フィールド + `create()` 状態リセットで明示初期化
- `tryBuyShip` を空 Program 開始に変更 + 「船をクリックしてプログラムを編集」バナー
- `findShipAt(x, y)` — `SHIP.radius + 4` の円判定 (Ship は Graphics で interactive ではない)
- `pointerdown` 再構成: `editorOpen` で早期 return → `placingTower` 分岐 → 通常時は ShopPanel 帯除外で `findShipAt` → `openProgramEditor`
- `pointermove` / ESC ハンドラにも `editorOpen` ガード
- `openProgramEditor(ship)`: 二重 launch ガード、`scene.launch` + `bringToTop`、`editor.events.once(SHUTDOWN)` で `editorOpen = false`
- `cleanup()` で editor を stop

### 7. main.ts

`ProgramEditorScene` を GameScene の**後ろ**に登録 (並行 active 時に入力レイヤが上)。

## 検証

- `npm run typecheck` / `npm run build`: PASS (gzip 348→352KB)
- dev サーバで `window.__game` (一時公開) + `preview_eval` で `GameScene.update` を手動駆動 (preview タブが hidden で RAF 凍結のため):
  - 新規購入 Ship は空 Program で `state: idle`、エネルギー消費なし
  - エディタを launch → 両シーン active、`editorOpen = true`、Program/Backdrop/3 コンポーネント生成確認
  - `handleAddBlock` を 4 回 → ブロック 4 つ追加、Ship 動き出す
  - `handleLoadSample` → Program 中身入れ替え、ticking で planet 採掘 (80→59.9) → 基地納品 → 停止 (Phase 1 サンプル回帰パリティ)
  - `insert(0)` / `removeAt(0)` / `moveUp(cursor)` / `moveDown(cursor)` / `removeAt(cursor)` でカーソル追従を確認
  - エディタ開閉 3 サイクル: editorOpen の同期、SHUTDOWN リスナの累積なし
  - `preview_console_logs level='error'`: 空
- 検証後 `window.__game` 公開を削除し最終 typecheck PASS

## プランからの逸脱

- バックドロップだけでなく**中央カード自体も `setInteractive()`** に (カード内空白クリックでバックドロップ閉じが発火するのを防ぐため)
- ProgramList の行ボタン (▲▼✕) は depth 差 + `topOnly` (デフォルト) により親行の select は発火しないので `stopPropagation` 不要
- 検証時に Vite (Windows 環境) がいくつかのファイル更新を watcher で取りこぼし、Program.ts / Block.ts / samples.ts を再書き込みして強制再 transform した
- preview_eval 検証で `g.scene.update()` を手動呼び出ししたところ scene shutdown と競合して renderer hang → `g.scene.processQueue()` に変更して安定化

## 既知の制限

- 「ライブ編集」の意味的サプライズ: MINE のターゲットを Ship が旧惑星上にいる間に変更したり走行中の MOVE_TO を削除した場合、次のブロック評価まで Ship 側に stale な `mineTarget`/`moveTarget` が残る (副作用は無いが理屈上気になる)。Phase 2 では許容
- 編集中の入力競合: ESC は両シーンに届くが GameScene 側が `editorOpen` でガード。タワー設置モード中に Ship クリックは効かない (placingTower 優先) — 仕様
- バックドロップが半透明 (alpha 0.55) で GameScene の描画は背後で見える。ShopPanel のボタンも視覚的には見えるがバックドロップが入力を吸収するので押せない
- BlockParamEditor のチップ群はリスト高に対するスクロール非対応。Phase 2 では惑星 2 個 + 基地 = 3 個までなので問題なし
