import Phaser from 'phaser';
import { COLORS } from '../config';

/**
 * EnemyBullet — 敵 (sniper 等) が発射する弾 (2026-05-25 新規)。
 *
 * 既存の `Bullet` は Enemy をホーミングするため Ship/Base 砲塔用。
 * EnemyBullet は **基地の位置を静的ターゲット** にして直線飛行する。
 * 経路上の Ship は素通り (シンプル化のため、最初の MVP では基地のみ攻撃)。
 *
 * GameScene が enemyBullets[] を保持し、毎フレーム update + 基地ヒット判定を行う。
 */
export class EnemyBullet {
  public x: number;
  public y: number;
  public dead: boolean = false;

  private gfx: Phaser.GameObjects.Graphics;
  private targetX: number;
  private targetY: number;
  private speed: number;
  private damage: number;
  private readonly radius: number = 5;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    damage: number,
    speed: number
  ) {
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.damage = damage;
    this.speed = speed;

    this.gfx = scene.add.graphics();
    this.redraw();
  }

  private redraw(): void {
    const g = this.gfx;
    g.clear();
    // 外側 glow (淡い赤)
    g.fillStyle(COLORS.enemy, 0.35);
    g.fillCircle(0, 0, this.radius + 4);
    // 本体 (赤)
    g.fillStyle(COLORS.enemy, 1);
    g.fillCircle(0, 0, this.radius);
    // コア (白)
    g.fillStyle(COLORS.highlight, 0.9);
    g.fillCircle(0, 0, this.radius * 0.35);
    g.setPosition(this.x, this.y);
  }

  /** delta は ms。基地まで到達したら dead=true で自動破棄。 */
  public update(delta: number): void {
    if (this.dead) return;
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.speed * delta) / 1000;
    if (dist <= step) {
      this.x = this.targetX;
      this.y = this.targetY;
      this.gfx.setPosition(this.x, this.y);
      return; // hitsBase 側で消滅させる
    }
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.gfx.setPosition(this.x, this.y);
  }

  /** 基地ヒット判定。base 中心 (baseX,baseY) + baseRadius 円との衝突。 */
  public hitsBase(baseX: number, baseY: number, baseRadius: number): boolean {
    if (this.dead) return false;
    return Math.hypot(baseX - this.x, baseY - this.y) <= baseRadius + this.radius;
  }

  public getDamage(): number {
    return this.damage;
  }

  /** 明示的に破棄 (基地ヒット後 / シーン終了時)。 */
  public destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.gfx.destroy();
  }
}
