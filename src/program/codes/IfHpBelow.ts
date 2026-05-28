import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_HP_BELOW — Ship の HP が params.hpPercent% 以下なら true。
 * true のとき Executor が子コード列を 1 周実行する。
 */
export function conditionIfHpBelow(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void world;
  if (ship.maxHp <= 0) return false;
  const threshold = (code.params.hpPercent as number) ?? 100;
  return (ship.hp / ship.maxHp) * 100 <= threshold;
}
