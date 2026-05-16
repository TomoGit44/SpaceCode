# SpaceCode — 設計思想と引き継ぎ資料

> 別 Claude Code セッションがこのプロジェクトに合流したとき、最初に読むべきファイル。
> ここには **「なぜそう作るのか」「用語の定義」「過去の重要な判断」** を残す。
> 現在のコード進捗は [`PROGRESS.md`](./PROGRESS.md)、開発手順は [`../CLAUDE.md`](../CLAUDE.md) を参照。

---

## 1. このゲームの一行説明

**プレイヤーがブロックを組んで宇宙船をプログラミングし、襲来する敵から基地を守る、宇宙テーマのタワーディフェンス。**

ジャンルとしては TD だが、**プレイヤー体験のコアは「ブロックを組む」こと**。タワーで自動迎撃しているだけでは惑星から資源は採れず、宇宙船は動かず、難易度上昇に対応できない。

---

## 2. コア体験 (絶対に守る原則)

### 2.1 **プログラムを組まないと Ship は動かない**

これが本作の中核。

- Ship は購入しても `Program` (ブロック列) が割り当てられなければ **何もしない**。基地横で待機するだけ。
- 移動 (`MOVE_TO`)、採掘 (`MINE`)、納品 (`DEPOSIT`)、攻撃 (`ATTACK_NEAREST`)、すべて **ブロックが明示的に呼ばないと発動しない**。
- 「とりあえず採掘ループに入る」ような **内蔵 AI は存在しない**。
- プレイヤーが「ブロックを組んで動かす」というアクションを能動的に取ることが、ゲーム成立の必須条件。

この原則を曲げる実装は禁止 (例: 「未プログラム Ship のためのデフォルト挙動」のフォールバック等)。

### 2.2 TD レイヤは「**背景**」、ブロックレイヤは「**前景**」

| レイヤ | 内容 | プレイヤー操作 |
|---|---|---|
| 背景 (TD) | 敵 Wave / タワー自動迎撃 / 基地 HP / クレジット経済 | 受動的 (時間経過で進行) |
| **前景 (ブロック)** | **Ship のプログラム作成・編集・実行** | **能動的 (これが遊びの中心)** |

プレイヤーが何もしないと、TD は進行するが Ship は動かず、いずれ基地が落ちる。**ブロックを組むことが攻略**。

### 2.3 タワーはブロック化しない (現時点の判断)

- タワーは Phase B 由来の自動迎撃装置。`Ship.attackNearest` と同じ機能をブロックで組めるため、タワーをさらにブロック化すると概念が重複する。
- タワーは **「基地の自動防衛装置」**、Ship は **「プレイヤーがプログラムする働き手」**、と役割を分離。
- 将来再考の余地はあるが、MVP では明確に分離する。

---

## 3. 用語定義 (コード内で揺らがせない)

| 用語 | 意味 | 実装上の対応 |
|---|---|---|
| **Block** | プログラムの 1 ステップ。`MOVE_TO` / `MINE` / `DEPOSIT` / `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT` の 6 種 | `src/program/Block.ts` の discriminated union |
| **Program** | Block の配列 + 実行カーソル状態 | `src/program/Program.ts` |
| **Executor** | Program を 1 ティックごとに解釈し、Ship の命令的 API を呼ぶ実行器 | `src/program/Executor.ts` (`ShipBehavior` を実装) |
| **Behavior** | Ship を動かす意思決定主体の抽象。`tick(delta, ship, world)` を持つ | `src/entities/Ship.ts` の `ShipBehavior` interface |
| **Ship 命令的 API** | `moveTo` / `mineAt` / `depositAt` / `attackNearest` / `stop` — 低レベルの「目標設定」メソッド。誰がいつ呼んでもよい | `src/entities/Ship.ts` の public メソッド |
| **World** | Behavior / Executor がワールド状態を見るためのインタフェース (`base/planets/enemies/bullets/economy`) | `ShipWorld` interface |

**重要**: `Behavior` は Ship の挙動を担う抽象クラス、`Executor` はその具象実装の 1 つ。「ブロックを解釈する Behavior」が Executor。

---

## 4. アーキテクチャの要点 (詳細はコードを読む前提)

