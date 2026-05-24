# CLAUDE.md — SpaceCode プロジェクト ブリーフ

> Claude Code セッションが本プロジェクトに入った最初に読むファイル。
> **設計思想・用語・過去判断は [`docs/DESIGN.md`](docs/DESIGN.md) を必ず先に読むこと**。
> Phase 別の詳細進捗は [`docs/PROGRESS.md`](docs/PROGRESS.md)、進行中の plan は [`docs/plans/`](docs/plans/) を参照。

---

## プロジェクト概要

**SpaceCode** — **プレイヤーがコードで宇宙船をプログラミングし、襲来する敵から基地を守る、宇宙テーマのタワーディフェンス**。一人プレイのブラウザゲーム MVP。

- **ユーザー**: 日本語ネイティブのゲーム企画者。**日本語で応答すること**。
- **技術スタック**: TypeScript 5.5 (strict) + Phaser 3.90 + Vite 5.4
- **ビジュアル方針**: ミニマル・ベクター (画像アセットなし。すべて `Graphics` / `Text` で生成)
- **オフライン**: 一人プレイ・オンライン要素なし

---

## コア原則 (絶対に守る)

**プログラムを組まないと Ship は動かない。** これが本作の中核。移動・採掘・攻撃すべてコードが明示的に呼ばないと発動しない。内蔵 AI / フォールバック挙動は禁止。詳細は [`docs/DESIGN.md`](docs/DESIGN.md) §2。

---

## 現在のステータス (最終更新: 2026-05-24)

| Phase | 内容 | 状態 |
|---|---|---|
| 基盤層 | Boot/Menu/Game/GameOver/Victory + Base/Enemy/Bullet/Planet/Ship + Wave/Spawn/Economy + HUD/ShopPanel | ✅ 完了 (旧 Phase A-D) |
| **Phase 1** | **コード実行系**: `Code`/`Program`/`Executor` + 3 種 (`MOVE_TO`/`MINE`/`DEPOSIT`) | ✅ 完了 |
| **Phase 2** | **コード編集 UI**: `ProgramEditorScene` (並行 active オーバーレイ) + 3 UI コンポーネント。Ship クリック → ライブ編集 | ✅ 完了 |
| **Phase 3** | **残り 3 コード + 制御フロー**: `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT` (ネスト構造)。Executor スタック化、Ship cooldown 撤廃 | ✅ 完了 |
| **Phase 4** | **統合と難易度調整 / ローカルセーブ**: 射撃エネルギー消費、敵 3 種化 (basic/fast/tank)、Ship Program 永続化 (localStorage)、惑星 60s リスポーン、Wave/経済バランス調整 | ✅ 完了 (※ 永続化は Phase 6 で撤廃) |
| **Phase 5** | **仕上げ**: 演出強化 (シーン遷移・フラッシュ・バナーイージング)、配色 hardcoded → `COLORS` 統一、README 整備 | ✅ 完了 (**MVP 達成 2026-05-16**) |
| 補追 (Phase 5 後) | タワー廃止 → 基地砲塔統合 / Program 自動ループバック / 準備時間を手動開始制 | ✅ 完了 |
| **Phase 6** | **アイテムシステム**: `Inventory` (Run 揮発) + `EffectSystem` (加算スタック) / オムニ・コア 6 / モジュール 5 / ケミカル 6 / **アイテムコード** 3 (ITEM_CODE 条件 wrapper) / `ItemInventoryScene` / **ガチャ系統** (Phase クリア + fast/tank ドロップ + `GachaOpenScene` 3 候補選択) / **ボス敵** (Phase 5 末尾、SR 確定) / **中間ドロップ** (Phase 半数撃破でケミカル N) / **編集画面装着モジュール表示** | 🔧 **Step 0-9 完了** (実プレイ後バランス調整が残作業) |
| 補追 (Phase 6 後) | コード体系縮減: `MINE`/`DEPOSIT`/`WAIT_UNTIL_FULL` を撤廃し **`WAIT { seconds }`** に統合 (位置で挙動が決まる暗黙副作用 — 惑星近くで自動採掘 / 基地近くで自動納品+補給) | ✅ 完了 (2026-05-24) |

通しプレイ可能。コア体験「プログラムを組まないと Ship は動かない」を維持しつつ、Run 中の成長要素 (アイテム) を載せている最中。

**Phase 6 残作業**:
- 実プレイ後バランス調整 (ガチャ排出重み・敵ドロップ率・ボス HP/速度・中間ドロップの中身・アイテム効果値)

