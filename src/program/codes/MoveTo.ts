import type { Code, CodeStepResult } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';
import type { Enemy } from '../../entities/Enemy';
import { LOCATION_LABELS, resolveLocation } from '../locations';

/**
 * 到達と見なす距離 (px)。Ship.moveSpeed × 1 フレーム移動量より大きく取り、
 * オーバーシュートしても確実に done になるようにする。
 */
const ARRIVE_THRESHOLD = 4;

/**
 * `enemy_nearest` 用の追尾バッファ距離 (px、2026-05-25 後追加)。
 *  - 密接しないために 180px の距離を残す (SHIP.attackRange=220 の内側、攻撃可能)
 *  - 船から見た最寄り敵に対し「敵の手前 BUFFER の地点」を目標とする
 *  - 毎フレーム再計算されるため、敵が動けば船もそれを追う
 *  - 船が BUFFER + ARRIVE_THRESHOLD 以内に入ったら done
 */
const ENEMY_FOLLOW_BUFFER = 180;

/**
 * MOVE_TO — 名前付き地点 (base / planet0 / planet1 / enemy_nearest) へ移動する。
 * 座標解決は `resolveLocation` で行う。Phase 2 でこの方式に変更。
 * 2026-05-25 後: enemy_nearest は船基準で最寄り敵を選び、密接しないバッファ付きで追尾する。
 */
export function tickMoveTo(
  code: Extract<Code, { type: 'MOVE_TO' }>,
  ship: Ship,
  world: ShipWorld
): CodeStepResult {
  if (code.target === 'enemy_nearest') {
    return tickMoveToEnemy(ship, world);
  }
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

/**
 * enemy_nearest 専用の追尾ロジック。
 *  - 船からの距離で最寄りの生存敵を選ぶ (resolveLocation の「基地から最寄り」とは
 *    別計算: 船の位置で考えるのが直感的なため)
 *  - 敵手前 ENEMY_FOLLOW_BUFFER px の地点を目標に設定 (毎フレーム再計算)
 *  - 船が敵から BUFFER 以内に入ったら done
 *  - 敵が居なくなったら blocked (次のコードへ Executor が進める)
 */
function tickMoveToEnemy(ship: Ship, world: ShipWorld): CodeStepResult {
  const enemy = nearestEnemyToShip(ship, world.enemies);
  if (!enemy) return { status: 'blocked', reason: '敵がいない' };
  const dx = enemy.x - ship.x;
  const dy = enemy.y - ship.y;
  const dist = Math.hypot(dx, dy);
  // 既にバッファ内に居れば即 done (敵が動いていても、適切な距離は保てている状態)
  if (dist <= ENEMY_FOLLOW_BUFFER + ARRIVE_THRESHOLD) {
    return { status: 'done' };
  }
  // 敵手前 BUFFER の地点を目標に。dist > BUFFER のはずなので方向単位ベクトル × (dist - BUFFER) で
  // 「あと (dist - BUFFER) px だけ進む位置」を出す。敵が動けば次フレームで再計算される。
  const reach = dist - ENEMY_FOLLOW_BUFFER;
  const tx = ship.x + (dx / dist) * reach;
  const ty = ship.y + (dy / dist) * reach;
  ship.moveTo(tx, ty);
  return { status: 'running' };
}

/** 船からの直線距離が最短な生存敵を返す。なければ null。 */
function nearestEnemyToShip(ship: Ship, enemies: ReadonlyArray<Enemy>): Enemy | null {
  let best: Enemy | null = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - ship.x, e.y - ship.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}
