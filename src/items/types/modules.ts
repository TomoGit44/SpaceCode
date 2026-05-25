import type { Rarity, ShipStat, ItemInstance } from '../itemTypes';

/**
 * モジュール — 宇宙船に装備するアイテム (仕様 §6.3)。
 *
 * data-driven: 新モジュールは `MODULE_TYPES` に 1 エントリ追加するだけ。
 * 効果は複数持てる (例: ガトリング = 連射↑ + 攻撃力↓ のトレードオフ)。
 *
 * - 各 Ship に好きなだけ装着可能 (スロット上限なし)。同種は加算スタック。
 * - モジュール個体は 1 つの Ship にしか装着できない (排他)。
 * - 装着先は `Inventory.shipModules[ship.id]` が uid 配列で保持する。
 */

/**
 * モジュール効果が触れる stat。
 *  - `extraShots`: ATTACK_NEAREST 1 回ぶんの追加弾数 (整数加算、config に base を持たない)
 *  - `contactDps`: 2026-05-25 追加。装着 Ship が敵接触中に与える DPS (config に base 0)
 */
export type ModuleStatTarget = ShipStat | 'extraShots' | 'contactDps';

export interface ModuleEffect {
  readonly stat: ModuleStatTarget;
  /** percent: 対象 stat に加算割合 (omni-core と合算) / flat: 整数加算 (extraShots 用)。 */
  readonly kind: 'percent' | 'flat';
  readonly rarityValue: Record<Rarity, number>;
}

export interface ModuleType {
  readonly id: string;
  readonly nameJa: string;
  readonly descJa: string;
  readonly effects: ReadonlyArray<ModuleEffect>;
}

/** stat ラベル (UI 表示用)。 */
export const MODULE_STAT_LABEL: Record<ModuleStatTarget, string> = {
  damagePerShot: '攻撃力',
  moveSpeed: '移動速度',
  maxHp: '最大HP',
  maxEnergy: '最大エネルギー',
  mineRate: '採掘速度',
  inventoryCap: '積載量',
  extraShots: '連射',
  contactDps: '体当たり威力',
  energyConsume: 'エネルギー消費',
};

const PCT = (n: Record<Rarity, number>): Record<Rarity, number> => n;

export const MODULE_TYPES: Record<string, ModuleType> = {
  mod_gatling: {
    id: 'mod_gatling',
    nameJa: 'ガトリング砲',
    descJa: '1 射あたりの弾数を増やすが、1 発の威力は下がる',
    effects: [
      { stat: 'extraShots', kind: 'flat', rarityValue: { N: 2, R: 3, SR: 4, L: 6 } },
      { stat: 'damagePerShot', kind: 'percent', rarityValue: PCT({ N: -0.45, R: -0.42, SR: -0.4, L: -0.35 }) },
    ],
  },
  mod_armor: {
    id: 'mod_armor',
    nameJa: '装甲プレート',
    descJa: '最大 HP を上げる',
    effects: [
      { stat: 'maxHp', kind: 'percent', rarityValue: PCT({ N: 0.25, R: 0.4, SR: 0.6, L: 1.0 }) },
    ],
  },
  mod_thruster: {
    id: 'mod_thruster',
    nameJa: '補助スラスタ',
    descJa: '移動速度を上げる',
    effects: [
      { stat: 'moveSpeed', kind: 'percent', rarityValue: PCT({ N: 0.2, R: 0.35, SR: 0.5, L: 0.8 }) },
    ],
  },
  mod_drill: {
    id: 'mod_drill',
    nameJa: '強化ドリル',
    descJa: '採掘速度を大きく上げるが、移動が少し遅くなる',
    effects: [
      { stat: 'mineRate', kind: 'percent', rarityValue: PCT({ N: 0.4, R: 0.6, SR: 0.9, L: 1.4 }) },
      { stat: 'moveSpeed', kind: 'percent', rarityValue: PCT({ N: -0.15, R: -0.13, SR: -0.1, L: -0.08 }) },
    ],
  },
  mod_cargo: {
    id: 'mod_cargo',
    nameJa: '拡張カーゴ',
    descJa: '積載量を増やす',
    effects: [
      { stat: 'inventoryCap', kind: 'percent', rarityValue: PCT({ N: 0.3, R: 0.5, SR: 0.8, L: 1.2 }) },
    ],
  },
  // 2026-05-25 追加: 体当たり攻撃。装着すると敵接触中ずっと DPS でダメージを与える。
  // 引き換えに移動速度がやや遅くなる (突っ込み戦法と整合)。
  mod_ram: {
    id: 'mod_ram',
    nameJa: '衝角ブレード',
    descJa: '体当たりで敵にダメージを与える。引き換えに移動速度が少し遅くなる',
    effects: [
      { stat: 'contactDps', kind: 'flat',    rarityValue: { N: 8, R: 14, SR: 22, L: 35 } },
      { stat: 'moveSpeed',  kind: 'percent', rarityValue: PCT({ N: -0.12, R: -0.10, SR: -0.08, L: -0.05 }) },
    ],
  },
};

export const ALL_MODULE_IDS: ReadonlyArray<string> = Object.keys(MODULE_TYPES);

/** typeId がモジュールか。 */
export function isModule(typeId: string): boolean {
  return typeId in MODULE_TYPES;
}

/** モジュール 1 効果の表示文字列 (例: "攻撃力 -40%" / "連射 +4")。 */
function effectText(stat: ModuleStatTarget, kind: 'percent' | 'flat', value: number): string {
  const label = MODULE_STAT_LABEL[stat];
  if (kind === 'percent') {
    const pct = Math.round(value * 100);
    return `${label} ${pct >= 0 ? '+' : ''}${pct}%`;
  }
  return `${label} ${value >= 0 ? '+' : ''}${value}`;
}

/** モジュールの全効果をまとめた表示文字列。 */
export function moduleEffectText(typeId: string, rarity: Rarity): string {
  const mt = MODULE_TYPES[typeId];
  if (!mt) return '';
  return mt.effects
    .map((e) => effectText(e.stat, e.kind, e.rarityValue[rarity]))
    .join('  /  ');
}

/** デバッグ用: 指定レア度のモジュールをランダムに 1 個生成する。 */
export function makeRandomModule(rarity: Rarity): ItemInstance {
  const typeId = ALL_MODULE_IDS[Math.floor(Math.random() * ALL_MODULE_IDS.length)]!;
  return { uid: crypto.randomUUID(), typeId, rarity };
}
