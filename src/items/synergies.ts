import type { Inventory } from './Inventory';
import type { Ship } from '../entities/Ship';
import type { Program } from '../program/Program';
import type { Rarity } from './itemTypes';
import type { ModuleEffect } from './types/modules';
import type { Code } from '../program/Code';
import { codeChildren } from '../program/Code';

/**
 * SynergySystem — 装着の組み合わせで発火する隠れ効果 (2026-06-05 追加)。
 *
 * EffectSystem (加算スタックの stat 集計) とは責務を分離する:
 *  - EffectSystem: ItemInstance ベースの passive な加算。stat に閉じる
 *  - SynergySystem: Inventory 構成 + Program 構成のハイブリッド条件で発火。
 *    passive 効果は EffectSystem に「シナジー由来 pct/flat」として供給し、
 *    event 駆動 (onMine 等) は Ship.update から直接呼ぶ
 *
 * data-driven: 新シナジーは `SYNERGY_DEFS` に 1 エントリ追加するだけ。
 *
 * 「発見」が肝なので、UI 側で SR/L は ??? 隠蔽、N/R はヒント表示 (Step 2)。
 */

export type SynergyId =
  | 'syn_split_burst'
  | 'syn_mine_repair'
  | 'syn_ram_charge'
  | 'syn_crisis_judge'
  | 'syn_eco_burst'
  | 'syn_heavy_arm'
  | 'syn_coop_signal';

export type SynergyScope = 'ship' | 'global';

export interface SynergyContext {
  readonly inventory: Inventory;
  readonly getShips: () => ReadonlyArray<Ship>;
  readonly getProgramOf: (shipId: string) => Program | null;
}

export interface SynergyHooks {
  /** 採掘成功時 (Ship.update 内、`got > 0` の枝)。 */
  onMine?: (ship: Ship, deltaMs: number) => void;
  /** 敵接触時 (Ship.update 内、接触距離内に敵がいる枝)。 */
  onContact?: (ship: Ship) => void;
  /** 発射成功時 (Ship.fireAt 内、true 返却直前)。 */
  onFire?: (ship: Ship) => void;
}

export interface SynergyDef {
  readonly id: SynergyId;
  readonly nameJa: string;
  readonly descJa: string;
  readonly rarity: Rarity;
  readonly scope: SynergyScope;
  /** 発動条件。scope=global の場合 shipId は無視可。純関数。 */
  readonly condition: (ctx: SynergyContext, shipId: string) => boolean;
  /** EffectSystem に供給する passive 寄与 (加算スタック)。 */
  readonly passiveEffects?: ReadonlyArray<ModuleEffect>;
  readonly hooks?: SynergyHooks;
}

// ─── 内部ヘルパ ──────────────────────────────────────────────

function shipHasModule(inventory: Inventory, shipId: string, typeId: string): boolean {
  const uids = inventory.shipModules[shipId];
  if (!uids) return false;
  for (const uid of uids) {
    const it = inventory.items.find((i) => i.uid === uid);
    if (it && it.typeId === typeId) return true;
  }
  return false;
}

function shipModuleTotal(inventory: Inventory, shipId: string): number {
  return inventory.shipModules[shipId]?.length ?? 0;
}

function inventoryHasOmni(inventory: Inventory, typeId: string): boolean {
  for (const it of inventory.items) {
    if (it.typeId === typeId) return true;
  }
  return false;
}

function programHasItemCode(program: Program | null, codeType: string): boolean {
  if (!program) return false;
  const walk = (codes: ReadonlyArray<Code>): boolean => {
    for (const c of codes) {
      if (c.type === 'ITEM_CODE' && c.itemCodeType === codeType) return true;
      const ch = codeChildren(c);
      if (ch && walk(ch)) return true;
    }
    return false;
  };
  return walk(program.getCodes());
}

// ─── 初期シナジー定義 (7 個) ─────────────────────────────────

