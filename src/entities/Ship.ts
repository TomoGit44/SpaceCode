import Phaser from 'phaser';
import { COLORS, SHIP, ENEMY_VS_SHIP } from '../config';
import type { Base } from './Base';
import type { Planet } from './Planet';
import type { Enemy } from './Enemy';
import { Bullet } from './Bullet';
import type { EconomySystem } from '../systems/EconomySystem';
import type { EffectSystem } from '../items/effects';
import type { Program } from '../program/Program';

export type ShipState =
  | 'idle'
  | 'moving'
  | 'mining'
  | 'depositing'
  | 'stalled';

/**
 * Ship が 1 フレームの判断時に参照するワールド情報。
 * コード実行系の Executor も同じ World を受け取る。
 */
export interface ShipWorld {
  readonly base: Base;
  readonly planets: ReadonlyArray<Planet>;
  readonly enemies: ReadonlyArray<Enemy>;
  readonly bullets: Bullet[]; // attackNearest 時に push
  readonly economy: EconomySystem;
  readonly effects: EffectSystem; // Phase 6: 装着アイテムによる stat 補正
}

/**
 * Behavior 抽象。
 * コード実行系の Executor (`src/program/Executor.ts`) がこれを実装し、
 * `ship.setBehavior()` で差し込まれる。
 */
export interface ShipBehavior {
  tick(delta: number, ship: Ship, world: ShipWorld): void;
  reset?(): void;
}

/**
 * 宇宙船 (Ship)。
 *
 * 低レベル命令 API (moveTo / mineAt / depositAt / attackNearest / stop) は
 * 「目標を設定するだけ」で、実際の進行は update() 内で行う。
 * これを Behavior (コード実行系の Executor) が呼び出す。
 */
export class Ship {
  /** ランタイム一意 ID (Phase 6: Inventory.shipModules のキー等に使う)。 */
  public readonly id: string = crypto.randomUUID();
  public x: number;
  public y: number;
  public readonly maxHp: number = SHIP.hp;
  public hp: number = SHIP.hp;
  public readonly maxEnergy: number = SHIP.energy;
  public energy: number = SHIP.energy;
  public readonly inventoryCap: number = SHIP.inventoryCap;
  public inventory: number = 0;
  public dead: boolean = false;
  public state: ShipState = 'idle';

  private scene: Phaser.Scene;
  private bodyGfx: Phaser.GameObjects.Graphics;
  private barGfx: Phaser.GameObjects.Graphics;
  private rotation: number = 0;

  // 低レベル命令の現在ターゲット
  private moveTarget: { x: number; y: number } | null = null;
  private mineTarget: Planet | null = null;
  private depositTarget: Base | null = null;
  private attackTarget: Enemy | null = null;

