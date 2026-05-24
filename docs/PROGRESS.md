# SpaceCode — 開発進捗ログ

最終更新: 2026-05-25 (Phase 6 Step 0-9 + コード体系改修 + ダウン状態 / 編集画面ステータス / クレジット補給修理)

> このドキュメントは **「現状どこまでできているか / 次に何をすべきか / 設計書からどこを変えたか」** を Phase 単位で記録する。
> 設計思想・用語・過去判断は [`DESIGN.md`](DESIGN.md) を参照。

---

## 重要な経緯: 2026-05-15 Block-first 再編

旧 Phase 構成 (A→B→C→D→**E=ブロック**) は「TD ベースを完成させてから最後にブロックを実装」という積み上げ式だったが、**コアであるブロック体験が実装の最後尾に追いやられている**問題に気付き、Block-first へ再編した。

旧 Phase 対応:
- 旧 Phase A-D → **基盤層 (完了済)**。再編後も成果物はそのまま使用。
- 旧 Phase E → **新 Phase 1+2+3 に分割再構成**。
- 旧 Phase F → 新 Phase 4
- 旧 Phase G → 新 Phase 5

Phase D 実装時に `ShipBehavior` 抽象を先行導入したことで、新 Phase 1 では **Executor を `setBehavior()` で差し込むだけ** で接続できる。`AutoMineBehavior` は新 Phase 1 着手時に削除する。

詳細な思想転換の経緯は [`DESIGN.md`](DESIGN.md) §6.1 を参照。

---

## 新 Phase 1: ブロック実行系 (UI なし) ✅ 完了 (2026-05-15)

### 目標
**プログラムを組まないと Ship は動かない** というコア原則を実装で成立させる。UI は Phase 2 で被せるので、本 Phase ではコード内ハードコード Program で動作確認する。

### 成果物
- `src/program/Block.ts` — `Block` discriminated union (`MOVE_TO` / `MINE` / `DEPOSIT` の 3 種) + `BlockStepResult` 型 (`running` / `done` / `blocked`)
- `src/program/Program.ts` — `Program` クラス (Block 配列 + 実行カーソル。`currentBlock` / `advance` / `isDone` / `reset` / `length`)
- `src/program/Executor.ts` — `Executor implements ShipBehavior`。tick で `currentBlock` を dispatcher に振り分け、`done` なら `advance`。末尾到達で `ship.stop()`。1 tick 内の連続 `done` は最大 8 回まで前進
- `src/program/blocks/MoveTo.ts` / `Mine.ts` / `Deposit.ts` — 1 ファイル 1 種の評価関数
- `src/program/samples.ts` — `createSampleProgram(planets, base)`。Phase 2 で本物の編集 UI に置き換わるハードコードサンプル
- `src/scenes/GameScene.ts` 改修 — `tryBuyShip` で `Executor` + サンプル Program を `setBehavior`
- `src/entities/behaviors/` ディレクトリごと削除 (`AutoMineBehavior.ts` 削除)
- `src/entities/Ship.ts` — 旧 Phase 名 (Phase D/E) を参照していたコメントを現状に合わせて更新 (ロジック変更なし)

### ゲームの挙動
- 宇宙船購入 → サンプル Program (惑星 0 へ移動 → 満タンまで採掘 → 基地へ移動 → 納品) を 1 周実行 → **末尾で停止** (REPEAT が無いため idle)
- プログラム未割り当て / 空 Program の Ship は **完全に静止** (移動なし・エネルギー消費なし)。コア原則が実装で成立

### 設計判断・プランからの逸脱
- `behaviors/` ディレクトリは「空のまま残す」案もあったが、Executor は `src/program/` に居るため**ディレクトリごと削除**した。Phase 2/3 で `program/` 外の Behavior を増やす予定は無い
- ハードコード Program は GameScene 内 helper ではなく `src/program/samples.ts` に分離 (惑星座標を実 Planet から読み、config との二重ハードコードを回避)
- `Executor.evaluate` の switch に `never` 網羅チェックを追加 (Phase 3 でブロック追加時、case 漏れを型エラーで検出させるため)
- `Program` に `length` getter を追加 (Phase 2 UI / デバッグ用の先行追加)

### 検証
- `npm run typecheck`: PASS / `npm run build`: PASS (gzip 348KB、変化なし)
- dev サーバで手動ステップ実行 (preview ページが hidden で RAF 停止のため `GameScene.update` を手動駆動): サンプル Program 通りに移動→採掘 (惑星リソース 80→60)→移動→納品 (インベントリ 20→0、エネルギー補給) →停止 を確認
- 空 Program の Ship: 300 フレーム (~5s) 静止を確認
- `preview_console_logs level='error'`: エラーなし

### 既知の制限
- ハードコード Program は全 Ship 共通 (Ship ごとの編集は Phase 2)
- REPEAT が無いため 1 周で停止。Ship を消す手段は無い (Phase 2 の削除 UI or Phase 3 の REPEAT で解消)
- `MINE` / `DEPOSIT` は事前に `MOVE_TO` で対象へ到達している前提。範囲外だと `running` のまま留まる (サンプル Program は必ず `MOVE_TO` が先行するため問題なし)

詳細プラン: [`plans/phase-1-executor.md`](plans/phase-1-executor.md)

---

## 新 Phase 2: ブロック編集 UI ✅ 完了 (2026-05-15)

### 目標
プレイヤーがマウスでブロックを組めるようにし、コア体験「組まないと動かない」を実装で完成させる。

### 確定済み設計判断 (ユーザー確認)
- **編集中もゲームは止めない** (並行 active オーバーレイ)
- **MOVE_TO の目標は名前付き地点** (`'base' | 'planet0' | 'planet1'`)、Block 型を refactor
- **並び替えは ▲▼ ボタン** (D&D ではない)
- **新規 Ship は空 Program 開始** (コア原則最優先)。サンプル投入はパレットのボタンで提供
- **編集はライブ反映** (Program インスタンスをその場で破壊的編集、Executor は同参照を握る)

### 成果物
- 新規 `src/program/locations.ts` — `LocationId` / `PlanetId` 型 + ラベル + `resolveLocation` / `resolvePlanet` (`ShipWorld` を type-only import)
- `src/program/Block.ts` — `MOVE_TO`/`MINE` を名前付き地点 union に refactor。`BlockType` 列挙 + `createBlock` ファクトリ
- `src/program/Program.ts` — `getBlocks` / `cursorIndex` 読取、`append` / `insert` / `removeAt` / `replaceBlock` / `moveUp` / `moveDown` 編集。**走行中ブロックにカーソル追従**するルール
- `src/program/blocks/MoveTo.ts` / `Mine.ts` — resolver 経由でターゲット解決、null なら `blocked`
- `src/program/samples.ts` — `sampleBlocks()` を export、`createSampleProgram()` は引数不要に
- `src/entities/Ship.ts` — `private program` + `getProgram()` / `setProgram(program, behavior)`
- 新規 `src/scenes/ProgramEditorScene.ts` — 並行 active オーバーレイ。バックドロップ + 中央カード + 3 カラム。ESC / ✕ / バックドロップで `scene.stop()` → SHUTDOWN で全 GameObject 破棄
- 新規 `src/ui/BlockPalette.ts` — BlockType ごとの追加ボタン + サンプル読み込み + 閉じる
- 新規 `src/ui/ProgramList.ts` — 行 GameObject を毎回再構築。走行中ブロックに「▶」、行ごとに ▲▼✕
- 新規 `src/ui/BlockParamEditor.ts` — LocationId / PlanetId のチップ選択 UI。新 block を construct して emit
- `src/scenes/GameScene.ts` — `editorOpen` フラグ、空 Program 開始、`findShipAt` (円判定)、pointerdown 再構成、`openProgramEditor` (二重 launch ガード + `bringToTop` + SHUTDOWN 一回リスナ)、`cleanup()` で editor stop
- `src/main.ts` — `ProgramEditorScene` を GameScene の**後ろ**に登録 (並行 active 時に入力レイヤが上に乗る)

### 設計判断・プランからの逸脱
- **バックドロップだけでなく中央カードも `setInteractive()`** にした (カード内の空白クリックでバックドロップ閉じが発火するのを防ぐ)
- ProgramList の行ボタン (▲▼✕) は depth 差 + `topOnly` で親行 `select` の発火を防げるので、`stopPropagation` を呼ばずに済んだ
- 検証時の Vite (Windows 環境) ファイルウォッチャ取りこぼし: `Program.ts` / `Block.ts` / `samples.ts` を再書き込みして強制再 transform した
- `preview_eval` 検証で `g.scene.update()` を recursive に呼ぶと scene shutdown と競合して renderer hang。`g.scene.processQueue()` に変更して安定化

### 検証
- `npm run typecheck` / `npm run build`: PASS (gzip 348→352KB)
- dev サーバで `window.__game` (一時公開) + `preview_eval` (RAF が hidden で凍結のため手動駆動):
  - 新規購入 Ship は空 Program で `state: idle`、エネルギー消費なし → コア原則確立
  - `openProgramEditor` で並行 active を確認、`editorOpen=true`、3 コンポーネント + バックドロップ生成
  - `handleAddBlock` 4 回 → Ship が動き出す (ライブ反映)
  - `handleLoadSample` → Program 中身入れ替え → 採掘ループ 1 周完走 (惑星 80→59.9、credits +85、Phase 1 サンプル回帰パリティ)
  - `insert(0)` / `removeAt(0)` / `removeAt(cursor)` / `moveUp(cursor)` / `moveDown(cursor)` でカーソル追従を確認 (実行中ブロックを指し続ける)
  - エディタ開閉 3 サイクル: editorOpen の同期、SHUTDOWN リスナの累積なし
- `preview_console_logs level='error'`: 空
- 検証後 `window.__game` 公開を削除し最終 typecheck PASS

### 既知の制限
- ライブ編集中の stale ターゲット: 走行中の MOVE_TO / MINE を変更/削除すると次ブロック評価まで Ship 側に `mineTarget` / `moveTarget` が残る (副作用なし)
- BlockParamEditor チップ群のスクロール非対応 (Phase 2 では地点 3 つで足りる)
- ESC は両シーンに届くため両側に `editorOpen` ガードを置く必要があった (forget-prone)
- バックドロップ alpha 0.55 で背後の GameScene が薄く見える (意図的: 編集中もゲーム進行が見えるべき)

詳細プラン: [`plans/phase-2-editor.md`](plans/phase-2-editor.md)

---

## 新 Phase 3: 残ブロック + 制御フロー ✅ 完了 (2026-05-15)

