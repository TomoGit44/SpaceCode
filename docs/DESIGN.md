# SpaceCode — 設計思想と引き継ぎ資料

> 別 Claude Code セッションがこのプロジェクトに合流したとき、最初に読むべきファイル。
> ここには **「なぜそう作るのか」「用語の定義」「過去の重要な判断」** を残す。
> 現在のコード進捗は [`PROGRESS.md`](./PROGRESS.md)、開発手順は [`../CLAUDE.md`](../CLAUDE.md) を参照。

---

## 1. このゲームの一行説明

**プレイヤーがコードを組んで宇宙船をプログラミングし、襲来する敵から基地を守る、宇宙テーマのタワーディフェンス。**

ジャンルとしては TD だが、**プレイヤー体験のコアは「コードを組む」こと**。タワーで自動迎撃しているだけでは惑星から資源は採れず、宇宙船は動かず、難易度上昇に対応できない。

---

## 2. コア体験 (絶対に守る原則)

### 2.1 **プログラムを組まないと Ship は動かない**

これが本作の中核。

- Ship は購入しても `Program` (コード列) が割り当てられなければ **何もしない**。基地横で待機するだけ。
- 移動 (`MOVE_TO`)、採掘 (`MINE`)、納品 (`DEPOSIT`)、攻撃 (`ATTACK_NEAREST`)、すべて **コードが明示的に呼ばないと発動しない**。
- 「とりあえず採掘ループに入る」ような **内蔵 AI は存在しない**。
- プレイヤーが「コードを組んで動かす」というアクションを能動的に取ることが、ゲーム成立の必須条件。

この原則を曲げる実装は禁止 (例: 「未プログラム Ship のためのデフォルト挙動」のフォールバック等)。

### 2.2 TD レイヤは「**背景**」、コードレイヤは「**前景**」

| レイヤ | 内容 | プレイヤー操作 |
|---|---|---|
| 背景 (TD) | 敵 Wave / タワー自動迎撃 / 基地 HP / クレジット経済 | 受動的 (時間経過で進行) |
| **前景 (コード)** | **Ship のプログラム作成・編集・実行** | **能動的 (これが遊びの中心)** |

プレイヤーが何もしないと、TD は進行するが Ship は動かず、いずれ基地が落ちる。**コードを組むことが攻略**。

### 2.3 自動迎撃は基地砲塔のみ (Phase 5 後の判断)

- かつてはタワーが自動迎撃を担っていたが、Phase 5 後にタワーを廃止し **基地そのものに固定砲塔を内蔵** (§6.16)。射程リングは常時表示。
- 基地砲塔は **「基地の自動防衛装置」**、Ship は **「プレイヤーがプログラムする働き手」** という役割分離は維持。
- コードで組まない自動装置は基地砲塔 1 つだけに集約され、それ以外の能動的攻撃はすべてコードで組む。

---

## 3. 用語定義 (コード内で揺らがせない)

| 用語 | 意味 | 実装上の対応 |
|---|---|---|
| **Code** | プログラムの 1 ステップ。`MOVE_TO` / `MINE` / `DEPOSIT` / `ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT` の 6 種 (旧称「ブロック」、Phase 6 で改称) | `src/program/Code.ts` の discriminated union |
| **Program** | Code の配列 + 実行カーソル状態 | `src/program/Program.ts` |
| **Executor** | Program を 1 ティックごとに解釈し、Ship の命令的 API を呼ぶ実行器 | `src/program/Executor.ts` (`ShipBehavior` を実装) |
| **Behavior** | Ship を動かす意思決定主体の抽象。`tick(delta, ship, world)` を持つ | `src/entities/Ship.ts` の `ShipBehavior` interface |
| **Ship 命令的 API** | `moveTo` / `mineAt` / `depositAt` / `attackNearest` / `stop` — 低レベルの「目標設定」メソッド。誰がいつ呼んでもよい | `src/entities/Ship.ts` の public メソッド |
| **World** | Behavior / Executor がワールド状態を見るためのインタフェース (`base/planets/enemies/bullets/economy`) | `ShipWorld` interface |

