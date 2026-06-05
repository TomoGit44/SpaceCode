import type { Rarity } from './itemTypes';

/**
 * RunMod — Run 限定の永続バフ (2026-06-05 ローグライト Step 4)。
 *
 * Phase 間選択イベントの「永続バフ」枠で獲得し、その Run 中ずっと効果が乗る。
 * Inventory.runMods[] に蓄積され、EffectSystem の加算スタックに合算される。
 * Run 終了 (Game Over / Victory / Menu) で破棄 (永続化なし、§6.19)。
 *
 * data-driven: 新しい RunMod は `RUN_MOD_DEFS` に 1 エントリ追加するだけ。
 * 効果は ModuleEffect と同じ形式 (target/stat/kind/value) で表現する。
 */

export type RunModTarget = 'ship' | 'base' | 'economy';

export interface RunMod {
  readonly id: string;
  readonly nameJa: string;
  readonly descJa: string;
  readonly rarity: Rarity;
  readonly target: RunModTarget;
  readonly stat: string;
  readonly kind: 'percent' | 'flat';
  readonly value: number;
}

/**
 * 初期 RunMod 定義 (Step 4 で 6 種)。
 *  - 全 Ship 系: 移動 / 攻撃 / 採掘 / 最大エネルギー
 *  - 基地系: 最大 HP
 *  - 経済系: 採掘→クレジット換算
 */
export const RUN_MOD_DEFS: Record<string, RunMod> = {
  rm_ship_speed: {
    id: 'rm_ship_speed',
    nameJa: '推進ブースト',
    descJa: '全宇宙船の移動速度 +12%',
    rarity: 'R',
    target: 'ship',
    stat: 'moveSpeed',
    kind: 'percent',
    value: 0.12,
  },
  rm_ship_attack: {
    id: 'rm_ship_attack',
    nameJa: '攻撃ブースト',
    descJa: '全宇宙船の攻撃力 +15%',
    rarity: 'R',
    target: 'ship',
    stat: 'damagePerShot',
    kind: 'percent',
    value: 0.15,
  },
  rm_ship_mine: {
    id: 'rm_ship_mine',
    nameJa: '採掘ブースト',
    descJa: '全宇宙船の採掘速度 +18%',
    rarity: 'R',
    target: 'ship',
    stat: 'mineRate',
    kind: 'percent',
    value: 0.18,
  },
  rm_ship_energy: {
    id: 'rm_ship_energy',
    nameJa: 'エネルギー拡張',
    descJa: '全宇宙船の最大エネルギー +30',
    rarity: 'R',
    target: 'ship',
    stat: 'maxEnergy',
    kind: 'flat',
    value: 30,
  },
  rm_base_hp: {
    id: 'rm_base_hp',
    nameJa: '基地強化キット',
    descJa: '基地の最大 HP +20',
    rarity: 'SR',
    target: 'base',
    stat: 'maxHp',
    kind: 'flat',
    value: 20,
  },
  rm_resource_value: {
    id: 'rm_resource_value',
    nameJa: '精錬技術',
    descJa: '採掘→クレジット換算 +20%',
    rarity: 'SR',
    target: 'economy',
    stat: 'resourceToCredit',
    kind: 'percent',
    value: 0.2,
  },
};

export const ALL_RUN_MOD_IDS: ReadonlyArray<string> = Object.keys(RUN_MOD_DEFS);

/** 指定レア度の RunMod を 1 個ランダム選出。 */
export function pickRandomRunMod(rarity: Rarity): RunMod | null {
  const pool = ALL_RUN_MOD_IDS.filter((id) => RUN_MOD_DEFS[id]!.rarity === rarity);
  if (pool.length === 0) return null;
  const id = pool[Math.floor(Math.random() * pool.length)]!;
  return RUN_MOD_DEFS[id]!;
}
