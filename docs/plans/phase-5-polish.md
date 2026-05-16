# Phase 5 — 仕上げ (演出 / UI 統一 / コード整理 / README)

## Context

Phase 1-4 で MVP として通しプレイ可能な状態に到達。Phase 5 は**仕上げ**として、(a) コード整理、(b) 演出強化、(c) UI 配色・レイアウト統一、(d) README 整備に集中する。

ユーザー確認事項 (2026-05-16):
- 含める: **演出強化 / UI 統一 / README / コード整理**
- 除外: バンドル分割 / 音 (MVP 範囲外で Phase 5 でもやらない)
- 実プレイバランス再調整は Phase 5 完了後にユーザー実プレイ → PROGRESS.md バランスメモ枠を埋める → 別途数値調整、というフローで進める

Explore による事前調査で判明:
- TODO/FIXME コメント: 0 件 (整理対象は明示マーク以外)
- `DamageSystem` 集約は **見送り** (各エンティティが self-contained で読みやすい。集約すると拡張性が下がる)
- 未使用 export 候補: `config.ts` の `ENEMY` (`ENEMY_TYPES.basic` への後方互換 alias)。参照確認後に判断
- 配色 hardcoded 箇所: `Bullet.ts` / `Base.ts` / `Planet.ts` / 各 UI ファイルに `0xffffff` / `0x1a2540` / `0x223151` 等が散見

---

## 全体方針

「**MVP として動くものを丁寧に仕上げる**」。大改修・大幅な機能追加は禁止。コア体験 (ブロックがゲームの中心) を曇らせる演出も避ける (例: 派手な攻撃エフェクトで「ブロックの動作が見えにくい」になっては逆効果)。

優先順: Step 1 (整理) → Step 2 (演出) → Step 3 (UI 統一) → Step 4 (README)。

---

## Step 1 — コード整理 (最小限)

### 1.1 `config.ts` の整理
- `ENEMY` の参照箇所を grep → どこからも参照されていなければ削除。残っていれば配色定数化で対応。
- UI 共通色 (背景 / hover / 境界 / dim text) を `COLORS` に追加。例: `panelBg=0x1a2540`, `panelHover=0x223151`。
- `Planet.ts` の `0x8a6f1f` (本体色) と `0x6b551a` (模様色) を `COLORS.planetBody` / `COLORS.planetMark` に昇格。

### 1.2 配色 hardcoded → COLORS 統一
- `Bullet.ts` / `Base.ts`: `0xffffff` のハイライトは `COLORS.accent` か新規 `COLORS.highlight` に。
- UI ファイル群 (`HUD.ts` / `ShopPanel.ts` / `BlockPalette.ts` / `ProgramList.ts` / `BlockParamEditor.ts` / `ProgramEditorScene.ts`) の `0x1a2540` / `0x223151` / hex 文字色 → `COLORS.*` 参照に統一。
- これにより将来のテーマ変更が `config.ts` の `COLORS` だけで完結する。

### 1.3 未使用引数・dead code の除去
- `tsc --noEmit` で警告ゼロを確認しつつ、引数 `_` プレフィックスの整合性を確認。
- `WaveSystem` の `getRemainingMs()` / `getPhaseRemaining()` などの公開 API が使われているか確認、未使用なら削除。
- 古いコメント (例: 旧 Phase 名「Phase D Step 4」など) を「Phase 4」へ書き直す or 削除して可読性を上げる。

### 1.4 検証
- `npm run typecheck` PASS
- `npm run build` PASS

---

## Step 2 — 演出強化 (控えめ)

### 2.1 シーン遷移
- **MenuScene**: 起動時フェードイン (280ms) を追加。タイトルの軽いスケールイン。
- **GameOverScene / VictoryScene**: バナー出現を fade + slideIn (上から) に変更。`R で再挑戦` のリピート点滅をやや控えめに。

### 2.2 ゲーム内フィードバック
- **Phase 開始バナー**: 既存 `HUD.showBanner` のスケール演出を強化 (`from: 0.7` → `to: 1.05` → `1.0`、duration やや短縮)。
- **Phase クリアバナー**: クリア時に微かなフラッシュ (画面全体 alpha 0.15 で 100ms)。
- **Ship が attackTarget を取得した瞬間** (= ATTACK_NEAREST が justEntered): 短い circle 演出 (ターゲット位置に 1 フレーム円)。これだけで「狙ってる」感が出る。
- **惑星リスポーン完了**: 完了時に短い flash (resources 0 → 80 の瞬間に planet 周囲が一瞬光る)。

### 2.3 やらないこと
- パーティクル多用 (Phase の本質はブロックで Ship が動くこと。爆発エフェクトを派手にするとブロックの動作が見えにくい)
- カメラ shake 増量 (現状の敵接触 shake で十分)
- Wave 開始時のカウントダウン演出 (HUD のテキスト表示で足りる)

---

## Step 3 — UI 配色・レイアウト統一

### 3.1 フォントサイズの段階整理
現状 12/13/14/15/18/20/22/56/88px が混在。以下に統一:

- 12px → 「ラベル」「ヒント」「dim」
- 14px → 「本文」「ボタンテキスト」
- 18px → 「数値強調」(HP / クレジット)
- 22px → 「セクション見出し」(Phase / 編集ヘッダ)
- 48px → 「中央バナー」(Phase 開始 / クリア)
- 72px → 「STAGE CLEAR / GAME OVER 等の大表示」