export const SYNERGY_DEFS: Record<SynergyId, SynergyDef> = {
  // ガトリング砲 + ボム砲 同船 → 攻撃 +20% (将来 onFire hook で AoE 化拡張余地)
  syn_split_burst: {
    id: 'syn_split_burst',
    nameJa: '散弾爆裂',
    descJa: 'ガトリング砲 + ボム砲 同船装着で攻撃力 +20%',
    rarity: 'R',
    scope: 'ship',
    condition: (ctx, shipId) =>
      shipHasModule(ctx.inventory, shipId, 'mod_gatling') &&
      shipHasModule(ctx.inventory, shipId, 'mod_bomb'),
    passiveEffects: [{ stat: 'damagePerShot', kind: 'percent', value: 0.2 }],
  },

  // 強化ドリル + 装甲 同船 → 採掘中 HP 自動回復 (onMine hook)
  syn_mine_repair: {
    id: 'syn_mine_repair',
    nameJa: '採掘修復',
    descJa: '強化ドリル + 装甲 同船装着で採掘中 HP +2/s 自動回復',
    rarity: 'N',
    scope: 'ship',
    condition: (ctx, shipId) =>
      shipHasModule(ctx.inventory, shipId, 'mod_drill') &&
      shipHasModule(ctx.inventory, shipId, 'mod_armor'),
    hooks: {
      onMine: (ship, deltaMs) => {
        ship.heal((2 * deltaMs) / 1000);
      },
    },
  },

  // 衝角ブレード + スラスタ 同船 → 移動 +30%, 体当たり威力 +10
  syn_ram_charge: {
    id: 'syn_ram_charge',
    nameJa: '衝角突進',
    descJa: '衝角ブレード + スラスタ 同船装着で移動 +30% / 体当たり +10',
    rarity: 'R',
    scope: 'ship',
    condition: (ctx, shipId) =>
      shipHasModule(ctx.inventory, shipId, 'mod_ram') &&
      shipHasModule(ctx.inventory, shipId, 'mod_thruster'),
    passiveEffects: [
      { stat: 'moveSpeed', kind: 'percent', value: 0.3 },
      { stat: 'contactDps', kind: 'flat', value: 10 },
    ],
  },

  // プログラムに IF_HP_BELOW + IF_ENERGY_BELOW 両方配置 → 攻撃 +15% / 採掘 +15%
  syn_crisis_judge: {
    id: 'syn_crisis_judge',
    nameJa: '危機判定',
    descJa: 'プログラムに IF_HP_BELOW + IF_ENERGY_BELOW 配置で攻撃 +15% / 採掘 +15%',
    rarity: 'SR',
    scope: 'ship',
    condition: (ctx, shipId) => {
      const p = ctx.getProgramOf(shipId);
      return programHasItemCode(p, 'IF_HP_BELOW') && programHasItemCode(p, 'IF_ENERGY_BELOW');
    },
    passiveEffects: [
      { stat: 'damagePerShot', kind: 'percent', value: 0.15 },
      { stat: 'mineRate', kind: 'percent', value: 0.15 },
    ],
  },

  // 省エネコア + ガトリング砲 同船 → エネルギー消費 -25%
  syn_eco_burst: {
    id: 'syn_eco_burst',
    nameJa: '省エネ連射',
    descJa: '省エネコア + ガトリング砲 同船でエネルギー消費 -25%',
    rarity: 'R',
    scope: 'ship',
    condition: (ctx, shipId) =>
      inventoryHasOmni(ctx.inventory, 'core_efficiency') &&
      shipHasModule(ctx.inventory, shipId, 'mod_gatling'),
    passiveEffects: [{ stat: 'energyConsume', kind: 'percent', value: -0.25 }],
  },

  // 同一船にモジュール 3 個以上 → 最大 HP +15%
  syn_heavy_arm: {
    id: 'syn_heavy_arm',
    nameJa: '重武装',
    descJa: '同一船にモジュール 3 個以上装着で最大 HP +15%',
    rarity: 'N',
    scope: 'ship',
    condition: (ctx, shipId) => shipModuleTotal(ctx.inventory, shipId) >= 3,
    passiveEffects: [{ stat: 'maxHp', kind: 'percent', value: 0.15 }],
  },

  // 2 隻以上 + どこかに BROADCAST_SIGNAL 配置 → 全船 攻撃 +10%
  syn_coop_signal: {
    id: 'syn_coop_signal',
    nameJa: '連携作戦',
    descJa: '2 隻以上 + どこかに BROADCAST_SIGNAL 配置で全船 攻撃 +10%',
    rarity: 'SR',
    scope: 'global',
    condition: (ctx) => {
      const ships = ctx.getShips();
      if (ships.length < 2) return false;
      for (const s of ships) {
        if (programHasItemCode(ctx.getProgramOf(s.id), 'BROADCAST_SIGNAL')) return true;
      }
      return false;
    },
    passiveEffects: [{ stat: 'damagePerShot', kind: 'percent', value: 0.1 }],
  },
};

export const ALL_SYNERGY_IDS: ReadonlyArray<SynergyId> = Object.keys(SYNERGY_DEFS) as SynergyId[];

// ─── SynergySystem 本体 ──────────────────────────────────────

