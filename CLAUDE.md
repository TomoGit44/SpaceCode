# CLAUDE.md — SpaceCode プロジェクト ブリーフ

> Claude Code セッションが本プロジェクトに入った最初に読むファイル。
> **設計思想・用語・過去判断は [`docs/DESIGN.md`](docs/DESIGN.md) を必ず先に読むこと**。
> Phase 別の詳細進捗は [`docs/PROGRESS.md`](docs/PROGRESS.md)、進行中の plan は [`docs/plans/`](docs/plans/) を参照。

---

## プロジェクト概要

**SpaceCode** — **プレイヤーがブロックで宇宙船をプログラミングし、襲来する敵から基地を守る、宇宙テーマのタワーディフェンス**。一人プレイのブラウザゲーム MVP。

- **ユーザー**: 日本語ネイティブのゲーム企画者。**日本語で応答すること**。
- **技術スタック**: TypeScript 5.5 (strict) + Phaser 3.90 + Vite 5.4
- **ビジュアル方針**: ミニマル・ベクター (画像アセットなし。すべて `Graphics` / `Text` で生成)
- **オフライン**: 一人プレイ・オンライン要素なし

---

## コア原則 (絶対に守る)

**プログラムを組まないと Ship は動かない。** これが本作の中核。移動・採掘・攻撃すべてブロックが明示的に呼ばないと発動しない。内蔵 AI / フォールバック挙動は禁止。詳細は [`docs/DESIGN.md`](docs/DESIGN.md) §2。

---

## 現在のステータス (最終更新: 2026-05-16)

| Phase | 内容 | 状態 |
|---|---|---|
| 基盤層 | Boot/Menu/Game/GameOver/Victory + Base/Tower/Enemy/Bullet/Planet/Ship + Wave/Spawn/Economy + HUD/ShopPanel | ✅ 完了 (旧 Phase A-D) |
| **Phase 1** | **ブロック実行系**: `Block`/`Program`/`Executor` + 3 種 (`MOVE_TO`/`MINE`/`DEPOSIT`) | ✅ 完了 |
| **Phase 2** | **ブロック編集 UI**: `ProgramEditorScene` (並行 active オーバーレイ) + 3 UI コンポーネント。Ship クリック → ライブ編集 | ✅ 完了 |
| **Phase 3** | **残り 3 ブロック + 制御フロー**: `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT` (ネスト構造)。Executor スタック化、Ship cooldown 撤廃 | ✅ 完了 |
| **Phase 4** | **統合と難易度調整 / ローカルセーブ**: 射撃エネルギー消費、敵 3 種化 (basic/fast/tank)、Ship Program 永続化 (localStorage)、惑星 60s リスポーン、Wave/経済バランス調整 | ✅ 完了 |
| **Phase 5** | **仕上げ**: 演出強化 (シーン遷移・フラッシュ・バナーイージング)、配色 hardcoded → `COLORS` 統一、README 整備 | ✅ 完了 |

**🎉 MVP 達成 (2026-05-16)**。通しプレイ可能。コア体験「プログラムを組まないと Ship は動かない」を実装で成立。

