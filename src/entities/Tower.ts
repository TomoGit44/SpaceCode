import Phaser from 'phaser';
import { COLORS, TOWER } from '../config';
import { Enemy } from './Enemy';
import { Bullet } from './Bullet';

/**
 * タワー (Tower)。固定設置・自動迎撃。
 * 射程内の最寄り敵を選び、fireIntervalMs ごとに Bullet を生成。
 *
 * 描画: 円基盤 + 砲身 (敵方向に回転)。
 */
export class Tower {
  public readonly x: number;
  public readonly y: number;

  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Graphics;
  private barrel: Phaser.GameObjects.Graphics;
  private rangeRing: Phaser.GameObjects.Graphics;

  private cooldownMs: number = 0;
  private currentTarget: Enemy | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    // 射程リング (薄く常時表示)
    this.rangeRing = scene.add.graphics();
    this.rangeRing.lineStyle(1, COLORS.ally, 0.12);
    this.rangeRing.strokeCircle(0, 0, TOWER.range);
    this.rangeRing.setPosition(x, y);

    // 基盤
    this.base = scene.add.graphics();
    this.base.fillStyle(COLORS.ally, 0.22);
    this.base.fillCircle(0, 0, 18);
    this.base.fillStyle(COLORS.ally, 1);
    this.base.fillCircle(0, 0, 11);
    this.base.lineStyle(1.5, COLORS.highlight, 0.7);
    this.base.strokeCircle(0, 0, 11);
    this.base.setPosition(x, y);

    // 砲身 (右向き基本、setRotation で向きを変える)
    this.barrel = scene.add.graphics();
    this.barrel.fillStyle(COLORS.highlight, 0.95);
    this.barrel.fillRect(0, -2.5, 18, 5);
    this.barrel.fillStyle(COLORS.accent, 1);
    this.barrel.fillRect(16, -3.5, 4, 7);
    this.barrel.setPosition(x, y);
  }

  /**
   * delta は ms。enemies/bullets はシーン側の配列。
   * 発射時は bullets に追加する。
   */
  public update(delta: number, enemies: Enemy[], bullets: Bullet[]): void {
    this.cooldownMs = Math.max(0, this.cooldownMs - delta);

    // 現在ターゲットの有効性チェック
    if (this.currentTarget && (this.currentTarget.dead || !this.inRange(this.currentTarget))) {
      this.currentTarget = null;
    }

    // 必要なら新規ターゲット取得
    if (!this.currentTarget) {
      this.currentTarget = this.findNearestEnemy(enemies);
    }

    if (this.currentTarget) {
      // 砲身を向ける
      const dx = this.currentTarget.x - this.x;
      const dy = this.currentTarget.y - this.y;
      this.barrel.setRotation(Math.atan2(dy, dx));

      // 発射
      if (this.cooldownMs <= 0) {
        bullets.push(new Bullet(this.scene, this.x, this.y, this.currentTarget));
        this.cooldownMs = TOWER.fireIntervalMs;
        this.muzzleFlash();
      }
    }
  }

  private inRange(e: Enemy): boolean {
    const dx = e.x - this.x;
    const dy = e.y - this.y;
    return dx * dx + dy * dy <= TOWER.range * TOWER.range;
  }

  private findNearestEnemy(enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = TOWER.range * TOWER.range;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.x - this.x;
      const dy = e.y - this.y;
      const d = dx * dx + dy * dy;
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private muzzleFlash(): void {
    // 砲身先端の一瞬の発光
    const angle = this.barrel.rotation;
    const fx = this.x + Math.cos(angle) * 22;
    const fy = this.y + Math.sin(angle) * 22;
    const flash = this.scene.add.graphics();
    flash.fillStyle(COLORS.accent, 1);
    flash.fillCircle(0, 0, 5);
    flash.setPosition(fx, fy);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 0.3,
      duration: 110,
      onComplete: () => flash.destroy(),
    });
  }

  public destroy(): void {
    this.base.destroy();
    this.barrel.destroy();
    this.rangeRing.destroy();
  }
}