```
[Block] (データ)
   ↓ 並べる
[Program]  (実行カーソル付き配列)
   ↓ tick で解釈
[Executor]  implements ShipBehavior
   ↓ Ship 命令的 API を呼ぶ
[Ship]  (位置・HP・energy・inventory)
   ↑ tick ごとに 1 ステップ進行 / 命令 API 呼び出しでターゲットを更新
```

- Ship は **「目標 (`moveTarget`/`mineTarget` 等) を持ち、毎フレーム 1 ステップ進める」** 設計。命令的 API は「目標を設定するだけ」で同期的に完了しない。これにより Executor 側の「ブロック完了判定」が必要になる (例: `MOVE_TO` ブロックは Ship が到達するまで `done = false` を返し続ける)。
- Bullet は Tower と Ship で共用 (`src/entities/Bullet.ts`)。

### 拡張ポイント (1 ファイル 1 種の原則)

**ブロックは 1 ファイル 1 種**で `src/program/blocks/` 配下に置く。新しいブロックを追加するときは新規ファイルを 1 つ作るだけで完結する設計を維持する。Executor 本体や Block 型を毎回触るような構造にはしない (discriminated union は中央の Block.ts に、各 block の評価ロジックは blocks/<name>.ts に分散させる)。

---

## 5. Phase 構成 (Block-first 再編後)

| Phase | 内容 | 状態 |
|---|---|---|
| **基盤層** | Boot/Menu/Game/GameOver/Victory + Base/Tower/Enemy/Bullet/Planet/Ship + Wave/Spawn/Economy + HUD/ShopPanel | ✅ 完了 (旧 A-D) |
| **Phase 1** | ブロック実行系 (UI なし): `Block`/`Program`/`Executor` + 3 種 (`MOVE_TO`/`MINE`/`DEPOSIT`)。`AutoMineBehavior` 削除 | ✅ 完了 |
| **Phase 2** | ブロック編集 UI (`ProgramEditorScene` + `BlockPalette` / `ProgramList` / `BlockParamEditor`)。並行オーバーレイでライブ編集 | ✅ 完了 |
| **Phase 3** | 残り 3 ブロック (`ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT`)。Executor をスタック実行モデルに刷新、Ship cooldown 撤廃 | ✅ 完了 |
| **Phase 4** | 統合と難易度調整: 射撃エネルギー消費、敵 3 種化、Program 永続化、惑星リスポーン、バランス調整 | ✅ 完了 |
| **Phase 5** | 仕上げ: 演出強化 (シーン遷移・フラッシュ・バナー)、配色統一 (COLORS 拡張)、README 整備 | ✅ 完了 (**MVP 達成**) |

旧 Phase A-D の進捗詳細は `PROGRESS.md` の履歴節に保存。**旧 Phase E は新 Phase 1+2+3 に再分配された**。旧 Phase F = 新 Phase 4、旧 Phase G = 新 Phase 5。

---

## 6. 過去の重要判断 (なぜそうなっているか)

### 6.1 旧 Phase 構成 (A→B→C→D→**E**=ブロック) からの転換 (2026-05-15)

**問題**: 「TD ベースを先に完成 → 最後にブロック実装」という積み上げ式で組んだ結果、**コアであるブロック体験が実装の最後尾に追いやられていた**。Phase D 完了時点で TD ループは完璧に動くが、肝心のブロックプログラミングが触れない状態。

**判断**: 「Phase をまたいで実装しない」というルールを撤廃し、コア体験を優先する判断を許容するルールに変更。Phase 構成は Block-first に再編。

**反省点**: Phase 計画は「実装順を縛るドキュメント」ではなく「ガイド」として扱うべき。コア体験が遅延しそうな兆候があれば順序を組み替える判断を歓迎する。

### 6.2 `ShipBehavior` 抽象を Phase D で先行導入

**経緯**: Phase D 実装時、`AutoMineBehavior` を作ったが、Phase E (現 Phase 1) で Executor に差し替える前提だったため、`ShipBehavior` interface を Ship に持たせて差し替え可能にした。

**現在**: この判断のおかげで Phase 1 では「`AutoMineBehavior` を削除し `Executor` を `setBehavior()` で差し込むだけ」で接続できる。Ship 本体の改修は不要。Phase D での先行設計が活きた数少ない例。

### 6.3 Bullet を Tower と Ship で共用

