import Phaser from 'phaser';
import { BASE, COLORS } from '../config';

/**
 * 基地 (Base)。プレイヤーが守る防衛対象。
 * MVP では HP のみ持ち、後フェーズで敵衝突 / 資源納品先 / 回復ロジックが乗る。
 *
 * 描画: 内側の塗りつぶし円 + 外周リング + 中央十字。すべて Graphics で生成。
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
  private pulse: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    // 外周リング (回転する)
    this.ring = scene.add.graphics();
    this.drawRing();
    this.ring.setPosition(x, y);

    // 本体
    this.bodyGfx = scene.add.graphics();
    this.drawBody();
    this.bodyGfx.setPosition(x, y);

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

  /** ダメージ。後フェーズで敵衝突から呼ばれる。 */
  public takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
  }

  public isDestroyed(): boolean {
    return this.hp <= 0;
  }

  /** 緩やかなコア脈動。delta は ms。 */
  public update(delta: number): void {
    this.pulse += delta / 600;
    const s = 1 + Math.sin(this.pulse) * 0.04;
    this.bodyGfx.setScale(s);
  }

  /** シーン破棄時に呼ぶ。 */
  public destroy(): void {
    this.bodyGfx.destroy();
    this.ring.destroy();
  }

  /** Scene への参照露出が必要な場合用。 */
  public getScene(): Phaser.Scene {
    return this.scene;
  }
}