**Phase 5 後の継続課題** (本セッションでは未着手):
- **実プレイ後バランス再調整** — `docs/PROGRESS.md` のバランスメモ枠を埋めて、数値を微調整
- バンドル分割 (Phaser dynamic import で初期ロード軽減)
- 音 (BGM / SE)
- 敵バリエーション拡張・惑星追加
- セーブの拡張 (Ship スロット別保存)

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
├── main.ts                 # Phaser 起動・シーン登録
├── config.ts               # 全定数 (GAME_*, COLORS, BASE, TOWER, SHIP, ENEMY/ENEMY_TYPES, ENEMY_VS_SHIP, ECONOMY, STAGE, PHASES (enemySpecs), SPAWN, PLANETS, PLANET)
├── scenes/                 # Phaser シーン (薄く保つ。ロジックは entities/systems へ)
│   ├── BootScene.ts        # 即 Menu へ
│   ├── MenuScene.ts        # タイトル + クリック/SPACE で開始
│   ├── GameScene.ts        # メインループ。enemies/bullets/towers/planets/ships 配列を所有
│   ├── GameOverScene.ts    # R リトライ / ESC メニュー
│   ├── VictoryScene.ts     # STAGE CLEAR
│   └── ProgramEditorScene.ts  # 並行 active オーバーレイ。Ship クリックで起動、Program をライブ編集
├── entities/               # ゲーム内オブジェクト (描画+状態を自分で持つ)
│   ├── Base.ts             # 基地 HP, takeDamage, 脈動 + 回転リング
│   ├── Tower.ts            # 自動迎撃 (射程内最寄り敵 → Bullet)
│   ├── Enemy.ts            # 基地へ直進, dead/reachedBase フラグ
│   ├── Bullet.ts           # 対象ホーミング (Tower/Ship 共用)
│   ├── Planet.ts           # 資源源。extract API + 残量リング/バー
│   └── Ship.ts             # 命令的 API (moveTo/mineAt/depositAt/attackNearest/stop) + setBehavior
├── program/                # ブロック実行系 (Phase 1+2+3 完了。6 種揃った)
│   ├── Block.ts            # Discriminated union (6 種、名前付き地点 + REPEAT ネスト) + BlockType + createBlock + BlockStepResult
│   ├── Program.ts          # 配列 + カーソル。append/insert/removeAt/replaceBlock/moveUp/moveDown (root scope カーソル追従)
│   ├── Executor.ts         # implements ShipBehavior。スタック実行モデル + BlockExecContext + REPEAT ハンドリング
│   ├── locations.ts        # LocationId / PlanetId 型 + ラベル + resolver (ShipWorld を type-only import)
│   ├── samples.ts          # sampleBlocks() (BlockPalette「サンプル読み込み」が使う。REPEAT 入り)
│   └── blocks/             # 1 ファイル 1 種 (MoveTo / Mine / Deposit / AttackNearest / WaitUntilFull / Repeat)
├── systems/                # 横断的なロジック
│   ├── SpawnSystem.ts      # `spawnAtRandomEdge()` で 1 体生成 (時間管理はしない)
│   ├── WaveSystem.ts       # Phase 状態機械 (preparing/spawning/clearing/intermission/victory)
│   └── EconomySystem.ts    # credits + depositResource + EventEmitter (change イベント)
├── ui/
│   ├── HUD.ts              # HP/クレジット/Phase + 中央バナー + クレジット増減ポップ
│   ├── ShopPanel.ts        # 画面下端 [宇宙船 $70] [タワー $50]
│   ├── BlockPalette.ts     # 編集 UI 左カラム: ブロック追加 + サンプル読み込み + 閉じる
│   ├── ProgramList.ts      # 編集 UI 中央: ブロック行 + ▲▼✕ + 走行中マーカー
│   └── BlockParamEditor.ts # 編集 UI 右: LocationId/PlanetId チップ選択
└── utils/
    ├── starfield.ts        # 星空背景描画ヘルパ
    └── save.ts             # Ship Program の localStorage 永続化 (Phase 4)
