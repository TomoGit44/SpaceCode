import Phaser from 'phaser';
import { BASE, BASE_TURRET, COLORS } from '../config';
import { Enemy } from './Enemy';
import { Bullet } from './Bullet';
import { muzzleFlash } from '../systems/CombatFx';
import type { EffectSystem } from '../items/effects';

/**
 * 基地 (Base)。プレイヤーが守る防衛対象。
 * Phase 5 後: タワーを廃止して基地自体が固定砲塔を内蔵 (range/damage/fireInterval は
 * `BASE_TURRET` で集約)。常時表示の射程リングで攻撃範囲を可視化する。
 *
 * 描画: 内側の塗りつぶし円 + 外周リング + 中央十字 + 射程リング + 砲身 (回転)。
 */
export class Base {
  public hp: number = BASE.hp;
  public readonly maxHp: number = BASE.hp;
  public readonly radius: number = BASE.radius;

  private scene: Phaser.Scene;
  public readonly x: number;
  public readonly y: number;

  private bodyGfx: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private rangeRing: Phaser.GameObjects.Graphics;
  private barrel: Phaser.GameObjects.Graphics;
  private pulse: number = 0;

  // 砲塔状態
  private cooldownMs: number = 0;
  private currentTarget: Enemy | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    // 射程リング (常時表示で攻撃範囲を可視化)
    this.rangeRing = scene.add.graphics();
    this.drawRangeRing();
    this.rangeRing.setPosition(x, y);

    // 外周リング (回転する)
    this.ring = scene.add.graphics();
    this.drawRing();
    this.ring.setPosition(x, y);

    // 本体
    this.bodyGfx = scene.add.graphics();
    this.drawBody();
    this.bodyGfx.setPosition(x, y);

    // 砲身 (敵方向に回転)
    this.barrel = scene.add.graphics();
    this.drawBarrel();
    this.barrel.setPosition(x, y);

