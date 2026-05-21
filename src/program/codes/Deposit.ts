import type { CodeStepResult } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * DEPOSIT — 基地へ資源を納品する。
 *
 * インベントリが空になるまで毎フレーム `ship.depositAt(base)` を呼ぶ。
 * 実際の納品 (経済への加算・補給) は Ship.update が基地到達時に行う。
 *
 * 前提: 呼び出し前に MOVE_TO で基地へ到達していること。範囲外なら Ship 側が
 * 納品しないため running のまま留まる。
 */
export function tickDeposit(ship: Ship, world: ShipWorld): CodeStepResult {
  if (ship.inventory === 0) {
    return { status: 'done' };
  }
  ship.depositAt(world.base);
  return { status: 'running' };
}
