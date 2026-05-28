import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_BASE_HP_BELOW — 基地 HP が params.hpPercent% 以下なら true。
 */
export function conditionIfBaseHpBelow(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void ship;
  const base = world.base;
  if (base.maxHp <= 0) return false;
  const threshold = (code.params.hpPercent as number) ?? 100;
  return (base.hp / base.maxHp) * 100 <= threshold;
}
