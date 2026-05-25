import Phaser from 'phaser';
import { ENEMY_TYPES, COLORS, type EnemyType, type EnemyTypeStats } from '../config';
import { EnemyBullet } from './EnemyBullet';
import { hitEffect, bigExplosion } from '../systems/CombatFx';

/**
 * 敵 (Enemy)。出現位置から基地へ直進する単純AI。
 *
 * - Phase 4: 3 種類化 (basic / fast / tank)
 * - Phase 6 Step 7: boss 追加
 * - **2026-05-25**: sniper (behavior='shoot') を追加。
 *   `update` が context (enemyBullets[]) を受け取り、shoot 種別は
 *   `attackRange` で停止して `fireIntervalMs` 間隔で弾を発射する。
 *   charge 種別 (basic/fast/tank/boss) は従来通り体当たり + 電気スタン演出。
 */
export interface EnemyTickContext {
  enemyBullets: EnemyBullet[];
}

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
  /** shoot 種別の発射タイマー (ms 残り)。0 以下で 1 発撃って interval にリセット。 */
  private fireTimerMs: number;

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
    // shoot 種別は射程内到達後すぐに 1 発撃てるよう初期 timer を短めに
    this.fireTimerMs = this.stats.behavior === 'shoot' ? 600 : 0;

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
    } else if (this.type === 'sniper') {
      // sniper: 外周 + 砲身を意識した薄い長方形 + 中心リング (2026-05-25)
      g.fillStyle(stats.color, 0.2);
      g.fillCircle(0, 0, stats.radius + 6);
      g.lineStyle(1, stats.color, 0.7);
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
    // sniper: 砲身を細い長方形で前方に伸ばす
    if (this.type === 'sniper') {
      g.fillStyle(stats.color, 1);
      g.fillRect(stats.radius - 1, -2, stats.radius * 0.9, 4);
    }
    // コア (tank は濃いめ、fast は白っぽく速度感を強調、boss は強コア)
    const coreAlpha = this.type === 'fast' ? 1 : 0.85;
    g.fillStyle(COLORS.highlight, coreAlpha);
    g.fillCircle(0, 0, stats.radius * (this.type === 'boss' ? 0.35 : 0.25));
  }

  /**
   * delta は ms。`ctx` は shoot 種別だけが弾を push するための配列を渡す。
   * charge 種別 (basic/fast/tank/boss) は ctx を使わない。
   */
  public update(delta: number, ctx?: EnemyTickContext): void {
    if (this.dead || this.reachedBase) return;

    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);

    // ─── shoot 種別: 射程内で停止して弾を発射 ───────────────
    if (this.stats.behavior === 'shoot' && this.stats.attackRange) {
      // 進行方向 (基地向き) は常に更新 (停止していても砲身が基地を向く)
      this.gfx.setRotation(dist > 0 ? Math.atan2(dy, dx) : 0);
      if (dist <= this.stats.attackRange) {
        // 停止 + 定期発射
        this.fireTimerMs -= delta;
        if (this.fireTimerMs <= 0 && ctx) {
          ctx.enemyBullets.push(
            new EnemyBullet(
              this.gfx.scene,
              this.x,
              this.y,
              this.targetX,
              this.targetY,
              this.stats.bulletDamage ?? 10,
              this.stats.bulletSpeed ?? 240
            )
          );
          // マズルフラッシュ (短い円が拡大して消える)
          this.spawnMuzzleFlash();
          this.fireTimerMs = this.stats.fireIntervalMs ?? 1800;
        }
        return; // 移動しない
      }
      // 射程外: 通常通り基地に近づく
    }

    // ─── charge 種別 (および sniper 射程外): 基地直進 ──────
    // 基地接触判定 (sniper は damage=0 のため実害なし、charge は基地ヒット)
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

  /** sniper 発射時の砲口フラッシュ。 */
  private spawnMuzzleFlash(): void {
    const scene = this.gfx.scene;
    const flash = scene.add.graphics();
    flash.fillStyle(this.stats.color, 0.7);
    flash.fillCircle(0, 0, this.stats.radius * 0.9);
    flash.setPosition(this.x, this.y);
    scene.tweens.add({
      targets: flash,
      scale: 1.8,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  public takeDamage(amount: number): void {
    if (this.dead) return;
    this.hp -= amount;
    // Step 1-D: 弾命中 (amount >= 1) のみ着弾エフェクトを出す。
    // 体当たりモジュールの持続接触ダメ (~0.5/frame) ではエフェクトを発生させない (画面が騒がしくなるのを防ぐ)。
    if (amount >= 1) {
      hitEffect(this.gfx.scene, { x: this.x, y: this.y }, amount, this.type);
    }
    // 本体の短い色抜き (CombatFx と併用してヒット感を補強)
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
    // Step 1-E: 大爆発演出 (3 連 shockwave + 中心フラッシュ + 多数 spark)
    bigExplosion(this.gfx.scene, this.x, this.y, this.type, this.stats.color);
    // 本体は短く膨らんで消える (CombatFx の爆発と被らないよう 180ms 程度に短縮)
    this.gfx.scene.tweens.add({
      targets: this.gfx,
      alpha: 0,
      scale: 1.6,
      duration: 180,
      ease: 'Cubic.easeOut',
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

/**
 * 電気スタン演出: from→to 間にジグザグの白/シアン稲妻を 1 本描く。
 * 80ms でフェードアウト。Ship 接触ダメージや基地ヒット時に呼ぶ (2026-05-25)。
 */
export function spawnElectricArc(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  const g = scene.add.graphics();
  g.setDepth(8);
  const segments = 6;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const nx = dx / len;
  const ny = dy / len;
  // 法線
  const px = -ny;
  const py = nx;
  const points: Array<{ x: number; y: number }> = [];
  points.push({ x: fromX, y: fromY });
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const cx = fromX + dx * t;
    const cy = fromY + dy * t;
    const jitter = (Math.random() - 0.5) * 14; // 法線方向にゆらぎ
    points.push({ x: cx + px * jitter, y: cy + py * jitter });
  }
  points.push({ x: toX, y: toY });
  // 太い外側 (シアン) + 細い内側 (白)
  g.lineStyle(3, 0x44e0ff, 0.55);
  g.beginPath();
  g.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
  g.strokePath();
  g.lineStyle(1.2, 0xffffff, 0.95);
  g.beginPath();
  g.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i]!.x, points[i]!.y);
  g.strokePath();
  scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 110,
    ease: 'Cubic.easeOut',
    onComplete: () => g.destroy(),
  });
}
