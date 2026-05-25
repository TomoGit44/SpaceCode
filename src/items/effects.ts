import type { Ship } from '../entities/Ship';
import type { ShipStat, BaseStat, EconomyStat } from './itemTypes';
import type { Inventory } from './Inventory';
import { OMNI_CORE_TYPES, type EffectTarget } from './types/omniCores';
import { MODULE_TYPES } from './types/modules';

/**
 * EffectSystem — 装着中アイテム (オムニ・コア / 各 Ship のモジュール / 時限バフ) を
 * 集約し、Ship / Base / Economy の stat に効果を適用する。
 *
 * stat 取得側は `SHIP.damagePerShot` 等の直接参照をやめ、
 * `effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot)` のように
 * base 値を渡して呼ぶ。EffectSystem は装着効果を載せた値を返す。
 *
 * Phase 6 Step 3 時点:
 *  - オムニ・コア: 全 Ship 共通の加算割合 (§6.1)
 *  - モジュール: 各 Ship 個別の加算割合 + 特殊効果 (連射数)
 *  - 同じ stat への効果はすべて加算スタック (乗算は終盤破綻、§6.1)
 * 時限バフ (Step 4) は後続で足す。
 */
/** ケミカルが付与する時限バフ (全 Ship 共通)。 */
interface TimedShipBuff {
  stat: ShipStat;
  percent: number;
  remainingMs: number;
}

export class EffectSystem {
  private readonly inventory: Inventory;
  /** ケミカル由来の時限バフ。tick で残り時間を減算し、0 で消える。 */
  private timedBuffs: TimedShipBuff[] = [];

  constructor(inventory: Inventory) {
    this.inventory = inventory;
  }

  /** 時限バフを追加する (ケミカル使用時)。 */
  public addTimedShipBuff(stat: ShipStat, percent: number, durationMs: number): void {
    this.timedBuffs.push({ stat, percent, remainingMs: durationMs });
  }

  /** 指定 stat に効く有効な時限バフの加算割合の合計。 */
  private timedPercent(stat: string): number {
    let sum = 0;
    for (const b of this.timedBuffs) {
      if (b.stat === stat) sum += b.percent;
    }
    return sum;
  }

  /** target/stat に効く全オムニ・コアの加算割合の合計。 */
  private omniPercent(target: EffectTarget, stat: string): number {
    let sum = 0;
    for (const it of this.inventory.items) {
      const core = OMNI_CORE_TYPES[it.typeId];
      if (core && core.target === target && core.stat === stat) {
        sum += core.rarityPercent[it.rarity];
      }
    }
    return sum;
  }

  /** 指定 Ship に装着中の全モジュールから stat への加算割合の合計。 */
  private shipModulePercent(ship: Ship, stat: string): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (!uids) return 0;
    for (const uid of uids) {
      const it = this.inventory.items.find((i) => i.uid === uid);
      if (!it) continue;
      const mt = MODULE_TYPES[it.typeId];
      if (!mt) continue;
      for (const eff of mt.effects) {
        if (eff.stat === stat && eff.kind === 'percent') {
          sum += eff.rarityValue[it.rarity];
        }
      }
    }
    return sum;
  }

  /** Ship stat に装着効果 (オムニ・コア + モジュール + 時限バフ) を適用した値。 */
  public shipStat(ship: Ship, stat: ShipStat, base: number): number {
    const pct =
      this.omniPercent('ship', stat) +
      this.shipModulePercent(ship, stat) +
      this.timedPercent(stat);
    return base * (1 + pct);
  }

  /**
   * 指定 Ship の 1 射あたりの追加弾数 (モジュールの extraShots 合計)。
   * ATTACK_NEAREST 1 回の発射弾数は `1 + これ`。
   */
  public shipExtraShots(ship: Ship): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (!uids) return 0;
    for (const uid of uids) {
      const it = this.inventory.items.find((i) => i.uid === uid);
      if (!it) continue;
      const mt = MODULE_TYPES[it.typeId];
      if (!mt) continue;
      for (const eff of mt.effects) {
        if (eff.stat === 'extraShots' && eff.kind === 'flat') {
          sum += eff.rarityValue[it.rarity];
        }
      }
    }
    return Math.max(0, Math.round(sum));
  }

  /**
   * 指定 Ship の体当たり DPS (モジュール `mod_ram` 等の `contactDps` 合計、2026-05-25)。
   * 装着なしなら 0 → 体当たりダメージなし。Ship.update が delta/1000 を掛けて使う。
   */
  public shipContactDps(ship: Ship): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (!uids) return 0;
    for (const uid of uids) {
      const it = this.inventory.items.find((i) => i.uid === uid);
      if (!it) continue;
      const mt = MODULE_TYPES[it.typeId];
      if (!mt) continue;
      for (const eff of mt.effects) {
        if (eff.stat === 'contactDps' && eff.kind === 'flat') {
          sum += eff.rarityValue[it.rarity];
        }
      }
    }
    return Math.max(0, sum);
  }

  /** 基地 stat に装着効果を適用した値。 */
  public baseStat(stat: BaseStat, base: number): number {
    return base * (1 + this.omniPercent('base', stat));
  }

  /** 経済 stat に装着効果を適用した値。 */
  public economyStat(stat: EconomyStat, base: number): number {
    return base * (1 + this.omniPercent('economy', stat));
  }

  /** 時限バフの残り時間を進め、切れたものを除去する。GameScene が毎フレーム呼ぶ。 */
  public tick(delta: number): void {
    if (this.timedBuffs.length === 0) return;
    for (const b of this.timedBuffs) b.remainingMs -= delta;
    this.timedBuffs = this.timedBuffs.filter((b) => b.remainingMs > 0);
  }
}