    // 緩やかな回転 tween (リングのみ)
    scene.tweens.add({
      targets: this.ring,
      angle: 360,
      duration: 12000,
      repeat: -1,
    });
  }

  private drawBody(): void {
    const g = this.bodyGfx;
    g.clear();
    // 外側の柔らかいハロー
    g.fillStyle(COLORS.base, 0.18);
    g.fillCircle(0, 0, BASE.radius + 14);
    // 本体
    g.fillStyle(COLORS.base, 1);
    g.fillCircle(0, 0, BASE.radius);
    // 中央コア
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(0, 0, BASE.radius * 0.4);
    // 十字 (中央の発光)
    g.lineStyle(2, COLORS.highlight, 0.9);
    g.beginPath();
    g.moveTo(-BASE.radius * 0.55, 0);
    g.lineTo(BASE.radius * 0.55, 0);
    g.moveTo(0, -BASE.radius * 0.55);
    g.lineTo(0, BASE.radius * 0.55);
    g.strokePath();
  }

  private drawRing(): void {
    const g = this.ring;
    g.clear();
    g.lineStyle(2, COLORS.baseRing, 0.85);
    g.strokeCircle(0, 0, BASE.ringRadius);
    // 4方向のノッチ
    g.lineStyle(3, COLORS.baseRing, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const x1 = Math.cos(a) * (BASE.ringRadius - 4);
      const y1 = Math.sin(a) * (BASE.ringRadius - 4);
      const x2 = Math.cos(a) * (BASE.ringRadius + 4);
      const y2 = Math.sin(a) * (BASE.ringRadius + 4);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
    }
  }

  /** 射程リング: 攻撃範囲を常時表示する (ダッシュ風の点線で目立たせる)。 */
  private drawRangeRing(): void {
    const g = this.rangeRing;
    g.clear();
    // 薄い外周
    g.lineStyle(1, COLORS.accent, 0.18);
    g.strokeCircle(0, 0, BASE_TURRET.range);
    // 内側に少し濃いダッシュ風 (32 分割で短い arc を描く)
    g.lineStyle(2, COLORS.accent, 0.32);
    const segments = 48;
    for (let i = 0; i < segments; i += 2) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, BASE_TURRET.range, a0, a1, false);
      g.strokePath();
    }
  }

  private drawBarrel(): void {
    const g = this.barrel;
    g.clear();
    g.fillStyle(COLORS.highlight, 0.95);
    g.fillRect(0, -3, 22, 6);
    g.fillStyle(COLORS.accent, 1);
    g.fillRect(20, -4, 4, 8);
  }

  /** ダメージ。後フェーズで敵衝突から呼ばれる。 */
  public takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  /** Phase 6: ケミカルによる回復。最大 HP を超えない。 */
  public heal(amount: number): void {
    if (amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  public isDestroyed(): boolean {
    return this.hp <= 0;
  }

  /** 緩やかなコア脈動 + 砲塔のターゲット選定・発射。delta は ms。 */
  public update(delta: number, enemies: Enemy[], bullets: Bullet[], effects: EffectSystem): void {
    this.pulse += delta / 600;
    const s = 1 + Math.sin(this.pulse) * 0.04;
    this.bodyGfx.setScale(s);

    // ─── 砲塔ロジック ───
    this.cooldownMs = Math.max(0, this.cooldownMs - delta);

    if (this.currentTarget && (this.currentTarget.dead || !this.inRange(this.currentTarget))) {
      this.currentTarget = null;
    }
    if (!this.currentTarget) {
      this.currentTarget = this.findNearestEnemy(enemies);
    }

    if (this.currentTarget) {
      const dx = this.currentTarget.x - this.x;
      const dy = this.currentTarget.y - this.y;
      this.barrel.setRotation(Math.atan2(dy, dx));

      if (this.cooldownMs <= 0) {
        // Phase 6: 砲塔火力はオムニ・コアで強化されうる (EffectSystem 経由)
        const turretDamage = effects.baseStat('turretDamage', BASE_TURRET.damagePerShot);
        bullets.push(
          new Bullet(this.scene, this.x, this.y, this.currentTarget, turretDamage)
        );
        this.cooldownMs = BASE_TURRET.fireIntervalMs;
        this.muzzleFlash();
      }
    }
  }

  private inRange(e: Enemy): boolean {
    const dx = e.x - this.x;
    const dy = e.y - this.y;
    return dx * dx + dy * dy <= BASE_TURRET.range * BASE_TURRET.range;
  }

  private findNearestEnemy(enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = BASE_TURRET.range * BASE_TURRET.range;
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

  /**
   * 射撃時の演出: CombatFx の砲口フラッシュ (3 層 + 4 ray) + 砲身リコイル。
   * 連射時は前フレームの barrel tween を kill して位置を原点に戻してから再生する。
   */
  private muzzleFlash(): void {
    const angle = this.barrel.rotation;
    const fx = this.x + Math.cos(angle) * 26;
    const fy = this.y + Math.sin(angle) * 26;
    muzzleFlash(this.scene, fx, fy, angle, COLORS.accent);
    // 砲身リコイル (進行方向の反対に 3px ずらして 60ms で戻る)
    this.scene.tweens.killTweensOf(this.barrel);
    this.barrel.setPosition(this.x, this.y);
    this.scene.tweens.add({
      targets: this.barrel,
      x: this.x - Math.cos(angle) * 3,
      y: this.y - Math.sin(angle) * 3,
      duration: 60,
      yoyo: true,
      ease: 'Cubic.easeOut',
    });
  }

  /** シーン破棄時に呼ぶ。 */
  public destroy(): void {
    this.bodyGfx.destroy();
    this.ring.destroy();
    this.rangeRing.destroy();
    this.barrel.destroy();
  }

  /** Scene への参照露出が必要な場合用。 */
  public getScene(): Phaser.Scene {
    return this.scene;
  }
}
