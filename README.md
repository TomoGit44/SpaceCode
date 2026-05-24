# SpaceCode

**プレイヤーがコードで宇宙船をプログラミングし、襲来する敵から基地を守る、宇宙テーマのタワーディフェンス**。一人プレイのブラウザゲーム MVP。

> Claude Code で開発。
> - 設計思想・用語: [`docs/DESIGN.md`](./docs/DESIGN.md)
> - プロジェクトブリーフ・開発規約: [`CLAUDE.md`](./CLAUDE.md)
> - Phase 別の詳細進捗: [`docs/PROGRESS.md`](./docs/PROGRESS.md)
> - 進行中の実装プラン: [`docs/plans/`](./docs/plans/)

## ステータス

**MVP 達成 (Phase 5 完了)** → **Phase 6 アイテムシステム実装中** (Step 0-9 完了)。
通しプレイ可能。コア体験「**プログラムを組まないと Ship は動かない**」を維持しつつ、Run 中の成長要素 (アイテム / ガチャ) を載せた構成。

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
| 画面右上 `[📦 アイテム]` | インベントリ画面 (装着 / 使用 / ガチャ開封) |
| 画面下中央 `▶ PHASE N 開始` | 準備時間中の Phase 開始ボタン (`SPACE` / `ENTER` でも可) |
| **Ship 本体をクリック** | **プログラム編集オーバーレイを開く + その船を選択** (上部にステータス数値が浮く) |
| `ESC` | 編集中なら閉じる、それ以外はメニュー |

### 編集オーバーレイ

| 入力 | 動作 |
|---|---|
| 左カラム `[移動]/[待機]/...` | 選択中コードの後ろにそのコードを追加 |
| 左カラム のアイテムコード | 所持しているアイテムコード (`もし HP が低ければ` 等) を残数つきで追加 |
| 左カラム `[サンプル読み込み]` | テンプレ Program を一括投入 (root スコープのみ) |
| 中央のコード行クリック | 選択 (右の「パラメータ」欄に反映) |
| 行右端 `▲`/`▼` | コードを上/下に移動 |
| 行右端 `✕` | コードを削除 |
| 右カラムのチップ / スピナー | パラメータ (移動先・待機秒数・繰り返し回数等) を変更 |
| 右上 `[修理 $40]` / `[補給 $20]` | クレジット消費で HP / エネルギーを全回復 (常時利用可) |
| バックドロップ / `ESC` / `✕ 閉じる` | オーバーレイを閉じる |

> **編集中もゲームは止まらない**。編集すると同時に Ship の挙動が変わる (ライブ反映)。
> REPEAT / アイテムコード (条件 wrapper) の中身はインライン (インデント + 罫線) で表示・編集する。
> カード右上には HP / エネルギー / 積載量 の現在値が表示され、エネルギー切れ (ENE 0) や **ダウン状態** (HP 0) の時は赤強調 + 警告メッセージ + 対応ボタンが目立つ。

---

## 遊び方

### 1. コア原則

**プログラムを組まないと Ship は動かない。** Ship を買っても、最初は基地横で待機するだけ。Ship をクリックして編集オーバーレイを開き、コードを並べると Ship が動き出す。

基地中央には **固定砲塔** が内蔵され、射程内 (260px) の敵を自動で迎撃する (常時表示のリングが攻撃範囲)。射程外の敵は Ship で対処する設計。

### 2. 初期コード 4 種

| コード | 説明 |
|---|---|
| **移動** (`MOVE_TO`) | 指定地点 (基地 / 惑星A / 惑星B) へ移動 |
| **待機** (`WAIT`) | 秒数指定で停止 (1〜60 秒)。**惑星のそばで待機 → 自動採掘** / **基地のそばで待機 → 自動納品 + エネルギー補給** |
| **攻撃** (`ATTACK_NEAREST`) | 射程内最寄りの敵に 1 発撃つ。500ms 持続 |
| **繰り返し** (`REPEAT`) | 子コード列を N 回ループ (ネスト可) |

> 2026-05-24 改修: 旧 `MINE` / `DEPOSIT` / `WAIT_UNTIL_FULL` を撤廃し、`WAIT` に統合。
> 位置で挙動が決まる (惑星近くなら採掘、基地近くなら納品 + 補給) ので、ターゲット指定が不要に。

加えて **アイテムコード** (`もし HP が低ければ` / `もし敵が近ければ` / `もし満タンなら`) は条件 wrapper として、ガチャから入手したぶんだけプログラムに配置できる。

### 3. 推奨初手プログラム

プログラムは **置いた順に上から下へ実行 → 末尾まで来たら自動で先頭に戻る (無限ループ)**。`REPEAT` は「特定の行動を N 回だけ繰り返したい」時に使う。

**(A) 採掘ループ** — クレジットを貯める基本パターン:

```
移動 → 惑星A
待機 5 秒       (惑星 A のそば → 自動採掘で満タン)
移動 → 基地
待機 1 秒       (基地のそば → 自動納品 + エネルギー全回復)
```

**(B) 防衛ループ** — 基地の近くで連射:

```
移動 → 基地
攻撃 (最寄り)
```

複数 Ship を買い、A 役と B 役で役割分担すると Phase 後半が安定。

### 4. リソース循環

