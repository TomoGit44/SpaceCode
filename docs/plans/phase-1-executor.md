# Phase 1 — ブロック実行系 (UI なし)

## Context

本作のコア体験は「プレイヤーがブロックで Ship をプログラミングする」こと。
旧 Phase 構成は積み上げ式 (A→B→C→D→**E**=ブロック) で、コア体験が最後尾に追いやられていた。**Block-first 再編 (2026-05-15)** で新 Phase 1 を「ブロック実行系の最小実装」に位置づけ、UI は Phase 2 に分離した。

本 Phase の完了条件は **「コード内ハードコードされた `Program` を Ship に流し込むと、その内容通りに Ship が動く」** こと。UI は不要。Executor のデータモデルと評価ロジックが固まることが目的。

`Ship` には Phase D で `ShipBehavior` 抽象が先行導入済 (`setBehavior()`)。本 Phase では `Executor implements ShipBehavior` を作って差し込むだけで接続できる。Phase D の `AutoMineBehavior` はコア原則 (「プログラムを組まないと Ship は動かない」) に反するため **本 Phase で削除する**。

## ゴール

- `MOVE_TO` / `MINE` / `DEPOSIT` の 3 ブロックで「採掘ループ」を **ブロックで** 表現できる
- Ship 購入直後はプログラム未割り当てで **静止する** (← この挙動の確立がコア)
- 新規ブロックを増やすときは `src/program/blocks/<Name>.ts` を 1 ファイル追加するだけで済む構造

## スコープ外 (Phase 2 以降)

- `ProgramEditorScene` / マウス操作の UI (Phase 2)
- `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT` ブロック (Phase 3)
- Ship ごとの永続プログラム保持 (Phase 3)
- セーブ (Phase 4)

---

## 設計判断

### 1. Block の表現: discriminated union + 評価関数ファイル分散

```ts
// src/program/Block.ts
export type Block =
  | { type: 'MOVE_TO'; x: number; y: number }
  | { type: 'MINE'; planetIndex: number }
  | { type: 'DEPOSIT' };

// 将来 Phase 3 で追加
//  | { type: 'ATTACK_NEAREST' }
//  | { type: 'WAIT_UNTIL_FULL' }
//  | { type: 'REPEAT'; times: number; children: Block[] };  // 形は Phase 3 で確定
```

評価ロジックは `src/program/blocks/<Name>.ts` に「Block 1 種類分の評価関数」を置く。Executor は中央で dispatcher として switch するだけ。

```ts
// src/program/blocks/MoveTo.ts
export function tickMoveTo(
  block: Extract<Block, { type: 'MOVE_TO' }>,
  ship: Ship,
  world: ShipWorld
): BlockStepResult { ... }
```

**理由**: ブロックを増やすとき、Block.ts に 1 行 (union バリアント追加) + Executor の switch case 1 行 + 新規ファイル 1 つ、で完結する。各ブロックの評価ロジックが他から隔離される。

### 2. ブロック完了判定: `BlockStepResult`

```ts
export type BlockStepResult =
  | { status: 'running' }     // まだこのブロックが進行中。次フレームも同じブロックを評価
  | { status: 'done' }        // 完了。Executor は次のブロックへ進む
  | { status: 'blocked'; reason: string };  // 実行不能 (例: 惑星が枯渇している)
```

**理由**: `MOVE_TO` は到達まで複数フレーム、`MINE` は満タンまで複数フレーム。「1 tick = 1 ブロック」ではなく「ブロック側が完了を宣言するまで Executor は次に進まない」設計が必要。

`blocked` 時の挙動: Phase 1 では「そのブロックに留まる」(`running` と同等で副作用だけ抑制)。Phase 3 の REPEAT や Phase 2 の UI で「エラー表示」「次ブロックへスキップ」を選べるよう、現段階で type だけは分けておく。

### 3. Executor の責務

```ts
// src/program/Executor.ts
export class Executor implements ShipBehavior {
  private program: Program;

  constructor(program: Program);

  tick(delta: number, ship: Ship, world: ShipWorld): void;
  reset(): void;  // ShipBehavior が optional で持つ
}
```

- `tick` で `program.currentBlock()` を取り出し、対応する `tick<Name>` 関数を呼ぶ
- `done` なら `program.advance()`
- プログラム末尾に到達したら **末尾で停止** (Phase 1 では `Repeat` がないため。Ship は idle になる)
- Ship の命令的 API (`moveTo` 等) を呼ぶ。直接 `ship.x` を書き換えない

