# SpaceCode — 開発履歴 (MVP 達成までの記録)

> このドキュメントは **Phase 5 (MVP 達成) まで** の実装履歴 + 旧 Phase A-D の記録。
> Phase 6 以降の進捗・補追改修は [`PROGRESS.md`](PROGRESS.md) を、
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
- `behaviors/` ディレクトリは「空のまま残す」案もあったが、Executor は `src/program/` に居るため**ディレクトリごと削除**した
- ハードコード Program は GameScene 内 helper ではなく `src/program/samples.ts` に分離 (惑星座標を実 Planet から読み、config との二重ハードコードを回避)
- `Executor.evaluate` の switch に `never` 網羅チェックを追加 (Phase 3 でブロック追加時、case 漏れを型エラーで検出させるため)
- `Program` に `length` getter を追加 (Phase 2 UI / デバッグ用の先行追加)

### 検証
- `npm run typecheck`: PASS / `npm run build`: PASS (gzip 348KB、変化なし)
- dev サーバで手動ステップ実行: サンプル Program 通りに移動→採掘 (惑星リソース 80→60)→移動→納品 (インベントリ 20→0、エネルギー補給) →停止 を確認
- 空 Program の Ship: 300 フレーム (~5s) 静止を確認

### 既知の制限
- ハードコード Program は全 Ship 共通 (Ship ごとの編集は Phase 2)
- REPEAT が無いため 1 周で停止。Ship を消す手段は無い (Phase 2 の削除 UI or Phase 3 の REPEAT で解消)
- `MINE` / `DEPOSIT` は事前に `MOVE_TO` で対象へ到達している前提

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
- 新規 `src/program/locations.ts` — `LocationId` / `PlanetId` 型 + ラベル + resolver
- `src/program/Block.ts` — `MOVE_TO`/`MINE` を名前付き地点 union に refactor。`BlockType` 列挙 + `createBlock` ファクトリ
- `src/program/Program.ts` — `getBlocks` / `cursorIndex` 読取、`append` / `insert` / `removeAt` / `replaceBlock` / `moveUp` / `moveDown` 編集。**走行中ブロックにカーソル追従**するルール
- 新規 `src/scenes/ProgramEditorScene.ts` — 並行 active オーバーレイ。バックドロップ + 中央カード + 3 カラム
- 新規 `src/ui/BlockPalette.ts` / `ProgramList.ts` / `BlockParamEditor.ts`
- `src/scenes/GameScene.ts` — `editorOpen` フラグ、空 Program 開始、`findShipAt` (円判定)、`openProgramEditor` (二重 launch ガード + `bringToTop`)
- `src/main.ts` — `ProgramEditorScene` を GameScene の**後ろ**に登録 (並行 active 時に入力レイヤが上に乗る)

### 設計判断
- **バックドロップだけでなく中央カードも `setInteractive()`** にした (カード内の空白クリックでバックドロップ閉じが発火するのを防ぐ)
- ProgramList の行ボタン (▲▼✕) は depth 差 + `topOnly` で親行 `select` の発火を防げる

### 検証
- `npm run typecheck` / `npm run build`: PASS (gzip 348→352KB)
- preview_eval で並行 active / ライブ編集 / カーソル追従を確認

### 既知の制限
- ライブ編集中の stale ターゲット: 走行中の MOVE_TO / MINE を変更/削除すると次ブロック評価まで Ship 側に `mineTarget` / `moveTarget` が残る (副作用なし)
- BlockParamEditor チップ群のスクロール非対応 (Phase 2 では地点 3 つで足りる)

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
- `src/program/Block.ts` — 3 variant 追加、`BlockType` 列挙拡張、`createBlock` 拡張
- `src/program/Executor.ts` — **スタックベース実行モデルへ刷新**: フレームスタック、`BlockExecContext { elapsedMs, justEntered }`、REPEAT ハンドリング、root frame は末尾で pop しない設計、`MAX_ADVANCES_PER_TICK` 8→16
- `src/entities/Ship.ts` — `attackCooldownMs` + 自動発射ロジック削除、`fireAt(enemy, bullets)` 追加
- `src/config.ts` — `SHIP.fireIntervalMs` 削除、`SHIP.attackDurationMs: 600` 追加
- `src/scenes/ProgramEditorScene.ts` — スコープスタック + breadcrumb、`enterScope` / `popScope`
- `src/ui/*` — REPEAT 用 ▼/▲ スピナー (1〜20) + 「中身を編集 →」ボタン