**重要**: `Behavior` は Ship の挙動を担う抽象クラス、`Executor` はその具象実装の 1 つ。「コードを解釈する Behavior」が Executor。

---

## 4. アーキテクチャの要点 (詳細はコードを読む前提)

```
[Code] (データ)
   ↓ 並べる
[Program]  (実行カーソル付き配列)
   ↓ tick で解釈
[Executor]  implements ShipBehavior
   ↓ Ship 命令的 API を呼ぶ
[Ship]  (位置・HP・energy・inventory)
   ↑ tick ごとに 1 ステップ進行 / 命令 API 呼び出しでターゲットを更新
```

- Ship は **「目標 (`moveTarget`/`mineTarget` 等) を持ち、毎フレーム 1 ステップ進める」** 設計。命令的 API は「目標を設定するだけ」で同期的に完了しない。これにより Executor 側の「コード完了判定」が必要になる (例: `MOVE_TO` コードは Ship が到達するまで `done = false` を返し続ける)。
- Bullet は Tower と Ship で共用 (`src/entities/Bullet.ts`)。

### 拡張ポイント (1 ファイル 1 種の原則)

**コードは 1 ファイル 1 種**で `src/program/codes/` 配下に置く。新しいコードを追加するときは新規ファイルを 1 つ作るだけで完結する設計を維持する。Executor 本体や Code 型を毎回触るような構造にはしない (discriminated union は中央の Code.ts に、各 code の評価ロジックは codes/<name>.ts に分散させる)。

---

## 5. Phase 構成 (Block-first 再編後)

| Phase | 内容 | 状態 |
|---|---|---|
| **基盤層** | Boot/Menu/Game/GameOver/Victory + Base/Tower/Enemy/Bullet/Planet/Ship + Wave/Spawn/Economy + HUD/ShopPanel | ✅ 完了 (旧 A-D) |
| **Phase 1** | コード実行系 (UI なし): `Code`/`Program`/`Executor` + 3 種 (`MOVE_TO`/`MINE`/`DEPOSIT`)。`AutoMineBehavior` 削除 | ✅ 完了 |
| **Phase 2** | コード編集 UI (`ProgramEditorScene` + `CodePalette` / `ProgramList` / `CodeParamEditor`)。並行オーバーレイでライブ編集 | ✅ 完了 |
| **Phase 3** | 残り 3 コード (`ATTACK_NEAREST` / `WAIT_UNTIL_FULL` / `REPEAT`)。Executor をスタック実行モデルに刷新、Ship cooldown 撤廃 | ✅ 完了 |
| **Phase 4** | 統合と難易度調整: 射撃エネルギー消費、敵 3 種化、Program 永続化、惑星リスポーン、バランス調整 | ✅ 完了 |
| **Phase 5** | 仕上げ: 演出強化 (シーン遷移・フラッシュ・バナー)、配色統一 (COLORS 拡張)、README 整備 | ✅ 完了 (**MVP 達成**) |
| **Phase 6** | アイテムシステム: レア度 4 段階 / `Inventory` (Run 揮発) / `EffectSystem` (オムニ・コア + モジュール + 時限バフ加算スタック) / ケミカル / **アイテムコード** (ITEM_CODE = 条件 wrapper、配置真実源は Code ノード自身) / **ガチャ系統** (Phase クリア + fast/tank ドロップ + GachaOpenScene 3 候補選択) | 🔧 進行中 (Step 0-6 完了、Run リワード経路の拡張は後続) |

旧 Phase A-D の進捗詳細は `PROGRESS.md` の履歴節に保存。**旧 Phase E は新 Phase 1+2+3 に再分配された**。旧 Phase F = 新 Phase 4、旧 Phase G = 新 Phase 5。Phase 6 は MVP 達成後の拡張で、コア体験 (コードを組まないと動かない) を保ったまま **Run 中の成長要素** を載せる試み。

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

