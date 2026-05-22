import type { Rarity, ShipStat, ItemInstance } from '../itemTypes';

/**
 * ケミカル — 使用すると消費される一時効果アイテム (仕様 §6.4)。
 *
 * data-driven: 新ケミカルは `CHEMICAL_TYPES` に 1 エントリ追加するだけ。
 * 効果の実適用は GameScene.applyChemical が kind で振り分ける。
 */

export type ChemicalKind =
  | 'baseHeal' // 基地 HP を回復
  | 'shipHeal' // 全宇宙船の HP を回復
  | 'shipRefuel' // 全宇宙船のエネルギーを全回復
  | 'credits' // クレジット獲得
  | 'timedAttack' // 全宇宙船の攻撃力を時限バフ
  | 'aoeDamage'; // 基地中心の範囲ダメージ

export interface ChemicalType {
  readonly id: string;
  readonly nameJa: string;
  readonly descJa: string;
  readonly kind: ChemicalKind;
  /** kind ごとに意味が変わる (HP量 / クレジット / バフ割合 / ダメージ)。 */
  readonly rarityValue: Record<Rarity, number>;
  readonly durationMs?: number; // timed 用
  readonly radius?: number; // aoe 用
  readonly buffStat?: ShipStat; // timedAttack が対象とする stat
}

const ZERO: Record<Rarity, number> = { N: 0, R: 0, SR: 0, L: 0 };

export const CHEMICAL_TYPES: Record<string, ChemicalType> = {
  chem_repair: {
    id: 'chem_repair',
    nameJa: '基地修理キット',
    descJa: '基地の HP を即座に回復する',
    kind: 'baseHeal',
    rarityValue: { N: 25, R: 40, SR: 60, L: 100 },
  },
  chem_shipheal: {
    id: 'chem_shipheal',
    nameJa: '船団リペアパック',
    descJa: '全宇宙船の HP を即座に回復する',
    kind: 'shipHeal',
    rarityValue: { N: 15, R: 25, SR: 40, L: 60 },
  },
  chem_refuel: {
    id: 'chem_refuel',
    nameJa: 'エネルギーセル',
    descJa: '全宇宙船のエネルギーを全回復する',
    kind: 'shipRefuel',
    rarityValue: ZERO,
  },
  chem_credits: {
    id: 'chem_credits',
    nameJa: 'クレジットチップ',
    descJa: 'クレジットを即座に獲得する',
    kind: 'credits',
    rarityValue: { N: 50, R: 100, SR: 180, L: 350 },
  },
  chem_overdrive: {
    id: 'chem_overdrive',
    nameJa: 'オーバードライブ',
    descJa: '一定時間、全宇宙船の攻撃力を大きく上げる',
    kind: 'timedAttack',
    rarityValue: { N: 0.5, R: 0.8, SR: 1.2, L: 2.0 },
    durationMs: 20000,
    buffStat: 'damagePerShot',
  },
  chem_shockwave: {
    id: 'chem_shockwave',
    nameJa: '衝撃波ジェネレータ',
    descJa: '基地を中心とした範囲の敵にダメージを与える',
    kind: 'aoeDamage',
    rarityValue: { N: 20, R: 40, SR: 70, L: 140 },
    radius: 320,
  },
};

export const ALL_CHEMICAL_IDS: ReadonlyArray<string> = Object.keys(CHEMICAL_TYPES);

/** typeId がケミカルか。 */
export function isChemical(typeId: string): boolean {
  return typeId in CHEMICAL_TYPES;
}

/** ケミカル効果の表示文字列。 */
export function chemicalEffectText(typeId: string, rarity: Rarity): string {
  const c = CHEMICAL_TYPES[typeId];
  if (!c) return '';
  const v = c.rarityValue[rarity];
  switch (c.kind) {
    case 'baseHeal':
      return `基地 HP を ${v} 回復`;
    case 'shipHeal':
      return `全宇宙船の HP を ${v} 回復`;
    case 'shipRefuel':
      return '全宇宙船のエネルギーを全回復';
    case 'credits':
      return `クレジットを ${v} 獲得`;
    case 'timedAttack':
      return `${Math.round((c.durationMs ?? 0) / 1000)} 秒間 全宇宙船の攻撃力 +${Math.round(v * 100)}%`;
    case 'aoeDamage':
      return `基地周囲 (半径 ${c.radius}) の敵に ${v} ダメージ`;
  }
}

/** デバッグ用: 指定レア度のケミカルをランダムに 1 個生成する。 */
export function makeRandomChemical(rarity: Rarity): ItemInstance {
  const typeId = ALL_CHEMICAL_IDS[Math.floor(Math.random() * ALL_CHEMICAL_IDS.length)]!;
  return { uid: crypto.randomUUID(), typeId, rarity };
}
