# Phase 4 — 統合と難易度調整 / ローカルセーブ

## Context

Phase 1-3 でブロックプログラミングのコア (Block / Program / Executor / 6 ブロック + REPEAT ネスト) が揃い、コア原則「プログラムを組まないと Ship は動かない」が実装で成立した。本 Phase は **その上にゲーム全体としての完成度を乗せる** 段階。具体的には:

1. 射撃のエネルギーコスト導入 (Phase 3 で「後で」と保留)
2. 敵バリエーション (現状 1 種)
3. Ship Program の localStorage 永続化 (リトライ時の組み直し負担を解消)
4. Wave/経済バランス調整
5. 惑星リソース枯渇後のリスポーン (現状半永久的に詰む)

すべてのサブタスクは **「一気に全部」** 実装する方針 (ユーザー確認済)。各 Step は依存関係順に並べ、検証可能なまとまりで区切る。

---

## 確定済み設計判断 (ユーザー確認 2026-05-16)

| 項目 | 採用案 |
|---|---|
| 射撃エネルギー消費 | `SHIP.energyPerShot = 5`。`Ship.fireAt()` 内で消費 (Block 側ではなく Ship 側で持つ) |
| 敵バリエーション | 3 種 (`basic` / `fast` / `tank`)。Phase 1-2 basic、Phase 3-4 basic+fast、Phase 5 全 3 種混在 |
| Program 永続化 | 単一テンプレスロット (`localStorage['spacecode.shipTemplate']`)。編集のたびに保存、新規購入時に自動ロード |
| 惑星枯渇後 | 60s で全回復するリスポーン。`tickMine` は枯渇中 `blocked` 返却 |
| バランス調整 | 初期値を控えめに調整。計測ポイントを `PROGRESS.md` のバランスメモ枠に明記。実プレイ後に微調整 |

---

## Step 1 — 射撃エネルギー消費

### 編集ファイル
- **[src/config.ts](src/config.ts)** — `SHIP.energyPerShot = 5` を追加
- **[src/entities/Ship.ts](src/entities/Ship.ts)** — `fireAt(enemy, bullets): boolean` を修正:
  - 冒頭で `this.energy < SHIP.energyPerShot` なら `return false` (発射せず)
  - 発射成功時に `this.energy -= SHIP.energyPerShot`

### 設計判断
- ブロック側 (`tickAttackNearest`) は `fireAt` の戻り値で判定。戻り値 false の場合は **発射音/演出はしない、ブロックの elapsedMs は進める** (= 不発でも attackDurationMs 経過で done)。
- これにより「エネルギー切れで攻撃ブロックが永久に running」を防止。

### 検証
- ATTACK_NEAREST × REPEAT で 20 発撃った後、energy が 0 になり以降の REPEAT iteration で発射しないこと
- DEPOSIT で energy 全回復後、再度撃てること

---

## Step 2 — 惑星リスポーン + tickMine blocked

### 編集ファイル
- **[src/config.ts](src/config.ts)** — `PLANET.respawnMs = 60000` を追加
- **[src/entities/Planet.ts](src/entities/Planet.ts)**:
  - `depleted: boolean` の判定はそのまま (`resources <= 0`)
  - `update(delta)` 内で枯渇していたら `depletedElapsedMs` を加算
  - `respawnMs` 経過で `resources = maxResources`、`depletedElapsedMs = 0`、リング表示を復元
  - 枯渇中のリングを薄く + 残り時間バー (例: 真下に小さくカウントダウン) を描画
- **[src/program/blocks/Mine.ts](src/program/blocks/Mine.ts)** — `planet.depleted` の場合 `{ status: 'blocked', reason: '惑星が枯渇しています (リスポーン中)' }` を返却。現状は到達済みで完了扱いだったロジックを修正

### 検証
- 惑星を完全に掘り尽くした後、Ship が MINE ブロックで blocked になり、次のブロックへ進まないこと
- 60s 経過で resources が 80 に戻ること
- リスポーン後、MINE ブロックが running 再開すること (Executor は blocked → running 復帰を許容している前提。コードで確認)

---

## Step 3 — 敵バリエーション (basic / fast / tank)

### 編集ファイル
- **[src/config.ts](src/config.ts)** — `ENEMY` を 3 種類へ展開:
  ```ts
  export type EnemyType = 'basic' | 'fast' | 'tank';
  export const ENEMY_TYPES: Record<EnemyType, {
    hp: number; speed: number; damage: number; radius: number;
    hitRadius: number; contactRadius: number; color: number;
    creditsOnKill: number;
  }> = {
    basic: { hp: 20, speed: 60, damage: 10, radius: 10, hitRadius: 12, contactRadius: 24, color: 0xff4d5a, creditsOnKill: 5 },
    fast:  { hp: 12, speed: 90, damage: 8,  radius: 8,  hitRadius: 10, contactRadius: 22, color: 0xff9040, creditsOnKill: 7 },
    tank:  { hp: 50, speed: 35, damage: 15, radius: 14, hitRadius: 16, contactRadius: 28, color: 0xa01030, creditsOnKill: 12 },
  };
  ```
  既存 `ENEMY` は段階的撤去 (互換のため一時残置)
