import Phaser from 'phaser';
import { COLORS, BASE_TURRET, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { Enemy } from './Enemy';

export interface BulletOptions {
  /**
   * 0 より大きいとき: 命中時 (もしくは lifetime 切れ時) に半径内の敵全員に
   * AoE ダメージを与える「ボム弾」モード。見た目もオレンジ大粒に変わる。
   */
  readonly explosionRadius?: number;
}

/**
 * 基地砲塔・宇宙船が共用する弾。**完全直進**。
 *
 * 2026-05-25 後: ホーミングを廃止し、発射時の照準点から方向を確定して直進する設計に変更。
 *  - target Enemy 参照は持たない (`aimX, aimY` から発射方向を 1 度だけ計算)
 *  - 衝突判定: 毎フレーム update に渡される enemies 配列を走査し、最初に hit-radius
 *    + 自分の半径内に入った敵にダメージを与えて自壊
 *  - ボム弾は命中時に AoE 爆発 (もしくは画面外 / lifetime 切れで自壊)
 *  - 命中しなかったぶんは画面外 (GAME_WIDTH/HEIGHT のはみ出し) で自壊
 *
 * Step 1-B (2026-05-25): 二層 glow 化 + 60ms 間隔の残像トレイル。
 *   `color` は射撃源で変える (基地砲塔 = teal / Ship = blue / ボム = enemy 色)。
 */
export class Bullet {
  public x: number;
  public y: number;
  public dead: boolean = false;

  private scene: Phaser.Scene;
  private gfx: Phaser.GameObjects.Graphics;
  /** 速度ベクトル (発射時に確定、以後変化しない)。 */
  private readonly vx: number;
  private readonly vy: number;
  /** 当たり判定の自分側半径 (ボム弾は大粒なので少し大きめ)。 */
  private readonly hitRadius: number;
  private damage: number;
  private color: number;
  private explosionRadius: number;
  private lifeMs: number = 3000; // 安全策の自動破棄
  private trailMs: number = 0;   // 残像生成タイマー

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    /** 発射時の照準点 (この点に向かう方向ベクトルを取り、以後直進する)。 */
    aimX: number,
    aimY: number,
    damage: number = BASE_TURRET.damagePerShot,
    speed: number = BASE_TURRET.bulletSpeed,
    color: number = COLORS.accent,
    options: BulletOptions = {}
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.color = color;
    this.explosionRadius = options.explosionRadius ?? 0;
    this.hitRadius = this.explosionRadius > 0 ? 8 : 4;

    // 発射方向を 1 度だけ計算して固定
    const dx = aimX - x;
    const dy = aimY - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) {
      // 同一点を狙うケースのフォールバック: 右方向に発射
      this.vx = speed;
      this.vy = 0;
    } else {
      this.vx = (dx / dist) * speed;
      this.vy = (dy / dist) * speed;
    }

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

  /**
   * delta は ms。
   * 1. lifetime / 画面外チェック
   * 2. 直進移動
   * 3. 全 enemies を走査し、ヒット判定 (自分の半径 + 敵 hit-radius)
   * 4. 命中したらダメージを与えて自壊 (ボム弾は AoE 爆発)
   */
  public update(delta: number, enemies?: ReadonlyArray<Enemy>): void {
    if (this.dead) return;

    this.lifeMs -= delta;
    if (this.lifeMs <= 0) {
      if (this.explosionRadius > 0) this.explode(enemies ?? []);
      this.destroy();
      return;
    }

    const step = delta / 1000;
    this.x += this.vx * step;
    this.y += this.vy * step;
    this.gfx.setPosition(this.x, this.y);

    // 画面外: 余裕 20px 持たせて clip
    if (this.x < -20 || this.x > GAME_WIDTH + 20 || this.y < -20 || this.y > GAME_HEIGHT + 20) {
      if (this.explosionRadius > 0) this.explode(enemies ?? []);
      this.destroy();
      return;
    }

    // 衝突判定 (最初にヒットした敵で停止)
    if (enemies) {
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = e.x - this.x;
        const dy = e.y - this.y;
        const r = this.hitRadius + e.hitRadius;
        if (dx * dx + dy * dy <= r * r) {
          e.takeDamage(this.damage);
          if (this.explosionRadius > 0) this.explode(enemies, e);
          this.destroy();
          return;
        }
      }
    }

    // 残像トレイル (60ms ごとに 1 つ、320ms で fade)
    this.trailMs -= delta;
    if (this.trailMs <= 0) {
      this.trailMs = 60;
      this.spawnTrail();
    }
  }

  /**
   * ボム弾の爆発処理。
   *  - 半径内のすべての敵に damage を与える (直撃した敵は除外 = 二重ダメ防止)
   *  - 視覚: 拡大しながらフェードする 2 重円 + 中心フラッシュ
   */
  private explode(enemies: ReadonlyArray<Enemy>, directHit?: Enemy): void {
    const r = this.explosionRadius;
    for (const e of enemies) {
      if (e.dead) continue;
      if (e === directHit) continue; // 直撃は update 側で既に処理済み
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
