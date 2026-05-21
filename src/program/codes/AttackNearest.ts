import { SHIP } from '../../config';
import type { CodeStepResult } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';
import type { CodeExecContext } from '../Executor';

/**
 * ATTACK_NEAREST — 最寄りの敵を 1 発撃って、コード持続時間 (SHIP.attackDurationMs)
 * が経過するまで `running` で留まる。連射は REPEAT で囲んで実現する。
 *
 * - 入った最初の tick (`justEntered`) で `attackNearest` してターゲット設定 + `fireAt` で 1 発発射
 * - ターゲット無し / 射程外でも持続時間は消費する (= 構え動作)
 * - elapsedMs >= attackDurationMs で done
 */
export function tickAttackNearest(
  ship: Ship,
  world: ShipWorld,
  ctx: CodeExecContext
): CodeStepResult {
  if (ctx.justEntered) {
    ship.attackNearest(world.enemies);
    const target = ship.getAttackTarget();
    if (target) ship.fireAt(target, world);
  }
  return ctx.elapsedMs >= SHIP.attackDurationMs
    ? { status: 'done' }
    : { status: 'running' };
}