### 目標
6 ブロック揃え、REPEAT による本格的な制御フロー (ネスト構造) を解禁する。Ship cooldown を撤廃して「コア体験はブロックを組むこと」を更に徹底。

### 確定済み設計判断 (ユーザー確認)
- **REPEAT はネスト構造** (`{ times, children: Block[] }`)
- **ATTACK_NEAREST は持続時間ブロック** (1 発撃って `SHIP.attackDurationMs` 経過まで留まる)
- **Ship の cooldown 連射機構を撤廃**、連射は `REPEAT { ATTACK_NEAREST }` で
- エネルギー消費 (移動/攻撃) は Phase 4 へ持ち越し

### 成果物
- 新規 `src/program/blocks/AttackNearest.ts` / `WaitUntilFull.ts` / `Repeat.ts` (Repeat は Executor が直接ハンドルするためロジック無し)
- `src/program/Block.ts` — 3 variant 追加、`BlockType` 列挙拡張、`createBlock` 拡張 (REPEAT デフォルト `{ times: 3, children: [] }`)
- `src/program/Executor.ts` — **スタックベース実行モデルへ刷新**: フレームスタック、`BlockExecContext { elapsedMs, justEntered }`、REPEAT ハンドリング、`getRunningBlocks()` / `getRunningCursor()`、root frame は末尾で pop しない設計、tick 冒頭で root frame.cursor を `program.cursorIndex` と同期、`MAX_ADVANCES_PER_TICK` 8→16
- `src/program/samples.ts` — `REPEAT × 20 { ... 4 ブロック ... }` に変更
- `src/entities/Ship.ts` — `attackCooldownMs` + Ship.update の自動発射ロジック削除、`fireAt(enemy, bullets)` / `getAttackTarget()` 追加
- `src/config.ts` — `SHIP.fireIntervalMs` 削除、`SHIP.attackDurationMs: 600` 追加
- `src/scenes/ProgramEditorScene.ts` — スコープスタック + breadcrumb、`enterScope` / `popScope` / `gotoScopeDepth`、編集ハンドラを `currentScope.blocks` 経由 (root は Program API、ネストは直接 splice)、走行マーカーは Executor の top frame と現スコープが一致するときのみ表示
- `src/ui/BlockPalette.ts` — `BLOCK_LABEL` / `BLOCK_COLOR` 拡張、ボタン高さ圧縮で 6 ブロック+テンプレ+閉じる が card 内に収まる
- `src/ui/ProgramList.ts` — `blockLabel` 拡張、`cursorIndex: number | null` 受信
- `src/ui/BlockParamEditor.ts` — REPEAT の ▼/▲ スピナー (1〜20) + 「中身を編集 →」ボタンが `enterScope` を emit

### 設計判断・プランからの逸脱
- **Executor の root frame を末尾で pop しない**設計に変更 (空 Program で後から append したときに再開できるよう)。子フレームは末尾で pop
- tick 冒頭で root frame.cursor を `program.cursorIndex` と同期する 1 行を追加 (Phase 2 のライブ編集互換を維持)
- `MAX_ADVANCES_PER_TICK` を 8 → 16 (REPEAT 開閉が advance を消費するため)
- `BlockPalette` のボタン色を種別ごとに変更 (ATTACK_NEAREST 赤系、REPEAT teal)
- `tickRepeat` は独立ファイル化したが空 (Executor のスタック制御で完結、spec コメントのみ)

### 検証
- `npm run typecheck` / `npm run build`: PASS (gzip 352→353KB)
- preview_eval 経由で:
  - 空 Program Ship は idle
  - REPEAT × 2 { MOVE_TO planet0 → MINE → MOVE_TO base → DEPOSIT } を append → 1800 frame で 2 周完走、planet 40.2 採掘、root に戻ったところで停止
  - ATTACK_NEAREST 単発: 入った tick で Bullet 1 発生成、~600ms で cursor 進行
  - REPEAT × 5 { ATTACK_NEAREST } → 5 回連射動作、root に正しく戻る
  - WAIT_UNTIL_FULL: 空インベントリで cursor 据え置き、満タンで次へ進む
  - ProgramEditorScene のスコープナビゲーション: enterScope/popScope で深さ 1↔2、currentScope の参照切り替えを確認
  - Phase 2 のライブ編集 (insert/removeAt 等のカーソル追従) も Phase 3 Executor で動作
- `preview_console_logs level='error'`: 空

### 既知の制限
- ネストスコープの編集中ライブ追従は最小 (cursor クランプのみ。root scope のみ Phase 2 の完全追従)
- REPEAT.times = 0 / children = [] は即スキップ (フレーム push せず通過)
- 二重ネスト (REPEAT 内に REPEAT) は動作するが UI のパンくずが横に長くなる
- `SHIP.attackDurationMs: 600` は固定値 (ブロックごとの個別設定は Phase 4 で検討)
- Vite (Windows) ファイルウォッチャ取りこぼし対策で `Executor.ts` を 1 回再 Write した

詳細プラン: [`plans/phase-3-blocks-and-repeat.md`](plans/phase-3-blocks-and-repeat.md)

---

## 新 Phase 4: 統合と難易度調整 / ローカルセーブ ✅ 完了 (2026-05-16)

### 目標
ブロックプログラミングのコアが揃った上で、ゲーム全体の完成度を上げる:
1. 射撃のエネルギー消費 (Phase 3 で保留)
2. 敵バリエーション (現状 1 種)
3. Ship Program の localStorage 永続化
4. 惑星リソース枯渇後のリスポーン
5. Wave/経済バランス調整

### 確定済み設計判断 (ユーザー確認 2026-05-16)
- 射撃: `SHIP.energyPerShot = 5`、Ship.fireAt 内で消費 (Block 側ではなく Ship 側)
- 敵: 3 種 (basic/fast/tank)、Phase 1-2 basic / Phase 3-4 basic+fast / Phase 5 全 3 種
- Program 永続化: 単一テンプレスロット (`spacecode.shipTemplate`)、編集のたびに保存
- 惑星: 60s で全回復、tickMine は枯渇中 `blocked`

### 成果物
- `src/config.ts` — `SHIP.energyPerShot=5`、`SHIP.cost: 80→70`、`SHIP.attackDurationMs: 600→500`、`PLANET.respawnMs=60000`、`ENEMY_TYPES` (3 種) + `EnemyType` + `EnemyTypeStats` + 互換 `ENEMY=ENEMY_TYPES.basic`、`PHASES` を `{enemySpecs[]}` 形式に refactor、`ECONOMY.startCredits: 100→120`、`STAGE.intermissionMs: 6000→7000`
- `src/entities/Ship.ts` — `fireAt` でエネルギー判定 (`energy < energyPerShot` で発射せず false) + 発射成功時に `energy -= energyPerShot`
- `src/entities/Planet.ts` — `depletedElapsedMs` + `update` で枯渇中タイマー進行 + `respawn()` 内部メソッド + `drawRespawnIndicator()` (枯渇中の進捗バー + 灰色プレースホルダリング)
- `src/entities/Enemy.ts` — コンストラクタに `type: EnemyType` 引数 (default 'basic')、`stats: EnemyTypeStats` を `ENEMY_TYPES[type]` から読む、`creditsValue`/`contactRadius`/`hitRadius` ゲッタ、描画色を `stats.color` 経由
- `src/program/blocks/Mine.ts` — 枯渇判定を `done` から `blocked` (reason: "リスポーン中") に変更
- `src/systems/SpawnSystem.ts` — `spawnAtRandomEdge(type?: EnemyType)`
- `src/systems/WaveSystem.ts` — **並行スポーンタイマー方式へ刷新**: `SpecRunner[]` で各 spec を独立タイマー駆動。delayMs / intervalMs / count を spec ごとに管理。Phase 完了判定は「全 spec の remaining=0」+「残敵 0」
- `src/scenes/GameScene.ts` — `loadShipTemplate()` で新規 Ship に保存テンプレを自動投入。撃破集計を `e.creditsValue` 加算に変更 (旧 `ECONOMY.creditsPerKill` 一律から敵種別)
- `src/scenes/ProgramEditorScene.ts` — `persist()` を全 mutation ハンドラ (handleAddBlock / handleLoadSample / handleMoveUp / handleMoveDown / handleRemove / handleParamChange) の末尾で呼び `saveShipTemplate(program)`
- 新規 `src/utils/save.ts` — `saveShipTemplate(program)` / `loadShipTemplate(): Program | null` / `clearShipTemplate()`。schema version=1、`sanitizeBlocks` で localStorage 由来 JSON を型安全に再構築 (unsupported block type は filter で除去)、`cloneBlock` でディープコピー、localStorage 例外は try/catch で握り潰し

### ゲームの挙動
- ATTACK_NEAREST 連射 (REPEAT) でエネルギーが減り、20 発で stall → 採掘で復帰可能
- Phase 3 開始 ~4s で fast (オレンジ、HP 12 / 速度 95)、Phase 5 で tank (濃赤、HP 55 / 速度 38) が並行スポーン
- 撃破クレジット: basic 5 / fast 7 / tank 14
- 惑星枯渇 → 真下にリスポーン進捗バー + 灰リング表示 → 60s で全回復、MINE ブロックが running 再開
- ブロックを編集 → F5 リロード → 新規 Ship 購入で同じ Program が自動投入される。バナー「テンプレを読み込みました」表示

### 設計判断・プランからの逸脱
- **`tickMine` を `done` ではなく `blocked` に変更** — リスポーン中は Program が次のブロックへ進まず、惑星復活で自動再開する。プログラマブル感を維持
- **`SpecRunner` 内部型を新設** (`enemySpecs` の各エントリに独立タイマーを持たせる方式)。旧 `toSpawn / spawnTimerMs` フィールドを廃止
- **`ENEMY` 定数を互換のため残置** (`ENEMY = ENEMY_TYPES.basic`)。Bullet 等の既存参照を壊さないため
- **Phase 4 の `ECONOMY.creditsPerKill` を撤廃せず残す** — `Enemy.creditsValue` で常に上書きされるが、ENEMY_TYPES に creditsOnKill を持たない (将来追加される) 敵種への default として残す
- **計測ポイントの記述は PROGRESS.md のバランスメモ枠に集約** (バランス調整は実プレイ後の継続作業)

