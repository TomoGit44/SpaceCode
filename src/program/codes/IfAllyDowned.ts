import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_ALLY_DOWNED — 自分以外の Ship が 1 隻でも 'downed' 状態なら true。
 */
export function conditionIfAllyDowned(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void code;
  for (const other of world.ships) {
    if (other === ship) continue;
    if (other.dead) continue;
    if (other.state === 'downed') return true;
  }
  return false;
}