```
惑星のそばで WAIT → 基地のそばで WAIT → クレジット獲得 → Ship 購入 / アイテム強化
                       └→ エネルギー全回復 (Ship)
```

採掘速度は 5 資源/秒 (基本)、積載量 20。`待機 5 秒` で満タンが目安。
惑星 2 個ともリソースが尽きると 60 秒で全回復。枯渇中の惑星のそばで `WAIT` しても採掘されないので、復活を待つか、別の惑星へ移動。

### 5. エネルギー (Ship のみ)

- **移動**: 2/秒消費 (満タン 100 → 50 秒走行可能)
- **射撃**: 5/発消費 (満タンで 20 発)
- **基地のそばで WAIT**: 全回復 (`refuelOnDeposit`)
- **0 で停止** (stalled。アルファ低下、移動・攻撃すべて不可) — Ship クリックで編集画面を開き **[補給 $20]** で全回復

### 5.5 HP とダウン状態 (Ship のみ)

- 通常の HP 30、ダメージは敵接触で 8/秒
- **HP 0 = ダウン状態** (戦闘不能、Ship オブジェクトは残る、敵接触も無効)
- ダウン中の船は移動・採掘・攻撃すべて停止。**alpha 0.3 で薄表示** + 選択リング/ステータスが赤強調
- 復活: Ship クリックで編集画面を開き **[修理 $40]** で HP 全回復 → 行動再開
- 装着モジュールはダウン中も付いたまま (修理すれば即戦力に戻る)

### 6. 敵 4 種

| 種別 | 色 | HP | 速度 | 報酬 | 出現 |
|---|---|---|---|---|---|
| basic | 赤 | 20 | 60 | $5 | Phase 1 〜 |
| fast | オレンジ | 12 | 95 | $7 | Phase 3 〜 |
| tank | 濃赤 | 55 | 38 | $14 | Phase 5 |
| **boss** | 紫 | 200 | 30 | $50 | Phase 5 末尾のみ (1 体、撃破で SR ガチャ確定) |

5 Phase をクリアすると `STAGE CLEAR`。基地 HP が 0 になると `GAME OVER`。

### 7. アイテムシステム (Phase 6)

`📦 アイテム` ボタンで開ける Run 中の成長要素。Inventory は **Run 毎にリセット** (Game Over / Victory で初期化)。

- **オムニ・コア** — 装着で全 Ship / 基地 / 経済の stat を強化 (攻撃・推進・採掘・装甲・砲塔・賞金)
- **モジュール** — Ship 個別に装着 (ガトリング・装甲・スラスタ・ドリル・カーゴ)
- **ケミカル** — 消費型。基地修理 / 船団リペア / エネ補給 / クレジット / 時限バフ / AoE
- **コードガチャ / モジュールガチャ** — 開封すると 3 候補から 1 つ選択
- **入手経路**: Phase クリア毎に 1 個ガチャ + fast/tank ドロップ + ボス撃破 SR 確定 + Phase 半数撃破時にケミカル N

### 8. セーブ

**永続化なし** (Phase 6 で撤廃)。Inventory も Program も Run 中だけメモリに保持し、Game Over / Victory / Menu 復帰でリセット。

---

## ディレクトリ構成

```
src/
├── main.ts                # Phaser 起動 + シーン登録
├── config.ts              # 全定数 (COLORS, SHIP, ENEMY_TYPES, PHASES, ...)
├── scenes/                # Boot / Menu / Game / GameOver / Victory / ProgramEditor / ItemInventory / GachaOpen
├── entities/              # Base (砲塔内蔵) / Enemy (basic/fast/tank/boss) / Bullet / Planet / Ship
├── program/               # コード実行系
│   ├── Code.ts            #   discriminated union (初期 4 種 + ITEM_CODE)
│   ├── Program.ts         #   コード配列 + カーソル (path ベース API)
│   ├── Executor.ts        #   ShipBehavior 実装 (スタック式 + 自動ループバック)
│   ├── locations.ts       #   LocationId + resolver
│   ├── samples.ts         #   サンプル Program (MOVE_TO + WAIT)
│   └── codes/             #   1 ファイル 1 種 (MoveTo / Wait / AttackNearest / Repeat / IfHpBelow / IfEnemyInRange / IfInventoryFull)
├── items/                 # Phase 6 アイテムシステム
│   ├── Inventory.ts       #   Run 揮発 (永続化なし)
│   ├── effects.ts         #   EffectSystem (オムニ・コア + モジュール + 時限バフ加算スタック)
│   ├── codePlacement.ts   #   ITEM_CODE 配置の真実源走査
│   ├── gacha.ts           #   ガチャ抽選 (drawGacha / Phase 報酬重み)
│   └── types/             #   omniCores / modules / chemicals / itemCodes
├── systems/               # SpawnSystem / WaveSystem (enemySpawned event) / EconomySystem
├── ui/                    # HUD / ShopPanel / CodePalette / ProgramList / CodeParamEditor
└── utils/                 # starfield (背景描画)
```

詳細・設計原則は [`CLAUDE.md`](./CLAUDE.md)、思想とアーキテクチャは [`docs/DESIGN.md`](./docs/DESIGN.md) を参照。

---

## ライセンス

未定 (個人プロジェクト)。