### 設計判断
- **Executor の root frame を末尾で pop しない** (空 Program で後から append したときに再開できるよう)
- tick 冒頭で root frame.cursor を `program.cursorIndex` と同期 (Phase 2 のライブ編集互換を維持)
- `MAX_ADVANCES_PER_TICK` を 8 → 16 (REPEAT 開閉が advance を消費するため)

### 検証
- `npm run typecheck` / `npm run build`: PASS (gzip 352→353KB)

### 既知の制限
- ネストスコープの編集中ライブ追従は最小 (cursor クランプのみ)
- 二重ネスト (REPEAT 内に REPEAT) は動作するが UI のパンくずが横に長くなる

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
- `src/config.ts` — `SHIP.energyPerShot=5`、`SHIP.cost: 80→70`、`PLANET.respawnMs=60000`、`ENEMY_TYPES` (3 種)、`PHASES` を `{enemySpecs[]}` 形式に refactor
- `src/entities/Ship.ts` — `fireAt` でエネルギー判定 + 消費
- `src/entities/Planet.ts` — `depletedElapsedMs` + `respawn()` + 進捗バー
- `src/entities/Enemy.ts` — `type: EnemyType` 引数、`stats: EnemyTypeStats`
- `src/program/blocks/Mine.ts` — 枯渇判定を `done` から `blocked` に変更
- `src/systems/WaveSystem.ts` — **並行スポーンタイマー方式** (`SpecRunner[]`)
- 新規 `src/utils/save.ts` — `saveShipTemplate` / `loadShipTemplate` / `clearShipTemplate`

### ゲームの挙動
- ATTACK_NEAREST 連射でエネルギーが減り、20 発で stall → 採掘で復帰可能
- Phase 3 で fast (オレンジ)、Phase 5 で tank (濃赤) が並行スポーン
- 惑星枯渇 → 60s で全回復、MINE ブロックが running 再開
- ブロックを編集 → F5 リロード → 新規 Ship 購入で同じ Program が自動投入

### 設計判断
- **`tickMine` を `done` ではなく `blocked` に変更** — リスポーン中は Program が次のブロックへ進まず、惑星復活で自動再開する (プログラマブル感を維持)
- **`SpecRunner` 内部型を新設** (`enemySpecs` の各エントリに独立タイマーを持たせる方式)
- **`ENEMY` 定数を互換のため残置** (Phase 5 で削除)

### 既知の制限
- バランス調整値は **実プレイ前の仮置き**
- localStorage クリア UI なし

### 検証
- `npm run typecheck` / `npm run build`: PASS

詳細プラン: [`plans/phase-4-balance.md`](plans/phase-4-balance.md)

---

## 新 Phase 5: 仕上げ ✅ 完了 (2026-05-16) 🎉 MVP 達成

### 目標
コア体験を曇らせない範囲で「動くもの」を丁寧に仕上げる。実プレイバランス再調整は Phase 5 後の継続課題として残し、コード作業を先に完了させる。

### 確定済み設計判断 (ユーザー確認 2026-05-16)
- 含める: 演出強化 / UI 統一 / README / コード整理
- 除外: バンドル分割 / 音 (今回見送り)

### 成果物
- `src/config.ts` — `COLORS` 拡張 (`highlight` / `panelBg` / `panelHover` / `panelBorder` / `planetBody` / `planetMark`)
- 全エンティティ — hardcoded `0xffffff` → `COLORS.highlight`、リスポーン完了時にフラッシュ演出、マズルフラッシュ
- `src/ui/*` — 全 UI コンポーネントの色を `COLORS.panelBg` / `panelHover` に統一
- `src/ui/HUD.ts` — `showBanner` のイージング `Back.easeOut`
- `src/scenes/MenuScene.ts` — 起動時フェードイン + タイトル軽スケールイン
- `src/scenes/GameScene.ts` — Phase クリア時にカメラフラッシュ
- `README.md` — **遊び方ガイド全面追記**

### 設計判断
- **`DamageSystem` 集約は見送り**: 各エンティティが self-contained でダメージ管理する現状の方が読みやすい
- **後方互換 `ENEMY` alias を削除** (誰も参照していなかったため安全)
- **演出は控えめに**: パーティクル多用 / カメラ shake 増量を避け、「ブロックの動作が見えるゲーム」というコア体験を曇らせない方針

