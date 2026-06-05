/**
 * SpaceCode UI レイアウトグリッド (M-1, 2026-06-06)。
 *
 * 4px ベースのグリッドユニット。これまで `top + 14` `top + 38` のような
 * px ハードコードが散見していたが、`top + grid(3)` `top + grid(9)` の形に
 * 揃えることでレイアウト調整が一元化される。
 *
 * design system の "Base unit 4px. Most spacing is 4 / 8 / 12 / 16 / 24 / 32"
 * (`SKILL.md` 既述) に対応。
 */

const UNIT = 4;

/** n グリッドぶんの px 値 (n * 4)。 */
export const grid = (n: number): number => n * UNIT;

/** 代表的なスペーシング定数 (named constant)。 */
export const SPACING = {
  xs: grid(1),   // 4
  sm: grid(2),   // 8
  md: grid(3),   // 12
  lg: grid(4),   // 16
  xl: grid(6),   // 24
  xxl: grid(8),  // 32
} as const;
