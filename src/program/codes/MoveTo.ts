import type { Code, CodeStepResult } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';
import { LOCATION_LABELS, resolveLocation } from '../locations';

/**
 * 到達と見なす距離 (px)。Ship.moveSpeed × 1 フレーム移動量より大きく取り、
 * オーバーシュートしても確実に done になるようにする。
 */
const ARRIVE_THRESHOLD = 4;

/**
 * MOVE_TO — 名前付き地点 (base / planet0 / planet1) へ移動する。
 * 座標解決は `resolveLocation` で行う。Phase 2 でこの方式に変更。
 */
export function tickMoveTo(
  code: Extract<Code, { type: 'MOVE_TO' }>,
  ship: Ship,
  world: ShipWorld
): CodeStepResult {
  const pos = resolveLocation(code.target, world);
  if (!pos) {
    return { status: 'blocked', reason: `${LOCATION_LABELS[code.target]} が解決できない` };
  }
  if (ship.isAt(pos, ARRIVE_THRESHOLD)) {
    return { status: 'done' };
  }
  ship.moveTo(pos.x, pos.y);
  return { status: 'running' };
}