### 4. Program の責務

```ts
// src/program/Program.ts
export class Program {
  private blocks: Block[];
  private cursor: number;

  constructor(blocks: Block[]);
  public currentBlock(): Block | null;
  public advance(): void;
  public isDone(): boolean;     // cursor >= blocks.length
  public reset(): void;
}
```

ブロックの追加/削除 API は Phase 2 (UI) で必要になったときに足す。Phase 1 では「コンストラクタで配列を受けて、内部カーソルで進む」だけ。

### 5. `AutoMineBehavior` の処遇: 削除

- ファイル削除: `src/entities/behaviors/AutoMineBehavior.ts`
- GameScene の `import` と `setBehavior(new AutoMineBehavior())` を削除
- 代わりに `setBehavior(new Executor(sampleProgram))` を流し込む

`AutoMineBehavior` の意図 (採掘ループ) は **本 Phase の `sampleProgram` がブロックで表現** することで継承される。フォールバック挙動は持たせない。

### 6. ハードコード Program のサンプル

```ts
// GameScene.tryBuyShip 内 (Phase 2 で本物の UI に置き換える)
const sampleProgram = new Program([
  { type: 'MOVE_TO', x: 220, y: 200 },      // 惑星 0 の位置
  { type: 'MINE', planetIndex: 0 },          // 満タンまで採掘
  { type: 'MOVE_TO', x: this.base.x, y: this.base.y },
  { type: 'DEPOSIT' },
]);
ship.setBehavior(new Executor(sampleProgram));
```

このサンプルは「Phase D の AutoMineBehavior と同じ動きを **ブロックで** 表現したもの」。動作比較ができるので Phase D との回帰テストにもなる。

Phase 1 では「全 Ship 同じサンプル」で良い。Phase 2 で Ship ごとの編集が入る。

### 7. `MINE` ブロックの「満タン判定」

`MINE` ブロックは `ship.isInventoryFull()` または `planet.depleted` で `done`。それまで `ship.mineAt(planet)` を毎フレーム呼んで採掘継続。

これは Phase D の `AutoMineBehavior` 内で実装していた挙動と同じ。本質的に「ループ条件付きブロック」だが、Phase 1 の MVP では `MINE` 単体に「満タン or 枯渇まで自動継続」を埋め込む。

将来 Phase 3 の `WAIT_UNTIL_FULL` で「条件待ちブロック」を分離する案もあるが、Phase 1 では `MINE` がそれを内包する単純構造で良い。Phase 3 で `WAIT_UNTIL_FULL` を入れるとき `MINE` の意味を「1 回採掘 (= 短いブロック)」に変える選択肢も残る。Phase 1 では「`MINE` = 採掘完了するまで」で確定。

### 8. `MOVE_TO` の到達判定

`ship.isAt(target, threshold)` で判定。`threshold` は Block の `MOVE_TO` に持たせず、Executor 側で「到達と見なす距離」を 4px 固定 (`Ship.moveSpeed * 16ms` 未満)。

将来 `MOVE_TO_PLANET` のように半径つきターゲットが必要になったら別ブロックにする (1 ファイル 1 種を守る)。Phase 1 の `MOVE_TO` は座標到達のみ。

### 9. ハードコード Program の `planetIndex` 参照

`{ type: 'MINE', planetIndex: 0 }` は `world.planets[0]` を見る。インデックスベースは UI 化したときに不便なので Phase 2 では「Planet ID」化を検討。Phase 1 では simplicity 優先でインデックスで OK。

---

## 実装ステップ

### Step 1: `src/program/` 骨組み (型と基本構造)

新規ファイル:
- `src/program/Block.ts` — `Block` discriminated union (3 種) + `BlockStepResult` 型
- `src/program/Program.ts` — `Program` クラス (blocks 配列 + cursor)
- `src/program/Executor.ts` — `Executor` クラス (`ShipBehavior` 実装、tick で dispatcher)

この段階では blocks/ ディレクトリは空でも良いが、tickMoveTo 等を呼ぶので一緒に作る。

### Step 2: 3 種ブロック評価関数

新規ファイル:
- `src/program/blocks/MoveTo.ts` — `tickMoveTo`: ship.moveTo を呼んで `ship.isAt(target, 4)` で done
- `src/program/blocks/Mine.ts` — `tickMine`: ship.mineAt を呼んで `ship.isInventoryFull() || planet.depleted` で done。惑星が無効インデックスなら `blocked`
- `src/program/blocks/Deposit.ts` — `tickDeposit`: ship.depositAt(world.base) を呼んで `ship.inventory === 0` で done