### 6.16 タワー廃止 → 基地砲塔に統合 (Phase 5 後, 2026-05-16)

**経緯**: タワー (Tower) は Phase B 以来の固定迎撃装置で、初期 2 基 + ShopPanel から自由配置できる設計だった。ユーザー要望: 「タワーを廃止して、その代わり基地から弾を撃つ機能を追加。範囲を可視化し、範囲内の敵に攻撃」。

**判断**: `Tower` クラスを削除し、その自動迎撃ロジックを `Base` に移植。`TOWER` config を `BASE_TURRET` (射程 260 / 12 ダメ / 0.8s 間隔) に置き換え、`Base.update(delta, enemies, bullets)` で最寄り敵を選定して `Bullet` を生成する。射程は基地中心からダッシュ風の薄い円で常時可視化する。ShopPanel から「タワー」ボタン、GameScene からタワー設置モード (`placingTower` / `placeGhost` / `tryPlaceTower` / `placementBlocker` / `drawPlaceGhost`) を撤去。

**理由**:
- タワーは「ブロックで組まない自動装置」というコア体験の例外で、しかも 2 つ存在することで「上下抜け」という固定の欠陥を抱えていた。1 基に集約することで盤面の意味が明快になる (中心 = 防衛拠点 / 周縁 = 宇宙船の戦域)。
- 設置モードという別 UI レイヤが消え、コア体験「ブロックを組んで Ship を動かす」だけが残る。
- 射程の可視化は「どこから先は宇宙船で守るべきか」のヒントとして機能し、プログラム設計の動機を強める。

**バランス調整**: タワー 2 基 (各 10 DPS = 計 20 DPS、射程 200) → 基地砲塔 1 基 (15 DPS、射程 260) で、火力は減るが射程は広がる。射程外を Ship で迎撃する必要性が増えるため、コア体験の比重が上がる。実プレイで難易度過剰なら `BASE_TURRET` の値を調整。

**互換性**: `Bullet` の default damage/speed を `TOWER.*` → `BASE_TURRET.*` に変更 (基地砲塔と Ship 攻撃で共用される弾)。Ship 側は `damagePerShot` / `bulletSpeed` を引数で渡しているため挙動変化なし。

### 6.15 root Program は自動でループバック (Phase 5 後, 2026-05-16)

**経緯**: 「ブロックを置いただけで上から下に無限ループしてほしい」「繰り返しブロックは特定の行動を N 回繰り返したい時だけ使う」とのユーザー要望。Phase 3 までは root 末尾に到達すると `ship.stop()` で idle になり、無限ループしたい場合は **全体を REPEAT で包む** 必要があった。

**判断**: Executor の root frame が末尾に到達したら、`cursor = 0` に戻して再周回する。`Program.reset()` も呼んで Program インスタンスのカーソルを同期する。空 Program (length=0) のみ `ship.stop()` で idle 表現 (= 無限ループ防止)。サンプル `sampleBlocks()` から REPEAT 包みを撤去。

**理由**: 「ブロックを置く = 動く」が最も直感的。プレイヤーは Scratch のようなブロック並列を期待しており、`REPEAT { ... }` でループ全体を包むのは余計な認知負荷。REPEAT の役割は「特定セクションを N 回」に純化される。

**UI 反映**: 編集オーバーレイの ProgramList に「▼ ここから実行」(先頭) と「↻ 末尾まで来たら先頭に戻る (自動ループ)」(末尾) のマーカーを追加。右側に細い縦線で「末尾 → 先頭へ戻る」流れを示す。BlockPalette のヘッダに「置いた順に上から実行 → 自動でループ」のサブテキストを添え、REPEAT ボタンは「繰り返し (N 回)」表記に変更。

