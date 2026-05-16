import Phaser from 'phaser';
import { COLORS, PLANET } from '../config';

/**
 * 惑星 (Planet)。Phase D で配置される資源源。
 * 当たり判定は持たず、敵は素通り。Ship が `mineRadius` 以内に入ったら採掘可能。
 */
export interface PlanetConfig {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly initialResources: number;
}

export class Planet {
  public readonly x: number;
  public readonly y: number;
  public readonly radius: number;
  public readonly mineRadius: number;
  public readonly maxResources: number;
  public resources: number;
  public depleted: boolean = false;

  private scene: Phaser.Scene;
  private bodyGfx: Phaser.GameObjects.Graphics;
  private ringGfx: Phaser.GameObjects.Graphics;
  private barBg: Phaser.GameObjects.Graphics;
  private bar: Phaser.GameObjects.Graphics;
  private respawnGfx: Phaser.GameObjects.Graphics;
  private pulse: number = 0;
  private depletedElapsedMs: number = 0;  // Phase 4: 枯渇からの経過 (リスポーンタイマー)

  constructor(scene: Phaser.Scene, cfg: PlanetConfig) {
    this.scene = scene;
    this.x = cfg.x;
    this.y = cfg.y;
    this.radius = cfg.radius;
    this.mineRadius = cfg.radius + PLANET.mineRadiusPadding;
    this.resources = cfg.initialResources;
    this.maxResources = cfg.initialResources;

    // ハロー + 本体
    this.bodyGfx = scene.add.graphics();
    this.bodyGfx.setPosition(this.x, this.y);
    this.drawBody();

    // 残資源リング (回転アニメ用に独立)
    this.ringGfx = scene.add.graphics();
    this.ringGfx.setPosition(this.x, this.y);
    this.drawRing();

    // 真下の残量バー
    const barW = this.radius * 2;
    const barY = this.y + this.radius + 10;
    this.barBg = scene.add.graphics();
    this.barBg.fillStyle(COLORS.panelBg, 1);
    this.barBg.fillRect(this.x - barW / 2, barY, barW, 3);
    this.bar = scene.add.graphics();
    this.drawBar();

    // Phase 4: リスポーン進捗インジケータ (枯渇時のみ可視化)
    this.respawnGfx = scene.add.graphics();

    // リングの緩い回転
    scene.tweens.add({
      targets: this.ringGfx,
      angle: 360,
      duration: 18000,
      repeat: -1,
    });
  }

  private drawBody(): void {
    const g = this.bodyGfx;
    g.clear();
    // ハロー
    g.fillStyle(COLORS.resource, 0.12);
    g.fillCircle(0, 0, this.radius + 10);
    // 本体 (暗めの黄)
    g.fillStyle(COLORS.planetBody, 1);
    g.fillCircle(0, 0, this.radius);
    // 表面の模様 (2 つの小円)
    g.fillStyle(COLORS.planetMark, 1);
    g.fillCircle(-this.radius * 0.35, -this.radius * 0.2, this.radius * 0.22);
    g.fillCircle(this.radius * 0.25, this.radius * 0.3, this.radius * 0.16);
    // 中央コア (採掘可能を示す光点)
    g.fillStyle(COLORS.resource, 1);
    g.fillCircle(0, 0, this.radius * 0.18);
  }

  private drawRing(): void {
    const g = this.ringGfx;
    g.clear();
    const ratio = this.resources / this.maxResources;
    if (ratio <= 0) return;
    g.lineStyle(2, COLORS.resource, 0.85);
    // 残資源比に応じて円弧 (-PI/2 から時計回り)
    g.beginPath();
    g.arc(0, 0, this.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
    g.strokePath();
  }

  private drawBar(): void {
    const ratio = Math.max(0, this.resources / this.maxResources);
    const barW = this.radius * 2;
    const barY = this.y + this.radius + 10;
    this.bar.clear();
    this.bar.fillStyle(COLORS.resource, 1);
    this.bar.fillRect(this.x - barW / 2, barY, barW * ratio, 3);
  }

  /**
   * 1 フレームぶん採掘する。実際に取れた量を返す (枯渇間際は減ることがある)。
   * @param delta フレーム経過時間 (ms)
   * @param ratePerSec 1 秒あたりの採掘量
   */
  public extract(delta: number, ratePerSec: number): number {
    if (this.depleted) return 0;
    const want = ratePerSec * (delta / 1000);
    const got = Math.min(want, this.resources);
    this.resources -= got;
    if (this.resources <= 0) {
      this.resources = 0;
      this.depleted = true;
      this.depletedElapsedMs = 0;
    }
    this.drawRing();
    this.drawBar();
    return got;
  }

  public update(delta: number): void {
    // 枯渇中はリスポーンタイマーを進める (Phase 4)
    if (this.depleted) {
      this.depletedElapsedMs += delta;
      this.drawRespawnIndicator();
      if (this.depletedElapsedMs >= PLANET.respawnMs) {
        this.respawn();
      }
      // 枯渇中は脈動も止める (採掘不可のシグナル)
      this.bodyGfx.setScale(0.92);
      return;
    }

    // コアの脈動 (採掘可能のシグナル)
    this.pulse += delta / 700;
    const s = 1 + Math.sin(this.pulse) * 0.05;
    this.bodyGfx.setScale(s);
  }

  /** 枯渇 → リスポーンタイマー満了で resources を全回復し depleted を解除する。 */
  private respawn(): void {
    this.resources = this.maxResources;
    this.depleted = false;
    this.depletedElapsedMs = 0;
    this.respawnGfx.clear();
    this.drawRing();
    this.drawBar();
    // Phase 5: リスポーン完了の短いフラッシュ (resource 色の円が拡大しながら消える)
    const flash = this.scene.add.graphics();
    flash.fillStyle(COLORS.resource, 0.6);
    flash.fillCircle(this.x, this.y, this.radius);
    this.scene.tweens.add({
      targets: flash,
      scale: 1.8,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  /** 枯渇中のカウントダウンを真下の小バー領域に重ねて描画。 */
  private drawRespawnIndicator(): void {
    const g = this.respawnGfx;
    g.clear();
    const ratio = Math.min(1, this.depletedElapsedMs / PLANET.respawnMs);
    const barW = this.radius * 2;
    const barY = this.y + this.radius + 10;
    // 進捗バー (ティール: もうすぐ復活)
    g.fillStyle(COLORS.accent, 0.85);
    g.fillRect(this.x - barW / 2, barY, barW * ratio, 3);
    // リングの灰色プレースホルダ
    g.lineStyle(2, COLORS.uiDim, 0.35);
    g.strokeCircle(this.x, this.y, this.radius + 6);
  }

  public destroy(): void {
    this.bodyGfx.destroy();
    this.ringGfx.destroy();
    this.barBg.destroy();
    this.bar.destroy();
    this.respawnGfx.destroy();
    void this.scene;
  }
}
