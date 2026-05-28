import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_NEAREST_ENEMY_IS — Ship から見た最寄りの生存敵が params.enemyType と一致すれば true。
 * 敵が 1 体も居なければ false。
 */
export function conditionIfNearestEnemyIs(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  const target = (code.params.enemyType as string) ?? '';
  if (!target) return false;
  let bestType: string | null = null;
  let bestDist = Infinity;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const dx = e.x - ship.x;
    const dy = e.y - ship.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      bestType = e.type;
    }
  }
  return bestType === target;
}