**実装上の注意**:
- MAX_ADVANCES_PER_TICK = 16 の上限が無限ループ暴走の最終防壁として機能する (`[DEPOSIT]` のような全 instant block 並びでも 1 tick で 16 advance に収まる)。
- `ensureRunning()` は実質 dead code 化したが、空 Program → 1 ブロック追加直後の安全網として残置。

### 6.17 準備時間を「手動開始」制に変更 (Phase 5 後, 2026-05-17)

**経緯**: 従来は Phase 開始前の待機を `STAGE.intermissionMs` (7s) でタイマー進行していた。ユーザー要望: 「フェーズ開始前に準備時間を作る。準備時間中は宇宙船購入やプログラム編集ができる」。7s では編集の時間として短く、また自動進行だと「組み終わる前に始まる」緊張が編集体験を阻害していた。

**判断**: `WaveSystem` の `intermission` 状態を撤廃し `preparing` に統合。`preparing` はタイマー無しで `startNextPhase()` 呼び出しを待つ。HUD に「▶ PHASE N 開始」ボタンを出し、クリック or SPACE/ENTER で次 Phase に遷移する。最初の Phase 1 開始前にも同じボタンを出す。

**理由**: コア体験「ブロックを組むこと」の比重を上げる。準備時間を**プレイヤーが任意に伸ばせる**ことで、編集を中断されず腰を据えて組める。「敵が攻めてくる緊張感」は Phase 中で十分に出るため、準備時間は意図的に弛緩フェーズとする (ライブ編集自体は §6.10 で Phase 開始後も維持される)。

**トレードオフ**: 準備時間に上限が無いため、無限放置すると Phase が始まらない。MVP のシングルプレイでは問題なし。将来「上限カウントダウン併用」が必要になっても `WaveSystem` 側に optional な timer を足すだけで拡張可能。

**実装上の注意**:
- 編集オーバーレイ中は SPACE/ENTER を無効化 (`editorOpen` ガード)。編集中の誤発射防止
- 状態遷移イベント (`'state'`) は `info` の `remainingMs` を撤去。HUD/GameScene 側は `preparing` を見るだけ
- `STAGE.intermissionMs` 設定値を削除 (config から除去)

---

### 6.18 用語シフト「ブロック」→「コード」 (Phase 6 Step 0, 2026-05-22)

**経緯**: Phase 6 でアイテム配置型の Code 拡張 (条件 wrapper) を入れる前段として、Block / blocks/ という呼称を Code / codes/ に統一。

**判断**: 型名・ファイル名・変数名・UI 文字列を一括 rename。ファイル移動は `git mv` で blame を保持。`docs/DESIGN.md` §1-5 / `CLAUDE.md` / `README.md` も更新。**§6 以降の過去判断ログ本文は当時の「ブロック」呼称を残す** — 判断の文脈保存 (なぜそうしたか) を優先し、改名は表記揺れに過ぎないため履歴 fact を書き換えない。

**理由**: ITEM_CODE が「アイテムコード」として登場するため、「ブロック」とは別の語が交錯すると混乱する。コアの 1 ステップ = Code に統一することで「初期コード 6 種」「アイテムコード」「ITEM_CODE ノード」の 3 概念が同じ語幹で説明できる。

### 6.19 アイテム永続化はしない (Phase 6 Step 1, 2026-05-22)

**経緯**: アイテムシステム導入に当たり、`Inventory` を (A) localStorage 永続化 / (B) Run 毎リセット (メモリ上のみ) の選択。同時に Phase 4 で入れていた **Ship Program の localStorage 永続化 (`spacecode.shipTemplate`) を継続するか** も再検討対象になった。

**判断**: (B) Run 毎リセット。Phase 4 の Program 永続化 (`src/utils/save.ts` / `ProgramEditorScene.persist()`) も**撤廃**。Inventory / Program ともにメモリ上のみ、Game Over / Victory / Menu 復帰で新規生成。

