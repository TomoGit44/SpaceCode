import type { Rarity, ShipStat, BaseStat, EconomyStat, ItemInstance } from '../itemTypes';

/**
 * オムニ・コア — 装着中ずっと有効な永続効果アイテム (仕様 §6.1)。
 *
 * data-driven: 新しいコアを足すときは `OMNI_CORE_TYPES` に 1 エントリ追加するだけ。
 * 効果適用は `EffectSystem` がこのテーブルを読んで集計する (効果 hook を毎回書かない)。
 *
 * 効果はレア度ごとの **加算割合** で表現する。同名コア複数所持はすべて加算スタック
 * (乗算にすると終盤の倍々ゲーが破綻するため、仕様 §6.1)。
 */

export type EffectTarget = 'ship' | 'base' | 'economy';

export interface OmniCoreType {
  readonly id: string;
  readonly nameJa: string;
  /** 効果の説明テンプレ (%値は付けない。UI 側で付与)。 */
  readonly descJa: string;
  readonly target: EffectTarget;
  readonly stat: ShipStat | BaseStat | EconomyStat;
  /** レア度ごとの加算割合 (例: N=0.2 → +20%)。 */
  readonly rarityPercent: Record<Rarity, number>;
}

/** 標準的なレア度倍率テーブル (仕様 §4.2 の例)。 */
const STD: Record<Rarity, number> = { N: 0.2, R: 0.35, SR: 0.5, L: 1.0 };

/**
 * オムニ・コア定義テーブル。
 * Step 2 では read-time に倍率を掛けられる stat のみ実装 (HP/エネルギー等の
 * 最大値変動を伴うコアは Step 3 で動的 max 機構と一緒に追加する)。
 */
export const OMNI_CORE_TYPES: Record<string, OmniCoreType> = {
  core_attack: {
    id: 'core_attack',
    nameJa: '攻撃コア',
    descJa: '全宇宙船の攻撃力',
    target: 'ship',
    stat: 'damagePerShot',
    rarityPercent: STD,
  },
  core_thruster: {
    id: 'core_thruster',
    nameJa: '推進コア',
    descJa: '全宇宙船の移動速度',
    target: 'ship',
    stat: 'moveSpeed',
    rarityPercent: STD,
  },
  core_drill: {
    id: 'core_drill',
    nameJa: '採掘コア',
    descJa: '全宇宙船の採掘速度',
    target: 'ship',
    stat: 'mineRate',
    rarityPercent: STD,
  },
  core_hull: {
    id: 'core_hull',
    nameJa: '装甲コア',
    descJa: '全宇宙船の最大 HP',
    target: 'ship',
    stat: 'maxHp',
    rarityPercent: STD,
  },
  core_turret: {
    id: 'core_turret',
    nameJa: '砲塔コア',
    descJa: '基地砲塔の火力',
    target: 'base',
    stat: 'turretDamage',
    rarityPercent: STD,
  },
  core_bounty: {
    id: 'core_bounty',
    nameJa: '賞金コア',
    descJa: '撃破クレジット報酬',
    target: 'economy',
    stat: 'creditsPerKill',
    rarityPercent: STD,
  },
  // 2026-05-25: 新コア 3 種。レア度問わず固定 +50% / -50% (スターター装着前提、
  // レア度カラーは表示用に rarityPercent と切り離す)。
  // descJa には倍率を書かない (UI 側で omniCorePercent から付与し、二重表記を防ぐ)。
  core_attack_plus: {
    id: 'core_attack_plus',
    nameJa: '強化攻撃コア',
    descJa: '全宇宙船の攻撃力',
    target: 'ship',
    stat: 'damagePerShot',
    rarityPercent: { N: 0.5, R: 0.5, SR: 0.5, L: 0.5 },
  },
  core_efficiency: {
    id: 'core_efficiency',
    nameJa: '省エネコア',
    descJa: '全宇宙船のエネルギー消費',
    target: 'ship',
    stat: 'energyConsume',
    rarityPercent: { N: -0.5, R: -0.5, SR: -0.5, L: -0.5 },
  },
  core_endurance: {
    id: 'core_endurance',
    nameJa: '耐久コア',
    descJa: '全宇宙船の最大 HP',
    target: 'ship',
    stat: 'maxHp',
    rarityPercent: { N: 0.5, R: 0.5, SR: 0.5, L: 0.5 },
  },
};

export const ALL_OMNI_CORE_IDS: ReadonlyArray<string> = Object.keys(OMNI_CORE_TYPES);

/** typeId がオムニ・コアか。 */
export function isOmniCore(typeId: string): boolean {
  return typeId in OMNI_CORE_TYPES;
}

/** オムニ・コアの効果倍率 (%) を整数で返す。 */
export function omniCorePercent(typeId: string, rarity: Rarity): number {
  const t = OMNI_CORE_TYPES[typeId];
  return t ? Math.round(t.rarityPercent[rarity] * 100) : 0;
}

/** デバッグ用: 指定レア度のオムニ・コアをランダムに 1 個生成する。 */
export function makeRandomOmniCore(rarity: Rarity): ItemInstance {
  const typeId = ALL_OMNI_CORE_IDS[Math.floor(Math.random() * ALL_OMNI_CORE_IDS.length)]!;
  return { uid: crypto.randomUUID(), typeId, rarity };
}
