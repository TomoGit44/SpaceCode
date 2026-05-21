import type { Ship } from '../entities/Ship';
import type { ShipStat, BaseStat, EconomyStat } from './itemTypes';
import type { Inventory } from './Inventory';

/**
 * EffectSystem — 装着中アイテム (オムニ・コア / 各 Ship のモジュール / 時限バフ) を
 * 集約し、Ship / Base / Economy の stat に効果を適用する。
 *
 * stat 取得側は `SHIP.damagePerShot` 等の直接参照をやめ、
 * `effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot)` のように
 * base 値を渡して呼ぶ。EffectSystem は装着効果を載せた値を返す。
 *
 * Phase 6 Step 1: **枠のみ**。装着アイテムがまだ無いため、全メソッドは
 * base 値をそのまま返す (素通し)。Step 2 (オムニ・コア) / Step 3 (モジュール) /
 * Step 4 (ケミカル時限バフ) で効果集計ロジックを追加する。
 */
export class EffectSystem {
  private readonly inventory: Inventory;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
  }

  /** Ship stat に装着効果を適用した値。Step 1 は素通し。 */
  public shipStat(ship: Ship, stat: ShipStat, base: number): number {
    void ship;
    void stat;
    return base;
  }

  /** 基地 stat に装着効果を適用した値。Step 1 は素通し。 */
  public baseStat(stat: BaseStat, base: number): number {
    void stat;
    return base;
  }

  /** 経済 stat に装着効果を適用した値。Step 1 は素通し。 */
  public economyStat(stat: EconomyStat, base: number): number {
    void stat;
    return base;
  }

  /** 時限バフ等の時間管理。Step 4 (ケミカル) で実装。 */
  public tick(delta: number): void {
    void delta;
    void this.inventory;
  }
}