**理由**:
- Run の境界 (Game Over / Victory) を明確にする — ローグライクに近い「1 Run = 1 セット」感を出す。Run 内の選択がそのまま結果に響く緊張感を残す
- 「最後に組んだプログラム」が常に新規 Ship に乗る挙動は、Phase 6 ではアイテム構成と組み合わさるため意味が薄れる (毎 Run でアイテムを再獲得 → 同じプログラムでも効き方が違う)
- 永続化撤廃で `save.ts` の sanitize ロジック (型安全な復元) の維持コストも消える

**トレードオフ**: F5 リロード復帰時の組み直し負担が戻ってきた。Run 全体の永続化 (中断レジューム) は Phase 6 スコープ外、必要なら別 Phase で再検討。

### 6.20 EffectSystem は加算スタック、参照は段階的に置換 (Phase 6 Step 2, 2026-05-22)

**経緯**: アイテム効果の合成方式に (A) 加算スタック (`base × (1 + Σ pct)`) / (B) 乗算スタック (`base × Π (1 + pct)`) の選択。

**判断**: (A) 加算。同じ stat に効くアイテムを 3 個積めば `base × 1.6` (×1.2 を 3 個の場合)、(B) なら `base × 1.728`。

**理由**: (B) は終盤の倍々ゲーで破綻する (Phase 5 で 5 個積むと ×2.5、攻撃力なら 1 撃で全敵を蒸発させる)。MVP に近い小規模 Run ではバランスが取りやすい (A) を採用。仕様 §6.1 と整合。

**実装上の判断**: stat 参照を `SHIP.damagePerShot` 直参照から `effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot)` 経由に置換するのは **Step 2 以降で段階的**。Step 1 では `EffectSystem` を素通し実装 (`base` をそのまま返す) にして、Step 2/3 でアイテムが効くようになったタイミングで合わせて置換する — そうしないと素通し時点で全置換しても効果が見えず検証不能。

### 6.21 モジュール装着で最大 stat が動的に変動する (Phase 6 Step 3, 2026-05-22)

**経緯**: 装甲プレート (最大 HP%) / 拡張カーゴ (積載量%) のような **maxHp / maxEnergy / inventoryCap** に効くモジュールを入れる際、(A) 倍率を read-time に掛けて「実 HP は常に `base × pct`」 / (B) max を field で持ち、装着 / 取り外し時に再計算 (現在 HP は差分回復 or clamp) の選択。

**判断**: (B)。`Ship.maxHp` / `Ship.maxEnergy` / `Ship.inventoryCap` を可変 field 化し、`Ship.applyMaxStats(effects)` で再計算。**増加時は差分ぶんを現在値に加算 (回復)、減少時は clamp** (仕様 A5)。`GameScene` が Ship 購入時 / アイテム構成変化時に呼ぶ。

**理由**:
- (A) だと「現在 HP」表示が常に倍率込みの値になり、ダメージを受けたり HP 回復を入れたときの計算が複雑化する (`hp / max` 比率を維持する必要)
- (B) なら「現在 HP は普通のフィールド、最大値だけが動く」という直感的なモデル。装甲プレートを装着したら HP が「ぴったり差分ぶん回復する」演出も自然
- ケミカル `heal(amount)` / 接触ダメージ等が `maxHp` を意識せず純粋な加減算で済む

**Ship 破壊時のモジュール返却は GameScene 側**: Ship/Inventory のどちらにも相互参照を持たせず、GameScene が「Ship 破壊検知 → `shipModules[shipId]` を `items` に戻す → `delete shipModules[shipId]`」を仲介 (B3)。

### 6.22 アイテムコード配置の真実源 = プログラム内 ITEM_CODE ノード (Phase 6 Step 5, 2026-05-22)

