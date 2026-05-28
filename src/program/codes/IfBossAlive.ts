import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_BOSS_ALIVE — 現在 enemies に 'boss' タイプの生存個体がいれば true。
 */
export function conditionIfBossAlive(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void code;
  void ship;
  for (const e of world.enemies) {
    if (!e.dead && e.type === 'boss') return true;
  }
  return false;
}
