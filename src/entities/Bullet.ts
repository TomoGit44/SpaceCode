import Phaser from 'phaser';
import { COLORS, TOWER } from '../config';
import { Enemy } from './Enemy';

/**
 * タワーが発射する弾。指定 Enemy をホーミングする。
 * 対象が消滅したら自壊。
 */
export class Bullet {
  public x: number;
  public y: number;
  public dead: boolean = false;

  private gfx: Phaser.GameObjects.Graphics;
  private target: Enemy;
  private damage: number;
  private speed: number;
  private lifeMs: number = 3000; // 安全策の自動破棄

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Enemy,
    damage: number = TOWER.damagePerShot,
    speed: number = TOWER.bulletSpeed
  ) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = speed;

    this.gfx = scene.add.graphics();
    this.gfx.fillStyle(COLORS.accent, 1);
    this.gfx.fillCircle(0, 0, 3);
    this.gfx.fillStyle(COLORS.highlight, 0.6);
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
  }

  public destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.gfx.destroy();
  }
}