### 既知の制限
- 編集ハンドラは `select` イベントでは保存しない (mutation 時のみ)。これにより stale な選択状態は保存されない
- localStorage クリア UI なし — 必要なら DevTools か新タブで明示的に削除
- 敵バリエーションは spawn 時固定。type 切り替えは Phase 進行のみ (Phase 内動的混在は spec の delayMs/intervalMs で表現)
- バランス調整値は **実プレイ前の仮置き** — Phase 5 着手前に通しプレイして再調整推奨

### 検証
- `npm run typecheck`: PASS
- `npm run build`: PASS

詳細プラン: [`plans/phase-4-balance.md`](plans/phase-4-balance.md)

---

## 新 Phase 5: 仕上げ ✅ 完了 (2026-05-16) 🎉 MVP 達成

### 目標
コア体験を曇らせない範囲で「動くもの」を丁寧に仕上げる。実プレイバランス再調整は Phase 5 後の継続課題として残し、コード作業を先に完了させる。

### 確定済み設計判断 (ユーザー確認 2026-05-16)
- 含める: 演出強化 / UI 統一 / README / コード整理
- 除外: バンドル分割 / 音 (今回見送り)
- 実プレイ後バランス調整は Phase 5 完了後に別途

### 成果物
- `src/config.ts` — `COLORS` 拡張 (`highlight` / `panelBg` / `panelHover` / `panelBorder` / `planetBody` / `planetMark`)。後方互換 alias `ENEMY` を削除 (`ENEMY_TYPES.basic` で代替)
- `src/entities/Bullet.ts` / `Base.ts` / `Tower.ts` / `Enemy.ts` — hardcoded `0xffffff` → `COLORS.highlight`
- `src/entities/Planet.ts` — `0x8a6f1f` / `0x6b551a` → `COLORS.planetBody` / `planetMark`、`0x1a2540` → `COLORS.panelBg`。**リスポーン完了時にフラッシュ演出** (resource 色の円が拡大しながらフェード)
- `src/entities/Ship.ts` — `0x1a2540` → `COLORS.panelBg`。**`fireAt` にマズルフラッシュ** (accent 色、160ms)
- `src/ui/*` — 全 UI コンポーネント (HUD / ShopPanel / BlockPalette / ProgramList / BlockParamEditor) の `0x1a2540` / `0x223151` を `COLORS.panelBg` / `panelHover` に統一
- `src/ui/HUD.ts` — `showBanner` のイージングを `Back.easeOut` に強化、初期スケール 0.85→0.7 / 終了 1.05→1.08 でやや跳ねるバウンス
- `src/scenes/MenuScene.ts` — 起動時フェードイン 320ms、タイトル軽スケールイン (`Cubic.easeOut` 520ms)、サブタイトル + プロンプトを遅延フェードイン。フッターを「MVP v1.0 — Phase 5 完成」へ更新
- `src/scenes/GameOverScene.ts` / `VictoryScene.ts` — タイトルを上からスライドイン + フェード、サブ・サマリ・リトライ案内を時間差で順次表示。リトライ点滅を 900ms → 1100ms にやや控えめに
- `src/scenes/GameScene.ts` — Phase クリア時に accent 色のカメラフラッシュ (220ms)
- `src/scenes/ProgramEditorScene.ts` — カード stroke を `ally, 0.6` → `0.4` に薄めて軽さを出す
- `README.md` — **遊び方ガイド全面追記** (コア原則、ブロック 6 種、推奨初手プログラム 2 例 A/B、リソース循環、エネルギー、敵 3 種、セーブ挙動、操作テーブル)。「ステータス」を「MVP 達成」へ更新

### 設計判断・プランからの逸脱
- **`DamageSystem` 集約は見送り**: 各エンティティが self-contained でダメージ管理する現状の方が読みやすい (調査結果)
- **後方互換 `ENEMY` alias を削除** (誰も参照していなかったため安全)
- **フォントサイズ統一は見送り**: 現状のサイズで実用上問題ないため、影響範囲を広げず据え置き
- **演出は控えめに**: パーティクル多用 / カメラ shake 増量を避け、「ブロックの動作が見えるゲーム」というコア体験を曇らせない方針

### 既知の制限 (Phase 5 後の継続課題)
- バンドル 1.5MB (gzip 354KB) — dynamic import 未実施
- 音なし — BGM / SE は未実装
- 実プレイ後バランス調整は未着手 — `PROGRESS.md` のバランスメモ枠の計測ポイントに従って実プレイ後に数値修正
- 敵バリエーション拡張・惑星追加・タワー初期 2 基の自由化は将来課題

### 検証
- `npm run typecheck`: PASS
- `npm run build`: PASS (gzip 354KB)

詳細プラン: [`plans/phase-5-polish.md`](plans/phase-5-polish.md)

---

## 補追改修: ProgramEditorScene を**インライン階層編集**へ刷新 (2026-05-16)

### 経緯
Phase 5 完了直後にユーザーから UI 仕様変更の指示:
- 「繰り返し」の中身は「中身を編集」ボタンで別画面に切り替えるのではなく、**その場で表示**する
- 階層を罫線で囲む表現 (Scratch 風)

### 確定済み設計判断 (ユーザー指示 2026-05-16)
- ネストは drill-in せず、インデント + 罫線でインライン表示
- 罫線は Graphics で線を引く (フォント依存しない)
- ブロック追加は「選択中ブロックが REPEAT なら中に、それ以外なら同じ scope の直後」のヒューリスティック

### 成果物
- `src/program/Program.ts` — **path ベース API** を追加 (`getBlocksAtParent` / `getBlockAt` / `insertAtPath` / `appendAtPath` / `removeAtPath` / `replaceBlockAtPath` / `moveUpAtPath` / `moveDownAtPath`)。root scope の操作は既存 API (`insert`/`removeAt`/...) に委譲してカーソル追従互換を維持
- `src/program/Executor.ts` — `getRunningPath(): number[] | null` を追加。スタック中間フレームの「親 cursor - 1」が REPEAT 自身を指す事実から path を組み立てる
- `src/scenes/ProgramEditorScene.ts` — **スコープスタック + breadcrumb を撤廃**、`selectedPath: number[] | null` に刷新。編集ハンドラはすべて path 引数を取る。`handleAddBlock` は「REPEAT 選択中なら children に push / 通常選択中なら同 scope 直後に挿入」のロジック
- `src/ui/ProgramList.ts` — **再帰展開で行リストを構築**、ブロック行を depth で左インデント。REPEAT スコープは Graphics で `accent` 色の縦線 (depth に応じた x) + 終端 `└` 形状で囲む。`select`/`moveUp`/`moveDown`/`remove` の emit を `number` から `number[]` (path) に変更
- `src/ui/BlockParamEditor.ts` — REPEAT 用の「中身を編集 →」ボタンを撤廃 (drill-in が無いため)。代わりにヒント「中身はリストでそのまま編集」 + 「子ブロック: N」表示
- `BlockParamEditorEvents.enterScope` を撤廃

### 設計判断・実装上の判断
- **▼ ボタンの有効/無効判定** — 子の親 scope の長さを ProgramList 側で得るのは煩雑なため、UI は常に有効として描画し、`moveDownAtPath` 側で範囲外を no-op として吸収する設計に
- **走行中ハイライト** — `Executor.getRunningPath()` から得た path と各行 path を直接比較。Phase 3 で導入した `getRunningBlocks()`/`getRunningCursor()` は残置 (今は使わないが互換のため)
- **REPEAT 行の見た目** — 通常ブロックと違って薄い `accent` 色背景 + ストロークでスコープ感を強調、ラベルは bold

### 既知の制限
- 画面外省略 (height 超過) はそのまま — 縦スクロール未実装。深くネスト + 多数ブロックでカード下端をはみ出すと描画されない
- 中間フレームの cursor が末尾 (REPEAT 内の最後を実行完了した直後 1 フレーム) のとき `getRunningPath` が一時的に親フレーム末尾の path を返すことがあるが、次 tick で pop されるので実用上問題なし
- 連続ネスト (REPEAT 内 REPEAT 内 REPEAT...) は描画上は対応するがインデント分の幅が圧迫されると本体が窮屈になる

### 検証
- `npm run typecheck`: PASS
- `npm run build`: PASS (gzip 354→355KB)

### Hotfix: 編集後の idle 検知 → 自動 reset (2026-05-16)

**症状**: プログラムを編集すると Ship が止まる / 走行マーカー (▶) が表示されない

**原因**: Executor は「root cursor が末尾に到達 = `ship.stop()`」設計。一度プログラム末尾まで実行した Ship は **末尾停止 (idle) 状態** に落ち、`getRunningPath()` が `null` を返す。この状態でブロックを追加・編集しても、root cursor が末尾を指したままなので再評価されない (= 動かない / マーカーも出ない)。

**修正**: `ProgramEditorScene` に `ensureRunning()` を追加。各 mutation ハンドラ (`handleAddBlock` / `handleLoadSample` / `handleMoveUp` / `handleMoveDown` / `handleRemove` / `handleParamChange`) の `persist()` 直後に呼ぶ。`getRunningPath() === null` のときのみ `executor.reset()` を呼んで先頭から再実行。

**判断**: 採掘・移動など実行中 (idle ではない) のときは無干渉で、Phase 2 で確立した「ライブ編集 + カーソル追従」がそのまま働く。idle のときだけリセットなので、編集中に走行状態を壊さない。

---

## 補追改修: 準備時間を「手動開始」制に変更 (2026-05-17)

### 経緯
ユーザー要望: 「フェーズ開始前に準備時間を作る。準備時間中は宇宙船の購入やプログラム編集ができる」。
従来は `STAGE.intermissionMs` (7s) のタイマーカウントダウン + 最初の `preparing` (1.5s) で自動進行していたが、ブロックを組む時間としては短く、プレイヤー側に主導権が無かった。

### 確定済み設計判断 (ユーザー確認 2026-05-17)
- 終了タイミング: **「開始」ボタンで手動開始** (タイマー無し)
- 最初の Phase 1 開始前にも準備時間を入れる
- 前 Phase クリア後に準備時間に入る (現状の流れ通り、敵スポーン中は準備時間にしない)

