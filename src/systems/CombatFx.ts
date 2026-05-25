/**
 * 戦闘エフェクト集 (Step 1 / Combat 刷新, 2026-05-25)。
 *
 * redesign/combat.html の演出を Phaser ネイティブで再現する。
 * - `muzzleFlash`: 砲口フラッシュ (core + halo + shockwave ring + 4 ray)
 * - `hitEffect`  : 着弾 (白フラッシュ + shockwave + sparks + ダメージ数字 + camera shake)
 * - `bigExplosion`: 撃破 (3 連 shockwave + 中心フラッシュ + 多数 spark)
 * - `damageNumber`: 上昇 fade テキスト
 *
 * すべて scene 時間ベースの Tween なので `GAME_SPEED` (0.5) でも等速で動く。
 * Tween / Graphics は finishHandler で必ず destroy する (リーク防止)。
 */
import Phaser from 'phaser';
import { COLORS, type EnemyType } from '../config';

const EASE = 'Cubic.easeOut';
const FONT = 'system-ui, "Segoe UI", sans-serif';

/**
 * 砲口フラッシュ。射撃位置 (砲口) を中心に、進行方向 (`angle` rad) を軸に展開する。
 *  - core   : 白→色 のフラッシュ (220ms)
 *  - halo   : 同色グロー (320ms)
 *  - ring   : 同色アウトラインの shockwave (540ms)
 *  - 4 rays : `angle` を基準に直交 4 本の細い棒 (220ms)
 */
export function muzzleFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  color: number = COLORS.accent
): void {
  // Core (white + 色のにじみ)
  const core = scene.add.graphics().setDepth(7);
  core.fillStyle(0xffffff, 1);
  core.fillCircle(0, 0, 6);
  core.fillStyle(color, 0.7);
  core.fillCircle(0, 0, 10);
  core.setPosition(x, y).setScale(0.4);
  scene.tweens.add({
    targets: core, scale: 1.2, alpha: 0,
    duration: 220, ease: EASE,
    onComplete: () => core.destroy(),
  });

  // Halo (色のグロー)
  const halo = scene.add.graphics().setDepth(6);
  halo.fillStyle(color, 0.4);
  halo.fillCircle(0, 0, 18);
  halo.setPosition(x, y).setScale(0.6).setAlpha(0.8);
  scene.tweens.add({
    targets: halo, scale: 1.5, alpha: 0,
    duration: 320, ease: EASE,
    onComplete: () => halo.destroy(),
  });

  // Shockwave ring
  const ring = scene.add.graphics().setDepth(7);
  ring.lineStyle(2, color, 0.85);
  ring.strokeCircle(0, 0, 12);
  ring.setPosition(x, y);
  scene.tweens.add({
    targets: ring, scale: 2.4, alpha: 0,
    duration: 540, ease: EASE,
    onComplete: () => ring.destroy(),
  });

  // 4 directional rays
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + angle;
    const ray = scene.add.graphics().setDepth(7);
    ray.fillStyle(color, 0.9);
    ray.fillRect(0, -1, 22, 2);
    ray.setPosition(x, y).setRotation(a).setScale(0.3, 1);
    scene.tweens.add({
      targets: ray, scaleX: 1.2, alpha: 0,
      duration: 220, ease: EASE,
      onComplete: () => ray.destroy(),
    });
  }
}

/**
 * ダメージ数字。上昇しながら fade。`isCrit` で赤色 + 大きめ。
 * stroke を入れて星空でも視認できる。
 */
