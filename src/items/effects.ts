import type { Ship } from '../entities/Ship';
import type { ShipStat, BaseStat, EconomyStat } from './itemTypes';
import type { Inventory } from './Inventory';
import { OMNI_CORE_TYPES, type EffectTarget } from './types/omniCores';

/**
 * EffectSystem — 装着中アイテム (オムニ・コア / 各 Ship のモジュール / 時限バフ) を
 * 集約し、Ship / Base / Economy の stat に効果を適用する。
 *
 * stat 取得側は `SHIP.damagePerShot` 等の直接参照をやめ、
 * `effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot)` のように
 * base 値を渡して呼ぶ。EffectSystem は装着効果を載せた値を返す。
 *
 * Phase 6 Step 2: **オムニ・コア** に対応。所持しているすべてのオムニ・コアが
 * 常時有効で、同じ stat への効果は **加算** スタックする (仕様 §6.1)。
 * モジュール (Step 3) / 時限バフ (Step 4) は後続ステップで足す。
 */
export class EffectSystem {
  private readonly inventory: Inventory;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
  }

  /**
   * 指定 target/stat に効く全オムニ・コアの加算割合の合計を返す。
   * 例: 攻撃力 +20% のコアを 3 枚所持 → 0.6。
   */
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

  /** Ship stat に装着効果を適用した値。 */
  public shipStat(ship: Ship, stat: ShipStat, base: number): number {
    void ship; // モジュール (Step 3) で ship 個別効果に使う
    return base * (1 + this.omniPercent('ship', stat));
  }

  /** 基地 stat に装着効果を適用した値。 */
  public baseStat(stat: BaseStat, base: number): number {
    return base * (1 + this.omniPercent('base', stat));
  }

  /** 経済 stat に装着効果を適用した値。 */
  public economyStat(stat: EconomyStat, base: number): number {
    return base * (1 + this.omniPercent('economy', stat));
  }

  /** 時限バフ等の時間管理。Step 4 (ケミカル) で実装。 */
  public tick(delta: number): void {
    void delta;
  }
}
