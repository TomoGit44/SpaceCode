# Phase 3 — 残ブロック (ATTACK_NEAREST / WAIT_UNTIL_FULL / REPEAT) + 制御フロー

## Context

Phase 1+2 でブロック実行系と編集 UI が完成。だが「ループ」「攻撃」「条件待ち」の 3 つが無く、表現力が不足していた。Phase 3 で残り 3 ブロックを追加し、REPEAT による本格的な制御フロー (ネスト構造) を解禁する。

完了条件: 編集 UI から `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT` を追加・編集でき、REPEAT は中身を編集して N 回繰り返す。Ship は ATTACK_NEAREST に入ると 1 発撃ち、`SHIP.attackDurationMs` 経過まで次に進まない (= REPEAT で囲んで連射)。

## 確定済み設計判断 (ユーザー確認)

1. **REPEAT はネスト構造**: `{ type: 'REPEAT'; times: number; children: Block[] }`。子ブロック列を N 回繰り返す。プログラム末尾ループ案ではなく本格的な制御構造。
2. **ATTACK_NEAREST は持続時間ブロック**: 入った tick で最寄り敵をターゲット指定 + 1 発発射。以降 `SHIP.attackDurationMs` (600ms) 経過まで running。
3. **Ship の cooldown 連射機構は撤廃**: `SHIP.fireIntervalMs` と `attackCooldownMs` を削除、Ship.update の自動発射ロジックを撤廃。連射したいプレイヤーは `REPEAT { ATTACK_NEAREST }` で囲む。
4. **エネルギー消費 (移動/攻撃)** は Phase 4 で実装予定 (ユーザー言及あり)。Phase 3 では実装しない。

## 成果物

### 新規
- `src/program/blocks/AttackNearest.ts` — `tickAttackNearest(ship, world, ctx)`。justEntered で `ship.attackNearest` + `ship.fireAt`、`ctx.elapsedMs >= SHIP.attackDurationMs` で done
- `src/program/blocks/WaitUntilFull.ts` — `tickWaitUntilFull(ship)`。`ship.isInventoryFull()` で done
- `src/program/blocks/Repeat.ts` — Executor が直接ハンドルするためロジックなし。仕様コメントのみ

### 編集
- `src/program/Block.ts` — union に 3 variant 追加 (`ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT`)、`BlockType` 列挙拡張、`createBlock` 分岐追加 (REPEAT デフォルト `{ times: 3, children: [] }`)
- `src/program/Executor.ts` — **スタックベース実行モデルへ刷新**:
  - `Frame { blocks, cursor, remainingIterations }` のスタック
  - root frame は `remainingIterations = -1` でループしない (末端でも pop しない)
  - REPEAT 遭遇時に新フレーム push、children 末尾で `remainingIterations` 消費 (>1 ならカーソル 0 戻し)
  - `BlockExecContext { elapsedMs, justEntered }` を tick fn に渡す
  - tick 冒頭で root frame.cursor を `program.cursorIndex` と同期 (ユーザー編集を反映)
  - `getRunningBlocks() / getRunningCursor()` を UI 用に追加
  - `MAX_ADVANCES_PER_TICK` を 8 → 16 (REPEAT 開閉が 2 advance 消費するため)
- `src/program/samples.ts` — `sampleBlocks()` を `REPEAT × 20 { MOVE_TO, MINE, MOVE_TO, DEPOSIT }` に変更
- `src/entities/Ship.ts` — `attackCooldownMs` フィールドと cooldown 自動発射ロジック削除、`fireAt(enemy, bullets): boolean` と `getAttackTarget(): Enemy | null` 追加
- `src/config.ts` — `SHIP.fireIntervalMs` 削除、`SHIP.attackDurationMs: 600` 追加
- `src/scenes/ProgramEditorScene.ts` — スコープスタック (`scopeStack: ScopeFrame[]`) + breadcrumb 描画 + `enterScope` / `popScope` / `gotoScopeDepth`、編集ハンドラを `currentScope.blocks` 経由 (root のみ Program API、ネストは直接 splice)、走行マーカー追従の最小再描画
- `src/ui/BlockPalette.ts` — `BLOCK_LABEL` に 3 種追加、種別ごとのアクセントカラー (`BLOCK_COLOR`)、ボタン高さ 36→32 圧縮で 6 ボタン + テンプレ + 閉じる が card に収まる
- `src/ui/ProgramList.ts` — `blockLabel` で REPEAT は「繰り返し ×N (M ブロック)」表示、`cursorIndex: number | null` 受信 (現スコープと走行フレームが別なら null)
- `src/ui/BlockParamEditor.ts` — REPEAT の `times` ▼/▲ スピナー (1〜20)、「中身を編集 →」ボタンが `enterScope` を emit