弾の挙動 (対象ホーミング、命中で takeDamage) は完全に同じなので、`src/entities/Bullet.ts` を両方から使う。`ATTACK_NEAREST` ブロックも同じ Bullet を流用する。

### 6.4 タワーの自由配置と既存 2 基の併存

ShopPanel から追加するタワーは「3 基目以降を自由配置」、初期 2 基は基地左右固定のまま。理由: Phase B からの既知制限 (上下抜け) を維持して難易度を保つため。完全自由化は Phase 4 で再検討。

### 6.5 惑星と敵の重なり判定なし

敵は惑星を貫通して基地に直進する。理由: 敵 AI に避け処理を入れると難易度設計が複雑化するため。Phase 4 で必要なら再考。

### 6.6 MOVE_TO / MINE のターゲットを名前付き地点 (LocationId) にした (Phase 2, 2026-05-15)

**経緯**: Phase 1 では `MOVE_TO` が任意座標 `{x, y}`、`MINE` が `planetIndex: number` だった (Phase 1 plan 内で「Phase 2 で Planet ID 化を検討」と保留)。Phase 2 で編集 UI を設計する際、ユーザーから**「プレイヤーは惑星A / 惑星B / 基地から選ぶ」** という回答を得た。

**判断**: `LocationId = 'base' | 'planet0' | 'planet1'` を導入し `src/program/locations.ts` で resolver を集約。`Block` 型は `MOVE_TO: {target: LocationId}` / `MINE: {target: PlanetId}` に変更。

**理由**: (a) このゲームで意味のある移動先は 3 地点のみで、任意座標は実用上ほぼ無価値。(b) UI が「チップ選択」というシンプルなコンポーネントで済む (座標入力 UI を作らずに済む)。(c) 将来 `MOVE_TO_PLANET` のような半径つきターゲットを別ブロックとして増やすことは可能。

**トレードオフ**: 「任意の点へ移動して何かする」ような自由度は失った。だが MVP の目標は「ブロックを組んで採掘ループを作る」であり、その範囲では十分以上。

### 6.7 新規 Ship は空 Program 開始 (Phase 2, 2026-05-15)

**経緯**: Phase 1 では新規購入 Ship に `createSampleProgram` のサンプル 4 ブロックを自動投入していた (実行系の動作確認のため)。Phase 2 で編集 UI が乗ったタイミングで、コア原則「組まなければ動かない」に最も忠実な挙動に戻す機会と判断。

**判断**: 新規購入 Ship は**空 Program で生成**。プレイヤーは Ship をクリックして編集オーバーレイを開き、自分でブロックを組む必要がある。`samples.ts` の `sampleBlocks()` は BlockPalette の「サンプル読み込み」ボタンとして残し、テンプレ流し込みは引き続き可能。

**理由**: 教育的な意味で「買ったのに動かない」体験はコア原則の最初の手触り。バナー「船をクリックしてプログラムを編集」で誘導する。

### 6.9 ATTACK_NEAREST は持続時間ブロック、Ship cooldown 撤廃 (Phase 3, 2026-05-15)

**経緯**: Phase 1 で Ship に `attackCooldownMs` を持たせ、attackTarget が居る限り 900ms 間隔で自動発射する仕組みだった。Phase 3 で ATTACK_NEAREST ブロックを実装するに当たり、ユーザーから「Cooldown の概念はいりません」「撃つ動作に時間がかかるようにして下さい」「REPEAT で囲めば連射」との指針。

**判断**: Ship.update の自動発射ロジックを完全に削除し、`SHIP.fireIntervalMs` を撤廃。代わりに ATTACK_NEAREST ブロックが「入った tick で 1 発撃ち、SHIP.attackDurationMs (600ms) 経過まで block を留める」設計に。連射は `REPEAT { ATTACK_NEAREST }` で表現する。Ship に `fireAt(enemy, bullets): boolean` API を追加 (射程内なら即 Bullet 生成)。

**理由**: 「コア体験はブロックを組むこと」原則の徹底。Ship の自動挙動を 1 つでも残すと、それが「組まなくても動く」抜け道になる。攻撃の cooldown は本来「攻撃ブロックの持続時間」として block レイヤで表現するべき関心事。