### 成果物
- `src/systems/WaveSystem.ts` — `intermission` 状態を削除し `preparing` に統合。`intermissionTimerMs` を撤去。新規 API: `startNextPhase()` (preparing → spawning 遷移) / `isAwaitingStart()` / `getUpcomingPhaseNumber()`。`update()` の `preparing` 分岐はタイマー無しで開始待ち
- `src/ui/HUD.ts` — 開始ボタン (中央下、ShopPanel 上) を追加。`showStartButton(phaseNumber, totalPhases, onClick)` / `hideStartButton()` / `triggerStartButton()`。注意を引くスケールパルス (`Sine.easeInOut`, yoyo, -1 repeat)。下にヒント「宇宙船を購入・船をクリックしてプログラム編集ができます」
- `src/scenes/GameScene.ts` — `waves.on('state')` で `preparing` 時にボタン表示 / それ以外で hide。初期表示でも (Phase 1 開始前) ボタン提示。SPACE / ENTER でボタン押下と同等動作。`updateStatusText` の `preparing` 分岐を「準備時間 — PHASE X 開始待ち」に変更、`intermission` 分岐を削除
- `src/config.ts` — `STAGE.intermissionMs` を削除 (`STAGE.totalPhases` のみ残置)

### 設計判断
- **`intermission` を撤廃して `preparing` に統合**: 「Phase 開始前の待機」という意味で本質的に同一だったため。状態数が減り `updateStatusText` も単純化
- **編集オーバーレイ中はボタン無効**: 編集中に SPACE で誤って開始しないよう、`editorOpen` ガード。ProgramEditorScene のフルスクリーンバックドロップで pointer も拾えない
- **ボタン位置**: ShopPanel と重ねず上に配置 (Y = GAME_HEIGHT - 60 - 28 - 24)。準備時間中だけ表示することで通常プレイ時のクラッタを増やさない
- **「PHASE 1 開始」と「次の PHASE N 開始」のラベル分岐**: 初回は新規開始の高揚感を出し、2 周目以降は連続性を示す文言にした

### 検証
- `npm run typecheck`: PASS
- `npm run build`: PASS (gzip 355→ほぼ変化なし)
- `preview_console_logs level='error'`: エラーなし
- 実プレイ確認はユーザーに依頼 (WebGL ページは preview ヘッドレスで操作テスト困難)

### 既知の制限
- 準備時間に「最大時間」が無いため、放置すると永久に Phase が始まらない。MVP のシングルプレイでは問題なし
- 開始ボタンと SPACE 同時押しでも 2 重発火しない (`startNextPhase()` 内で state チェック)

---

## Phase 6: アイテムシステム 🔧 進行中 (2026-05-22 時点 Step 0-5 完了)

### 目標
MVP (Phase 5) で完成したコアループに、Run 中の成長要素として **アイテムシステム** を載せる。
カテゴリは 5 つ (オムニ・コア / モジュール / ケミカル / コードガチャ / モジュールガチャ) + 配置型の **アイテムコード** (Code 拡張)。
**コア体験「コードを組まないと Ship は動かない」は維持** — アイテムはコードの組み合わせを広げる手段であって、自動挙動の足し算ではない。

進捗: Step 0 〜 5 完了 (commit 済)。ガチャ開封・抽選 UI (`src/items/gacha.ts` は実装済だが未配線)・Run リワード経路は Step 6 以降の予定。

### Phase 6 共通の確定済み設計判断
- **localStorage 永続化は撤廃** (Phase 4 の `spacecode.shipTemplate` を含む)。Inventory は **Run 毎にリセット**、メモリ上のみ
- レア度 4 段階 (N / R / SR / L) を全アイテム共通で採用、色を `COLORS.rarity*` に集約
- 装着効果は **加算スタック** (乗算は終盤の倍々ゲー破綻、§6.1 オムニ・コア)
- アイテム種類追加は **data-driven** (新オムニ・コア = `OMNI_CORE_TYPES` に 1 行、モジュール = `MODULE_TYPES` に 1 行、ケミカル = `CHEMICAL_TYPES` に 1 行)
- アイテム一覧 / 編集オーバーレイは複数並ぶため、`editorOpen: boolean` を `overlayDepth: number` に一般化

### Step 0: 用語シフト「ブロック」→「コード」 ✅ 2026-05-22
**経緯**: Phase 6 でアイテム配置型の Code 拡張 (条件 wrapper) を導入する前段として、用語を「コード」に統一。
**成果物**:
- `Block` → `Code` を型名・ファイル名・変数名・UI 文字列で一括 rename。ファイル移動は `git mv` で blame 保持
- `src/program/Block.ts` → `Code.ts`、`blocks/` → `codes/`、`BlockPalette` → `CodePalette`、`ProgramList`/`BlockParamEditor` 等の API も Code 系に統一
- `docs/DESIGN.md` §1-5・`CLAUDE.md`・`README.md` の用語を更新 (§6 以降の過去判断ログは当時の表記を保持)
**設計判断**: 過去判断ログ (§6) の本文は当時の「ブロック」呼称をそのまま残す — 判断の文脈保存を優先 (改名は履歴 fact ではなく表記揺れに該当)
**検証**: typecheck / build PASS、挙動変化なし

### Step 1: アイテムデータモデル + EffectSystem の枠 ✅ 2026-05-22
**成果物**:
- `src/items/itemTypes.ts` — `Rarity` / `ItemCategory` (5) / `ItemInstance` / `CodeItemInstance` / `ShipStat`/`BaseStat`/`EconomyStat` 列挙 + `RARITY_LABEL`/`RARITY_SHORT`/`RARITY_COLOR`
- `src/items/effects.ts` — `EffectSystem` クラス (Step 1 は素通し: `shipStat(ship, stat, base) → base` を返すだけ)。Step 2 以降で集計を実装
- `src/items/Inventory.ts` — `items[]` + `codes[]` + `shipModules: Record<shipId, uid[]>` + `reset()`。**メモリ上のみ**
- `src/config.ts` — `COLORS.rarityN/R/SR/L` 追加
- `src/entities/Ship.ts` — `readonly id: string` (`crypto.randomUUID()`)。`Inventory.shipModules` のキーに使う
- `src/utils/save.ts` 削除、`ProgramEditorScene.persist()` 撤廃 — Phase 4 で導入した Program 永続化を破棄
**設計判断**:
- **`CodeItemInstance` は `ItemInstance` と別型**: コードアイテムは「プログラムへの配置」概念がモジュール装着と異質なため (配置の真実源は ITEM_CODE ノード自身、後述 Step 5)
- **`Ship.id` を `crypto.randomUUID()` で発番**: 配列インデックスだと Ship の生成順 / 破壊で安定 ID にならない
- stat 参照の EffectSystem 経由化は **Step 2 以降で順次**: 効果が即検証できるため (素通し段階で全箇所書き換えると検証不能)
**検証**: typecheck / build PASS、ランタイムエラーなし

### Step 2: アイテム一覧 UI + オムニ・コア ✅ 2026-05-22
**成果物**:
- `src/scenes/ItemInventoryScene.ts` — 並行 active オーバーレイ。左カテゴリタブ / 中央所持一覧 / 右詳細パネル。右端「📦 アイテム」ボタンから開く
- `src/items/types/omniCores.ts` — `OMNI_CORE_TYPES` (5 種: 攻撃 / 推進 / 採掘 / 砲塔 / 賞金) + `makeRandomOmniCore`。Step 3 で装甲コア追加
- `src/items/effects.ts` — オムニ・コア集計を実装 (`omniPercent(target, stat)`)。`shipStat`/`baseStat`/`economyStat` がインベントリ集計値で base を倍率補正
- stat 参照を EffectSystem 経由に置換:
  - `Ship.update` の `damagePerShot` / `moveSpeed` / `mineRate` → `effects.shipStat(...)`
  - `Base.update` の砲塔火力 → `effects.baseStat('turretDamage', ...)`
  - `GameScene` の撃破クレジット → `effects.economyStat('creditsPerKill', ...)`
- `GameScene` — `editorOpen: boolean` を `overlayDepth: number` に一般化 (ProgramEditorScene と ItemInventoryScene の重複対策、SPACE で誤 startNextPhase しないガード)
- デバッグ用「オムニ・コア獲得 (N/R/SR/L)」ボタンを ItemInventoryScene に配置
**設計判断**:
- **加算スタック**: `damagePerShot` ×1.2 を 3 個持つと `×1.6` (×1.2 を 3 回乗算ではなく)。仕様 §6.1 の「終盤バランス保護」
- **overlayDepth カウンタ**: オーバーレイ排他ではなく**多重起動を許容**しつつ「最低 1 つ開いていれば GameScene 入力をブロック」できる形に
- **stat 参照の置換は段階的**: Step 2 で `damagePerShot` / `moveSpeed` / `mineRate` / 砲塔 / 撃破クレジット。`maxHp` / `maxEnergy` / `inventoryCap` は Step 3 (動的 max 機構) と一緒に
**検証**: typecheck / build PASS、ランタイムエラーなし

### Step 3: モジュール + Ship 装備 ✅ 2026-05-22
**成果物**:
- `src/items/types/modules.ts` — `MODULE_TYPES` (5 種): ガトリング砲 / 装甲プレート / 補助スラスタ / 強化ドリル / 拡張カーゴ + `makeRandomModule`
- `ModuleEffect` は `kind: 'percent' | 'flat'` で表現。`extraShots` (flat) は `config` に base を持たない特殊値
- `src/items/effects.ts` — `shipModulePercent(ship, stat)` で Ship 個別集計を追加。`shipExtraShots(ship)` で 1 射あたり追加弾数
- `src/entities/Ship.ts` — `maxHp`/`maxEnergy`/`inventoryCap` を可変化 (`public` フィールド)。`applyMaxStats(effects)`: 増加=差分回復 / 減少=clamp (仕様 A5)。`fireAt` が複数弾発射 (`1 + extraShots` 発)
- `src/entities/Base.ts` — `applyMaxStats` 相当のオムニ・コア対応 (`maxHp` 拡張は将来用に予約)
- `src/scenes/ItemInventoryScene.ts` — モジュールタブ + 「装着先 Ship 選択」/「取り外し」フロー。Ship 個別表示
- `src/scenes/GameScene.ts` — Ship 購入時 / アイテム構成変化時に `applyMaxStats(effects)` 再計算。**Ship 破壊時に装着モジュールをインベントリへ自動返却** (B3)
- `src/items/types/omniCores.ts` — 装甲コア (`core_hull`, maxHp%) を追加
**設計判断**:
- **モジュール個体は 1 Ship 排他** (同種は加算スタックなので個体を複数持てば複数 Ship に分散可能)。仕様 §6.3
- **ガトリング砲のトレードオフ表現** (`extraShots` + `damagePerShot -40%`): 効果配列で複数 stat を持てる構造、「強化のみ」アイテムにしないため
- **§7.4 (ProgramEditorScene 内モジュールセクション) は見送り**: ItemInventoryScene で装着完結する設計のため、編集オーバーレイにモジュール UI を重ねる必要なし
- **Ship 破壊時の装着モジュール返却は GameScene 側**: Ship/Inventory のどちらにも参照を持たせず GameScene が仲介 (B3)
**検証**: typecheck / build PASS、ランタイムエラーなし

