import type { Rarity, ShipStat, ItemInstance } from '../itemTypes';

/**
 * モジュール — 宇宙船に装備するアイテム (仕様 §6.3)。
 *
 * data-driven: 新モジュールは `MODULE_TYPES` に 1 エントリ追加するだけ。
 * 効果は複数持てる (例: ガトリング = 連射↑ + 攻撃力↓ のトレードオフ)。
 *
 * 2026-05-28: 固定レア度制を導入。各モジュールは 1 つの `rarity` を持ち、
 * その rarity でしかガチャ排出されない。`rarityValue: Record<Rarity, number>` は
 * 廃止し、単一の `value` を持つ。
 *
 * - 各 Ship に好きなだけ装着可能 (スロット上限なし)。同種は加算スタック。
 * - モジュール個体は 1 つの Ship にしか装着できない (排他)。
 * - 装着先は `Inventory.shipModules[ship.id]` が uid 配列で保持する。
 */

/**
 * モジュール効果が触れる stat。
 *  - `extraShots`: ATTACK_NEAREST 1 回ぶんの追加弾数 (整数加算、config に base を持たない)
 *  - `contactDps`: 装着 Ship が敵接触中に与える DPS (config に base 0)
 *  - `bombDamage`: ATTACK_NEAREST 1 回ぶんで追加発射されるボム弾の威力 (config に base 0)
 */
export type ModuleStatTarget = ShipStat | 'extraShots' | 'contactDps' | 'bombDamage';

export interface ModuleEffect {
  readonly stat: ModuleStatTarget;
  /** percent: 対象 stat に加算割合 (omni-core と合算) / flat: 整数加算。 */
  readonly kind: 'percent' | 'flat';
  /** 固定値。固定レア度制下では rarity による分岐なし。 */
  readonly value: number;
}

export interface ModuleType {
  readonly id: string;
  readonly nameJa: string;
  readonly descJa: string;
  readonly rarity: Rarity;
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
  bombDamage: 'ボム威力',
};

/**
 * 既存 8 モジュールに固定レア度を割り当て (2026-05-28)。
 * 値は旧 rarityValue の該当 rarity の値を採用する。
 */
export const MODULE_TYPES: Record<string, ModuleType> = {
  mod_gatling: {
    id: 'mod_gatling',
    nameJa: 'ガトリング砲',
    descJa: '1 射あたりの弾数を増やすが、1 発の威力は下がる',
    rarity: 'SR',
    effects: [
      { stat: 'extraShots',    kind: 'flat',    value: 4 },
      { stat: 'damagePerShot', kind: 'percent', value: -0.4 },
    ],
  },
  mod_thruster: {
    id: 'mod_thruster',
    nameJa: '補助スラスタ',
    descJa: '移動速度を上げる',
    rarity: 'R',
    effects: [
      { stat: 'moveSpeed', kind: 'percent', value: 0.35 },
    ],
  },
  mod_drill: {
    id: 'mod_drill',
    nameJa: '強化ドリル',
    descJa: '採掘速度を大きく上げるが、移動が少し遅くなる',
    rarity: 'R',
    effects: [
      { stat: 'mineRate',  kind: 'percent', value: 0.6 },
      { stat: 'moveSpeed', kind: 'percent', value: -0.13 },
    ],
  },
  // 体当たり攻撃。装着すると敵接触中ずっと DPS でダメージを与える。
  // 引き換えに移動速度がやや遅くなる (突っ込み戦法と整合)。
  mod_ram: {
    id: 'mod_ram',
    nameJa: '衝角ブレード',
    descJa: '体当たりで敵にダメージを与える。引き換えに移動速度が少し遅くなる',
    rarity: 'SR',
    effects: [
      { stat: 'contactDps', kind: 'flat',    value: 22 },
      { stat: 'moveSpeed',  kind: 'percent', value: -0.08 },
    ],
  },
  // 装甲: 最大 HP を flat で加算する。
  mod_armor: {
    id: 'mod_armor',
    nameJa: '装甲',
    descJa: '最大 HP を増やす',
    rarity: 'R',
    effects: [
      { stat: 'maxHp', kind: 'flat', value: 25 },
    ],
  },
  // 貯蔵庫: 積載量を flat で加算する。
  mod_cargo: {
    id: 'mod_cargo',
    nameJa: '貯蔵庫',
    descJa: '資源の積載量を増やす',
    rarity: 'N',
    effects: [
      { stat: 'inventoryCap', kind: 'flat', value: 7 },
    ],
  },
  // バッテリー: 最大エネルギーを flat で加算する。
  mod_battery: {
    id: 'mod_battery',
    nameJa: 'バッテリー',
    descJa: '最大エネルギーを増やす',
    rarity: 'R',
    effects: [
      { stat: 'maxEnergy', kind: 'flat', value: 50 },
    ],
  },
  // ボム砲: ATTACK_NEAREST 1 回ぶんでボム弾を追加発射。弾速は遅いが着弾時に範囲攻撃。
  // 直撃ダメージ + 半径 80px の AoE。AoE は直撃ターゲット以外にも適用される。
  mod_bomb: {
    id: 'mod_bomb',
    nameJa: 'ボム砲',
    descJa: '一射ごとに低速のボム弾を追加発射する。着弾時に範囲爆発',
    rarity: 'SR',
    effects: [
      { stat: 'bombDamage', kind: 'flat', value: 40 },
    ],
  },
};

export const ALL_MODULE_IDS: ReadonlyArray<string> = Object.keys(MODULE_TYPES);

/** typeId がモジュールか。 */
export function isModule(typeId: string): boolean {
  return typeId in MODULE_TYPES;
}

/** モジュール 1 効果の表示文字列 (例: "攻撃力 -40%" / "連射 +4" / "最大HP +25")。 */
function effectText(stat: ModuleStatTarget, kind: 'percent' | 'flat', value: number): string {
  const label = MODULE_STAT_LABEL[stat];
  if (kind === 'percent') {
    const pct = Math.round(value * 100);
    return `${label} ${pct >= 0 ? '+' : ''}${pct}%`;
  }
  return `${label} ${value >= 0 ? '+' : ''}${value}`;
}

/** モジュールの全効果をまとめた表示文字列。 */
export function moduleEffectText(typeId: string): string {
  const mt = MODULE_TYPES[typeId];
  if (!mt) return '';
  return mt.effects
    .map((e) => effectText(e.stat, e.kind, e.value))
    .join('  /  ');
}

/** モジュールの効果を 1 つずつ配列で返す (UI で行ごとに表示する用)。 */
export function moduleEffectLines(typeId: string): string[] {
  const mt = MODULE_TYPES[typeId];
  if (!mt) return [];
  return mt.effects.map((e) => effectText(e.stat, e.kind, e.value));
}

/** デバッグ用: 指定レア度のモジュールをランダムに 1 個生成する。
 *  該当 rarity がなければ null。 */
export function makeRandomModule(rarity: Rarity): ItemInstance | null {
  const pool = ALL_MODULE_IDS.filter((id) => MODULE_TYPES[id]!.rarity === rarity);
  if (pool.length === 0) return null;
  const typeId = pool[Math.floor(Math.random() * pool.length)]!;
  return { uid: crypto.randomUUID(), typeId, rarity };
}
