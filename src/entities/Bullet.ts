import Phaser from 'phaser';
import { COLORS, BASE_TURRET } from '../config';
import { Enemy } from './Enemy';

/**
 * 基地砲塔・宇宙船が共用する弾。指定 Enemy をホーミングする。
 * 対象が消滅したら自壊。
 *
 * Step 1-B (2026-05-25): 二層 glow 化 + 60ms 間隔の残像トレイル。
 *   `color` は射撃源で変える (基地砲塔 = teal / Ship = blue)。
 */
export class Bullet {
  public x: number;
  public y: number;
  public dead: boolean = false;

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  private target: Enemy;
  private damage: number;
  private speed: number;
  private color: number;
  private lifeMs: number = 3000; // 安全策の自動破棄
  private trailMs: number = 0;   // 残像生成タイマー

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Enemy,
    damage: number = BASE_TURRET.damagePerShot,
    speed: number = BASE_TURRET.bulletSpeed,
    color: number = COLORS.accent
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.color = color;

    this.gfx = scene.add.graphics().setDepth(5);
    // 二層 glow: 大きめ低α の halo + 本体 + 白コア
    this.gfx.fillStyle(color, 0.35);
    this.gfx.fillCircle(0, 0, 6);
    this.gfx.fillStyle(color, 1);
    this.gfx.fillCircle(0, 0, 3);
    this.gfx.fillStyle(COLORS.highlight, 0.75);
    this.gfx.fillCircle(0, 0, 1.4);
    this.gfx.setPosition(x, y);
  }

  /** delta は ms。当たれば damage を target に与えて自壊。 */
  public update(delta: number): void {
    if (this.dead) return;

    this.lifeMs -= delta;
    if (this.lifeMs <= 0) {
      this.destroy();
      return;
    }

    if (this.target.dead) {
      this.destroy();
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * delta) / 1000;

    if (dist <= step + 4) {
      // 命中
      this.target.takeDamage(this.damage);
      this.destroy();
      return;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.gfx.setPosition(this.x, this.y);

    // 残像トレイル (60ms ごとに 1 つ、320ms で fade)
    this.trailMs -= delta;
    if (this.trailMs <= 0) {
      this.trailMs = 60;
      this.spawnTrail();
    }
  }

  private spawnTrail(): void {
    const t = this.scene.add.graphics().setDepth(4);
    t.fillStyle(this.color, 0.5);
    t.fillCircle(0, 0, 2);
    t.setPosition(this.x, this.y);
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      scale: 0.4,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  public destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.gfx.destroy();
  }
}