**経緯**: アイテムコード (`IF_HP_BELOW` 等) は所持アイテム個体 (`CodeItemInstance`) と 1:1 対応し、プログラムに配置すると 1 個「使用中」になる。残数管理を (A) `CodeItemInstance` に `placed: boolean` フラグを持つ / (B) プログラム内の `ITEM_CODE` ノード (`itemUid`) を**真実源**として全 Ship 走査で算出、の選択。

**判断**: (B) 真実源 = プログラム内ノード。`CodeItemInstance` 側に配置フラグを持たない。`src/items/codePlacement.ts` の `collectPlacedCodeUids(programs)` で全 Ship のプログラムを再帰走査し、配置済み `itemUid` の Set を構築 → `availableCodeCounts` で type 別残数を算出。

**理由**:
- **Ship 破壊・wrapper コード削除のいずれでも、ノードが消えれば走査結果から自動的に外れる** → アイテムが「未使用」に戻る。明示的な解放処理 (B5) が一切不要
- (A) だと Ship 破壊時に「装着モジュールは返却 / 配置アイテムコードはフラグを戻す」の 2 経路が必要になる。整合性バグの温床
- 走査コストは Ship 数 × プログラムサイズに比例するが、MVP 規模では 1 フレームに 1 度走らせても無視できる

**設計上の含意**:
- **wrapper の意味**: ITEM_CODE は条件成立時に子コードを **1 周だけ実行**。REPEAT が「N 回」「root 末尾で自動ループ」とは意味論的に異なる
- **同じアイテムを複数箇所に配置不可**: `itemUid` は 1 個体 1 配置 (Set で保証)。複数欲しければ「同種を複数所持」する必要がある
- `Code.ts` に `codeChildren(code)` ヘルパを追加し、REPEAT / ITEM_CODE の子配列取得を統一 (走査ロジックが wrapper 種別を意識しなくて済む)

### 6.24 ガチャは「未配線実装」→「Run リワード経路」として配線 (Phase 6 Step 6, 2026-05-23)

**経緯**: `src/items/gacha.ts` は Step 1 着手前に抽選ロジック (`drawGacha(category, gachaRarity)` で 3 候補返却、保証スロット 1 + 重み付き 2 をシャッフル) だけ実装されていたが、Step 0-5 完了時点で**どこからも import されていない**死体コード状態だった。Step 6 でこれを実用化する。

**判断**:
- **入手経路は 2 つに分散** — (a) Phase クリアごとに 1 個保証 (`phaseRewardCategory`: 奇数=code/偶数=module 交互、`rollPhaseRewardRarity`: R 55% / SR 30% / L 15%)、(b) fast/tank 撃破時に低確率ドロップ (fast 4% / tank 12%、R 固定、カテゴリ 50/50)
- **開封 UI は専用シーン** `GachaOpenScene` を新設。`ItemInventoryScene` 内のモーダル層ではなく独立シーンとして分離 — 3 候補カードのアニメーション (stagger フェード + `Back.easeOut`) と選択 UX を独立して持つため
- **キャンセル時はガチャを消費しない**: ESC / バックドロップ / 「やめる」では `consumed=false` のまま閉じる → ガチャ個体はインベントリに残る。誤クリック保護 (候補は再開封ごとに毎回 `drawGacha` で再抽選される)

**理由**:
- (a) 毎クリア報酬で「進行感」、(b) ドロップで「ログライク要素」を両立。Phase 番号でカテゴリを決め打ちすることで、5 Phase 通しで code 3 / module 2 が確定的に取れ、両系統のアイテムが揃う
- basic からドロップさせない理由: 全敵対象だとドロップ頻度が上がりすぎて、ガチャの希少性 (「fast/tank を倒すモチベ」) が壊れる。MVP では fast/tank だけに限定して保守的に
- GachaOpenScene を独立シーンにしたのは: `ItemInventoryScene` 内でモーダル UI を組み上げると行数が増えすぎ、また「カードアニメーション」は別シーンの方が render 切り分けがしやすい
- レア度抽選で N が出ない理由: `gacha.ts` の `GACHA_RARITIES = ['R', 'SR', 'L']` 定義どおり (ガチャは R 以上保証)。Phase クリア報酬も同じ重みテーブル系列を採用

