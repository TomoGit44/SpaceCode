import type { Block, BlockStepResult } from '../Block';
import type { Ship, ShipWorld } from '../../entities/Ship';
import { LOCATION_LABELS, resolvePlanet } from '../locations';

/**
 * MINE — 指定された惑星 (planet0 / planet1) を採掘する。
 *
 * - インベントリ満タンで `done` (採掘成功で次へ)
 * - 惑星枯渇 (depleted) は `blocked` (Phase 4: リスポーン待ち。次へは進まない)
 * - 普段は毎フレーム `ship.mineAt` を呼び続ける `running`
 *
 * 前提: 呼び出し前に MOVE_TO で惑星へ到達していること。範囲外なら Ship 側が
 * 採掘しないため running のまま留まる。
 */
export function tickMine(
  block: Extract<Block, { type: 'MINE' }>,
  ship: Ship,
  world: ShipWorld
): BlockStepResult {
  const planet = resolvePlanet(block.target, world);
  if (!planet) {
    return { status: 'blocked', reason: `${LOCATION_LABELS[block.target]} が存在しない` };
  }
  if (ship.isInventoryFull()) {
    return { status: 'done' };
  }
  if (planet.depleted) {
    return { status: 'blocked', reason: `${LOCATION_LABELS[block.target]} がリスポーン中` };
  }
  ship.mineAt(planet);
  return { status: 'running' };
}