- **[src/config.ts](src/config.ts)** — `PHASES` を編成テーブルに拡張:
  ```ts
  export const PHASES: ReadonlyArray<{
    enemySpecs: Array<{ type: EnemyType; count: number; intervalMs: number; delayMs?: number }>;
  }> = [
    { enemySpecs: [{ type: 'basic', count: 5,  intervalMs: 2200 }] },
    { enemySpecs: [{ type: 'basic', count: 7,  intervalMs: 1900 }] },
    { enemySpecs: [
        { type: 'basic', count: 6, intervalMs: 1800 },
        { type: 'fast',  count: 3, intervalMs: 1400, delayMs: 4000 },
    ]},
    { enemySpecs: [
        { type: 'basic', count: 7, intervalMs: 1600 },
        { type: 'fast',  count: 5, intervalMs: 1300, delayMs: 3500 },
    ]},
    { enemySpecs: [
        { type: 'basic', count: 6, intervalMs: 1500 },
        { type: 'fast',  count: 5, intervalMs: 1200, delayMs: 2500 },
        { type: 'tank',  count: 2, intervalMs: 4000, delayMs: 6000 },
    ]},
  ];
  ```
- **[src/entities/Enemy.ts](src/entities/Enemy.ts)** — コンストラクタに `type: EnemyType` 追加。`ENEMY_TYPES[type]` から HP/speed/damage 等を読む。`creditsOnKill` を `Enemy.creditsValue` として公開
- **[src/systems/SpawnSystem.ts](src/systems/SpawnSystem.ts)** — `spawnAtRandomEdge(type: EnemyType)` に変更
- **[src/systems/WaveSystem.ts](src/systems/WaveSystem.ts)** — `enemySpecs` 配列の各エントリを独立スポーンタイマーで管理。複数 spec が並行で spawn する設計 (例: basic 6 体間隔 1800ms + fast 3 体間隔 1400ms (4s delay))
- **[src/scenes/GameScene.ts](src/scenes/GameScene.ts)** — 撃破集計時に `enemy.creditsValue` を使用 (現状は `ECONOMY.creditsPerKill` 固定)

### 設計判断
- 敵 type は spawn 時に固定。type 切替は Block (Ship) 側からは見えない (`ATTACK_NEAREST` は距離だけ見る)
- Phase 編成テーブルの型変更は破壊的変更だが、Phase 1-2 の互換性 (basic のみ) は保つ
- `ECONOMY.creditsPerKill` は default として残し、`creditsValue` がない敵は default 使用 (現状全敵が type を持つので実際は使われない)

### 検証
- Phase 1-2: basic のみ出現を確認
- Phase 3: 開始 4s 後に fast が出現
- Phase 5: 6s 後に tank 登場、basic + fast + tank が同時に動く
- HUD: 色が違うことを目視 (描画)
- 撃破時のクレジット: fast=7, tank=12 が加算される

---

## Step 4 — Program 永続化 (localStorage)

### 新規ファイル
- **[src/utils/save.ts](src/utils/save.ts)**:
  ```ts
  const KEY = 'spacecode.shipTemplate';

  export interface SerializedProgram {
    version: 1;
    blocks: Block[];   // Block 型は JSON-safe (string/number/discriminated union のみ)
  }

  export function saveShipTemplate(program: Program): void;
  export function loadShipTemplate(): Program | null;
  export function clearShipTemplate(): void;
  ```
  - `Block` 型は serialize にカスタム処理不要 (純粋データ)。REPEAT.children も再帰的に JSON 化される
  - `version` を入れて将来の Block 型変更時に migration できる余地を残す
  - `try/catch` で localStorage 不可環境 (プライベートブラウジング等) を吸収

### 編集ファイル
- **[src/scenes/GameScene.ts](src/scenes/GameScene.ts)**:
  - `tryBuyShip` で `loadShipTemplate()` を試み、あればその Program、なければ空 Program で Ship 生成
  - 編集オーバーレイから戻る/Ship を編集した直後に `saveShipTemplate(program)`
- **[src/scenes/ProgramEditorScene.ts](src/scenes/ProgramEditorScene.ts)** — 編集ハンドラ (`handleAdd` / `handleRemove` / `handleMove` / `handleReplace` / `handleLoadSample`) すべての末尾で `saveShipTemplate(currentProgram)` を呼ぶ
- **[src/ui/HUD.ts](src/ui/HUD.ts)** か `MenuScene` — 起動時のバナー「保存テンプレあり」表示は MVP では不要 (透過的に動作)

### 設計判断
- 「最後に編集した Program」が常に上書き保存される
- 編集オーバーレイで「テンプレを消去」のボタンは設けない (MVP)。明示的に消したいユーザーは localStorage クリアで対応 (注意点として README に書く程度)
- Ship 複数買った場合、それぞれ独立した Program インスタンスを持つが、**新規購入時のロードは同じテンプレ**。1 隻目の編集が 2 隻目に伝播することはない
- Phase 4 完了時点で Block 型が今後変わる場合は version up + migration を入れる (現状 v1)