**将来**: 「移動と射撃でエネルギー消費」を Phase 4 で実装する予定 (ユーザー言及あり)。その時 ATTACK_NEAREST の `attackDurationMs` を block ごとに設定可能にする余地がある。

### 6.10 REPEAT はネスト構造、Executor をスタック実行モデルに刷新 (Phase 3, 2026-05-15)

**経緯**: Phase 1 plan で REPEAT の形を「プログラム末尾で先頭に戻る (A) / 子ブロック列を N 回 (B)」の 2 案で Phase 3 まで保留していた。Phase 3 着手時にユーザーが (B) ネスト構造を選択。

**判断**: `Block` 型に `{ type: 'REPEAT'; times: number; children: Block[] }` を追加。Executor を**スタックベース実行モデル**に刷新し、REPEAT に到達すると新フレームを push、children 末尾で `remainingIterations` を消費して再周回 or pop。`BlockExecContext { elapsedMs, justEntered }` を tick fn に渡し、ATTACK_NEAREST の持続時間判定に使う。編集 UI はスコープスタック + breadcrumb で nested children に drill-in できる。

**理由**: 表現力。(A) ではプログラム末尾以外でループ表現できず、「採掘 1 周 → 攻撃 → 採掘 1 周」のような構造が組めない。(B) は実装量が増えるがプレイヤーの能動性 (組み立てる楽しさ) を大幅に拡張する。MVP の限界を超えたが Phase 1+2 の蓄積で安全に到達できた。

**トレードオフ**: 編集 UI が「スコープを drill-in する」操作になり、Scratch のような階層インライン表示は採用しない (Phaser での実装が重い)。Phase 2 で確立した「ライブ編集 + カーソル追従」の完全互換は root scope のみ。children 編集中の cursor 追従は最小 (クランプ) で済ませた。

**重要な実装上の判断**:
- Executor の root frame は末尾でも pop しない (空 Program → 後から append したときに再開できるよう)
- tick 冒頭で root frame.cursor を Program.cursorIndex と同期 (ユーザーの Program.insert/removeAt 等の編集を Executor に反映させる唯一の経路)
- MAX_ADVANCES_PER_TICK を 8 → 16 (REPEAT 開閉が advance を消費するため)

---

**経緯**: `ProgramEditorScene` を Phaser シーンとして実装するに当たり、(A) GameScene を pause する / (B) pause せず並行 active のオーバーレイ、の選択肢があった。ユーザー回答: **(B) 止めない**。

**判断**: `scene.launch('ProgramEditorScene', {ship})` で並行 active に起動。`Program` インスタンスは Ship が保持し Executor が同参照を握るため、編集 UI で `program.insert/removeAt/moveUp/...` を呼ぶたびに走行中の Ship に**ライブ反映**される。`Program` のミューテーション API はカーソル位置を「乗っているブロック」に追従させる仕様で、編集による Ship の挙動跳ねを抑える。

**理由**: 編集中も敵が攻めてくる緊張感がコア体験。Pause すると「ブロックを組む」が「ゲームを止めて設定する」に意味的に降格する。

**実装上の注意**: GameScene の scene-level `pointerdown` は editorOpen フラグで早期 return、オブジェクトレベルは ProgramEditorScene の全画面 interactive バックドロップで吸収。ESC は両シーンに届くため両方の ESC ハンドラが editorOpen をガード。

### 6.11 射撃エネルギー消費は Ship 側で持つ (Phase 4, 2026-05-16)

**経緯**: Phase 3 で「移動と射撃でエネルギーを消費する」とユーザーから明言。Phase 4 で実装する際、エネルギー判定を (A) ブロック側 (`tickAttackNearest` で `ship.energy` を見て判定) / (B) Ship 側 (`Ship.fireAt` 内で消費・判定) の選択。

**判断**: (B)。`Ship.fireAt(enemy, bullets): boolean` の冒頭で `energy < energyPerShot` なら発射せず false を返し、発射成功時に `energy -= energyPerShot`。Block 側は戻り値を見て elapsedMs は通常通り進める (= 不発でも attackDurationMs で done)。

**理由**: 「エネルギーを消費して撃つ」は Ship の能力に属する関心事。Block は「攻撃せよ」と命令するだけで十分。これにより Block 側の知識が「敵が居て撃てなければ何もしない」に閉じる。逆に Block で消費判定すると Ship 内部状態への依存が増え、新しい攻撃系 Block を増やすたびに同じ判定を書き直す羽目になる。