**実装上の判断**:
- **`GameScene.overlayDepth` は GachaOpenScene では触らない**: 親 (ItemInventoryScene) が既に +1 しているため、孫オーバーレイは入力遮断をバックドロップに任せて、親の `onClosed` コールバックで再描画 + `onChanged` を促す方式に
- **`gacha.ts` の `RARITY_WEIGHT` (R25/SR12/L3) と Phase 報酬用の重み (R55/SR30/L15) は別テーブル**: ガチャ内部の保証外スロットには N も入りうる (`RARITY_WEIGHT.N=60`) ため、用途が違う。Phase 報酬は「N の引き目」を排除したいので別重み

**トレードオフ**:
- Phase 5 クリア時点 (Stage クリア = VictoryScene) でガチャを使う前に終わる可能性がある (現状は Stage 単位 = 1 Run のため、未使用ガチャは Inventory リセットで消える)。気になれば後続で「Run リワードを VictoryScene で開封させる」などの導線追加が可能
- 候補抽選は再開封のたびに走るため、L 候補を引いた状態でキャンセルしても次回は別候補。プレイヤーから見ると「リロール」しているように見える (意図通り)

### 6.23 オーバーレイ排他を `overlayDepth` カウンタに一般化 (Phase 6 Step 2, 2026-05-22)

**経緯**: Phase 2 で導入した `editorOpen: boolean` は ProgramEditorScene 単独前提だった。Phase 6 で `ItemInventoryScene` が並ぶようになり、両方が独立に開閉する状況で boolean では不足。

**判断**: `GameScene.overlayDepth: number` カウンタに置換。各オーバーレイの起動で `++`、SHUTDOWN で `--`。「最低 1 つでも開いていれば GameScene の pointerdown / SPACE startNextPhase をブロック」というガードロジックは `overlayDepth > 0` で表現。

**理由**: 多重起動 (ProgramEditor を開いた状態で ItemInventory も開く、あるいは将来の追加オーバーレイ) を許容しつつ、ガード判定はシンプルに維持できる。boolean 1 つを各オーバーレイが独立に立て下げると競合する。

---

### 6.14 惑星枯渇は MINE ブロックで blocked、60s リスポーン (Phase 4, 2026-05-16)

**経緯**: Phase 1 では枯渇時に `tickMine` は `done` (採掘完了として次へ進む) としていた。Phase 4 で「枯渇 → 60s リスポーン」を入れる際、tickMine を `blocked` に変えるか議論。

**判断**: `tickMine` は枯渇中 `{ status: 'blocked', reason: '...リスポーン中' }` を返し、次のブロックへは進まない。`Planet.update` で枯渇中タイマーを進め、`PLANET.respawnMs` (60s) 経過で `resources` を全回復し `depleted=false` へ。リスポーン後 `tickMine` は自然に `running` に戻る。

**理由**: 「採掘完了」を blocked と done で区別する意味がある。プレイヤーが組んだ `MOVE_TO planet0 → MINE → MOVE_TO base → DEPOSIT` のループにおいて、枯渇しても先頭に戻らず MINE で待機 → リスポーンで再開、という挙動はループ全体を破綻させない。動作中の Program がリスポーンを意識せずに済む。

---

## 7. 現在の実装状態スナップショット (2026-05-23, MVP 達成 + Phase 6 Step 0-6 完了)