### Step 4: ケミカル ✅ 2026-05-22
**成果物**:
- `src/items/types/chemicals.ts` — `CHEMICAL_TYPES` (6 種): 基地修理キット / 船団リペアパック / エネルギーセル / クレジットチップ (即時)、オーバードライブ (時限バフ)、衝撃波ジェネレータ (AoE)
- `ChemicalKind`: `baseHeal` / `shipHeal` / `shipRefuel` / `credits` / `timedAttack` / `aoeDamage`
- `src/items/effects.ts` — 時限バフ `TimedShipBuff` + `addTimedShipBuff(stat, percent, durationMs)` + `tick(delta)` で残時間減算。`shipStat` に時限バフ加算を合算
- `src/entities/Base.ts` — `heal(amount)` 追加 / `src/entities/Ship.ts` — `heal(amount)` 追加
- `src/scenes/GameScene.ts` — `applyChemical(typeId, rarity)` を kind で振り分け。AoE は基地中心 + 半径内の敵に damage、`effects.tick(delta)` を毎フレーム呼ぶ
- `src/scenes/ItemInventoryScene.ts` — ケミカルタブ + 「使用する」→ 確認 → 消費フロー
**設計判断**:
- ケミカルは **消費型** (装着ではない)。使用すると `Inventory.items` から remove
- **時限バフは全 Ship 共通** (Ship 個別のバフは MVP スコープ外)
- 衝撃波は基地中心固定 (任意座標選択は MVP スコープ外、UI 複雑化を回避)
**検証**: typecheck / build PASS、ランタイムエラーなし

### Step 5: アイテムコードと配置システム ✅ 2026-05-22
**成果物**:
- `src/program/Code.ts` — `ITEM_CODE` variant を `Code` union に追加 (`itemUid` / `itemCodeType` / `rarity` / `params` / `children`)。`codeChildren(code)` ヘルパで REPEAT / ITEM_CODE の子配列取得を統一
- `src/items/types/itemCodes.ts` — `ItemCodeType` 3 種 (`IF_HP_BELOW` / `IF_ENEMY_IN_RANGE` / `IF_INVENTORY_FULL`) + `ITEM_CODE_DEFS` (パラメータ仕様、レア度ごとの最大値)。`createItemCodeNode(inst)` / `itemCodeLabel(node)` / `defaultItemCodeParams`
- `src/program/codes/IfHpBelow.ts` / `IfEnemyInRange.ts` / `IfInventoryFull.ts` — 条件判定関数 (純関数、ship/world から bool を返す)
- `src/program/Executor.ts` — `ITEM_CODE` を条件 wrapper として処理: 条件成立時に子コードを 1 周実行 (REPEAT との違い: 1 ループ後 done、何度も繰り返さない)
- `src/items/codePlacement.ts` — **配置の真実源はプログラム内 ITEM_CODE ノード** (`itemUid`)。`collectPlacedCodeUids(programs)` で全 Ship を走査 → 残数算出。`availableCodeCounts` / `pickUnplacedInstance` (レア度高い順)
- `src/ui/CodePalette.ts` — 初期コード (∞) と アイテムコード (残数表示、0 で無効化) を別セクションで表示
- `src/ui/CodeParamEditor.ts` — `ITEM_CODE` のパラメータ編集 UI (レア度ごとの最大値で clamp)
- `src/ui/ProgramList.ts` — `ITEM_CODE` をネスト wrapper として階層描画 (REPEAT と同じ縦線 + 終端)
- `src/scenes/ProgramEditorScene.ts` — `inventory` / `getShips` を受け取り、配置・残数を毎フレーム再計算。デバッグ用「アイテムコード獲得」行を追加
**設計判断 (仕様 §8.4)**:
- **配置の真実源 = プログラム内 ITEM_CODE ノード**: `CodeItemInstance` 側に配置フラグを持たない。残数は全 Ship のプログラム走査で算出
- **理由**: Ship 破壊・wrapper コード削除のいずれでもノードが消えれば走査結果から自動的に外れる → アイテムが「未使用」に戻る。明示的な解放処理 (B5) が不要
- **wrapper の意味**: 条件成立時に子を **1 周だけ実行**。REPEAT が「N 回」「root が無限ループ」とは意味論的に異なる
- **同じアイテムを複数箇所に配置不可**: `itemUid` は 1 個体 1 配置 (`collectPlacedCodeUids` の Set で保証)
**検証**: typecheck / build PASS、ランタイムエラーなし

### Step 6: ガチャ抽選 + 開封 UI + リワード経路 ✅ 2026-05-23
**成果物**:
- `src/items/gacha.ts` を配線 (Step 0-5 完了時点で実装済・未参照だったロジックを実用化):
  - `gachaCategoryOf(typeId)` 逆引き
  - `phaseRewardCategory(phaseNumber)` (奇数=code / 偶数=module)
  - `rollPhaseRewardRarity()` 重み付き抽選 (R 55% / SR 30% / L 15%)
- `src/scenes/GachaOpenScene.ts` (新規): 並行 active オーバーレイ。`drawGacha(category, gachaRarity)` で 3 候補を生成、カードを stagger フェード + スケールイン (`Back.easeOut`) で提示。選択 → 「これを選ぶ」確定で Inventory に追加 + ガチャ消費。ESC / バックドロップでキャンセル (未消費のまま閉じる)
- `src/scenes/ItemInventoryScene.ts`: `codeGacha` / `moduleGacha` タブを `IMPLEMENTED` 化、所持ガチャ一覧 + 詳細パネルに「開封する」ボタン → `GachaOpenScene` を launch。デバッグ獲得ボタンもガチャカテゴリ対応
- `src/scenes/GameScene.ts`:
  - `phaseClear` ハンドラに `grantPhaseClearGacha(n)` を追加 (毎クリア 1 個付与、バナー「報酬: <レア度> <カテゴリ>ガチャを獲得」)
  - 撃破集計ループに `rollEnemyDropGacha(enemy)` を追加 (fast 4% / tank 12% で R ガチャ、basic はドロップなし、カテゴリ 50/50、バナー「ドロップ: R <カテゴリ>ガチャ」)
- `src/main.ts`: `GachaOpenScene` を ItemInventoryScene の後ろに登録 (並行 active 時の入力レイヤ順)

**設計判断**:
- **GachaOpenScene は親 (ItemInventoryScene) を pause しない**: 並行 active + 全画面バックドロップ + `bringToTop` で親への入力遮断。Phaser のシーン入力順 (最後に追加 = 最上位) に依存
- **`GameScene.overlayDepth` は触らない**: 親 ItemInventoryScene が既にカウンタを 1 増やしているため、GachaOpenScene は孫オーバーレイとしてカウンタ操作不要。SHUTDOWN 時に `onClosed()` で親に再描画 + `onChanged()` を促し、所持インベントリ表示を更新
- **ガチャ消費はキャンセル時に行わない**: ESC / バックドロップ / 「やめる」では `consumed = false` のまま閉じる → ガチャ個体はインベントリに残る。誤クリック保護
- **Phase クリア報酬カテゴリは交互、レア度は重み付き**: 「進行感」(毎クリア何かもらえる) と「ガチャの引き目」(L はたまに) を両立。Phase 番号がカテゴリを決めるので、5 Phase 通しで code 3 / module 2 が確定的に取れる
- **敵ドロップは fast/tank のみ、レア度 R 固定**: basic はドロップなしで「fast/tank を倒すモチベ」を作る。カテゴリ 50/50 ランダムでスコープを最小化 (basic からもドロップさせると頻度が上がりすぎる)
- **ItemInventoryScene の `IMPLEMENTED` フラグはタブ単位**: ガチャ 2 タブを実装済リストに追加するだけで「アイテムがありません」表示から「実所持表示」に切り替わる構造

**ゲームの挙動**:
- Phase 1 クリア → 「報酬: <R/SR/L> コードガチャを獲得」バナー、📦アイテム のバッジが +1
- Phase 2 クリア → モジュールガチャ
- fast 撃破時に 4% で R コード/モジュールガチャ がドロップ
- ItemInventoryScene のガチャタブを開いて「開封する」 → 3 候補がカードでフェードイン → 1 つ選ぶ → そのアイテムが対応カテゴリに追加され、ガチャは消費
- キャンセルすればガチャは残るので何度でも開き直せる (ただし候補は開封ごとに再抽選)

**検証**: typecheck / build PASS、preview console エラーなし

### Step 7: ボス敵を Phase 5 末尾に追加 ✅ 2026-05-23
**成果物**:
- `src/config.ts`: `EnemyType` に `'boss'` 追加、`ENEMY_TYPES.boss` (HP 200 / 速度 30 / ダメ 30 / radius 22 / 色 `0xa07bff` 紫 / `creditsOnKill 50`)、`PHASES[4]` 末尾に boss spec (`count: 1, intervalMs: 1, delayMs: 18000`) を追加
- `src/entities/Enemy.ts` の `redraw`: ボス専用描画 (radius+14 の glow + 二重リング + radius*0.35 の強コア)
- `src/systems/WaveSystem.ts`: スポーン直後に `enemySpawned` イベントを emit (ボス出現バナーに利用)
- `src/scenes/GameScene.ts`:
  - `waves.on('enemySpawned')` で type === 'boss' を検知 → 「⚠ BOSS 接近中」バナー + カメラ shake
  - `rollEnemyDropGacha` の冒頭にボス分岐: 100% で SR ガチャ確定 + 紫色フラッシュ + 「ボス撃破! SR <カテゴリ>ガチャを獲得」バナー

**設計判断**:
- **ボスは Phase 5 末尾の delayMs 18000**: 雑魚 (basic / fast / tank) を片付け終わる頃に登場するよう、十分大きな遅延。`SpecRunner` の並行タイマー方式 (Phase 4 で導入) のおかげで spec を 1 行足すだけで実現
- **描画は既存の三角形は維持**: 大型化 + 二重リング + 強コアで「ボス感」を出す。専用スプライト等は作らず、`Graphics` の組み合わせで完結 (画像アセット不使用方針)
- **ボス報酬は SR 固定**: L にすると "Stage クリア直前で L を引かされる" タイミング問題が出る (使う機会が限られる)。SR にしておくと Stage 終盤の駆け込み装備に使える
- **enemySpawned はジェネリックなイベントとして実装**: ボス専用ではなく「敵スポーン直後」の汎用通知。将来 fast / tank の出現演出を入れる余地

