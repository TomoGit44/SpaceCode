import { COLORS } from '../config';

/**
 * Phase 6 アイテムシステムのデータモデル (枠)。
 *
 * 具体的なアイテム個体 (名称・効果値) は別途設計する。本ファイルは型と
 * 共通テーブルのみを定義する。
 */

/** アイテムのレア度 (4 段階)。 */
export type Rarity = 'N' | 'R' | 'SR' | 'L';

export const ALL_RARITIES: ReadonlyArray<Rarity> = ['N', 'R', 'SR', 'L'];

/** UI 表示用のレア度ラベル。 */
export const RARITY_LABEL: Record<Rarity, string> = {
  N: 'ノーマル',
  R: 'レア',
  SR: 'スーパーレア',
  L: 'レジェンド',
};

/** レア度の短縮表記 (枠取り等)。 */
export const RARITY_SHORT: Record<Rarity, string> = {
  N: 'N',
  R: 'R',
  SR: 'SR',
  L: 'L',
};

/** レア度ごとの UI 色 (config.COLORS から)。 */
export const RARITY_COLOR: Record<Rarity, number> = {
  N: COLORS.rarityN,
  R: COLORS.rarityR,
  SR: COLORS.raritySR,
  L: COLORS.rarityL,
};

/**
 * アイテムカテゴリ (6 カテゴリ)。
 * コードアイテムは「プログラムへの配置」概念がアイテム装備と異質なため、
 * このカテゴリとは独立した CodeItemInstance として扱う (仕様 §8.1)。
 */
export type ItemCategory =
  | 'omniCore'
  | 'module'
  | 'chemical'
  | 'codeGacha'
  | 'moduleGacha';

/** 装着アイテムが強化しうる Ship stat。 */
export type ShipStat =
  | 'damagePerShot'
  | 'moveSpeed'
  | 'maxHp'
  | 'maxEnergy'
  | 'mineRate'
  | 'inventoryCap';

/** 装着アイテムが強化しうる基地 stat。 */
export type BaseStat =
  | 'maxHp'
  | 'turretRange'
  | 'turretDamage'
  | 'turretInterval';

/** 装着アイテムが変動させうる経済 stat。 */
export type EconomyStat =
  | 'creditsPerKill'
  | 'resourceToCredit'
  | 'phaseClearBonus';

/**
 * ランタイムのアイテム個体 (オムニ・コア / モジュール / ケミカル / ガチャ)。
 * コードアイテムは CodeItemInstance を使う。
 */
export interface ItemInstance {
  readonly uid: string;
  readonly typeId: string;
  readonly rarity: Rarity;
}

/**
 * コードアイテム個体。**所持のみ** を表し、配置情報は持たない。
 * 「どこに配置されたか」の真実源はプログラム内の ITEM_CODE ノード (仕様 §8.4)。
 */
export interface CodeItemInstance {
  readonly uid: string;
  readonly codeType: string; // Step 5 で ITEM_CODE 種別に絞り込む
  readonly rarity: Rarity;
}