### 動くもの (MVP コア体験)
- 5 Phase 構成の TD 通しプレイ (基地砲塔 / 敵 Wave / クレジット経済 / GameOver / Victory)
- **準備時間は手動開始制** (Phase 5 後): プレイヤーが「▶ PHASE N 開始」ボタンを押すまで進まない
- 惑星 2 個から資源採掘 → 基地納品でクレジット変換 / 枯渇後 60s リスポーン (フラッシュ演出)
- 宇宙船購入 (ShopPanel `[宇宙船 $70]`)。**タワーは廃止**、基地中心の砲塔 1 基 (射程 260) に統合
- **コードプログラミング 7 種完備** (`MOVE_TO`/`MINE`/`DEPOSIT`/`ATTACK_NEAREST`/`WAIT_UNTIL_FULL`/`REPEAT` ネスト/`ITEM_CODE` 条件 wrapper)
- **ProgramEditorScene** (Ship クリックで並行 active オーバーレイ、ライブ編集、インライン階層編集)
- **敵 3 種** (basic / fast / tank) を Phase 編成に応じて並行スポーン
- **移動 + 射撃エネルギー消費** (移動 2/s、射撃 5/shot、納品で全回復)
- **root Program は自動ループバック** (Phase 5 後): 置いただけで上→下→先頭の無限ループ
- **演出**: シーン遷移フェード、Menu タイトルスライドイン、Phase クリアフラッシュ、Ship 射撃マズルフラッシュ、惑星リスポーンフラッシュ、HUD バナー `Back.easeOut`
- **配色**: 全 hardcoded 色を `COLORS` 経由に統一 (将来のテーマ変更が `config.ts` 一箇所で完結)
- **README**: 遊び方・操作・推奨初手プログラム例 2 種を完備

### 動くもの (Phase 6 拡張: アイテムシステム)
- **`Inventory` + `EffectSystem`**: Run 揮発 (localStorage 永続化なし、Game Over で reset)
- **オムニ・コア 6 種** (攻撃 / 推進 / 採掘 / 装甲 / 砲塔 / 賞金): 全 Ship / 基地 / 経済の stat を加算スタックで補正
- **モジュール 5 種** (ガトリング / 装甲プレート / 補助スラスタ / 強化ドリル / 拡張カーゴ): Ship 個別装着、`maxHp` / `maxEnergy` / `inventoryCap` も動的変動 (`applyMaxStats` 経由)
- **ケミカル 6 種** (即時系 4 + 時限バフ + AoE): `ItemInventoryScene` から使用フロー
- **アイテムコード 3 種** (IF_HP_BELOW / IF_ENEMY_IN_RANGE / IF_INVENTORY_FULL): 条件 wrapper、配置の真実源はプログラム内 ITEM_CODE ノード
- **`ItemInventoryScene`**: 右端「📦 アイテム」ボタンから並行 active オーバーレイ。カテゴリタブ + 所持一覧 + 詳細 + 装着/使用フロー
- **ガチャ系統 (Step 6)**: Phase クリアごとに 1 個保証 (code/module 交互 + 重み付きレア度 R55/SR30/L15) + fast 4% / tank 12% で R ガチャドロップ。`GachaOpenScene` で 3 候補カード提示 → 選択 → Inventory に追加
- **デバッグ用ガチャ獲得ボタン**: ItemInventoryScene の各カテゴリで N/R/SR/L のランダム個体を即時付与

### Phase 6 残作業 (Step 6 完了後)
- Run リワード経路の拡張 (ボス的な敵 / Wave 中間ドロップ等)
- ProgramEditorScene 内モジュール表示 (仕様 §7.4) — ItemInventoryScene で完結するため保留
- 実プレイ後バランス調整 (ガチャ排出重み・敵ドロップ率・アイテム効果値)

### MVP 達成後の継続課題 (Phase 6 と独立)
- 実プレイ後バランス再調整 (`docs/PROGRESS.md` バランスメモ枠の計測ポイント参照)。Phase 6 アイテム導入後の再計測必要
- バンドル分割 (Phaser dynamic import で初期ロード軽減)
- 音 (BGM / SE)
- 敵バリエーション・惑星追加

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