  private behavior: ShipBehavior | null = null;
  private program: Program | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    this.bodyGfx = scene.add.graphics();
    this.barGfx = scene.add.graphics();
    this.drawBody();
    this.drawBars();
    this.bodyGfx.setPosition(x, y);
  }

  private drawBody(): void {
    const g = this.bodyGfx;
    g.clear();
    const r = SHIP.radius;
    // ハロー
    g.fillStyle(COLORS.ally, 0.18);
    g.fillCircle(0, 0, r + 5);
    // 三角本体 (右向き、setRotation で向きを合わせる)
    g.fillStyle(COLORS.ally, 1);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.7, -r * 0.75);
    g.lineTo(-r * 0.4, 0);
    g.lineTo(-r * 0.7, r * 0.75);
    g.closePath();
    g.fillPath();
    // コア
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(0, 0, r * 0.25);
  }

  private drawBars(): void {
    const g = this.barGfx;
    g.clear();
    const w = SHIP.radius * 2.2;
    const x = this.x - w / 2;
    const yBase = this.y + SHIP.radius + 6;
    // 背景
    g.fillStyle(COLORS.panelBg, 0.8);
    g.fillRect(x, yBase, w, 2);
    g.fillRect(x, yBase + 3, w, 2);
    g.fillRect(x, yBase + 6, w, 2);
    // HP (赤系)
    const hpRatio = Math.max(0, this.hp / this.maxHp);
    g.fillStyle(hpRatio > 0.4 ? COLORS.accent : COLORS.enemy, 1);
    g.fillRect(x, yBase, w * hpRatio, 2);
    // エネルギー (青)
    const eRatio = Math.max(0, this.energy / this.maxEnergy);
    g.fillStyle(COLORS.ally, 1);
    g.fillRect(x, yBase + 3, w * eRatio, 2);
    // インベントリ (黄)
    const iRatio = this.inventory / this.inventoryCap;
    g.fillStyle(COLORS.resource, 1);
    g.fillRect(x, yBase + 6, w * iRatio, 2);
  }

  // ─── 低レベル命令 API ───────────────────────────────────

  public moveTo(x: number, y: number): void {
    this.moveTarget = { x, y };
  }

  public mineAt(planet: Planet): void {
    this.mineTarget = planet;
  }

  public depositAt(base: Base): void {
    this.depositTarget = base;
  }

  public attackNearest(enemies: ReadonlyArray<Enemy>): void {
    let best: Enemy | null = null;
    let bestDist: number = SHIP.attackRange;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= bestDist) {
        bestDist = d;
        best = e;
      }
    }
    this.attackTarget = best;
  }

  /**
   * Phase 3: 指定した敵に対して即 1 発発射する (cooldown は無し)。
   * 射程外 / dead 敵 / エネルギー不足 (Phase 4) には何もしない。
   * 連射ペースは ATTACK_NEAREST コードの持続時間と REPEAT で囲む構造で表現する。
   */
  public fireAt(enemy: Enemy, world: ShipWorld): boolean {
    if (enemy.dead) return false;
    if (this.energy < SHIP.energyPerShot) return false;  // Phase 4: 射撃エネルギー判定
    const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
    if (d > SHIP.attackRange) return false;
    // Phase 6: 攻撃力はオムニ・コア/モジュールで強化されうる (EffectSystem 経由)
    const damage = world.effects.shipStat(this, 'damagePerShot', SHIP.damagePerShot);
    world.bullets.push(
      new Bullet(this.scene, this.x, this.y, enemy, damage, SHIP.bulletSpeed)
    );
    this.energy -= SHIP.energyPerShot;  // Phase 4: 射撃でエネルギー消費
    // Phase 5: マズルフラッシュ (短い円が拡大して消える)
    const flash = this.scene.add.graphics();
    flash.fillStyle(COLORS.accent, 0.7);
    flash.fillCircle(this.x, this.y, SHIP.radius * 0.8);
    this.scene.tweens.add({
      targets: flash,
      scale: 1.6,
      alpha: 0,
      duration: 160,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    return true;
  }

  /** 現在の攻撃ターゲット (attackNearest が設定したもの)。 */
  public getAttackTarget(): Enemy | null {
    return this.attackTarget;
  }

  public stop(): void {
    this.moveTarget = null;
    this.mineTarget = null;
    this.depositTarget = null;
    this.attackTarget = null;
  }

  // ─── 状態問い合わせ ────────────────────────────────────

  public isAt(target: { x: number; y: number }, radius: number): boolean {
    return Math.hypot(target.x - this.x, target.y - this.y) <= radius;
  }

  public isInventoryFull(): boolean {
    return this.inventory >= this.inventoryCap;
  }

  public isStalled(): boolean {
    return this.energy <= 0;
  }

  // ─── Behavior 差し替え ─────────────────────────────────

  public setBehavior(b: ShipBehavior | null): void {
    if (this.behavior && this.behavior.reset) this.behavior.reset();
    this.behavior = b;
  }

  /**
   * Ship に編集対象の Program を紐付けつつ、それを駆動する Behavior (= Executor) を差し込む。
   * 編集 UI は `getProgram()` で取得し破壊的に編集する。Executor は同じ参照を握るのでライブ反映される。
   */
  public setProgram(program: Program, behavior: ShipBehavior): void {
    this.program = program;
    this.setBehavior(behavior);
  }

  public getProgram(): Program | null {
    return this.program;
  }

  // ─── ライフサイクル ─────────────────────────────────────

  public update(delta: number, world: ShipWorld): void {
    if (this.dead) return;

    // エネルギー切れチェック
    if (this.energy <= 0) {
      this.energy = 0;
      this.state = 'stalled';
      this.bodyGfx.setAlpha(0.45);
      this.drawBars();
      return;
    }
    this.bodyGfx.setAlpha(1);

    // Behavior が命令 API を呼ぶ
    if (this.behavior) {
      this.behavior.tick(delta, this, world);
    }

    // Phase 3: cooldown 駆動の自動発射は撤廃。発射は ATTACK_NEAREST コードが ship.fireAt を直接呼ぶ。
    // 死亡したターゲット参照だけここで掃除する。
    if (this.attackTarget && this.attackTarget.dead) {
      this.attackTarget = null;
    }

    // 移動
    let moved = false;
    if (this.moveTarget) {
      const dx = this.moveTarget.x - this.x;
      const dy = this.moveTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = world.effects.shipStat(this, 'moveSpeed', SHIP.moveSpeed);
      const step = (speed * delta) / 1000;
      if (dist <= step) {
        this.x = this.moveTarget.x;
        this.y = this.moveTarget.y;
        this.moveTarget = null;
      } else {
        this.rotation = Math.atan2(dy, dx);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
        moved = true;
      }
    }
    if (moved) {
      this.energy -= SHIP.energyConsumePerSec * (delta / 1000);
      this.state = 'moving';
    }

    // 採掘 (mineTarget に到達していれば)
    if (this.mineTarget) {
      const p = this.mineTarget;
      if (this.isAt(p, p.mineRadius) && this.inventory < this.inventoryCap) {
        const got = p.extract(delta, world.effects.shipStat(this, 'mineRate', SHIP.mineRate));
        this.inventory = Math.min(this.inventoryCap, this.inventory + got);
        this.state = 'mining';
      }
      if (p.depleted) {
        this.mineTarget = null;
      }
    }

    // 納品 (depositTarget に到達していれば)
    if (this.depositTarget && this.inventory > 0) {
      const b = this.depositTarget;
      if (this.isAt(b, b.radius + SHIP.depositRadius)) {
        const amount = this.inventory;
        this.inventory = 0;
        world.economy.depositResource(amount);
        if (SHIP.refuelOnDeposit) this.refuel();
        this.state = 'depositing';
      }
    }

    // 敵接触ダメージ
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= SHIP.contactRadius + 8) {
        this.takeDamage(ENEMY_VS_SHIP.contactDps * (delta / 1000));
        if (this.dead) return;
      }
    }

    // 描画更新
    this.bodyGfx.setPosition(this.x, this.y);
    this.bodyGfx.setRotation(this.rotation);
    this.drawBars();

    // state 補正 (idle 時)
    if (!moved && !this.mineTarget && !this.depositTarget) {
      if (this.state !== 'depositing') this.state = 'idle';
    }
  }

  public takeDamage(amount: number): void {
    if (this.dead) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  public refuel(): void {
    this.energy = this.maxEnergy;
  }

  private die(): void {
    this.dead = true;
    this.scene.tweens.add({
      targets: this.bodyGfx,
      alpha: 0,
      scale: 1.8,
      duration: 260,
      onComplete: () => this.bodyGfx.destroy(),
    });
    this.barGfx.destroy();
  }

  public destroy(): void {
    if (!this.dead) {
      this.bodyGfx.destroy();
      this.barGfx.destroy();
    }
    this.dead = true;
  }
}
