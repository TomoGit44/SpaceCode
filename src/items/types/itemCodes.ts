import type { Rarity, CodeItemInstance } from '../itemTypes';
import type { Code } from '../../program/Code';

/**
 * アイテムコード — プログラムに配置する有限のコード (仕様 §2)。
 *
 * 初期コード 6 種 (MOVE_TO 等) と異なり、所持アイテム個体 (CodeItemInstance) と
 * 1:1 対応する。プログラムに配置すると 1 個「使用中」になる。
 *
 * Step 5 のアイテムコードはすべて **条件 wrapper** (§2.5): 子コード列を持ち、
 * 条件成立時のみ中身を 1 周実行する。
 */

export type ItemCodeType = 'IF_HP_BELOW' | 'IF_ENEMY_IN_RANGE' | 'IF_INVENTORY_FULL';

/** パラメータ 1 個の仕様。レア度で取りうる最大値が変わる (§2.4)。 */
export interface ItemCodeParamSpec {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  /** レア度ごとの最大値。 */
  readonly rarityMax: Record<Rarity, number>;
  readonly fallbackDefault: number;
  readonly step: number;
  readonly unit: string;
}

export interface ItemCodeDef {
  readonly id: ItemCodeType;
  readonly nameJa: string;
  readonly descJa: string;
  /** wrapper (子コードを条件付き実行) か。Step 5 は全て true。 */
  readonly isWrapper: boolean;
  readonly params: ReadonlyArray<ItemCodeParamSpec>;
}

export const ITEM_CODE_DEFS: Record<ItemCodeType, ItemCodeDef> = {
  IF_HP_BELOW: {
    id: 'IF_HP_BELOW',
    nameJa: 'もし HP が低ければ',
    descJa: 'HP が指定% 以下のとき、中のコードを 1 周実行する',
    isWrapper: true,
    params: [
      {
        key: 'hpPercent',
        label: 'HP しきい値',
        min: 5,
        rarityMax: { N: 30, R: 50, SR: 80, L: 100 },
        fallbackDefault: 30,
        step: 5,
        unit: '%',
      },
    ],
  },
  IF_ENEMY_IN_RANGE: {
    id: 'IF_ENEMY_IN_RANGE',
    nameJa: 'もし敵が近ければ',
    descJa: '指定距離内に敵がいるとき、中のコードを 1 周実行する',
    isWrapper: true,
    params: [
      {
        key: 'range',
        label: '索敵距離',
        min: 80,
        rarityMax: { N: 200, R: 300, SR: 420, L: 560 },
        fallbackDefault: 200,
        step: 20,
        unit: 'px',
      },
    ],
  },
  IF_INVENTORY_FULL: {
    id: 'IF_INVENTORY_FULL',
    nameJa: 'もし満タンなら',
    descJa: 'インベントリが満タンのとき、中のコードを 1 周実行する',
    isWrapper: true,
    params: [],
  },
};

export const ALL_ITEM_CODE_TYPES: ReadonlyArray<ItemCodeType> = Object.keys(
  ITEM_CODE_DEFS
) as ItemCodeType[];

export function isItemCodeType(t: string): t is ItemCodeType {
  return t in ITEM_CODE_DEFS;
}

/** レア度に応じた既定パラメータ (fallbackDefault を rarityMax で clamp)。 */
export function defaultItemCodeParams(type: ItemCodeType, rarity: Rarity): Record<string, number> {
  const params: Record<string, number> = {};
  for (const p of ITEM_CODE_DEFS[type].params) {
    params[p.key] = Math.min(Math.max(p.fallbackDefault, p.min), p.rarityMax[rarity]);
  }
  return params;
}

/** CodeItemInstance から配置用の ITEM_CODE ノードを生成する。 */
export function createItemCodeNode(inst: CodeItemInstance): Code {
  const type = inst.codeType as ItemCodeType;
  return {
    type: 'ITEM_CODE',
    itemUid: inst.uid,
    itemCodeType: type,
    rarity: inst.rarity,
    params: defaultItemCodeParams(type, inst.rarity),
    children: [],
  };
}

/** ITEM_CODE ノードのリスト表示ラベル (例: 「もし HP が低ければ (30%)」)。 */
export function itemCodeLabel(node: Extract<Code, { type: 'ITEM_CODE' }>): string {
  const def = ITEM_CODE_DEFS[node.itemCodeType];
  if (!def) return 'アイテムコード';
  const first = def.params[0];
  if (first) {
    const v = node.params[first.key];
    if (v !== undefined) return `${def.nameJa} (${v}${first.unit})`;
  }
  return def.nameJa;
}

/** デバッグ用: 指定レア度のアイテムコードをランダムに 1 個生成する。 */
export function makeRandomItemCode(rarity: Rarity): CodeItemInstance {
  const type = ALL_ITEM_CODE_TYPES[Math.floor(Math.random() * ALL_ITEM_CODE_TYPES.length)]!;
  return { uid: crypto.randomUUID(), codeType: type, rarity };
}