### Step 3: AutoMineBehavior 削除 + GameScene 配線

- `src/entities/behaviors/AutoMineBehavior.ts` 削除
- `src/entities/behaviors/` ディレクトリは Phase 2/3 で他 Behavior を増やす可能性に備えて空のまま残す or 完全削除 (実装時に判断)
- `src/scenes/GameScene.ts`:
  - `AutoMineBehavior` の import を削除
  - `tryBuyShip` 内で `Executor` + ハードコード `Program` (上記 §6 のサンプル) を作って `setBehavior`
- ハードコード Program は GameScene 内 helper か `src/program/samples.ts` に出す (実装時に判断)

### Step 4: 検証

- `npm run typecheck` PASS
- `npm run build` PASS
- `npm run dev` → 起動 → ShopPanel から宇宙船購入 → サンプル Program 通りに惑星 0 へ移動 → 採掘 → 基地へ移動 → 納品 → **そこで停止する** (ループブロックなし)
- 2 隻目購入 → 同じサンプルで同じ挙動
- `preview_console_logs level='error'` でランタイムエラーなし

### Step 5: コア原則の動作確認 (重要)

サンプル Program を **空配列** にして購入してみる → **Ship が静止すること** を確認。これが本 Phase の本質。

確認後、サンプルを通常の Program に戻す。

### Step 6: PROGRESS.md / CLAUDE.md 更新

- PROGRESS.md の Phase 1 節を「完了」に。成果物・既知制限・検証結果を記入。
- CLAUDE.md の現在ステータステーブルを「Phase 1 完了、次は Phase 2」に更新。
- ファイル別ステータスを更新 (`src/program/*` を ✅ に、`AutoMineBehavior` の行を削除)。

---

## 触るファイル一覧

### 新規
- `src/program/Block.ts`
- `src/program/Program.ts`
- `src/program/Executor.ts`
- `src/program/blocks/MoveTo.ts`
- `src/program/blocks/Mine.ts`
- `src/program/blocks/Deposit.ts`

### 編集
- `src/scenes/GameScene.ts` — `AutoMineBehavior` 削除、`Executor` + サンプル Program 配線

### 削除
- `src/entities/behaviors/AutoMineBehavior.ts`

### 編集 (Phase 完了時)
- `docs/PROGRESS.md`
- `CLAUDE.md`

---

## 既存資産の再利用

- `src/entities/Ship.ts` — `setBehavior()` / `ShipBehavior` interface / 命令的 API。**改修不要**
- `src/entities/Planet.ts` — `extract()` API
- `src/entities/Base.ts` — `radius` (Deposit 判定で使う)
- `src/systems/EconomySystem.ts` — `depositResource()` (Ship 側が呼ぶので Executor からは触らない)

---

## 想定リスクと対策

| リスク | 対策 |
|---|---|
| Ship.update と Executor.tick の呼び出し順で `done` を取りこぼす | Ship.update の冒頭で `behavior.tick` を呼ぶ既存設計を維持。Executor 内で 1 tick 内に最大 N 回 advance できる loop を入れる (連続 done のブロックが連発したとき) |
| ハードコード Program が惑星位置とハードコーディングで重複 | `world.planets[0].x/y` を読んでサンプル Program を組み立てる helper を作って回避 |
| `Repeat` がない状態で末尾停止すると Ship が無駄に残り続ける | 仕様。UI のないこの Phase ではプレイヤーが Ship を消す手段がないが、Phase 2 で削除 UI を入れるか、Phase 3 の Repeat ブロックでループ化する。Phase 1 では「末尾停止」を許容 |
| `behaviors/` ディレクトリの去就 | Phase 2 で別 Behavior (例: AI 補助) を増やす予定がなければ削除。Phase 1 では空のまま残しても良い。実装時に判断 |

---

## 完了条件 (本 Phase 終了の判定)

- [ ] `src/program/` 配下に 6 ファイル (Block.ts / Program.ts / Executor.ts / blocks/ × 3)
- [ ] `AutoMineBehavior.ts` 削除完了
- [ ] `npm run typecheck` / `npm run build` PASS
- [ ] dev サーバで Ship 購入 → サンプル Program 通りに採掘ループ動作 (1 周してから停止)
- [ ] 空 Program の Ship が静止することを確認
- [ ] `PROGRESS.md` / `CLAUDE.md` 更新済