### 6.12 敵バリエーション: `EnemyType` を data-driven 化 (Phase 4, 2026-05-16)

**判断**: 3 種 (basic / fast / tank) を `ENEMY_TYPES: Record<EnemyType, EnemyTypeStats>` に集約。`Enemy.ts` は `type` を受け取り `ENEMY_TYPES[type]` から HP/速度/ダメージ/色/`creditsOnKill` を読む。`PHASES` を `{ enemySpecs: EnemySpec[] }` 形式に refactor、`WaveSystem` は `SpecRunner[]` で各 spec を独立タイマー駆動。

**理由**: 新しい敵種を増やすときに「config に 1 行 + PHASES の enemySpecs に entry」だけで済む構造を維持 (= ブロックの 1 ファイル 1 種原則と同様)。

**creditsValue は Enemy が持つ**: 撃破集計を `e.creditsValue` 加算に変更。Enemy 側に値があるのは、敵種が増えても GameScene が型分岐を持たないため。`ECONOMY.creditsPerKill` は default として残置 (creditsOnKill を持たない将来敵への保険)。

### 6.13 Ship Program 永続化は単一テンプレスロット (Phase 4, 2026-05-16)

**経緯**: localStorage 保存のスコープに (A) 単一テンプレスロット / (B) Ship スロットごと (1-3 番) / (C) 永続化なし、の選択肢。ユーザー回答: (A)。

**判断**: `localStorage['spacecode.shipTemplate']` に最後に編集された Program を 1 つだけ保存。新規 Ship 購入時に自動投入。schema version=1 で将来の migration 余地を確保。`sanitizeBlocks` で unsupported block を除去、try/catch で localStorage 例外を握り潰す (プライベートブラウジング等)。

**理由**: シンプル。コア体験「組まないと動かない」を維持しつつ、リトライ時の組み直し負担を解消する。複数 Ship のテンプレ管理は MVP のスコープ外。Ship 編集後の都度保存により「最後に組んだもの」が常に新規 Ship に乗る。

### 6.15 root Program は自動でループバック (Phase 5 後, 2026-05-16)

**経緯**: 「ブロックを置いただけで上から下に無限ループしてほしい」「繰り返しブロックは特定の行動を N 回繰り返したい時だけ使う」とのユーザー要望。Phase 3 までは root 末尾に到達すると `ship.stop()` で idle になり、無限ループしたい場合は **全体を REPEAT で包む** 必要があった。

**判断**: Executor の root frame が末尾に到達したら、`cursor = 0` に戻して再周回する。`Program.reset()` も呼んで Program インスタンスのカーソルを同期する。空 Program (length=0) のみ `ship.stop()` で idle 表現 (= 無限ループ防止)。サンプル `sampleBlocks()` から REPEAT 包みを撤去。

**理由**: 「ブロックを置く = 動く」が最も直感的。プレイヤーは Scratch のようなブロック並列を期待しており、`REPEAT { ... }` でループ全体を包むのは余計な認知負荷。REPEAT の役割は「特定セクションを N 回」に純化される。

**UI 反映**: 編集オーバーレイの ProgramList に「▼ ここから実行」(先頭) と「↻ 末尾まで来たら先頭に戻る (自動ループ)」(末尾) のマーカーを追加。右側に細い縦線で「末尾 → 先頭へ戻る」流れを示す。BlockPalette のヘッダに「置いた順に上から実行 → 自動でループ」のサブテキストを添え、REPEAT ボタンは「繰り返し (N 回)」表記に変更。

**実装上の注意**:
- MAX_ADVANCES_PER_TICK = 16 の上限が無限ループ暴走の最終防壁として機能する (`[DEPOSIT]` のような全 instant block 並びでも 1 tick で 16 advance に収まる)。
- `ensureRunning()` は実質 dead code 化したが、空 Program → 1 ブロック追加直後の安全網として残置。

### 6.14 惑星枯渇は MINE ブロックで blocked、60s リスポーン (Phase 4, 2026-05-16)

**経緯**: Phase 1 では枯渇時に `tickMine` は `done` (採掘完了として次へ進む) としていた。Phase 4 で「枯渇 → 60s リスポーン」を入れる際、tickMine を `blocked` に変えるか議論。