export class SynergySystem {
  private readonly inventory: Inventory;
  private readonly getShips: () => ReadonlyArray<Ship>;
  private readonly getProgramOf: (shipId: string) => Program | null;
  /** 直近に発動していたシナジー id (新規発動の diff 用)。 */
  private prevActive: Set<SynergyId> = new Set();
  private onNewActivation?: (id: SynergyId, def: SynergyDef) => void;

  constructor(
    inventory: Inventory,
    getShips: () => ReadonlyArray<Ship>,
    getProgramOf: (shipId: string) => Program | null,
  ) {
    this.inventory = inventory;
    this.getShips = getShips;
    this.getProgramOf = getProgramOf;
  }

  /** 新規発動時のリスナ (発動バナー / Codex 登録の起点)。 */
  public setOnNewActivation(cb: (id: SynergyId, def: SynergyDef) => void): void {
    this.onNewActivation = cb;
  }

  private ctx(): SynergyContext {
    return {
      inventory: this.inventory,
      getShips: this.getShips,
      getProgramOf: this.getProgramOf,
    };
  }

  /** Ship 単位の発動シナジー (global も合わせて含める — global は全 ship に効くため)。 */
  public activeForShip(shipId: string): SynergyDef[] {
    const ctx = this.ctx();
    const out: SynergyDef[] = [];
    for (const def of Object.values(SYNERGY_DEFS)) {
      if (def.scope === 'ship') {
        if (def.condition(ctx, shipId)) out.push(def);
      } else {
        if (def.condition(ctx, '')) out.push(def);
      }
    }
    return out;
  }

  /** UI 用: Ship 個別シナジー (global を除く)。 */
  public activeShipOnly(shipId: string): SynergyDef[] {
    const ctx = this.ctx();
    const out: SynergyDef[] = [];
    for (const def of Object.values(SYNERGY_DEFS)) {
      if (def.scope === 'ship' && def.condition(ctx, shipId)) out.push(def);
    }
    return out;
  }

  /** UI 用: Global シナジー。 */
  public activeGlobal(): SynergyDef[] {
    const ctx = this.ctx();
    const out: SynergyDef[] = [];
    for (const def of Object.values(SYNERGY_DEFS)) {
      if (def.scope === 'global' && def.condition(ctx, '')) out.push(def);
    }
    return out;
  }

  /** EffectSystem 用: ship に効く passive 加算 percent 合計。 */
  public passivePercent(shipId: string, stat: string): number {
    let sum = 0;
    for (const def of this.activeForShip(shipId)) {
      if (!def.passiveEffects) continue;
      for (const eff of def.passiveEffects) {
        if (eff.stat === stat && eff.kind === 'percent') sum += eff.value;
      }
    }
    return sum;
  }

  /** EffectSystem 用: ship に効く passive flat 合計。 */
  public passiveFlat(shipId: string, stat: string): number {
    let sum = 0;
    for (const def of this.activeForShip(shipId)) {
      if (!def.passiveEffects) continue;
      for (const eff of def.passiveEffects) {
        if (eff.stat === stat && eff.kind === 'flat') sum += eff.value;
      }
    }
    return sum;
  }

  /** Ship が現在発動中のシナジーで onMine hook を持つもの全部実行。 */
  public onMine(ship: Ship, deltaMs: number): void {
    for (const def of this.activeForShip(ship.id)) {
      def.hooks?.onMine?.(ship, deltaMs);
    }
  }

  public onContact(ship: Ship): void {
    for (const def of this.activeForShip(ship.id)) {
      def.hooks?.onContact?.(ship);
    }
  }

  public onFire(ship: Ship): void {
    for (const def of this.activeForShip(ship.id)) {
      def.hooks?.onFire?.(ship);
    }
  }

  /**
   * 発動状態の diff を取り、新規発動分にコールバックを発火。
   * GameScene から毎フレーム呼ぶ (条件評価は軽量 — 7 シナジー × 数 Ship)。
   */
  public refreshActivationDiff(): void {
    const now = new Set<SynergyId>();
    const ctx = this.ctx();
    for (const def of Object.values(SYNERGY_DEFS)) {
      if (def.scope === 'global') {
        if (def.condition(ctx, '')) now.add(def.id);
      } else {
        for (const s of this.getShips()) {
          if (def.condition(ctx, s.id)) {
            now.add(def.id);
            break;
          }
        }
      }
    }
    for (const id of now) {
      if (!this.prevActive.has(id)) {
        this.onNewActivation?.(id, SYNERGY_DEFS[id]);
      }
    }
    this.prevActive = now;
  }

  public reset(): void {
    this.prevActive.clear();
  }
}
