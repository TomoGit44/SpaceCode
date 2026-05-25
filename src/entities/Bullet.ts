import Phaser from 'phaser';
import { COLORS, BASE_TURRET } from '../config';
import { Enemy } from './Enemy';

export interface BulletOptions {
  /**
   * 0 より大きいとき: 直撃時に半径内の敵全員に AoE ダメージを与える「ボム弾」モード。
   * 見た目もオレンジ大粒に変わり、命中エフェクトを爆発に差し替える。
   */
  readonly explosionRadius?: number;
  /** AoE 適用時に直撃ターゲット以外の敵参照を渡す getter (GameScene が提供)。 */
  readonly getEnemies?: () => ReadonlyArray<Enemy>;
}

/**
 * 基地砲塔・宇宙船が共用する弾。指定 Enemy をホーミングする。
 * 対象が消滅したら自壊。
 *
 * Step 1-B (2026-05-25): 二層 glow 化 + 60ms 間隔の残像トレイル。
 *   `color` は射撃源で変える (基地砲塔 = teal / Ship = blue)。
 *
 * 2026-05-25 後: `explosionRadius` 指定でボム弾モード。低速 + 大粒 + 着弾時 AoE。
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
  private explosionRadius: number;
  private getEnemies?: () => ReadonlyArray<Enemy>;
  private lifeMs: number = 3000; // 安全策の自動破棄
  private trailMs: number = 0;   // 残像生成タイマー

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    target: Enemy,
    damage: number = BASE_TURRET.damagePerShot,
    speed: number = BASE_TURRET.bulletSpeed,
    color: number = COLORS.accent,
    options: BulletOptions = {}
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.color = color;
    this.explosionRadius = options.explosionRadius ?? 0;
    this.getEnemies = options.getEnemies;

    this.gfx = scene.add.graphics().setDepth(5);
    if (this.explosionRadius > 0) {
      // ボム弾: 大粒のオレンジ。芯 + ハロー + 黒い縞 (信管っぽさ)
      this.gfx.fillStyle(color, 0.4);
      this.gfx.fillCircle(0, 0, 12);
      this.gfx.fillStyle(color, 1);
      this.gfx.fillCircle(0, 0, 7);
      this.gfx.fillStyle(0x05070d, 0.55);
      this.gfx.fillRect(-7, -1.2, 14, 2.4);
      this.gfx.fillStyle(COLORS.highlight, 0.9);
      this.gfx.fillCircle(0, 0, 2);
    } else {
      // 通常弾: 二層 glow
      this.gfx.fillStyle(color, 0.35);
      this.gfx.fillCircle(0, 0, 6);
      this.gfx.fillStyle(color, 1);
      this.gfx.fillCircle(0, 0, 3);
      this.gfx.fillStyle(COLORS.highlight, 0.75);
      this.gfx.fillCircle(0, 0, 1.4);
    }
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
      // ターゲット消失時: ボム弾は最後の座標で爆発、通常弾は消える
      if (this.explosionRadius > 0) {
        this.explode();
      }
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
      if (this.explosionRadius > 0) this.explode();
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

  /**
   * ボム弾の爆発処理。
   * - 半径内のすべての敵に damage の AoE ダメージ (直撃済みは中心 = 0 距離なので二重ダメージしない)
   * - 視覚: 拡大しながらフェードする 2 重円 + 短い shake
   */
  private explode(): void {
    const r = this.explosionRadius;
    const enemies = this.getEnemies?.() ?? [];
    for (const e of enemies) {
      if (e.dead) continue;
      // 直撃ターゲットは update() 側で既にダメージ済みなのでスキップ
      if (e === this.target) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= r) e.takeDamage(this.damage);
    }
    // 視覚: AoE リング + 火花フラッシュ
    const ring = this.scene.add.graphics().setDepth(6);
    ring.fillStyle(this.color, 0.35);
    ring.fillCircle(0, 0, r * 0.55);
    ring.lineStyle(3, this.color, 1);
    ring.strokeCircle(0, 0, r * 0.55);
    ring.setPosition(this.x, this.y).setScale(0.4);
    this.scene.tweens.add({
      targets: ring,
      scale: 1.2,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const flash = this.scene.add.graphics().setDepth(7);
    flash.fillStyle(COLORS.highlight, 0.9);
    flash.fillCircle(0, 0, 14);
    flash.setPosition(this.x, this.y);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.8,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
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