**判断**: `tickMine` は枯渇中 `{ status: 'blocked', reason: '...リスポーン中' }` を返し、次のブロックへは進まない。`Planet.update` で枯渇中タイマーを進め、`PLANET.respawnMs` (60s) 経過で `resources` を全回復し `depleted=false` へ。リスポーン後 `tickMine` は自然に `running` に戻る。

**理由**: 「採掘完了」を blocked と done で区別する意味がある。プレイヤーが組んだ `MOVE_TO planet0 → MINE → MOVE_TO base → DEPOSIT` のループにおいて、枯渇しても先頭に戻らず MINE で待機 → リスポーンで再開、という挙動はループ全体を破綻させない。動作中の Program がリスポーンを意識せずに済む。

---

## 7. 現在の実装状態スナップショット (2026-05-16, **MVP 達成**)

### 動くもの
- 5 Phase 構成の TD 通しプレイ (基地 / タワー / 敵 Wave / クレジット経済 / GameOver / Victory)
- 惑星 2 個から資源採掘 → 基地納品でクレジット変換 / 枯渇後 60s リスポーン (フラッシュ演出)
- 宇宙船購入 (ShopPanel `[宇宙船 $70]`)
- タワー追加配置 (ShopPanel `[タワー $50]` + クリック設置 + 制約チェック)
- **ブロックプログラミング 6 種完備** (`MOVE_TO`/`MINE`/`DEPOSIT`/`ATTACK_NEAREST`/`WAIT_UNTIL_FULL`/`REPEAT` ネスト)
- **ProgramEditorScene** (Ship クリックで並行 active オーバーレイ、ライブ編集)
- **敵 3 種** (basic / fast / tank) を Phase 編成に応じて並行スポーン
- **移動 + 射撃エネルギー消費** (移動 2/s、射撃 5/shot、納品で全回復)
- **Ship Program の localStorage 永続化** (リトライ・リロード後も新規 Ship に自動投入)
- **演出**: シーン遷移フェード、Menu タイトルスライドイン、Phase クリアフラッシュ、Ship 射撃マズルフラッシュ、惑星リスポーンフラッシュ、HUD バナー `Back.easeOut`
- **配色**: 全 hardcoded 色を `COLORS` 経由に統一 (将来のテーマ変更が `config.ts` 一箇所で完結)
- **README**: 遊び方・操作・推奨初手プログラム例 2 種を完備

### Phase 5 後の継続課題 (今後対応)
- 実プレイ後バランス再調整 (`docs/PROGRESS.md` バランスメモ枠の計測ポイント参照)
- バンドル分割 (Phaser dynamic import で初期ロード軽減)
- 音 (BGM / SE)
- 敵バリエーション・惑星追加・タワー初期 2 基の自由化

### 既知の制約 (実装上)
- Phaser バンドル 1.5MB (gzip 354KB)
- Preview MCP の screenshot は WebGL でハングするので使わない。`preview_console_logs level='error'` で確認。
- PowerShell 5.1 環境: `&&` 不可。Bash ツール併用 or PowerShell ネイティブ構文。

---

## 8. 引き継ぎ Claude Code セッションへの推奨手順

1. **このファイル (`docs/DESIGN.md`) を読む** ← まず思想と用語を入れる
2. **`CLAUDE.md` を読む** ← 開発コマンド・現在のステータス・コーディング規約
3. **`docs/PROGRESS.md` の最新 Phase 節を読む** ← 今どこまで来ているか
4. **`docs/plans/` 配下の現在進行中の plan ファイルを読む** ← 何をやろうとしているか
5. 該当 Phase のソースコードを読む

着手前にユーザーへ「現在 Phase X 着手中という理解で合っているか」を確認する。Phase をまたぐ大きな判断 (このドキュメント自体の更新含む) はユーザー承認を取る。

---

## 9. このドキュメントの更新ルール

- 思想・用語・過去判断が変わったら **このファイルを更新する**。
- 進捗 (どこまで動くか) は `PROGRESS.md` に書き、ここには書かない (二重管理を避ける)。
- 「Why」を残すドキュメント。「What」は他に任せる。
- 過去判断は削除せず追記する (なぜそうしなかったかの情報は将来の判断に効く)。