### 検証
- ブロックを編集して F5 リロード → 新規購入 Ship に Program がロードされていること
- GameOver → R リトライ → 新規 Ship に Program がロードされていること
- localStorage に JSON が入っていること (DevTools で確認)
- REPEAT ネスト構造を持つ Program を保存・復元しても正しく動作

---

## Step 5 — バランス調整 + 計測コメント枠

### 編集ファイル
- **[src/config.ts](src/config.ts)** — 数値微調整:
  - `SHIP.cost`: 80 → 70 (Phase 4 で敵が強くなる分、Ship 投入のハードルを下げる)
  - `SHIP.fireAt cooldown` (= `attackDurationMs`): 600 → 500 (REPEAT { ATTACK } の DPS をやや上げる)
  - `ECONOMY.startCredits`: 100 → 120 (敵バリエーション対策で開戦時に Ship 1 + 余裕)
  - `STAGE.intermissionMs`: 6000 → 7000 (Phase 3 以降の編成準備時間を伸ばす)
  - 他は実プレイで調整
- **[docs/PROGRESS.md](docs/PROGRESS.md)** バランスメモ節に計測テンプレを追加:
  ```
  ## バランス調整メモ (実プレイ後に追記する場所)

  ### 計測ポイント
  - Phase 1 開始時の余裕: 開始 5s で credits / energy / Ship 隻数
  - Phase 3 fast 出現時の苦戦度: 残 HP / 撃ち漏らし数
  - Phase 5 tank 出現時のクリア可否
  - エネルギー欠乏で停止した Ship の発生頻度
  - 惑星枯渇に到達するか (60s リスポーンとプレイ時間の比)

  ### Phase 4 初期値 (実プレイ前)
  (テーブル)
  ```

### 検証
- `npm run typecheck` PASS
- `npm run build` PASS
- 全 Phase をプレイして Phase 5 まで到達可能であること (バランスが破綻していないことの確認)。MVP では「クリア可能」の確認のみ、面白さの調整は実プレイ後

---

## 触るファイル一覧

### 新規
- `src/utils/save.ts`

### 編集
- `src/config.ts` — `SHIP.energyPerShot` / `PLANET.respawnMs` / `ENEMY_TYPES` / `PHASES` 拡張 / バランス数値
- `src/entities/Ship.ts` — `fireAt` のエネルギー判定
- `src/entities/Planet.ts` — リスポーン
- `src/entities/Enemy.ts` — type フィールド、ENEMY_TYPES 参照
- `src/program/blocks/Mine.ts` — 枯渇中 blocked
- `src/systems/SpawnSystem.ts` — type パラメータ
- `src/systems/WaveSystem.ts` — enemySpecs 配列のスポーンタイマー
- `src/scenes/GameScene.ts` — テンプレロード / 撃破集計 / Ship 購入
- `src/scenes/ProgramEditorScene.ts` — 編集ハンドラで保存

### 編集 (Phase 完了時)
- `docs/PROGRESS.md`
- `CLAUDE.md`

---

## 既存資産の再利用

- `src/entities/Bullet.ts` — そのまま (新規敵にも命中)
- `src/entities/Tower.ts` — そのまま (新規敵にも有効)
- `src/program/Executor.ts` — `blocked` の扱いは既存 (running と同等で副作用抑制)
- `src/program/Block.ts` — JSON-safe な discriminated union のため serialize 拡張不要

---

## 想定リスクと対策

| リスク | 対策 |
|---|---|
| `PHASES` 型変更で WaveSystem が壊れる | WaveSystem を `enemySpecs[]` の並行タイマー方式に書き直す。各 spec が独立 spawner を持つ |
| `tickMine` を blocked に変えると現状の動作 (枯渇 = done) が崩れる | 枯渇時の挙動を意図的に変える。「次の MINE まで進まず stop」というプレイヤーへの明示が必要 → Editor で blocked 状態を表示 (深追いせず Phase 4 では reason 文字列のみ) |
| localStorage に古い JSON が残って Block 型不一致でエラー | `loadShipTemplate` で try/catch、unsupported な block type は filter で除去。最悪は null 返却 |
| 敵バリエーションで Phase 5 が難しすぎる | 初期値は控えめにし、実プレイ後に PROGRESS バランスメモに記載して調整 |
| `Enemy.takeDamage` の damage 値が ENEMY_TYPES からの場合、既存 Bullet との互換性 | Enemy.hp/maxHp は type ごと固定。Bullet.damagePerHit はそのまま |

---

## 完了条件 (本 Phase 終了の判定)

- [ ] `npm run typecheck` / `npm run build` PASS
- [ ] エネルギー切れの Ship が射撃しない (Step 1 検証)
- [ ] 惑星が 60s リスポーンする (Step 2 検証)
- [ ] Phase 3 で fast、Phase 5 で tank が出現する (Step 3 検証)
- [ ] F5 リロード後も新規 Ship に Program がロードされる (Step 4 検証)
- [ ] Phase 5 までクリア可能 (バランス検証)
- [ ] `PROGRESS.md` 更新済、`CLAUDE.md` ステータス更新済
