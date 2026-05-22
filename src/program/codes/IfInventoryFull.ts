import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_INVENTORY_FULL — Ship のインベントリが満タンなら true。
 * true のとき Executor が子コード列を 1 周実行する。パラメータなし。
 */
export function conditionIfInventoryFull(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void code;
  void world;
  return ship.isInventoryFull();
}