### Step 8: Wave 中間ドロップ (半数到達でケミカル N) ✅ 2026-05-23
**成果物**:
- `src/systems/WaveSystem.ts`: `getPhaseTotal()` を追加 (Phase 全 spec の `count` 合計)
- `src/scenes/GameScene.ts`:
  - `phaseKillCount: number` / `phaseHalfRewarded: boolean` を field 追加
  - `phaseStart` ハンドラで両方をリセット
  - 撃破集計ループに `checkPhaseHalfReward()` を挿入: 累計撃破数が `floor(total/2)` 以上になったら `makeRandomChemical('N')` を 1 個 Inventory に追加 + 「中盤ボーナス: <ケミカル名> を獲得」バナー (Phase ごと 1 回限定)

**設計判断**:
- **「Phase の敵を半数倒した」をトリガーに**: ガチャ報酬は Phase クリア / 敵ドロップで既に複数経路がある。中間枠は「Phase の途中で何かもらえる」リズム作りに使う。レア度 N のケミカルにすることで「使い切るしかないが当座の役には立つ」便利アイテム枠
- **`phaseKillCount` は GameScene 側で持つ**: WaveSystem は「いつ何体スポーンするか」と「Phase 完了判定」が責務であり、撃破カウントは GameScene の集計ループ内で自然に取れる。WaveSystem に kill 集計を移すと責務が混ざる
- **`makeRandomChemical('N')` 固定**: ケミカルは 6 種あり、N 固定でもバラエティが出る。レア度を抽選するとガチャと役割が被るのでシンプルに固定
- **基地接触で死んだ敵はカウント外**: `if (!e.reachedBase)` ブランチ内で `phaseKillCount` を増やすので、自然と「撃破」だけが半数判定に効く

### Step 9: ProgramEditorScene にモジュール装着一覧 ✅ 2026-05-23
**成果物**:
- `src/scenes/ProgramEditorScene.ts`:
  - `renderEquippedModules(x, y, w)` メソッド追加: `inventory.shipModules[ship.id]` から uid を引き、`MODULE_TYPES[typeId]` でラベル取得、レア度色付きチップ (`rc, alpha 0.15` 背景 + `rc, 0.85` ストローク) を横に並べる。チップ幅は Text の `width` を実測してから背景を描く
  - 装着なしなら「モジュールなし — 📦 アイテムから装着できます」のヒント文
  - 画面幅オーバー時は末尾に「…」省略マーカー
  - レイアウト調整: `innerTop` を `cardTop + 76` → `cardTop + 100`、`innerHeight` を `cardH - 96` → `cardH - 120` (24px 縮める)
- `MODULE_TYPES` を import

**設計判断**:
- **read-only**: 装着 / 取り外しは ItemInventoryScene で完結。両画面で操作できると UI 一貫性ロス (Step 2 着手時に決めた方針を継承)
- **チップ幅を実測してから背景を描く**: モジュール名が日本語可変長 (「ガトリング砲」「補助スラスタ」等) のため固定幅では収まらない / 余白が出る。`Text` を仮配置 → `width` 取得 → 背景描画 → 位置確定の順序で最小幅 + 8px 余白
- **省略マーカー方式**: スクロール対応の代わりに「…」で打ち切り。MVP 規模 (5 種モジュール) ではほぼ起こらないが将来の保険
- **レイアウトは縦に削る**: カード全体を拡張すると ShopPanel との重なりが発生する。`innerHeight` を 24px 縮めても ProgramList の表示行数は実用範囲

**ゲームの挙動 (Step 7-9)**:
- Phase 5 開始 → 雑魚出現 → 約 18 秒後にボス出現 (バナー + shake) → ボス撃破で SR ガチャ + フラッシュ
- 各 Phase で敵を半数倒した瞬間に「中盤ボーナス: <ケミカル名>」バナー → 📦アイテムバッジ +1
- Ship クリックで編集 → カード上部に「装着中: <レア度バッジ> <モジュール名>」チップ列が表示される (未装着ならヒント)

**検証**: typecheck / build PASS、preview console エラーなし

### Phase 6 残作業 (Step 9 完了後)
- **実プレイ後バランス調整**: ガチャ排出重み・敵ドロップ率・アイテム効果値・ボス HP/速度・中間ドロップの中身を実プレイで再計測
- 仕様 §7.4 のフル実装 (編集画面からの装着) が必要になった場合、Step 9 の chip 表示を起点に拡張可能

---

## 補追改修: 旧 MINE / DEPOSIT / WAIT_UNTIL_FULL を `WAIT` に統合 (2026-05-24)

### 経緯
プレイヤー要望: 「採掘・納品・満タンまで待機の 3 コードを **待機 (秒数指定)** に集約してほしい。
惑星の近くで WAIT したら自動採掘、基地の近くで WAIT したら自動納品 + エネルギー補給」。

### 確定済み設計判断
- `WAIT { seconds }` 1 種に統合 (旧 3 コードを削除)
- 副作用 (採掘 / 納品 / 補給) は **`tickWait` 内で位置判定して暗黙的に発火** — ユーザはターゲット指定不要
- 秒数範囲は 1〜60 秒、UI スピナーで指定。既定値 5 秒
- 「満タンまで待機」の自動完了は失われるが、`待機 5 秒` (inventoryCap=20 / mineRate=5 で満タン) を目安にすれば実用上問題なし

### 成果物
- `src/program/Code.ts`: `Code` union から `MINE` / `DEPOSIT` / `WAIT_UNTIL_FULL` を削除、`WAIT { seconds: number }` を追加。`CodeType` 列挙 → 4 種 (`MOVE_TO` / `ATTACK_NEAREST` / `WAIT` / `REPEAT`)。`createCode('WAIT')` 既定 5 秒
- `src/program/codes/Wait.ts` (新規): `tickWait(code, ship, world, ctx)` — 基地近くなら `ship.depositAt(base)` + 必要なら `ship.refuel()`、惑星近くで満タンでなければ `ship.mineAt(planet)`、`ctx.elapsedMs >= seconds*1000` で done
- `src/program/codes/Mine.ts` / `Deposit.ts` / `WaitUntilFull.ts` 削除 (`git rm`)
- `src/program/Executor.ts`: switch を 3 ケース削除 + `WAIT` ケース追加、import 整理
- `src/program/samples.ts`: サンプルを `[MOVE_TO planet0, WAIT 5, MOVE_TO base, WAIT 1]` に置き換え
- `src/ui/CodePalette.ts`: `CODE_LABEL` / `CODE_COLOR` / `INITIAL_TYPES` を 4 種に縮減、WAIT は 黄色 (`resource` 流用)
- `src/ui/CodeParamEditor.ts`: `renderWait()` を新規追加 (秒数スピナー 1〜60、ヒント文付き)。旧 MINE のチップ / WAIT_UNTIL_FULL の note を撤去。`PlanetId` / `ALL_PLANET_IDS` import 削除
- `src/ui/ProgramList.ts`: `codeLabel()` の switch を 4 種 + ITEM_CODE に縮減。WAIT 行は「待機 N 秒」表示

### 設計判断・実装上の判断
- **`tickWait` は位置で挙動が決まる**: ユーザは「採掘先」「納品先」を指定する必要がない。`MOVE_TO planet0 → WAIT 5` と書けば、`MOVE_TO` が実際に到達する地点 = 採掘対象になる。明示性は若干下がるが、コード数が半分以下になり「待機」の意味が直感的
- **基地近くの WAIT で空インベントリでも refuel**: 既存の `Ship.update` の deposit 経路は `inventory > 0` のときしか refuel しない。`tickWait` から `ship.refuel()` を直接呼ぶことで「資源を持っていなくても基地で休めば回復」を実現
- **複数惑星が範囲内のケース**: `world.planets` の最初に見つかった (非枯渇) 惑星を採掘対象に。MVP の盤面では事実上 1 つしか範囲内にならない
- **「満タンまで待機」相当の挙動**: 秒数を長めにすれば実質達成 (満タン後はインベントリ < cap の条件で mineAt が呼ばれず採掘ストップ、ただし WAIT 自体は秒数経過まで続く)。明示的な「満タン検知 done」が欲しい場合はアイテムコード `もし満タンなら` (`IF_INVENTORY_FULL`) と組み合わせる
- **README の遊び方ガイドも全面書き直し**: サンプル・リソース循環・コード表を WAIT 中心に。永続化撤廃 (Phase 6 Step 1) も反映

### 検証
- `npm run typecheck`: PASS
- `npm run build`: PASS (gzip 365KB、変化なし)
- preview console エラーなし

### 既知の制限
- `MOVE_TO` のターゲットが「惑星A / 惑星B / 基地」の 3 つで固定の現状、ユーザが「WAIT で何が起こるか」を知るには `MOVE_TO` 先を覚える必要がある。チップに `(WAIT で採掘可)` 等のヒントを足す余地あり
- 旧 `WAIT_UNTIL_FULL` の「満タン到達で即 done」挙動を完全に再現するには `IF_INVENTORY_FULL` wrapper + 内側で break する設計が必要だが、現状 break コード自体が存在しない。スコープ追加は将来検討

---

## 補追改修: ダウン状態 / 編集画面ステータス / クレジット補給修理 (2026-05-25)

### 経緯
プレイヤー要望:
1. プログラム編集画面でも (ゲーム内ステータスパネルと同様に) HP / エネルギー / 積載量を見たい
2. エネルギー切れ・HP 0 を強調表示してほしい
3. エネルギー切れの宇宙船は編集画面に「行動不可」と警告を出してほしい
4. 積載量が小数点で表示されることがある (バグ) → 整数で
5. クレジット消費で「いつでも満タン補給」「HP 0 でも修理で復活」できるようにしてほしい (ストール / ダウンからの能動的復帰経路)

### 確定済み設計判断
- **HP 0 = ダウン状態** (新規): 死亡せず Ship オブジェクトは残る。**敵接触ダメージも受けない (免疫)**。視覚は alpha 0.3 で更に薄く
- **エネルギー 0 = ストール状態** (既存維持): 移動・採掘・攻撃すべて不可。alpha 0.45
- **補給コスト $20 / 修理コスト $40** (固定、満タン回復)。常時利用可 — Phase クリアボーナス $30 で 1 回ぶんは賄える設計
- ステータスは編集カード右上に 3 行表示。HP/ENE が 0 のとき赤色 + ⚠ + 警告メッセージ
- 補給/修理ボタンは編集画面のみに配置 (Ship クリックで開く既存フローに統合)

