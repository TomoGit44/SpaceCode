/**
 * SpaceCode UI フォントスケール (M-1, 2026-06-06)。
 *
 * design system の type scale (9 段階) に統一する。これまで 10/11/12/13/14/15/16/18/20/22/56/88 と
 * 11 段階に細分化されていたものを、以下の 9 段階に集約:
 *
 *   display 88px / banner 56px / h1 22px / h2 20px / h3 18px / body 14px /
 *   meta 13px / caption 12px / micro 11px
 *
 * 廃止サイズ: 10 → 11 / 15 → 14 / 16 → 14
 *
 * 命名規則: 「label dim / value bold」のリズムを守る。label は `body`/`meta`
 * + uiDim 色 / value は同サイズ以上 + bold + ui または accent。
 */

/** Phaser Text style の `fontFamily` 既定値 (game canvas と design system の文字列)。 */
export const FONT = 'system-ui, "Segoe UI", sans-serif';

/** フォントサイズ (px 文字列、Text style.fontSize へ直接渡す)。 */
export const TYPE = {
  display: '88px',  // MenuScene タイトル "SpaceCode"
  banner: '56px',   // HUD 中央バナー
  h1: '22px',       // MenuScene サブタイトル, GameOver/Victory リトライ
  h2: '20px',       // HUD Phase 値, Credits 値, GachaOpen タイトル
  h3: '18px',       // HUD HP 値, Inventory アイテム名
  body: '14px',     // ボタン, 行ラベル, コードラベル (現状 14/15/16 を統合)
  meta: '13px',     // ヘッダー, hint, status
  caption: '12px',  // label, marker
  micro: '11px',    // 装着バッジ, count
} as const;

export type TypeKey = keyof typeof TYPE;
