import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_RANDOM — params.percent% の確率で true を返す (毎評価で独立抽選)。
 */
export function conditionIfRandom(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void ship;
  void world;
  const p = (code.params.percent as number) ?? 0;
  return Math.random() * 100 < p;
}
