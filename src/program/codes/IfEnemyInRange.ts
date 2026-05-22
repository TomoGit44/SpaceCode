import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_ENEMY_IN_RANGE — params.range 内に生存中の敵がいれば true。
 * true のとき Executor が子コード列を 1 周実行する。
 */
export function conditionIfEnemyInRange(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  const range = code.params.range ?? 0;
  const r2 = range * range;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = e.x - ship.x;
    const dy = e.y - ship.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}