### 成果物
- `src/config.ts`: `SHIP.refuelCost: 20` / `SHIP.repairCost: 40` 追加
- `src/entities/Ship.ts`:
  - `ShipState` に `'downed'` 追加
  - `takeDamage()` を `hp = max(0, hp - amount)` に変更 (自動 `die()` 撤廃)
  - `Ship.update()` の冒頭に「HP 0 → state='downed' + alpha 0.3 + 早期 return」分岐を追加 (敵接触ループより前で return するため、ダウン中は接触ダメージ免疫が自然に実現)
  - 既存 `heal()` / `refuel()` で復活 (`heal` は `dead === false` のとき HP 加算するため、ダウン状態は自然に対応)
- `src/scenes/GameScene.ts`:
  - `updateStatPanel()` を改修: `Math.floor(s.inventory)` で整数化、HP/ENE 0 で赤色 + ⚠ サフィックス
  - 選択リングをダウン/ストール時に赤に変更 (視認性強化)
  - `openProgramEditor()` に `economy` を渡す
- `src/scenes/ProgramEditorScene.ts`:
  - `ProgramEditorData` に `economy: EconomySystem` 追加
  - `renderShipStatusPanel()`: カード右上に 3 行ステータス + 警告メッセージ枠
  - `refreshShipStatus()`: 毎フレーム値更新 + 補給/修理ボタンの enable/disable + 警告文出し分け
  - `handleRepair()` / `handleRefuel()`: クレジット消費 + `heal`/`refuel` 呼び出し
  - `update()` を統合 (既存の走行 path 監視 + 新規の Ship ステータス refresh)
  - `shutdown()` に `statBtns` / `statTexts` / `warningText` クリーンアップ追加

### 設計判断・実装上の判断
- **ダウン状態は `Ship.update` の早期 return で実現**: 敵接触ループより前で抜けるため、コードを 1 箇所触るだけで「接触ダメージ免疫」「移動停止」「behavior 停止」すべてを満たす。`takeDamage` を `if (downed) return` する案より影響が小さい
- **`die()` は呼び出し元がなくなるが残置**: 将来「ダウン状態を解除して破棄」(ユーザが見限る) 機能を入れる余地。private なので外部影響なし
- **補給/修理ボタンは編集画面に集約**: Ship 選択 → 編集画面起動という既存フローに乗せれば追加 UI が不要。`ShopPanel` を太らせない
- **コストはクレジット定数 1 箇所**: 将来の調整は `config.ts` 編集のみで済む
- **`Math.floor(inventory)` は表示時のみ**: ゲームロジック内では float のまま保持 (経済計算精度のため)。表示時に丸めるだけ
- **ストール / ダウン両方の警告は同居可能**: HP も ENE も 0 のときは「戦闘不能 + エネルギー切れ」と複合メッセージ
- **ボタンを毎フレーム作り直す**: 値変化 (クレジット使用後の残高等) で enable/disable が変わるため、refresh ごとに destroy → 再生成。負荷は小さい (1 シーンに 0-2 個)

### ゲームの挙動
- 編集画面を開くと、カード右上に HP/ENE/INV (3 行)。INV はもう小数表示されない
- エネルギー切れの船を開くと: ENE 行が赤、上部に警告、[補給 $20] が赤縁で強調
- HP 0 (ダウン) の船を開くと: HP 行が赤、上部に警告、[修理 $40] が赤縁で強調
- 修理ボタンを押す → クレジット $40 消費 → HP 全回復 → ダウン解除 → 次フレームから behavior 再開
- ダウン中の船は敵が踏んでもダメージなし (HP 0 のまま停止)
- 通常時 (HP 30/30, ENE 100/100) は補給/修理ボタンは出ない

### 検証
- `npm run typecheck`: PASS
- `npm run build`: PASS (gzip 366KB)
- preview console エラーなし

### 既知の制限
- ダウン中の船は永久に居続ける (Run 終了まで)。「諦めて破棄して残骸を回収」する経路は無い → 後続課題
- 補給/修理は満タン固定。部分回復は対応していない (UI 簡略化)。「あと $10 でも補給できる」みたいな選択はできない

---

## バランス調整メモ (実プレイ後に追記する場所)

> 各 Phase の体感難易度・経済感をプレイ後にここに残す。`config.ts` の数値を触る前に参照。

### 計測ポイント (実プレイ時に観察するもの)
- **Phase 1 開始 5s**: credits / 購入した Ship 隻数 / Ship が惑星に向かったか
- **Phase 3 fast 出現時 (~4s)**: タワーが捌ききれているか / Ship の射撃で削れているか
- **Phase 5 tank 出現時 (~6s)**: tank が基地に到達するまでに撃破できているか
- **エネルギー消費**: REPEAT { ATTACK_NEAREST } の発射回数で stall するタイミング / 採掘ループとの両立可否
- **惑星枯渇 vs リスポーン (60s)**: ゲーム時間と枯渇期間の比 — Ship が停止する時間が許容範囲か
- **クレジット余り**: Phase 5 開始時の手持ち $ / 投資先 (Ship 増強 or タワー追加) が足りているか

### Phase 4 初期値 (実プレイ前。実プレイ後に上書きする)
| 項目 | 値 | 備考 |
|---|---|---|
| `SHIP.cost` | 70 | Phase D 80 から下げて Phase 1 から 1 隻必ず買えるよう |
| `SHIP.energyPerShot` | 5 | 20 発 / energy フル |
| `SHIP.attackDurationMs` | 500 | Phase 3 600 から短縮 (DPS 微増) |
| `ECONOMY.startCredits` | 120 | $70 Ship + $50 タワー が即購入可能 |
| `STAGE.intermissionMs` | 削除 (2026-05-17) | Phase 5 後の補追改修で「手動開始」制に変更 |
| `PLANET.respawnMs` | 60000 | 60s |
| ENEMY_TYPES.fast | HP 12 / 速度 95 / ダメ 8 / $7 | Phase 3 から登場 |
| ENEMY_TYPES.tank | HP 55 / 速度 38 / ダメ 15 / $14 | Phase 5 のみ |

### 実プレイ後の所見

(まだ実プレイデータなし)

---

## ファイル別ステータス

| ファイル | 状態 | 備考 |
|---|---|---|
| `src/main.ts` | ✅ | `ProgramEditorScene` + `ItemInventoryScene` を GameScene の後ろに登録 (並行 active 時の入力レイヤ順) |
| `src/config.ts` | ✅ | Phase 6: `COLORS.rarity*` 追加。Step 7: `EnemyType` に `boss` 追加 + `PHASES[4]` に boss spec。2026-05-25: `SHIP.refuelCost`/`repairCost` 追加 |
| `src/scenes/BootScene.ts` | ✅ | 変更予定なし |
| `src/scenes/MenuScene.ts` | ✅ | Phase 5 演出済 |
| `src/scenes/GameScene.ts` | ✅ | Phase 6: `overlayDepth` / `Inventory` + `EffectSystem` / `applyChemical` / Ship 破壊時のモジュール返却 / `applyMaxStats`。Step 6: `grantPhaseClearGacha` + `rollEnemyDropGacha`。Step 7-8: ボス出現バナー / `phaseKillCount` + `checkPhaseHalfReward` |
| `src/scenes/GameOverScene.ts` | ✅ | |
| `src/scenes/VictoryScene.ts` | ✅ | |
| `src/scenes/ProgramEditorScene.ts` | ✅ | Phase 6: `inventory`/`getShips`/`economy` 受領、ITEM_CODE 配置 + 残数管理。Step 9: 装着モジュール read-only チップ表示。**2026-05-25**: Ship ステータス + 補給 $20 / 修理 $40 ボタン + ダウン/ストール警告 |
| `src/scenes/ItemInventoryScene.ts` | ✅ | Phase 6: 並行 active オーバーレイ。カテゴリタブ + 所持一覧 + 詳細 + 装着/使用フロー (Step 6 でガチャ「開封する」ボタン追加) |
| `src/scenes/GachaOpenScene.ts` | ✅ | Phase 6 Step 6: ガチャ開封オーバーレイ。3 候補カード提示 + 選択 + 確定で Inventory に追加 |
| `src/entities/Base.ts` | ✅ | Phase 6: `heal(amount)`、砲塔火力に `effects.baseStat` 経由 |
| `src/entities/Tower.ts` | 🗑️ | Phase 5 後に削除済 (基地砲塔に統合) |
| `src/entities/Enemy.ts` | ✅ | Phase 4: 3 種化、Phase 6 Step 7: boss 専用描画 (二重リング + 強コア) |
| `src/entities/Bullet.ts` | ✅ | 基地砲塔/Ship 共用 |
| `src/entities/Planet.ts` | ✅ | Phase 4: 60s リスポーン |
| `src/entities/Ship.ts` | ✅ | Phase 6: `id` 発番 / `maxHp`/`maxEnergy`/`inventoryCap` 可変 / `applyMaxStats` / `heal` / `fireAt` が複数弾 / stat 参照を `effects.shipStat` 経由。**2026-05-25**: `ShipState` に `downed` 追加、`takeDamage` で自動 die 撤廃、HP 0 = ダウン (敵接触免疫) |
| `src/systems/SpawnSystem.ts` | ✅ | |
| `src/systems/WaveSystem.ts` | ✅ | Phase 5 後: `intermission` を `preparing` 統合 / `startNextPhase()` 手動開始。Phase 6 Step 7-8: `enemySpawned` イベント + `getPhaseTotal()` |
| `src/systems/EconomySystem.ts` | ✅ | |
| `src/program/Code.ts` | ✅ | Phase 6: `ITEM_CODE` variant 追加、`codeChildren` ヘルパで wrapper 統一。**2026-05-24 改修**: 初期コードを 6 → 4 種に縮減 (`MINE`/`DEPOSIT`/`WAIT_UNTIL_FULL` を撤廃 → `WAIT` に集約) |
| `src/program/Program.ts` | ✅ | path ベース API + カーソル追従 (root scope) |
| `src/program/Executor.ts` | ✅ | Phase 6: `ITEM_CODE` を条件 wrapper として処理 (1 周実行) / root 末尾は自動ループバック。2026-05-24 改修で switch を 4 種に縮減 |
| `src/program/samples.ts` | ✅ | `sampleCodes()` (Phase 6 で rename) |
| `src/program/locations.ts` | ✅ | |
| `src/program/codes/MoveTo.ts` | ✅ | Phase 6 Step 0 で `blocks/` → `codes/` 改名 |
| `src/program/codes/Wait.ts` | ✅ | **2026-05-24 新規**: 秒数指定の待機 + 位置による自動採掘 / 自動納品 + 補給 |
| `src/program/codes/Mine.ts` | 🗑️ | 2026-05-24 削除 (`WAIT` に統合) |
| `src/program/codes/Deposit.ts` | 🗑️ | 2026-05-24 削除 (`WAIT` に統合) |
| `src/program/codes/WaitUntilFull.ts` | 🗑️ | 2026-05-24 削除 (`WAIT` 秒数指定で代替) |
| `src/program/codes/AttackNearest.ts` | ✅ | |
| `src/program/codes/Repeat.ts` | ✅ | Executor が直接ハンドル |
| `src/program/codes/IfHpBelow.ts` | ✅ | Phase 6 Step 5: ITEM_CODE 条件判定 (純関数) |
| `src/program/codes/IfEnemyInRange.ts` | ✅ | Phase 6 Step 5: ITEM_CODE 条件判定 |
| `src/program/codes/IfInventoryFull.ts` | ✅ | Phase 6 Step 5: ITEM_CODE 条件判定 |
| `src/items/itemTypes.ts` | ✅ | Phase 6 Step 1: `Rarity` / `ItemInstance` / `CodeItemInstance` / stat 列挙 |
| `src/items/Inventory.ts` | ✅ | Phase 6 Step 1: items/codes/shipModules。**メモリ上のみ** (Run 毎リセット) |
| `src/items/effects.ts` | ✅ | Phase 6: オムニ・コア + モジュール + 時限バフを集約、加算スタック |
| `src/items/codePlacement.ts` | ✅ | Phase 6 Step 5: ITEM_CODE 配置の真実源走査 (`collectPlacedCodeUids` / `availableCodeCounts` / `pickUnplacedInstance`) |
| `src/items/types/omniCores.ts` | ✅ | Phase 6 Step 2-3: 6 種 (攻撃/推進/採掘/装甲/砲塔/賞金) |
| `src/items/types/modules.ts` | ✅ | Phase 6 Step 3: 5 種 (ガトリング/装甲/スラスタ/ドリル/カーゴ) |
| `src/items/types/chemicals.ts` | ✅ | Phase 6 Step 4: 6 種 (修理/船団リペア/エネ/$/オーバードライブ/衝撃波) |
| `src/items/types/itemCodes.ts` | ✅ | Phase 6 Step 5: アイテムコード定義 3 種 (もし HP/敵/満タン) + `createItemCodeNode` |
| `src/items/gacha.ts` | ✅ | Phase 6 Step 6: `drawGacha` + `phaseRewardCategory` + `rollPhaseRewardRarity` + `gachaCategoryOf`。GachaOpenScene / GameScene から参照 |
| `src/ui/HUD.ts` | ✅ | Phase 5 後: 「開始」ボタン |
| `src/ui/ShopPanel.ts` | ✅ | |
| `src/ui/CodePalette.ts` | ✅ | Phase 6: 初期コード (∞) + アイテムコード (残数) の 2 セクション |
| `src/ui/ProgramList.ts` | ✅ | Phase 6: ITEM_CODE をネスト wrapper として階層描画 |
| `src/ui/CodeParamEditor.ts` | ✅ | Phase 6: ITEM_CODE のパラメータ編集 (レア度で最大値 clamp) |
| `src/utils/starfield.ts` | ✅ | |
| `src/utils/save.ts` | 🗑️ | Phase 6 Step 1 で削除済 (Inventory はメモリ上のみ、Program 永続化も撤廃) |