export function damageNumber(
  scene: Phaser.Scene,
  x: number,
  y: number,
  damage: number,
  isCrit: boolean = false
): void {
  const t = scene.add
    .text(x, y - 6, String(Math.ceil(damage)), {
      fontFamily: FONT,
      fontSize: isCrit ? '20px' : '14px',
      color: isCrit ? '#ff4d5a' : '#ffd24a',
      fontStyle: 'bold',
      stroke: '#05070d',
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setDepth(9);
  scene.tweens.add({
    targets: t,
    y: y - 30,
    alpha: 0,
    duration: 620,
    ease: EASE,
    onComplete: () => t.destroy(),
  });
}

/** 敵種別ごとの spark プリセット。 */
function sparkConfigFor(type: EnemyType): {
  count: number;
  range: readonly [number, number];
  size: number;
  duration: number;
} {
  switch (type) {
    case 'tank': return { count: 12, range: [22, 38] as const, size: 1.6, duration: 600 };
    case 'fast': return { count: 5,  range: [12, 24] as const, size: 1.2, duration: 420 };
    case 'boss': return { count: 16, range: [26, 44] as const, size: 1.8, duration: 700 };
    case 'sniper':
    case 'basic':
    default:     return { count: 8,  range: [16, 30] as const, size: 1.4, duration: 480 };
  }
}

/** 敵種別ごとの camera shake プリセット。 */
export function hitShake(scene: Phaser.Scene, type: EnemyType): void {
  switch (type) {
    case 'tank': scene.cameras.main.shake(180, 0.004); break;
    case 'fast': scene.cameras.main.shake(60,  0.001); break;
    case 'boss': scene.cameras.main.shake(220, 0.006); break;
    default:     scene.cameras.main.shake(100, 0.002); break;
  }
}

/**
 * 着弾エフェクト。
 *  - 白フラッシュ (220ms)
 *  - shockwave (540ms)
 *  - spark 飛散 (敵種別で数 / 範囲 / 寿命が異なる。tank は金色混じり)
 *  - ダメージ数字 (>=25 で crit)
 *  - camera shake (敵種別)
 */
export function hitEffect(
  scene: Phaser.Scene,
  target: { x: number; y: number },
  damage: number,
  enemyType: EnemyType = 'basic'
): void {
  const x = target.x;
  const y = target.y;

  // 白フラッシュ
  const flash = scene.add.graphics().setDepth(7);
  flash.fillStyle(0xffffff, 0.9);
  flash.fillCircle(0, 0, 8);
  flash.setPosition(x, y).setScale(0.4);
  scene.tweens.add({
    targets: flash, scale: 1.4, alpha: 0,
    duration: 220, ease: EASE,
    onComplete: () => flash.destroy(),
  });

  // Shockwave ring (白)
  const ring = scene.add.graphics().setDepth(7);
  ring.lineStyle(2, 0xffffff, 0.7);
  ring.strokeCircle(0, 0, 10);
  ring.setPosition(x, y);
  scene.tweens.add({
    targets: ring, scale: 2.2, alpha: 0,
    duration: 540, ease: EASE,
    onComplete: () => ring.destroy(),
  });

  // Sparks
  const cfg = sparkConfigFor(enemyType);
  for (let i = 0; i < cfg.count; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = cfg.range[0] + Math.random() * (cfg.range[1] - cfg.range[0]);
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d;
    // tank は 1/3 を金スパーク (装甲ぶつかり感)、それ以外は白
    const color = enemyType === 'tank' && i % 3 === 0 ? COLORS.resource : 0xffffff;
    const s = scene.add.graphics().setDepth(8);
    s.fillStyle(color, 1);
    s.fillCircle(0, 0, cfg.size);
    s.setPosition(x, y);
    scene.tweens.add({
      targets: s,
      x: x + dx,
      y: y + dy,
      alpha: 0,
      duration: cfg.duration,
      ease: EASE,
      onComplete: () => s.destroy(),
    });
  }

  // ダメージ数字 (25 以上で crit 表示)
  damageNumber(scene, x, y - 2, damage, damage >= 25);

  // カメラシェイク
  hitShake(scene, enemyType);
}

/**
 * 撃破時の大爆発。
 *  - 3 連 shockwave (0 / 80 / 160ms 遅延、半径と太さを段階的に)
 *  - 中心フラッシュ (520ms)
 *  - 多数 spark (boss は 32 個、それ以外は 20 個)
 */
export function bigExplosion(
  scene: Phaser.Scene,
  x: number,
  y: number,
  enemyType: EnemyType = 'basic',
  color: number = COLORS.enemy
): void {
  // 3 連 shockwave
  [0, 80, 160].forEach((delay, i) => {
    scene.time.delayedCall(delay, () => {
      const r = scene.add.graphics().setDepth(7);
      r.lineStyle(Math.max(0.6, 2 - i * 0.4), color, 0.85 - i * 0.2);
      r.strokeCircle(0, 0, 16 + i * 4);
      r.setPosition(x, y);
      scene.tweens.add({
        targets: r, scale: 2.5, alpha: 0,
        duration: 600 + i * 100, ease: EASE,
        onComplete: () => r.destroy(),
      });
    });
  });

  // 中心フラッシュ (白 + 色)
  const core = scene.add.graphics().setDepth(7);
  core.fillStyle(0xffffff, 1);
  core.fillCircle(0, 0, 14);
  core.fillStyle(color, 0.7);
  core.fillCircle(0, 0, 26);
  core.setPosition(x, y).setScale(0.5);
  scene.tweens.add({
    targets: core, scale: 1.8, alpha: 0,
    duration: 520, ease: EASE,
    onComplete: () => core.destroy(),
  });

  // パーティクル (1/3 を金色混じりに)
  const sparkCount = enemyType === 'boss' ? 32 : 20;
  for (let i = 0; i < sparkCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 30 + Math.random() * 60;
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d;
    const useGold = i % 3 === 0;
    const p = scene.add.graphics().setDepth(8);
    p.fillStyle(useGold ? COLORS.resource : color, 1);
    p.fillCircle(0, 0, 1.8);
    p.setPosition(x, y);
    scene.tweens.add({
      targets: p,
      x: x + dx,
      y: y + dy,
      alpha: 0,
      duration: 600 + Math.random() * 300,
      ease: EASE,
      onComplete: () => p.destroy(),
    });
  }
}