```

### 設計原則 (重要)

1. **ブロックは 1 ファイル 1 種 (本作のコア)**: `src/program/blocks/<NAME>.ts` を新規追加するだけで新ブロックを足せる構造を維持。Executor / Block 型を毎回触る作りにはしない。
2. **`Ship` は命令的 API のみ持つ**: 「目標設定するだけ」のメソッド (`moveTo` 等)。意思決定は `ShipBehavior` (= Executor) に任せる。
3. **systems は責務単位**: 経済・Wave・スポーン・ダメージを混ぜない。
4. **scenes は薄く**: 大きなロジックは entities / systems / program に委譲。
5. **TypeScript strict**: `any` を避け、定数は `config.ts` に集約。
6. **画像アセット不使用**: 全描画は `Graphics` / `Shape` / `Text` のみ。色は `COLORS` から取得。
7. **音は MVP では実装しない** (Phase 5 以降)。

---

## ゲームデザイン要点

- **コア体験**: ブロックを組んで Ship をプログラム → 敵 Wave に対抗。プログラム未割り当ての Ship は何もしない。
- **基地 (Base)**: 中央固定。HP=100。0 でゲームオーバー。資源納品先。
- **タワー**: 自動迎撃 (ブロック化しない)。射程 200 / 10 ダメ × 1Hz / コスト $50。初期 2 基は基地左右固定、ShopPanel から 3 基目以降を自由配置。
- **宇宙船**: 命令的 API (`moveTo/mineAt/depositAt/attackNearest/fireAt/stop`) + `ShipBehavior` 差し替え。HP 30 / エネ 100 / コスト $70 / インベントリ 20。Phase 3 で cooldown 自動発射を撤廃 (連射は `REPEAT { ATTACK_NEAREST }` で表現)。Phase 4 で射撃エネルギー消費を追加 (5/shot)。
- **敵 3 種 (Phase 4)**: `basic` (HP 20 / 速度 60 / $5) / `fast` (HP 12 / 速度 95 / $7、オレンジ) / `tank` (HP 55 / 速度 38 / $14、濃赤)。Phase 1-2 basic、Phase 3-4 basic+fast、Phase 5 全種混在。
- **資源**: 惑星 2 個 (220,200)/(1060,540) から採掘 → 基地納品で資源 1:お金 2 変換。**枯渇 60s でリスポーン**。
- **エネルギー**: 宇宙船のみ。移動中 2/s 消費 + 射撃 5/shot 消費。0 で停止 (stalled)。基地納品で全回復。
- **Ship Program 永続化 (Phase 4)**: 編集のたびに `localStorage['spacecode.shipTemplate']` へ保存。新規 Ship 購入時に自動投入。リトライ時にも引き継ぎ。
- **Wave 構成**: 1 Stage = 5 Phase。`config.ts` の `PHASES` を参照。
- **ブロック (MVP 6 種)**: `MOVE_TO` / `MINE` / `DEPOSIT` / `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT`。REPEAT はネスト構造 (`{ times, children }`) で **特定の行動を N 回繰り返したい時に使う**、ATTACK_NEAREST は持続時間ブロック (`SHIP.attackDurationMs`)。
- **自動ループ (Phase 5 後)**: Program は **置いただけで先頭 → 末尾 → 先頭 → … と無限にループ** する (Executor root frame が末尾でループバック)。プログラム全体を `REPEAT` で囲む必要はない。空 Program のみ idle。

> ※「Phase」が二重に登場する: **Wave Phase** (敵編成の段階。1 Stage 中で進行) と **開発 Phase** (実装ロードマップ)。コード内では `Wave Phase` を指す。本ドキュメントでは「開発 Phase」と明示する。

---

## 既知の制限・注意点

- **初期タワー 2 基** (基地左右 x±150): 上下から来る敵は素抜け。ShopPanel から 3 基目以降を自由配置可。初期 2 基の完全自由化は今後の継続課題。
- **惑星リソース 60s リスポーン** (Phase 4): 枯渇中は `MINE` ブロックが `blocked` で停止、リスポーン後に再開。
- **Phaser バンドル 1.5MB** (gzip 354KB): Phase 5 後の継続課題で dynamic import を検討。
- **PowerShell 5.1 環境**: `&&` 使えない / `2>&1` で native exe が NativeCommandError 化。Bash ツール併用 or PowerShell ネイティブ構文。
- **Preview MCP の screenshot** は WebGL ページでハングする。`preview_console_logs` で確認する。

---

## ユーザーとのやり取り方針

- **日本語で応答**
- 選択肢がある場合は `AskUserQuestion` で提示
- 各 Phase 完了時は: 作成/変更ファイル一覧、検証結果 (typecheck/build)、設計書からの逸脱、次フェーズへの確認 を簡潔に提示
- **コア体験 (ブロックがゲームの中心) を優先する判断は歓迎**。Phase 計画はガイドであり、コア体験の遅延に気付いたら順序を組み替える判断を取って構わない (ただしユーザー承認を取る)
- 大きな方針転換 (Phase 構成変更等) は `docs/DESIGN.md` を更新して履歴として残す

---

## 参照ドキュメント

- **[`docs/DESIGN.md`](docs/DESIGN.md)** — 設計思想・用語・過去判断 (**先に読む**)
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — 開発 Phase ごとの詳細進捗・設計逸脱・次の TODO
- [`docs/plans/`](docs/plans/) — 進行中・完了済の実装プラン
- [`README.md`](README.md) — 開発セットアップと外向き紹介
