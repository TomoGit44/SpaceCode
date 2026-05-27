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
  private ring: Phaser.GameObjects.Graphics;          // 外輪 8 セグメント (時計回り)
  private innerRing: Phaser.GameObjects.Graphics;     // 内側点線 (反対回り) — Step 2-A
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

    // 外周リング (8 セグメント、時計回り 16s)
    this.ring = scene.add.graphics();
    this.drawRing();
    this.ring.setPosition(x, y);

    // 内側点線リング (反対回り 24s) — Step 2-A
    this.innerRing = scene.add.graphics();
    this.drawInnerRing();
    this.innerRing.setPosition(x, y);

    // 本体 (ヘックスコア)
    this.bodyGfx = scene.add.graphics();
    this.drawBody();
    this.bodyGfx.setPosition(x, y);

    // 砲身 (敵方向に回転、双砲)
    this.barrel = scene.add.graphics();
    this.drawBarrel();
    this.barrel.setPosition(x, y);

    // 回転 tween (外輪は時計回り、内側はカウンター)
    scene.tweens.add({
      targets: this.ring,
      angle: 360,
      duration: 16000,
      repeat: -1,
    });
    scene.tweens.add({
      targets: this.innerRing,
      angle: -360,
      duration: 24000,
      repeat: -1,
    });
  }

  /**
   * Step 2-A: ヘックスコア化。
   *  - ハロー (外周のグロー)
   *  - 外形ヘックス (`#1a1235` fill + base stroke)
   *  - 内側ヘックス (base 低α fill)
   *  - エネルギー十字 (白線)
   *  - コア (teal 円 + 白 dot)
   */
  private drawBody(): void {
    const g = this.bodyGfx;
    g.clear();
    const hexR = BASE.radius;
    const innerR = hexR * 0.7;

    // 外側の柔らかいハロー (3 層で radialGradient 近似)
    g.fillStyle(COLORS.base, 0.22);
    g.fillCircle(0, 0, hexR + 18);
    g.fillStyle(COLORS.base, 0.12);
    g.fillCircle(0, 0, hexR + 28);

    // 外形ヘックス (六角形 fill + stroke)
    const hexPoints = (r: number): Array<{ x: number; y: number }> => [
      { x: 0,            y: -r },
      { x: r * 0.866,    y: -r * 0.5 },
      { x: r * 0.866,    y: r * 0.5 },
      { x: 0,            y: r },
      { x: -r * 0.866,   y: r * 0.5 },
      { x: -r * 0.866,   y: -r * 0.5 },
    ];
    const drawHex = (r: number, fill: number, fillAlpha: number, strokeColor: number | null, strokeWidth = 1.5, strokeAlpha = 1): void => {
      const pts = hexPoints(r);
      g.fillStyle(fill, fillAlpha);
      g.beginPath();
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
      g.closePath();
      g.fillPath();
      if (strokeColor !== null) {
        g.lineStyle(strokeWidth, strokeColor, strokeAlpha);
        g.beginPath();
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
        g.closePath();
        g.strokePath();
      }
    };
    // 外形 (#1a1235 暗紫 + base stroke)
    drawHex(hexR, 0x1a1235, 0.95, COLORS.base, 1.8, 1);
    // 内側 (base 低 α)
    drawHex(innerR, COLORS.base, 0.45, null);

    // エネルギー十字 (白線)
    g.lineStyle(1.2, COLORS.highlight, 0.7);
    g.beginPath();
    g.moveTo(-hexR, 0);
    g.lineTo(hexR, 0);
    g.moveTo(0, -hexR);
    g.lineTo(0, hexR);
    g.strokePath();

    // コア (teal 円 + 白 dot)
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(0, 0, hexR * 0.4);
    g.fillStyle(COLORS.highlight, 1);
    g.fillCircle(0, 0, hexR * 0.14);
  }

  /**
   * 外輪 8 セグメント (時計回りに回転)。
   * セグメント間に node 円 (ベース色) を 8 個配置して「ノード接続」感を出す。
   */
  private drawRing(): void {
    const g = this.ring;
    g.clear();
    const r = BASE.ringRadius + 14;  // ヘックスより少し外側
    // 8 セグメントの円弧 (隙間を空けて回転感を出す)
    g.lineStyle(3, COLORS.baseRing, 0.9);
    const seg = 8;
    const gap = 0.16; // ラジアン: セグメント間の隙間
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2 + gap;
      const a1 = ((i + 1) / seg) * Math.PI * 2 - gap;
      g.beginPath();
      g.arc(0, 0, r, a0, a1, false);
      g.strokePath();
    }
    // node 円 (各セグメント境目に)
    g.fillStyle(COLORS.base, 1);
    for (let i = 0; i < seg; i++) {
      const a = ((i + 0.5) / seg) * Math.PI * 2;
      const nx = Math.cos(a) * (r + 5);
      const ny = Math.sin(a) * (r + 5);
      g.fillCircle(nx, ny, 2.5);
    }
  }

  /** 内側カウンター回転リング (点線、base 色)。 */
  private drawInnerRing(): void {
    const g = this.innerRing;
    g.clear();
    const r = BASE.radius * 1.2;
    g.lineStyle(1.3, COLORS.base, 0.55);
    const seg = 24;
    for (let i = 0; i < seg; i += 2) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, r, a0, a1, false);
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
    // 内側に少し濃いダッシュ風 (48 分割で短い arc を描く)
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

  /**
   * Step 2-A: 双砲身。マウント円 + 上下に並ぶ 2 本の砲身 + 各先端の teal アクセント。
   * 砲身は setRotation で敵方向に回る。
   */
  private drawBarrel(): void {
    const g = this.barrel;
    g.clear();
    // マウント (砲塔ベース)
    g.fillStyle(COLORS.bgAlt, 1);
    g.fillCircle(0, 0, 8);
    g.lineStyle(1, COLORS.base, 0.9);
    g.strokeCircle(0, 0, 8);
    // 双砲身 (上下に並列)
    g.fillStyle(COLORS.highlight, 0.95);
    g.fillRect(6, -5, 18, 3);
    g.fillRect(6, 2, 18, 3);
    // 砲身先端 (teal アクセント)
    g.fillStyle(COLORS.accent, 1);
    g.fillRect(22, -6, 3, 5);
    g.fillRect(22, 1, 3, 5);
  }

  /** ダメージ。後フェーズで敵衝突から呼ばれる。 */
  public takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
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
        // 2026-05-25 後: 直進弾化。発射時点の敵座標を照準点として方向確定。
        bullets.push(
          new Bullet(
            this.scene,
            this.x,
            this.y,
            this.currentTarget.x,
            this.currentTarget.y,
            turretDamage
          )
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
    this.innerRing.destroy();
    this.rangeRing.destroy();
    this.barrel.destroy();
  }

  /** Scene への参照露出が必要な場合用。 */
  public getScene(): Phaser.Scene {
    return this.scene;
  }
}
