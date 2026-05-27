import type { Code, CodeStepResult } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';
import { SHIP } from '../../config';
import type { CodeExecContext } from '../Executor';

/**
 * WAIT — 指定秒数だけその場で待機する持続時間コード (2026-05-24 改修)。
 *
 * 副作用:
 *  - **基地の近く** (`base.radius + SHIP.depositRadius`) に居れば
 *    毎フレーム `ship.depositAt(base)` を呼び、Ship.update が
 *    インベントリを納品 (refuelOnDeposit なら同時にエネルギー補給開始)。
 *    補給は時間ベース (Ship.requestRefuel → Ship.tickRefuelEffect、refuelDurationMs で満タン)。
 *    インベントリが空でも energy < maxEnergy なら毎フレーム requestRefuel を立て続けて回復させる。
 *  - **惑星の近く** (`planet.mineRadius`) に居れば、その惑星に `ship.mineAt(planet)`
 *    を設定し採掘を継続。複数惑星が範囲内なら最初に見つかったものを優先。
 *    満タンになるか枯渇すると Ship.update 側で自動停止 (本 tick 関数からは無干渉)。
 *
 * 旧 MINE / DEPOSIT / WAIT_UNTIL_FULL を 1 つに集約した設計 (位置で挙動が決まるため
 * ターゲット指定が不要になり、ユーザは「移動 → 待機」の 2 手で同等の効果を得る)。
 */
export function tickWait(
  code: Extract<Code, { type: 'WAIT' }>,
  ship: Ship,
  world: ShipWorld,
  ctx: CodeExecContext
): CodeStepResult {
  // 1. 基地の近くなら納品 + エネルギー補給を自動で行う
  const atBase = ship.isAt(world.base, world.base.radius + SHIP.depositRadius);
  if (atBase) {
    ship.depositAt(world.base);
    // インベントリ 0 でも補給する (Ship.update の deposit 経路は inventory>0 のみ requestRefuel)
    // refuel は時間ベース: 毎フレーム requestRefuel を立てて Ship 側で energy を加算
    if (SHIP.refuelOnDeposit && ship.energy < ship.maxEnergy) {
      ship.requestRefuel();
    }
  } else if (!ship.isInventoryFull()) {
    // 2. 惑星の近くなら採掘 (枯渇していない最初の 1 つ)
    for (const p of world.planets) {
      if (p.depleted) continue;
      if (ship.isAt(p, p.mineRadius)) {
        ship.mineAt(p);
        break;
      }
    }
  }

  // 3. 経過時間で完了判定
  const totalMs = Math.max(0, code.seconds) * 1000;
  if (ctx.elapsedMs >= totalMs) return { status: 'done' };
  return { status: 'running' };
}