### 既知の制限 (Phase 5 後の継続課題)
- バンドル 1.5MB (gzip 354KB) — dynamic import 未実施
- 音なし
- 実プレイ後バランス調整は未着手

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
- `src/program/Program.ts` — **path ベース API** を追加 (`insertAtPath` / `removeAtPath` 等)。root scope の操作は既存 API に委譲してカーソル追従互換を維持
- `src/program/Executor.ts` — `getRunningPath(): number[] | null` を追加
- `src/scenes/ProgramEditorScene.ts` — **スコープスタック + breadcrumb を撤廃**、`selectedPath: number[] | null` に刷新
- `src/ui/ProgramList.ts` — **再帰展開で行リストを構築**。REPEAT スコープは Graphics で `accent` 色の縦線 + 終端 `└` 形状で囲む
- `src/ui/BlockParamEditor.ts` — REPEAT 用の「中身を編集 →」ボタンを撤廃、ヒント「中身はリストでそのまま編集」

### 設計判断
- **▼ ボタンの有効/無効判定** — UI は常に有効として描画し、`moveDownAtPath` 側で範囲外を no-op として吸収
- **走行中ハイライト** — `Executor.getRunningPath()` から得た path と各行 path を直接比較
- **REPEAT 行の見た目** — 薄い `accent` 色背景 + ストロークでスコープ感を強調

### 既知の制限
- 画面外省略 (height 超過) はそのまま — 縦スクロール未実装
- 連続ネスト (REPEAT 内 REPEAT) はインデント分の幅が圧迫されると本体が窮屈になる

### 検証
- `npm run typecheck`: PASS / `npm run build`: PASS (gzip 354→355KB)

### Hotfix: 編集後の idle 検知 → 自動 reset (2026-05-16)

**症状**: プログラムを編集すると Ship が止まる / 走行マーカー (▶) が表示されない

**原因**: Executor は「root cursor が末尾に到達 = `ship.stop()`」設計。一度プログラム末尾まで実行した Ship は **末尾停止 (idle) 状態** に落ち、`getRunningPath()` が `null` を返す。

**修正**: `ProgramEditorScene` に `ensureRunning()` を追加。各 mutation ハンドラの `persist()` 直後に呼ぶ。`getRunningPath() === null` のときのみ `executor.reset()` を呼んで先頭から再実行。

---

## 補追改修: 準備時間を「手動開始」制に変更 (2026-05-17)

### 経緯
ユーザー要望: 「フェーズ開始前に準備時間を作る。準備時間中は宇宙船の購入やプログラム編集ができる」。従来は `STAGE.intermissionMs` (7s) のタイマーカウントダウンで自動進行していたが、ブロックを組む時間としては短く、プレイヤー側に主導権が無かった。

### 確定済み設計判断 (ユーザー確認 2026-05-17)
- 終了タイミング: **「開始」ボタンで手動開始** (タイマー無し)
- 最初の Phase 1 開始前にも準備時間を入れる
- 前 Phase クリア後に準備時間に入る

### 成果物
- `src/systems/WaveSystem.ts` — `intermission` 状態を削除し `preparing` に統合。`startNextPhase()` / `isAwaitingStart()` / `getUpcomingPhaseNumber()` を追加
- `src/ui/HUD.ts` — 開始ボタン (中央下、ShopPanel 上)。`showStartButton(phaseNumber, totalPhases, onClick)` + 注意を引くスケールパルス
- `src/scenes/GameScene.ts` — `waves.on('state')` で `preparing` 時にボタン表示。SPACE / ENTER でボタン押下と同等
- `src/config.ts` — `STAGE.intermissionMs` を削除

### 設計判断
- **`intermission` を撤廃して `preparing` に統合**: 「Phase 開始前の待機」という意味で本質的に同一
- **編集オーバーレイ中はボタン無効**: 編集中に SPACE で誤って開始しないよう、`editorOpen` ガード
- **ボタン位置**: ShopPanel と重ねず上に配置

### 検証
- `npm run typecheck` / `npm run build`: PASS

### 既知の制限
- 準備時間に「最大時間」が無いため、放置すると永久に Phase が始まらない (MVP のシングルプレイでは問題なし)

---

# 基盤層 (旧 Phase A-D, 完了済)

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

### Wave Phase 編成 (当時)

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