**MVP 後の継続課題** (Phase 6 と独立):
- 実プレイ後バランス再調整 — `docs/PROGRESS.md` バランスメモ枠の計測ポイント。Phase 6 アイテム導入後の再計測必要
- バンドル分割 (Phaser dynamic import で初期ロード軽減)
- 音 (BGM / SE)
- 敵バリエーション拡張・惑星追加

---

## 開発コマンド

```powershell
npm install          # 初回のみ
npm run dev          # http://localhost:5173/ (Vite HMR)
npm run typecheck    # tsc --noEmit
npm run build        # 本番ビルド (dist/)
npm run preview      # ビルド後のプレビュー
```

**作業ルーチン**: 変更後は最低限 `npm run typecheck` を通す。各 Phase 完了時は `npm run build` も通す。

---

## git ワークフロー (必読)

リポジトリ: [`https://github.com/TomoGit44/SpaceCode`](https://github.com/TomoGit44/SpaceCode) / ブランチ: `main` / リモート: `origin`

### コミット・プッシュのタイミング

**1 つの作業単位が完了するごとに必ず commit + push する**。具体的には:

- ユーザーから依頼された 1 つの指示 (例: 「Phase X に進んで」「このバグを直して」「ドキュメントを更新して」) を完了したら 1 コミット
- 大きな Phase は Step 単位 (Step 1 完了 / Step 2 完了 …) でも構わない。**「動作確認できる粒度」** で区切る
- typecheck / build を通してからコミット (壊れた状態を push しない)
- コミット後は **必ず push** する (ローカルにコミットを溜めない。引き継ぎ時に消える)

### コミットメッセージのスタイル

- 1 行目: 何を変えたか (動詞 + 対象、50 字以内目安、日本語可)
  - 良い例: `Phase 4 完了: 射撃エネルギー消費 + 敵 3 種 + Program 永続化 + 惑星リスポーン`
  - 良い例: `編集後の Ship idle を自動検知して reset するよう修正`
  - 悪い例: `更新`、`修正`
- 2 行目: 空行
- 3 行目以降: 必要なら「なぜ」を補足 (1〜3 文)
- 末尾に Co-Authored-By を付ける:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

### コマンド (Bash ツールで実行)

```bash
git add <変更したファイル>          # git add . は避ける (誤って秘匿ファイルを含めないため)
git status                          # 含めるべきファイルを確認
git commit -m "$(cat <<'EOF'
コミットメッセージ 1 行目

(必要なら) なぜこの変更が必要かの補足

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push                            # 直後に必ず push
```

### やってはいけないこと

- `git add .` / `git add -A` で全部添加 (秘匿ファイル混入リスク)
- `git push --force` を main に対して
- `--no-verify` / `--no-gpg-sign` 等のフック・署名スキップ (ユーザーが明示的に頼んだ場合のみ可)
- commit を作らず変更を放置 (ローカル消失リスク)
- pre-commit hook 失敗時の `--amend` (旧コミットを壊す。代わりに **新コミット** を作る)

### Preview MCP

`.claude/launch.json` に dev サーバ定義済。`preview_start name='dev'` で起動できる。ただし **スクリーンショットは WebGL コンテキストでハングしがち** なので、起動確認は `preview_console_logs` (level: 'error') でランタイムエラーが無いことを見るのが安全。

---

## アーキテクチャ

```
src/
├── main.ts                 # Phaser 起動・シーン登録 (Game / ProgramEditor / ItemInventory / GachaOpen はこの順で並行 active 対応)
├── config.ts               # 全定数 (GAME_*, COLORS (+ rarity*), BASE, BASE_TURRET, SHIP, ENEMY_TYPES, ENEMY_VS_SHIP, ECONOMY, STAGE, PHASES (enemySpecs), SPAWN, PLANETS, PLANET)
├── scenes/                 # Phaser シーン (薄く保つ。ロジックは entities/systems/items/program へ)
│   ├── BootScene.ts        # 即 Menu へ
│   ├── MenuScene.ts        # タイトル + クリック/SPACE で開始
│   ├── GameScene.ts        # メインループ。enemies/bullets/planets/ships + Inventory + EffectSystem を所有。overlayDepth でオーバーレイ入力ガード
│   ├── GameOverScene.ts    # R リトライ / ESC メニュー
│   ├── VictoryScene.ts     # STAGE CLEAR
│   ├── ProgramEditorScene.ts  # 並行 active オーバーレイ。Ship クリックで起動、Program をライブ編集。ITEM_CODE 配置 + 残数管理 + 装着モジュール read-only チップ
│   ├── ItemInventoryScene.ts  # Phase 6: 並行 active オーバーレイ。カテゴリタブ + 所持一覧 + 詳細 + 装着/使用フロー + ガチャ「開封する」
│   └── GachaOpenScene.ts      # Phase 6 Step 6: ガチャ開封オーバーレイ。drawGacha で 3 候補 → 選択 → Inventory に追加
├── entities/               # ゲーム内オブジェクト (描画+状態を自分で持つ)
│   ├── Base.ts             # 基地 HP, takeDamage, heal, 脈動 + 回転リング + 内蔵砲塔 (射程リング表示 + 射撃。火力は effects.baseStat 経由)
│   ├── Enemy.ts            # 基地へ直進, dead/reachedBase フラグ。4 種 (basic/fast/tank/boss)
│   ├── Bullet.ts           # 対象ホーミング (基地砲塔/Ship 共用)
│   ├── Planet.ts           # 資源源。extract API + 残量リング/バー + 60s リスポーン
│   └── Ship.ts             # 命令的 API (moveTo/mineAt/depositAt/attackNearest/fireAt/stop) + setBehavior + id (UUID) + 可変 maxHp/maxEnergy/inventoryCap + applyMaxStats + heal + stat 参照は effects.shipStat 経由
├── program/                # コード実行系 (7 種揃った: 初期 6 種 + ITEM_CODE)
│   ├── Code.ts             # Discriminated union (初期 4 + ITEM_CODE = 5 種) + CodeType (MOVE_TO/WAIT/ATTACK_NEAREST/REPEAT) + createCode + codeChildren (REPEAT/ITEM_CODE 共用) + CodeStepResult
│   ├── Program.ts          # 配列 + カーソル。path ベース API (insertAtPath/removeAtPath/...) + root scope カーソル追従
│   ├── Executor.ts         # implements ShipBehavior。スタック実行モデル + CodeExecContext + REPEAT (N 回) / ITEM_CODE (条件 wrapper、1 周) ハンドリング + root 末尾自動ループバック
│   ├── locations.ts        # LocationId / PlanetId 型 + ラベル + resolver
│   ├── samples.ts          # sampleCodes() (CodePalette「サンプル読み込み」が使う)
│   └── codes/              # 1 ファイル 1 種 (MoveTo / Wait / AttackNearest / Repeat / IfHpBelow / IfEnemyInRange / IfInventoryFull)
├── items/                  # Phase 6: アイテムシステム
│   ├── itemTypes.ts        # Rarity (N/R/SR/L) / ItemCategory (5) / ItemInstance / CodeItemInstance / ShipStat/BaseStat/EconomyStat + RARITY_LABEL/COLOR
│   ├── Inventory.ts        # items[] + codes[] + shipModules{shipId: uid[]} + reset()。**メモリ上のみ** (Run 毎リセット)
│   ├── effects.ts          # EffectSystem: shipStat/baseStat/economyStat (オムニ・コア + モジュール + 時限バフを加算スタックで合成) + shipExtraShots + tick
│   ├── codePlacement.ts    # ITEM_CODE 配置の真実源走査 (collectPlacedCodeUids / availableCodeCounts / pickUnplacedInstance)
│   ├── gacha.ts            # Phase 6 Step 6: drawGacha + phaseRewardCategory + rollPhaseRewardRarity + gachaCategoryOf
│   └── types/              # data-driven なアイテム定義テーブル
│       ├── omniCores.ts    # OMNI_CORE_TYPES (6 種: 攻撃/推進/採掘/装甲/砲塔/賞金)
│       ├── modules.ts      # MODULE_TYPES (5 種: ガトリング/装甲/スラスタ/ドリル/カーゴ)
│       ├── chemicals.ts    # CHEMICAL_TYPES (6 種: 即時 4 + 時限バフ + AoE)
│       └── itemCodes.ts    # ITEM_CODE_DEFS (3 種: IF_HP_BELOW / IF_ENEMY_IN_RANGE / IF_INVENTORY_FULL) + createItemCodeNode
├── systems/                # 横断的なロジック
│   ├── SpawnSystem.ts      # `spawnAtRandomEdge(type?)` で 1 体生成
│   ├── WaveSystem.ts       # Phase 状態機械 (preparing/spawning/clearing/victory)。preparing は手動開始 (startNextPhase)。enemySpawned イベント + getPhaseTotal (Phase 6 Step 7-8)
│   └── EconomySystem.ts    # credits + depositResource + EventEmitter
├── ui/
│   ├── HUD.ts              # HP/クレジット/Phase + 中央バナー + クレジット増減ポップ + 「▶ PHASE N 開始」ボタン
│   ├── ShopPanel.ts        # 画面下端 [宇宙船 $70] + 右端「📦 アイテム」
│   ├── CodePalette.ts      # 編集 UI 左カラム: 初期コード (∞) + アイテムコード (残数表示、0 で無効) + サンプル読み込み + 閉じる
│   ├── ProgramList.ts      # 編集 UI 中央: REPEAT/ITEM_CODE をネスト wrapper として階層描画 + ▲▼✕ + 走行中マーカー
│   └── CodeParamEditor.ts  # 編集 UI 右: LocationId/PlanetId チップ + REPEAT 回数 + ITEM_CODE パラメータ (レア度で最大値 clamp)
└── utils/
    └── starfield.ts        # 星空背景描画ヘルパ
```

> 注: `src/utils/save.ts` (Phase 4 の Program 永続化) と `src/entities/Tower.ts` は削除済。Inventory もメモリ上のみで永続化なし (Run 毎リセット)。

### 設計原則 (重要)

1. **コードは 1 ファイル 1 種 (本作のコア)**: `src/program/codes/<NAME>.ts` を新規追加するだけで新コードを足せる構造を維持。Executor / Code 型を毎回触る作りにはしない。
2. **`Ship` は命令的 API のみ持つ**: 「目標設定するだけ」のメソッド (`moveTo` 等)。意思決定は `ShipBehavior` (= Executor) に任せる。
3. **systems は責務単位**: 経済・Wave・スポーン・ダメージを混ぜない。
4. **scenes は薄く**: 大きなロジックは entities / systems / program に委譲。
5. **TypeScript strict**: `any` を避け、定数は `config.ts` に集約。
6. **画像アセット不使用**: 全描画は `Graphics` / `Shape` / `Text` のみ。色は `COLORS` から取得。
7. **音は MVP では実装しない** (Phase 5 以降)。

---

## ゲームデザイン要点

- **コア体験**: コードを組んで Ship をプログラム → 敵 Wave に対抗。プログラム未割り当ての Ship は何もしない。
- **基地 (Base)**: 中央固定。HP=100。0 でゲームオーバー。資源納品先。**Phase 5 後: 固定砲塔を内蔵** — 射程 260 / 12 ダメ × 1.25Hz、`BASE_TURRET` で集約。射程リングが常時可視化される。
- **タワー (廃止)**: Phase 5 後にタワーは撤廃され、自動迎撃は基地砲塔に統合された。`Tower` クラス・ShopPanel の「タワー」ボタン・設置モードは無い。
- **宇宙船**: 命令的 API (`moveTo/mineAt/depositAt/attackNearest/fireAt/stop`) + `ShipBehavior` 差し替え。HP 30 / エネ 100 / コスト $70 / インベントリ 20 (Phase 6 でモジュール装着により最大値が動的変動)。Phase 3 で cooldown 自動発射を撤廃 (連射は `REPEAT { ATTACK_NEAREST }` で表現)。Phase 4 で射撃エネルギー消費を追加 (5/shot)。
- **敵 4 種 (Phase 4 + 6)**: `basic` (HP 20 / 速度 60 / $5) / `fast` (HP 12 / 速度 95 / $7、オレンジ) / `tank` (HP 55 / 速度 38 / $14、濃赤) / **`boss` (HP 200 / 速度 30 / $50、紫、Phase 5 末尾のみ 1 体)**。Phase 1-2 basic、Phase 3-4 basic+fast、Phase 5 全種混在 + ボス。
- **資源**: 惑星 2 個 (220,200)/(1060,540) から採掘 → 基地納品で資源 1:お金 2 変換。**枯渇 60s でリスポーン**。
- **エネルギー**: 宇宙船のみ。移動中 2/s 消費 + 射撃 5/shot 消費。0 で停止 (stalled)。基地納品で全回復。
- **永続化なし (Phase 6 で撤廃)**: Inventory も Program も localStorage 保存しない。Game Over / Victory / Menu 復帰で Run リセット。Phase 4 の `spacecode.shipTemplate` は廃止
- **Wave 構成**: 1 Stage = 5 Phase。`config.ts` の `PHASES` を参照。**準備時間は手動開始**: 各 Phase 前にプレイヤーが「▶ PHASE N 開始」ボタンを押すまで進まない
- **初期コード (4 種)**: `MOVE_TO` / **`WAIT { seconds }`** / `ATTACK_NEAREST` / `REPEAT`。**所持無制限**
  - **`WAIT`**: 秒数指定 (1〜60s)。**惑星近くで待機 → 自動採掘** / **基地近くで待機 → 自動納品 + エネルギー全回復**。位置で副作用が決まるためターゲット指定不要
  - REPEAT はネスト構造で **特定の行動を N 回繰り返したい時に使う**
  - ATTACK_NEAREST は持続時間コード (1 発撃って 500ms 留まる)
  - 旧 `MINE` / `DEPOSIT` / `WAIT_UNTIL_FULL` は 2026-05-24 改修で `WAIT` に統合 (削除済)
- **アイテムコード (Phase 6, 3 種)**: `IF_HP_BELOW` / `IF_ENEMY_IN_RANGE` / `IF_INVENTORY_FULL` — 条件 wrapper。所持アイテム個体 (`CodeItemInstance`) と 1:1 対応、配置の真実源は **プログラム内 ITEM_CODE ノード**。同じ個体は 1 箇所しか配置不可、Ship 破壊や wrapper 削除で自動的に「未配置」に戻る
- **自動ループ (Phase 5 後)**: Program は **置いただけで先頭 → 末尾 → 先頭 → … と無限にループ** する。空 Program のみ idle
- **アイテム (Phase 6)**: オムニ・コア (装着で全 Ship/基地/経済に永続効果) / モジュール (Ship 個別装着) / ケミカル (消費型・即時 or 時限バフ or AoE) / コードガチャ・モジュールガチャ (`GachaOpenScene` で開封)。効果は加算スタック、`EffectSystem` 経由で集計
- **リワード経路 (Phase 6 Step 6-8)**: Phase クリアごとに 1 個保証 (code/module 交互 + 重み付きレア度 R55/SR30/L15) + fast/tank 撃破時の低確率 R ドロップ (fast 4% / tank 12%) + **ボス撃破時 SR ガチャ確定** + **Phase 敵半数撃破時にケミカル N 1 個** (Phase ごと 1 回)。basic はドロップなし

> ※「Phase」が二重に登場する: **Wave Phase** (敵編成の段階。1 Stage 中で進行) と **開発 Phase** (実装ロードマップ)。コード内では `Wave Phase` を指す。本ドキュメントでは「開発 Phase」と明示する。

---

## 既知の制限・注意点

- **基地砲塔のみで防衛**: Phase 5 後にタワーを廃止し、自動迎撃は基地中心の砲塔 1 基のみ (射程 260)。射程外から来る敵は宇宙船で迎撃する設計。
- **惑星リソース 60s リスポーン** (Phase 4): 枯渇中は `MINE` コードが `blocked` で停止、リスポーン後に再開。
- **Phaser バンドル 1.5MB** (gzip 354KB): Phase 5 後の継続課題で dynamic import を検討。
- **PowerShell 5.1 環境**: `&&` 使えない / `2>&1` で native exe が NativeCommandError 化。Bash ツール併用 or PowerShell ネイティブ構文。
- **Preview MCP の screenshot** は WebGL ページでハングする。`preview_console_logs` で確認する。

---

## ユーザーとのやり取り方針

- **日本語で応答**
- 選択肢がある場合は `AskUserQuestion` で提示
- 各 Phase 完了時は: 作成/変更ファイル一覧、検証結果 (typecheck/build)、設計書からの逸脱、次フェーズへの確認 を簡潔に提示
- **コア体験 (コードがゲームの中心) を優先する判断は歓迎**。Phase 計画はガイドであり、コア体験の遅延に気付いたら順序を組み替える判断を取って構わない (ただしユーザー承認を取る)
- 大きな方針転換 (Phase 構成変更等) は `docs/DESIGN.md` を更新して履歴として残す

---

## 参照ドキュメント

- **[`docs/DESIGN.md`](docs/DESIGN.md)** — 設計思想・用語・過去判断 (**先に読む**)
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — 開発 Phase ごとの詳細進捗・設計逸脱・次の TODO
- [`docs/plans/`](docs/plans/) — 進行中・完了済の実装プラン
- [`README.md`](README.md) — 開発セットアップと外向き紹介