凡例: ✅ 完了 / 🔧 部分実装・拡張予定 / 🗑️ 削除予定 / ⬜ 未着手

---

# 履歴: 基盤層 (旧 Phase A-D, 完了済)

> 旧 Phase 構成での実装履歴。再編後も以下の成果物は全て稼働中。
> 「設計書からの逸脱」は当時の旧 plan (`abundant-exploring-dusk.md` / `breezy-honking-quail.md`) に対しての記録。

## 旧 Phase A: プロジェクト基盤 ✅ 完了

### 成果物
- `package.json` / `tsconfig.json` / `vite.config.ts` / `index.html` / `.gitignore` / `README.md`
- `src/main.ts` — Phaser ゲーム初期化、シーン登録
- `src/config.ts` — 全定数 (`GAME_WIDTH=1280`, `GAME_HEIGHT=720`, `COLORS`, `BASE`, `TOWER`, `SHIP`, `ENEMY`, `ECONOMY`, `STAGE`)
- `src/scenes/BootScene.ts` — 即 Menu へ遷移
- `src/scenes/MenuScene.ts` — タイトル + クリック/SPACE 入力
- `src/scenes/GameScene.ts` — 基地描画 (この時点では基地のみ)
- `src/entities/Base.ts` — HP / 描画 / 脈動アニメ / takeDamage
- `src/utils/starfield.ts` — 星空背景ヘルパ

### 当時の設計書からの逸脱
- `utils/starfield.ts` を追加 (背景演出)
- `Base.ts` を Phase A 段階で実装 (起動確認の絵として先行実装)

### 検証
- `npx tsc --noEmit`: PASS / `npm run build`: 5.89s (gzip 341KB)

---

## 旧 Phase B: TD の最小ループ ✅ 完了

### 成果物
- `src/entities/Tower.ts` — 射程内最寄り敵の自動迎撃
- `src/entities/Enemy.ts` — 基地へ直進、`dead`/`reachedBase` フラグ
- `src/entities/Bullet.ts` — 対象ホーミング、命中で takeDamage
- `src/systems/SpawnSystem.ts` — 4 辺ランダム出現
- `src/scenes/GameOverScene.ts`
- `src/scenes/GameScene.ts` 更新、`src/main.ts` 更新、`src/config.ts` 拡張

### ゲームの挙動
- 中央基地 + 左右 150px のタワー 2 基。1.5s 後から 2.2s ごとに敵が出現。タワー秒 1 発、命中で敵 HP -10。基地接触で HP -10。HP=0 で GameOver。

### 当時の設計書からの逸脱
- `TOWER.dps` → `damagePerShot` + `fireIntervalMs` に分解
- `ENEMY.contactRadius=24` を追加

### 既知の制限 (当時)
- 上下から来る敵は素抜け (現在も継続。Phase 4 で再考)
- 撃破クレジットは Phase C で実装

---

## 旧 Phase C: 経済と HUD ✅ 完了

### 成果物
- `src/systems/WaveSystem.ts` — Phase 状態機械 (`preparing/spawning/clearing/intermission/victory`)
- `src/systems/EconomySystem.ts` — credits + `change` イベント
- `src/ui/HUD.ts` — HP/Phase/クレジット + 中央バナー
- `src/scenes/VictoryScene.ts`
- `src/scenes/GameScene.ts` 大改修、`src/systems/SpawnSystem.ts` 改修 (時間管理撤去)
- `src/config.ts` 拡張 (`PHASES[5]`, `ECONOMY.creditsPerKill=5/phaseClearBonus=30`, `STAGE.intermissionMs=6000`)

### Wave Phase 編成

| Wave Phase | 敵数 | spawn間隔 |
|---|---|---|
| 1 | 5 | 2200ms |
| 2 | 7 | 1900ms |
| 3 | 9 | 1650ms |
| 4 | 11 | 1450ms |
| 5 | 13 | 1250ms |

最大獲得クレジット: 撃破 $5×45 + クリアボーナス $30×5 + 開始 $100 = **$375**。

### 当時の設計書からの逸脱
- `STAGE.intermissionSec` (8秒) → `STAGE.intermissionMs=6000` (短縮)
- SpawnSystem の責務縮小 (時間管理は WaveSystem に集約)
- HUD に HP バー / 中央バナー / クレジット増減ポップ追加

---

## 旧 Phase D: 宇宙船 / 惑星 / 採掘 ✅ 完了

### 成果物
- `src/entities/Planet.ts` — 採掘 API (`extract(delta, ratePerSec)`)、残資源リング + 真下バー
- `src/entities/Ship.ts` — HP/energy/inventory 管理 + 命令的 API + `ShipBehavior` 差し替えフック + 敵接触ダメージ + Bullet 流用の攻撃発射
- `src/entities/behaviors/AutoMineBehavior.ts` — 採掘ループ自動 AI (**新 Phase 1 着手時に削除予定**)
- `src/ui/ShopPanel.ts` — 画面下端の固定ボタン群 (宇宙船 / タワー)
- `src/systems/EconomySystem.ts` 拡張 — `depositResource(amount)`
- `src/entities/Base.ts` 拡張 — `radius` を public readonly に昇格
- `src/config.ts` 拡張 — `SHIP` 拡張定数、`PLANETS`、`PLANET.mineRadiusPadding`、`ENEMY_VS_SHIP.contactDps`
- `src/scenes/GameScene.ts` 拡張 — planets/ships 配列、ShopPanel 配線、タワー設置モード

### ゲームの挙動
- ShopPanel: `[宇宙船 $80] [タワー $50]`、残高不足で自動グレーアウト
- 宇宙船購入 → AutoMineBehavior が採掘 → 納品 → ループ (**この自動挙動は新 Phase 1 で消える**)
- タワー追加配置: クリックで配置モード → 制約チェック付きでマップに設置
- Ship が敵に接触 → 接触持続中 DPS 8 でダメージ → HP < 8 で採掘中断・基地退避 → HP 0 で消滅
- 既存タワー 2 基はそのまま (3 基目以降を自由配置)

### 当時の設計からの逸脱
- AutoMineBehavior に攻撃挙動を組み込まない (ATTACK_NEAREST と二重定義を避ける)
- `ShipBehavior` 抽象を先行導入 (新 Phase 1 で実を結ぶ)
- タワー初期 2 基は維持。自由配置タワーは 3 基目以降
- エネルギー切れ復帰は基地納品時の全回復で固定 (`refuelOnDeposit=true`)
- 納品時 HP 回復はしない (MVP)
- `Base.radius` を public 化

### 完了時の検証
- `npm run typecheck`: PASS / `npm run build`: gzip 348KB

### 重要な学び (Block-first 再編につながった)
Phase D 完了時点で「コア体験 (ブロック) が触れない」ことに気付いた。`AutoMineBehavior` で採掘ループが動いてしまうため、UI を作る前にコア体験を確認する遅延が大きかった。この反省が Block-first 再編 (2026-05-15) のきっかけ。
