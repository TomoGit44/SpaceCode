# SpaceCode

**プレイヤーがブロックで宇宙船をプログラミングし、襲来する敵から基地を守る、宇宙テーマのタワーディフェンス**。一人プレイのブラウザゲーム MVP。

> Claude Code で開発。
> - 設計思想・用語: [`docs/DESIGN.md`](./docs/DESIGN.md)
> - プロジェクトブリーフ・開発規約: [`CLAUDE.md`](./CLAUDE.md)
> - Phase 別の詳細進捗: [`docs/PROGRESS.md`](./docs/PROGRESS.md)
> - 進行中の実装プラン: [`docs/plans/`](./docs/plans/)

## ステータス

**MVP 達成 (Phase 5 完了)** — 通しプレイ可能。コア体験「**プログラムを組まないと Ship は動かない**」を実装で成立。

---

## 開発

```powershell
npm install
npm run dev        # http://localhost:5173/
npm run typecheck  # tsc --noEmit
npm run build      # 本番ビルド (dist/)
npm run preview    # ビルド後のプレビュー
```

技術スタック: **TypeScript 5.5 (strict)** + **Phaser 3.90** + **Vite 5.4**。画像アセット不使用 (すべて `Graphics`/`Text` でコード生成)。

---

## 操作

### 全シーン共通

| シーン | 入力 | 動作 |
|---|---|---|
| Menu | クリック / `SPACE` | ゲーム開始 |
| GameOver | `R` / `ESC` | リトライ / メニュー |
| Victory | `R` / `ESC` | もう一度 / メニュー |

### ゲーム中

| 入力 | 動作 |
|---|---|
| 画面下 `[宇宙船 $70]` | クリックで Ship 購入 (基地横に出現) |
| **Ship 本体をクリック** | **プログラム編集オーバーレイを開く** |
| `ESC` | 編集中なら閉じる、それ以外はメニュー |

### 編集オーバーレイ

| 入力 | 動作 |
|---|---|
| 左カラム `[移動]/[採掘]/...` | 選択中ブロックの後ろにそのブロックを追加 |
| 左カラム `[サンプル読み込み]` | テンプレ Program を一括投入 (root スコープのみ) |
| 中央のブロック行クリック | 選択 (右の「パラメータ」欄に反映) |
| 行右端 `▲`/`▼` | ブロックを上/下に移動 |
| 行右端 `✕` | ブロックを削除 |
| 右カラムのチップ | パラメータ (移動先・採掘先) を変更 |
| `REPEAT` 行 → `中身を編集 →` | ネスト内に drill-in (`›` 区切りのパンくずから親へ戻る) |
| バックドロップ / `ESC` / `✕ 閉じる` | オーバーレイを閉じる |

> **編集中もゲームは止まらない**。編集すると同時に Ship の挙動が変わる (ライブ反映)。

---

## 遊び方

### 1. コア原則

**プログラムを組まないと Ship は動かない。** Ship を買っても、最初は基地横で待機するだけ。Ship をクリックして編集オーバーレイを開き、ブロックを並べると Ship が動き出す。

基地中央には **固定砲塔** が内蔵され、射程内 (260px) の敵を自動で迎撃する (常時表示のリングが攻撃範囲)。射程外の敵は Ship で対処する設計。

### 2. ブロック 6 種

| ブロック | 説明 |
|---|---|
| **移動** (`MOVE_TO`) | 指定地点 (基地 / 惑星A / 惑星B) へ移動 |
| **採掘** (`MINE`) | 指定惑星で資源を採取。インベントリ満タンで完了。**枯渇中はリスポーン待ち** (60s) |
| **納品** (`DEPOSIT`) | 基地で資源を渡してクレジット化 (資源 1 → $2)。エネルギーも全回復 |
| **攻撃** (`ATTACK_NEAREST`) | 射程内最寄りの敵に 1 発撃つ。500ms 持続 |
| **満タンまで待機** (`WAIT_UNTIL_FULL`) | インベントリ満タンになるまで停止 |
| **繰り返し** (`REPEAT`) | 子ブロック列を N 回ループ (ネスト可) |

### 3. 推奨初手プログラム

プログラムは **置いた順に上から下へ実行 → 末尾まで来たら自動で先頭に戻る (無限ループ)**。`REPEAT` は「特定の行動を N 回だけ繰り返したい」時に使う。

**(A) 採掘ループ** — クレジットを貯める基本パターン:

```
移動 → 惑星A
採掘: 惑星A
移動 → 基地
納品
```

**(B) 防衛ループ** — 基地の近くで連射:

```
移動 → 基地
攻撃 (最寄り)
```

複数 Ship を買い、A 役と B 役で役割分担すると Phase 後半が安定。

### 4. リソース循環

```
惑星で採掘 → 基地で納品 → クレジット獲得 → Ship 購入
              └→ エネルギー全回復 (Ship)
```

惑星 2 個ともリソースが尽きると 60 秒間採掘不可。MINE ブロックは枯渇中 `blocked` で次へ進まず、リスポーンで自動再開する。

### 5. エネルギー (Ship のみ)

- **移動**: 2/秒消費 (満タン 100 → 50 秒走行可能)
- **射撃**: 5/発消費 (満タンで 20 発)
- **基地納品**: 全回復
- **0 で停止** (stalled。アルファ低下、移動・採掘・攻撃すべて不可)

### 6. 敵 3 種

| 種別 | 色 | HP | 速度 | 報酬 | 出現開始 |
|---|---|---|---|---|---|
| basic | 赤 | 20 | 60 | $5 | Phase 1 |
| fast | オレンジ | 12 | 95 | $7 | Phase 3 |
| tank | 濃赤 | 55 | 38 | $14 | Phase 5 |

5 Phase をクリアすると `STAGE CLEAR`。基地 HP が 0 になると `GAME OVER`。

### 7. セーブ

**最後に編集した Program は自動的に保存される** (`localStorage['spacecode.shipTemplate']`)。
- F5 リロード後、新しい Ship を買うと同じ Program が自動投入される
- リトライ時 (`R`) も同様
- 「テンプレを読み込みました」のバナーで識別できる

---

## ディレクトリ構成

```
src/
├── main.ts                # Phaser 起動 + シーン登録
├── config.ts              # 全定数 (COLORS, SHIP, ENEMY_TYPES, PHASES, ...)
├── scenes/                # Boot / Menu / Game / GameOver / Victory / ProgramEditor
├── entities/              # Base (砲塔内蔵) / Enemy / Bullet / Planet / Ship
├── program/               # ブロック実行系
│   ├── Block.ts           #   discriminated union (6 種)
│   ├── Program.ts         #   ブロック配列 + カーソル
│   ├── Executor.ts        #   ShipBehavior 実装 (スタック式)
│   ├── locations.ts       #   LocationId / PlanetId + resolver
│   ├── samples.ts         #   サンプル Program
│   └── blocks/            #   1 ファイル 1 種の評価関数
├── systems/               # SpawnSystem / WaveSystem / EconomySystem
├── ui/                    # HUD / ShopPanel / BlockPalette / ProgramList / BlockParamEditor
└── utils/                 # starfield (背景描画) / save (localStorage)
```

詳細・設計原則は [`CLAUDE.md`](./CLAUDE.md)、思想とアーキテクチャは [`docs/DESIGN.md`](./docs/DESIGN.md) を参照。

---

## ライセンス

未定 (個人プロジェクト)。