ハードコードされた箇所を `config.ts` の `FONT_SIZES` 定数に集約する案もあるが、Phase 5 では各ファイルに直書きのままサイズ統一だけ行う (定数化は YAGNI)。

### 3.2 配色統一
Step 1 で `COLORS` に panelBg / panelHover / highlight を追加し、UI 全体で同じ値を参照させる。これにより:
- ShopPanel と編集オーバーレイのカード背景が同じ色になる
- BlockPalette の hover 色が他 UI と揃う
- BlockParamEditor のチップ選択色が ShopPanel のボタンと揃う

### 3.3 編集オーバーレイの微調整
- breadcrumb の `›` 区切りが他カラーから浮いているので uiDim 寄せ
- カードのストロークを `COLORS.ally, 0.6` から `COLORS.ally, 0.4` に薄めて軽さを出す
- 「サンプル読み込み」ボタンを accent 色 (現状は ally) に変えて区別

### 3.4 やらないこと
- 全面リデザイン (現状のレイアウト構造は MVP として通用する)
- アイコン追加 (画像アセット禁止方針なので絵文字 or Unicode のみ。これも増やしすぎない)

---

## Step 4 — README 整備

### 4.1 ステータス節を更新
- 現状「基盤層完了 / 次は Phase 1」 → 「**Phase 5 完了 / MVP 達成**」へ
- 「遊び方 (現状)」を充実

### 4.2 遊び方ガイドの追記
- ブロック編集の操作手順 (Ship クリック → 編集オーバーレイ → BlockPalette でブロック追加 → ProgramList で並び替え → BlockParamEditor でパラメータ)
- 推奨初手プログラム例 (採掘ループ + 攻撃ループの 2 案。実コードからのコピペ可)
- 敵 3 種の特徴
- エネルギーと採掘のリソース循環
- 惑星リスポーン (60s) の存在
- localStorage 永続化の挙動 (リロード後も新規 Ship が同じ Program で起動)

### 4.3 操作テーブル更新
編集オーバーレイ系の操作 (Ship クリック / ESC で閉じる / breadcrumb クリックで親スコープ / ▲▼✕ ボタン等) を追加。

### 4.4 「ライセンス」「貢献」「クレジット」は MVP のため最小限
- ライセンス未定のまま (個人プロジェクト)

---

## 触るファイル一覧

### 編集
- `src/config.ts` — `COLORS` 拡張、`ENEMY` 整理 (参照次第)
- `src/entities/Bullet.ts` / `Base.ts` / `Planet.ts` — hardcoded 色 → COLORS
- `src/ui/HUD.ts` / `ShopPanel.ts` / `BlockPalette.ts` / `ProgramList.ts` / `BlockParamEditor.ts` — 配色・フォントサイズ整理
- `src/scenes/MenuScene.ts` / `GameOverScene.ts` / `VictoryScene.ts` — シーン遷移演出
- `src/scenes/GameScene.ts` — Phase クリアフラッシュ、惑星リスポーンフラッシュ
- `src/scenes/ProgramEditorScene.ts` — カード stroke / breadcrumb の微調整
- `src/program/Executor.ts` or `Ship.ts` — ATTACK_NEAREST 入時のターゲット円演出 (どちらに置くかは実装時判断)
- `README.md` — 遊び方ガイド追記

### Phase 完了時
- `docs/PROGRESS.md` / `CLAUDE.md` / `docs/DESIGN.md`

---

## 想定リスクと対策

| リスク | 対策 |
|---|---|
| 演出を追加しすぎてフレームレート低下 | tweens は短命 + onComplete destroy で適切に解放。Phaser のオブジェクトプール検討 (やらない方針) |
| COLORS 一括変更で配色がチグハグに見える | Step ごとに typecheck + dev サーバで目視確認 |
| ATTACK_NEAREST 演出が見にくい / ブロック動作の邪魔になる | 演出時間 200ms 以内、alpha も控えめ |
| README の遊び方が冗長になる | 「最小限の操作 + 例 2 つ + 注意点」に絞る |

---

## 完了条件 (Phase 5 終了の判定)

- [ ] `npm run typecheck` / `npm run build` PASS
- [ ] hardcoded 色が `COLORS` 経由に整理されている
- [ ] フォントサイズが段階的に整理されている
- [ ] シーン遷移にフェードイン + バナー演出が入っている
- [ ] Phase クリア・惑星リスポーン・Ship 攻撃時に最小限のフィードバックがある
- [ ] README に遊び方ガイドが追記されている
- [ ] PROGRESS.md / CLAUDE.md / DESIGN.md が「Phase 5 完了、MVP 達成」状態に
- [ ] 実プレイバランス再調整は Phase 5 後の課題として PROGRESS.md バランスメモに残されている

---

## Phase 5 後の継続課題 (本 Phase では着手しない)

- 実プレイによるバランス再調整 (ユーザー作業 → 数値修正)
- バンドル分割 (Phaser dynamic import)
- 音 (BGM / SE)
- 敵バリエーション追加 / 惑星追加
- セーブの拡張 (Ship スロット別保存等)
