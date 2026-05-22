import Phaser from 'phaser';
import { ENEMY_TYPES, COLORS, type EnemyType, type EnemyTypeStats } from '../config';

/**
 * 敵 (Enemy)。出現位置から基地へ直進する単純AI。
 * Phase 4 で 3 種類化 (basic / fast / tank)。stats は `ENEMY_TYPES[type]` 経由。
 *
 * 描画: 色付き三角 (進行方向を向く) + コア。
 */
export class Enemy {
  public x: number;
  public y: number;
  public readonly type: EnemyType;
  public readonly stats: EnemyTypeStats;
  public hp: number;
  public readonly speed: number;
  public readonly damage: number;
  public dead: boolean = false;
  public reachedBase: boolean = false;

  private gfx: Phaser.GameObjects.Graphics;
  private targetX: number;
  private targetY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    baseX: number,
    baseY: number,
    type: EnemyType = 'basic'
  ) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.stats = ENEMY_TYPES[type];
    this.hp = this.stats.hp;
    this.speed = this.stats.speed;
    this.damage = this.stats.damage;
    this.targetX = baseX;
    this.targetY = baseY;

    this.gfx = scene.add.graphics();
    this.redraw();
    this.gfx.setPosition(x, y);
  }

  /** 撃破報酬 (Phase 4)。GameScene の撃破集計で使用。 */
  public get creditsValue(): number {
    return this.stats.creditsOnKill;
  }

  /** 基地接触判定距離。 */
  public get contactRadius(): number {
    return this.stats.contactRadius;
  }

  /** 弾の当たり判定半径。 */
  public get hitRadius(): number {
    return this.stats.hitRadius;
  }

  private redraw(): void {
    const g = this.gfx;
    const stats = this.stats;
    g.clear();
    // ボス: 大きめ外周 + 二重リング (Phase 6 Step 7)
    if (this.type === 'boss') {
      g.fillStyle(stats.color, 0.22);
      g.fillCircle(0, 0, stats.radius + 14);
      g.lineStyle(2, stats.color, 0.7);
      g.strokeCircle(0, 0, stats.radius + 8);
      g.lineStyle(1, COLORS.highlight, 0.4);
      g.strokeCircle(0, 0, stats.radius + 2);
    } else {
      // 外側のグロー
      g.fillStyle(stats.color, 0.18);
      g.fillCircle(0, 0, stats.radius + 5);
    }
    // 三角 (右向き、後で setRotation で進行方向に合わせる)
    g.fillStyle(stats.color, 1);
    g.beginPath();
    g.moveTo(stats.radius, 0);
    g.lineTo(-stats.radius * 0.7, -stats.radius * 0.8);
    g.lineTo(-stats.radius * 0.7, stats.radius * 0.8);
    g.closePath();
    g.fillPath();
    // コア (tank は濃いめ、fast は白っぽく速度感を強調、boss は強コア)
    const coreAlpha = this.type === 'fast' ? 1 : 0.85;
    g.fillStyle(COLORS.highlight, coreAlpha);
    g.fillCircle(0, 0, stats.radius * (this.type === 'boss' ? 0.35 : 0.25));
  }

  /** delta は ms */
  public update(delta: number): void {
    if (this.dead || this.reachedBase) return;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    // 基地接触判定
    if (dist <= this.stats.contactRadius) {
      this.reachedBase = true;
      return;
    }

    const step = (this.speed * delta) / 1000;
    const nx = dx / dist;
    const ny = dy / dist;
    this.x += nx * step;
    this.y += ny * step;

    this.gfx.setPosition(this.x, this.y);
    this.gfx.setRotation(Math.atan2(ny, nx));
  }

  public takeDamage(amount: number): void {
    if (this.dead) return;
    this.hp -= amount;
    // ダメージフラッシュ
    this.gfx.setAlpha(0.4);
    this.gfx.scene.time.delayedCall(60, () => {
      if (!this.dead) this.gfx.setAlpha(1);
    });
    if (this.hp <= 0) {
      this.die();
    }
  }

  private die(): void {
    this.dead = true;
    // 簡易爆発演出: fadeしながら拡大
    this.gfx.scene.tweens.add({
      targets: this.gfx,
      alpha: 0,
      scale: 1.8,
      duration: 220,
      onComplete: () => this.gfx.destroy(),
    });
  }

  /** 基地接触時に呼ぶ。視覚的に消す。 */
  public consumeOnBaseHit(): void {
    this.dead = true;
    this.gfx.destroy();
  }

  public destroy(): void {
    this.gfx.destroy();
    this.dead = true;
  }
}