### 変更なし
- `src/program/Program.ts` (Phase 2 の API で root scope の cursor 追従カバー)
- `src/scenes/GameScene.ts` (`tryBuyShip` は空 Program のまま)
- `src/main.ts`

## 検証

- `npm run typecheck` / `npm run build`: PASS (gzip 352→353KB)
- `preview_eval` 経由で:
  - 新規 Ship は空 Program で `state: idle` (コア原則維持)
  - REPEAT × 2 { MOVE_TO planet0 → MINE → MOVE_TO base → DEPOSIT } を append → 1800 フレームで 2 周完走、planet 40.2 採掘、root に戻ったところで停止
  - ATTACK_NEAREST 単発: 入った tick で Bullet 1 発生成、~600ms で cursor 進行
  - REPEAT × 5 { ATTACK_NEAREST } → 5 回連射動作、root に正しく戻る
  - WAIT_UNTIL_FULL: 空インベントリで cursor 据え置き (running)、満タンに変えると次のブロックへ進む
  - ProgramEditorScene のスコープナビゲーション: root → REPEAT 選択 → enterScope で scopeStack 深さ 1→2、currentScope が children 参照に切り替わる、popScope で 2→1 に戻る
  - Phase 2 のライブ編集 (insert/removeAt 等のカーソル追従) も Phase 3 Executor で動作 — root frame.cursor を tick 冒頭で program.cursorIndex と同期する仕組みで実現
- `preview_console_logs level='error'`: 空
- 検証後に `window.__game` 公開を削除し最終 typecheck PASS

## プランからの逸脱

- `MAX_ADVANCES_PER_TICK` を 8 → 16 に増やした (REPEAT push/pop が 1 ブロック扱いで advances を消費するため、ネストが深いと 8 では足りない場面が出る)
- **Executor の root frame を末尾で pop しない**設計に変更 (空 Program で append したときに再開できるようにするバグ修正)。子フレームは末尾で pop する
- **root frame.cursor を tick 冒頭で program.cursorIndex と同期**する 1 行を追加 (Phase 2 のライブ編集互換を維持するため。これがないと user の insert/removeAt が Executor に反映されない)
- BlockPalette: ボタン色をブロック種別ごとに変更 (ATTACK_NEAREST 赤系、REPEAT teal、移動/採掘/納品 ally 系)。視認性向上
- `tickRepeat` の独立ファイルは作ったが空: REPEAT は Executor のスタック制御で完結するため評価関数を独立化する意味が薄かった。1 ファイル 1 種の慣習は spec コメントで担保

## 既知の制限

- ネストスコープの編集中ライブ追従: REPEAT.children を編集中 (直接 splice) は cursor のフォロー処理を行わない。次 tick で Executor が cursor をクランプ (range 外なら frame 末尾扱い) するのみ。**root scope のみ Phase 2 の完全追従**
- REPEAT.times = 0 / children = [] は即スキップ (Executor がフレーム push 前にチェック)
- 二重ネスト (REPEAT 内に REPEAT) はスタック深 3 で動くが UI ではパンくずが横に長くなる可能性 (MVP では問題視せず)
- Ship の `attackTarget` フィールドは保持 (旧 cooldown 機構の名残)。次の REPEAT iteration で `attackNearest` が呼ばれるたび更新される
- `SHIP.attackDurationMs: 600` は固定値 (ブロックごとに変更不可)。Phase 4 でブロックパラメータ化を検討する余地あり

## Vite (Windows) 取りこぼし対策

Phase 2 と同様、`Executor.ts` の更新を Vite ファイルウォッチャが取りこぼした。Write で再書き込みして強制 re-transform した。今後も Edit を多用した既存ファイルは検証前に再 Write が必要になる可能性がある。
