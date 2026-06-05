import type { Ship } from '../entities/Ship';
import type { ShipStat, BaseStat, EconomyStat } from './itemTypes';
import type { Inventory } from './Inventory';
import type { SynergySystem } from './synergies';
import { OMNI_CORE_TYPES, type EffectTarget } from './types/omniCores';
import { MODULE_TYPES } from './types/modules';

/**
 * EffectSystem — 装着中アイテム (オムニ・コア / 各 Ship のモジュール) を
 * 集約し、Ship / Base / Economy の stat に効果を適用する。
 *
 * stat 取得側は `SHIP.damagePerShot` 等の直接参照をやめ、
 * `effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot)` のように
 * base 値を渡して呼ぶ。EffectSystem は装着効果を載せた値を返す。
 *
 *  - オムニ・コア: 全 Ship 共通の加算割合 (§6.1)
 *  - モジュール: 各 Ship 個別の加算割合 + 特殊効果 (連射数)
 *  - 同じ stat への効果はすべて加算スタック (乗算は終盤破綻、§6.1)
 *  - シナジー (2026-06-05 追加): SynergySystem から passive 寄与を受け、
 *    上記と同じ加算スタックに合算する。循環依存回避のため後付け注入。
 */
export class EffectSystem {
  private readonly inventory: Inventory;
  private synergies: SynergySystem | null = null;

  constructor(inventory: Inventory) {
    this.inventory = inventory;
  }

  /**
   * SynergySystem を注入する (2026-06-05)。
   * GameScene で `effects = new EffectSystem(inv)` のあと `synergies = new SynergySystem(...)`
   * を作り、`effects.setSynergies(synergies)` で接続する。循環参照を避けるため後付け。
   */
  public setSynergies(synergies: SynergySystem): void {
    this.synergies = synergies;
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

  /** RunMod (2026-06-05 Step 4) の target/stat への加算寄与 (% / flat 別)。 */
  private runModPercent(target: EffectTarget, stat: string): number {
    let sum = 0;
    for (const rm of this.inventory.runMods) {
      if (rm.target === target && rm.stat === stat && rm.kind === 'percent') sum += rm.value;
    }
    return sum;
  }

  private runModFlat(target: EffectTarget, stat: string): number {
    let sum = 0;
    for (const rm of this.inventory.runMods) {
      if (rm.target === target && rm.stat === stat && rm.kind === 'flat') sum += rm.value;
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
          sum += eff.value;
        }
      }
    }
    return sum;
  }

  /**
   * 指定 Ship に装着中の全モジュールから stat への flat 加算の合計
   * (2026-05-25 後: 装甲 / 貯蔵庫 / バッテリーが maxHp / inventoryCap / maxEnergy を
   * flat で底上げする経路。% との合算は `base * (1 + pct) + flat` で行う)。
   */
  private shipModuleFlat(ship: Ship, stat: string): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (!uids) return 0;
    for (const uid of uids) {
      const it = this.inventory.items.find((i) => i.uid === uid);
      if (!it) continue;
      const mt = MODULE_TYPES[it.typeId];
      if (!mt) continue;
      for (const eff of mt.effects) {
        if (eff.stat === stat && eff.kind === 'flat') {
          sum += eff.value;
        }
      }
    }
    return sum;
  }

  /** Ship stat に装着効果 (オムニ・コア + モジュール + シナジー + RunMod) を適用した値。 */
  public shipStat(ship: Ship, stat: ShipStat, base: number): number {
    const pct =
      this.omniPercent('ship', stat) +
      this.shipModulePercent(ship, stat) +
      this.runModPercent('ship', stat) +
      (this.synergies?.passivePercent(ship.id, stat) ?? 0);
    const flat =
      this.shipModuleFlat(ship, stat) +
      this.runModFlat('ship', stat) +
      (this.synergies?.passiveFlat(ship.id, stat) ?? 0);
    return base * (1 + pct) + flat;
  }

  /**
   * 指定 Ship の 1 射あたりの追加弾数 (モジュールの extraShots + シナジー flat の合計)。
   * ATTACK_NEAREST 1 回の発射弾数は `1 + これ`。
   */
  public shipExtraShots(ship: Ship): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (uids) {
      for (const uid of uids) {
        const it = this.inventory.items.find((i) => i.uid === uid);
        if (!it) continue;
        const mt = MODULE_TYPES[it.typeId];
        if (!mt) continue;
        for (const eff of mt.effects) {
          if (eff.stat === 'extraShots' && eff.kind === 'flat') {
            sum += eff.value;
          }
        }
      }
    }
    sum += this.synergies?.passiveFlat(ship.id, 'extraShots') ?? 0;
    return Math.max(0, Math.round(sum));
  }

  /**
   * 指定 Ship のボム弾威力 (モジュール `mod_bomb` の bombDamage + シナジー flat の合計、2026-05-25 後)。
   * 0 ならボム発射なし。> 0 のとき Ship.fireAt が低速のボム弾を 1 発追加発射する。
   */
  public shipBombDamage(ship: Ship): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (uids) {
      for (const uid of uids) {
        const it = this.inventory.items.find((i) => i.uid === uid);
        if (!it) continue;
        const mt = MODULE_TYPES[it.typeId];
        if (!mt) continue;
        for (const eff of mt.effects) {
          if (eff.stat === 'bombDamage' && eff.kind === 'flat') {
            sum += eff.value;
          }
        }
      }
    }
    sum += this.synergies?.passiveFlat(ship.id, 'bombDamage') ?? 0;
    return Math.max(0, sum);
  }

  /**
   * 指定 Ship の体当たり DPS (モジュール `mod_ram` 等の contactDps + シナジー flat の合計、2026-05-25)。
   * 装着なしなら 0 → 体当たりダメージなし。Ship.update が delta/1000 を掛けて使う。
   */
  public shipContactDps(ship: Ship): number {
    let sum = 0;
    const uids = this.inventory.shipModules[ship.id];
    if (uids) {
      for (const uid of uids) {
        const it = this.inventory.items.find((i) => i.uid === uid);
        if (!it) continue;
        const mt = MODULE_TYPES[it.typeId];
        if (!mt) continue;
        for (const eff of mt.effects) {
          if (eff.stat === 'contactDps' && eff.kind === 'flat') {
            sum += eff.value;
          }
        }
      }
    }
    sum += this.synergies?.passiveFlat(ship.id, 'contactDps') ?? 0;
    return Math.max(0, sum);
  }

  /** 基地 stat に装着効果 + RunMod を適用した値。 */
  public baseStat(stat: BaseStat, base: number): number {
    const pct = this.omniPercent('base', stat) + this.runModPercent('base', stat);
    const flat = this.runModFlat('base', stat);
    return base * (1 + pct) + flat;
  }

  /** 経済 stat に装着効果 + RunMod を適用した値。 */
  public economyStat(stat: EconomyStat, base: number): number {
    const pct = this.omniPercent('economy', stat) + this.runModPercent('economy', stat);
    const flat = this.runModFlat('economy', stat);
    return base * (1 + pct) + flat;
  }
}
