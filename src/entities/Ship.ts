import Phaser from 'phaser';
import { COLORS, SHIP, ENEMY_VS_SHIP } from '../config';
import type { Base } from './Base';
import type { Planet } from './Planet';
import type { Enemy } from './Enemy';
import { spawnElectricArc } from './Enemy';
import { Bullet } from './Bullet';
import { muzzleFlash } from '../systems/CombatFx';
import type { EconomySystem } from '../systems/EconomySystem';
import type { EffectSystem } from '../items/effects';
import type { Program } from '../program/Program';
import type { SignalBus } from '../program/SignalBus';

export type ShipState =
  | 'idle'
  | 'moving'
  | 'mining'
  | 'depositing'
  | 'stalled'   // エネルギー切れ (energy <= 0): 移動・採掘・攻撃すべて不可。クレジット補給で復帰
  | 'downed';   // HP 0 (2026-05-25 追加): 戦闘不能・敵接触も無効。クレジット修理で復帰

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
  // 2026-05-28: マルチ Ship 連携 / 新条件コード用
  readonly ships: ReadonlyArray<Ship>; // IF_ALLY_DOWNED の判定で他 Ship を走査
  readonly signals: SignalBus;        // BROADCAST_SIGNAL / IF_SIGNAL
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
  // Phase 6: 最大値はアイテム (オムニ・コア/モジュール) で変動するため可変。
  // 変更は applyMaxStats() 経由で行い、増加時は差分回復・減少時は clamp する (仕様 A5)。
  public maxHp: number = SHIP.hp;
  public hp: number = SHIP.hp;
  public maxEnergy: number = SHIP.energy;
  public energy: number = SHIP.energy;
  public inventoryCap: number = SHIP.inventoryCap;
  public inventory: number = 0;
  public dead: boolean = false;
  public state: ShipState = 'idle';

  private scene: Phaser.Scene;
  private bodyGfx: Phaser.GameObjects.Graphics;
  private barGfx: Phaser.GameObjects.Graphics;
  private thrustGfx: Phaser.GameObjects.Graphics; // Step 2-B: 推進炎 (移動中のみ visible)
  private refuelGfx: Phaser.GameObjects.Graphics; // 補給中のリング (基地で WAIT/納品中のみ visible)
  /**
   * エネルギー切れ警告アイコン (2026-05-25 後追加)。
   * 船本体の上に黄色の ⚠ 三角を浮かべて pulse させ、ゲーム画面上で一目で
   * 「補給が必要」と分かるようにする。stalled 状態でのみ visible。
   */
  private lowEnergyGfx: Phaser.GameObjects.Graphics;
  private lowEnergyTween?: Phaser.Tweens.Tween;
  private rotation: number = 0;

  // 採掘エフェクトの間引き用 (走るとフレームごとに extract が走るため)
  private mineFxAccumMs: number = 0;
  private static readonly MINE_FX_INTERVAL_MS = 400;

  // 自動補給の状態。Wait コードや納品が毎フレーム requestRefuel() を立てる。
  // Ship.update 末尾で読み取り、立っていれば時間ベースで energy を回復し
  // リング演出を表示する。フレーム末でフラグはクリアされる。
  private refuelRequested: boolean = false;
  private refuelPulse: number = 0;

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

    // 推進炎 (Step 2-B): bodyGfx より背面に描く。常に alpha 0..1 を yoyo で明滅。
    this.thrustGfx = scene.add.graphics().setDepth(3);
    this.drawThrust();
    this.thrustGfx.setAlpha(0);
    scene.tweens.add({
      targets: this.thrustGfx,
      scaleX: 1.15,
      duration: 280,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.bodyGfx = scene.add.graphics().setDepth(4);
    this.barGfx = scene.add.graphics().setDepth(4);
    this.drawBody();
    this.drawBars();
    this.bodyGfx.setPosition(x, y);

    // 補給リング (本体より前面、bars より背面)
    this.refuelGfx = scene.add.graphics().setDepth(5);
    this.refuelGfx.setVisible(false);

    // 2026-05-25 後: エネルギー切れ警告アイコン (黄色 ⚠ 三角)。
    // ship body より上 depth で常に視認可能、stalled でのみ visible。
    this.lowEnergyGfx = scene.add.graphics().setDepth(6);
    this.drawLowEnergyIcon();
    this.lowEnergyGfx.setVisible(false);
    // 注意喚起の pulse (yoyo alpha)
    this.lowEnergyTween = scene.tweens.add({
      targets: this.lowEnergyGfx,
      alpha: 0.45,
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 黄色 ⚠ 三角 + 中央 ! を Graphics で描画 (画像アセット不使用)。 */
  private drawLowEnergyIcon(): void {
    const g = this.lowEnergyGfx;
    g.clear();
    const size = 9; // 三角形 半高さ
    // 三角形 (黄)
    g.fillStyle(0xffdd44, 1);
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 1.05, size * 0.85);
    g.lineTo(-size * 1.05, size * 0.85);
    g.closePath();
    g.fillPath();
    // 黒い縁取りで視認性 up
    g.lineStyle(1.4, 0x05070d, 1);
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 1.05, size * 0.85);
    g.lineTo(-size * 1.05, size * 0.85);
    g.closePath();
    g.strokePath();
    // 中央の "!" (縦バー + ドット)
    g.fillStyle(0x05070d, 1);
    g.fillRect(-1.1, -size * 0.45, 2.2, size * 0.8);
    g.fillCircle(0, size * 0.55, 1.4);
  }

  /**
   * Step 2-B: 戦闘機シルエット。
   *  - ハロー (低α円)
   *  - 本体 (スウェプトバック四角 = `(r, 0) → (-0.55r, -0.6r) → (-0.25r, 0) → (-0.55r, 0.6r)`)
   *  - ウィングチップ (本体後縁の外側に小三角 2 個)
   *  - コックピット (teal 円 + 白 dot)
   *  - ノーズマーカー (短い白棒)
   */
  private drawBody(): void {
    const g = this.bodyGfx;
    g.clear();
    const r = SHIP.radius;

    // ハロー
    g.fillStyle(COLORS.ally, 0.2);
    g.fillCircle(0, 0, r + 6);

    // 本体 (4 頂点でスウェプトバック)
    g.fillStyle(COLORS.ally, 1);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.55, -r * 0.6);
    g.lineTo(-r * 0.25, 0);
    g.lineTo(-r * 0.55, r * 0.6);
    g.closePath();
    g.fillPath();

    // ウィングチップ (本体後縁の外側に翼端三角)
    g.fillStyle(COLORS.ally, 0.85);
    g.beginPath();
    g.moveTo(-r * 0.55, -r * 0.6);
    g.lineTo(-r * 0.85, -r * 0.85);
    g.lineTo(-r * 0.2,  -r * 0.45);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(-r * 0.55, r * 0.6);
    g.lineTo(-r * 0.85, r * 0.85);
    g.lineTo(-r * 0.2,  r * 0.45);
    g.closePath();
    g.fillPath();

    // コックピット (teal + 白)
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(r * 0.15, 0, r * 0.28);
    g.fillStyle(COLORS.highlight, 1);
    g.fillCircle(r * 0.15, 0, r * 0.1);

    // ノーズマーカー (短い白棒)
    g.fillStyle(COLORS.highlight, 1);
    g.fillRect(r * 0.75, -0.6, r * 0.35, 1.2);
  }

  /** 推進炎: 後方 (−x 方向) に楕円 2 枚を重ねる。 */
  private drawThrust(): void {
    const g = this.thrustGfx;
    g.clear();
    const r = SHIP.radius;
    // 外側 (青グロー)
    g.fillStyle(COLORS.ally, 0.7);
    g.fillEllipse(-r * 1.5, 0, r * 1.8, r * 0.55);
    // 内側 (白い芯)
    g.fillStyle(COLORS.highlight, 0.95);
    g.fillEllipse(-r * 1.1, 0, r * 0.9, r * 0.28);
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
    // 2026-05-25: 省エネコアで射撃消費 0〜1 倍に。実消費量で判定 + 消費する
    const shotCost = SHIP.energyPerShot * world.effects.shipStat(this, 'energyConsume', 1);
    if (this.energy < shotCost) return false;
    const d = Math.hypot(enemy.x - this.x, enemy.y - this.y);
    if (d > SHIP.attackRange) return false;
    // Phase 6: 攻撃力はオムニ・コア/モジュールで強化されうる (EffectSystem 経由)
    const damage = world.effects.shipStat(this, 'damagePerShot', SHIP.damagePerShot);
    // Phase 6: モジュール (ガトリング砲等) で 1 射の弾数が増える
    // 2026-05-25 後: 直進弾化。発射時点の敵座標を照準点として方向確定 +
    // ガトリング弾は照準点にもばらつき (±10px) を与えて広がりを表現する。
    const shots = 1 + world.effects.shipExtraShots(this);
    for (let i = 0; i < shots; i++) {
      const jx = i === 0 ? 0 : (Math.random() - 0.5) * 12;
      const jy = i === 0 ? 0 : (Math.random() - 0.5) * 12;
      const ax = i === 0 ? enemy.x : enemy.x + (Math.random() - 0.5) * 20;
      const ay = i === 0 ? enemy.y : enemy.y + (Math.random() - 0.5) * 20;
      world.bullets.push(
        new Bullet(this.scene, this.x + jx, this.y + jy, ax, ay, damage, SHIP.bulletSpeed, COLORS.ally)
      );
    }
    // 2026-05-25 後: ボム砲装着時は 1 射ごとに低速ボム弾を追加発射 (着弾時に半径 80px AoE)。
    // 通常弾と並行発射するため、ガトリング砲との重複装着も可。
    const bombDamage = world.effects.shipBombDamage(this);
    if (bombDamage > 0) {
      world.bullets.push(
        new Bullet(this.scene, this.x, this.y, enemy.x, enemy.y, bombDamage, SHIP.bulletSpeed * 0.5, COLORS.enemy, {
          explosionRadius: 80,
        })
      );
    }
    this.energy -= shotCost;  // Phase 4: 射撃でエネルギー消費 (省エネコア反映済)
    // Step 1-C: CombatFx の砲口フラッシュ (3 層 + 4 ray)。Ship 弾色 = ally (青)。
    const angle = Math.atan2(enemy.y - this.y, enemy.x - this.x);
    muzzleFlash(this.scene, this.x, this.y, angle, COLORS.ally);
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

    // HP 0 = ダウン状態 (Phase 6 後の改修, 2026-05-25)
    //  - behavior/移動/接触すべて停止 = 敵に踏まれてもダメージは入らない
    //  - 復帰はクレジット修理 (`heal()` 経由) のみ
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'downed';
      this.bodyGfx.setAlpha(0.3);
      this.drawBars();
      this.hideRefuelRing();
      this.setLowEnergyVisible(false); // ダウン優先 (HP 0 のほうが重い)
      return;
    }

    // エネルギー切れチェック
    if (this.energy <= 0) {
      this.energy = 0;
      this.state = 'stalled';
      this.bodyGfx.setAlpha(0.45);
      this.drawBars();
      this.hideRefuelRing();
      this.setLowEnergyVisible(true); // 警告アイコン表示
      return;
    }
    this.bodyGfx.setAlpha(1);
    this.setLowEnergyVisible(false);

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
      // 2026-05-25: 省エネコアで移動消費に倍率 (デフォルト 1.0、コアで 0.5 等)
      const consumeMul = world.effects.shipStat(this, 'energyConsume', 1);
      this.energy -= SHIP.energyConsumePerSec * consumeMul * (delta / 1000);
      this.state = 'moving';
    }

    // 採掘 (mineTarget に到達していれば)
    if (this.mineTarget) {
      const p = this.mineTarget;
      if (this.isAt(p, p.mineRadius) && this.inventory < this.inventoryCap) {
        const got = p.extract(delta, world.effects.shipStat(this, 'mineRate', SHIP.mineRate));
        this.inventory = Math.min(this.inventoryCap, this.inventory + got);
        this.state = 'mining';
        // 採掘エフェクト: $マークが Ship 上方に浮上 → フェードアウト
        if (got > 0) {
          this.mineFxAccumMs += delta;
          if (this.mineFxAccumMs >= Ship.MINE_FX_INTERVAL_MS) {
            this.mineFxAccumMs = 0;
            this.spawnMineFx();
          }
        }
      }
      if (p.depleted) {
        this.mineTarget = null;
      }
    } else {
      // 採掘していない間はアキュムをリセット (次の採掘で即発火するため)
      this.mineFxAccumMs = Ship.MINE_FX_INTERVAL_MS;
    }

    // 納品 (depositTarget に到達していれば)
    if (this.depositTarget && this.inventory > 0) {
      const b = this.depositTarget;
      if (this.isAt(b, b.radius + SHIP.depositRadius)) {
        const amount = this.inventory;
        this.inventory = 0;
        world.economy.depositResource(amount);
        // refuel は瞬時ではなく時間ベース: フレームごとに requestRefuel を立てる経路に統一
        // (Wait コード経由で毎フレーム再リクエストされる)
        if (SHIP.refuelOnDeposit) this.requestRefuel();
        this.state = 'depositing';
      }
    }

    // 自動補給 (Wait コードや上記納品が requestRefuel を立てている間、時間で energy 回復)
    this.tickRefuelEffect(delta);

    // 敵接触: 被ダメージ + 体当たりモジュール装着時の反撃 (2026-05-25)
    // - charge 種別の接触はスタンガン演出付き
    // - sniper (damage=0) は接触してもダメージ無し (体当たり攻撃しないので接触演出も省略)
    const myContactDps = world.effects.shipContactDps(this);
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= SHIP.contactRadius + 8) {
        // 1. 被ダメージ (charge 種別のみ実害、stats.damage=0 の sniper は無効化)
        if (e.stats.behavior === 'charge') {
          this.takeDamage(ENEMY_VS_SHIP.contactDps * (delta / 1000));
          // 電気スタン演出 (毎フレーム描かず確率で発火 — フレーム連発を防ぐ)
          if (Math.random() < 0.18) {
            spawnElectricArc(this.scene, e.x, e.y, this.x, this.y);
          }
          if (this.dead) return;
        }
        // 2. 体当たりモジュール: 装着していれば敵にダメージ
        if (myContactDps > 0) {
          e.takeDamage(myContactDps * (delta / 1000));
        }
      }
    }

    // 描画更新
    this.bodyGfx.setPosition(this.x, this.y);
    this.bodyGfx.setRotation(this.rotation);
    // Step 2-B: 推進炎は移動中のみ可視 (state="moving" 直後の moved フラグで判定)
    this.thrustGfx.setPosition(this.x, this.y);
    this.thrustGfx.setRotation(this.rotation);
    this.thrustGfx.setAlpha(moved ? 0.9 : 0);
    this.drawBars();

    // state 補正 (idle 時)
    if (!moved && !this.mineTarget && !this.depositTarget) {
      if (this.state !== 'depositing') this.state = 'idle';
    }
  }

  public takeDamage(amount: number): void {
    if (this.dead) return;
    // 2026-05-25: HP 0 では `die()` せず、ダウン状態として残す。
    // 戦闘不能だが Inventory.shipModules は保持され、クレジット修理で復活できる。
    this.hp = Math.max(0, this.hp - amount);
  }

  /**
   * 即時全回復。手動補給ボタン (クレジット消費) からのみ呼ばれる想定。
   * 自動補給 (Wait コード / 基地納品) は `requestRefuel()` を使って時間ベースで回復する。
   */
  public refuel(): void {
    this.energy = this.maxEnergy;
  }

  /**
   * 自動補給リクエスト。Wait コードや納品処理がフレームごとに立て、
   * Ship.update 末尾の `tickRefuelEffect` が時間ベースで energy を加算する。
   * フラグはフレーム末で必ずクリアされるため、基地から離れた瞬間に回復は止まる。
   */
  public requestRefuel(): void {
    this.refuelRequested = true;
  }

  /** 自動補給の本処理: energy 加算 + 脈動リング描画。フレーム末でフラグをクリア。 */
  private tickRefuelEffect(delta: number): void {
    if (this.refuelRequested && this.energy < this.maxEnergy) {
      // refuelDurationMs で maxEnergy ぶん回復する一定速度
      const ratePerMs = this.maxEnergy / SHIP.refuelDurationMs;
      this.energy = Math.min(this.maxEnergy, this.energy + ratePerMs * delta);
      this.refuelPulse += delta;
      this.drawRefuelRing();
      this.refuelGfx.setVisible(true);
      this.refuelGfx.setPosition(this.x, this.y);
    } else {
      this.refuelPulse = 0;
      if (this.refuelGfx.visible) {
        this.refuelGfx.clear();
        this.refuelGfx.setVisible(false);
      }
    }
    this.refuelRequested = false; // 毎フレームクリア (Wait / 納品が再リクエストする)
  }

  /** 補給リング: ally 色の脈動 + 円弧で energy 比を可視化。 */
  private drawRefuelRing(): void {
    const g = this.refuelGfx;
    g.clear();
    const r = SHIP.radius;
    // 1) 拡張する波紋 (1.0 → 1.8 で拡大しつつ alpha 0.6 → 0)
    const period = 700;
    const phase = (this.refuelPulse % period) / period;
    const rippleR = r * (1.4 + phase * 1.2);
    const rippleA = 0.55 * (1 - phase);
    g.lineStyle(2, COLORS.ally, rippleA);
    g.strokeCircle(0, 0, rippleR);
    // 2) energy 進捗弧 (満タンに近づくほど 360° に伸びる)
    const ratio = Math.max(0, Math.min(1, this.energy / this.maxEnergy));
    g.lineStyle(3, COLORS.ally, 0.9);
    g.beginPath();
    g.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
    g.strokePath();
    // 3) 中心ハイライト (脈動)
    const corePulse = 0.6 + Math.sin(this.refuelPulse / 120) * 0.25;
    g.fillStyle(COLORS.highlight, corePulse * 0.35);
    g.fillCircle(0, 0, r * 0.6);
  }

  /**
   * エネルギー切れ警告アイコンの表示制御 (2026-05-25 後追加)。
   * visible=true のとき船の上に位置を合わせて表示、false で隠す。
   * pulse tween は常時動かしっぱなしで visible だけ切り替える。
   */
  private setLowEnergyVisible(visible: boolean): void {
    if (visible) {
      this.lowEnergyGfx.setPosition(this.x, this.y - SHIP.radius - 12);
      if (!this.lowEnergyGfx.visible) this.lowEnergyGfx.setVisible(true);
    } else {
      if (this.lowEnergyGfx.visible) this.lowEnergyGfx.setVisible(false);
    }
  }

  /** stalled/downed などで update 中断する時に補給リングを確実に非表示化。 */
  private hideRefuelRing(): void {
    this.refuelRequested = false;
    this.refuelPulse = 0;
    if (this.refuelGfx.visible) {
      this.refuelGfx.clear();
      this.refuelGfx.setVisible(false);
    }
  }

  /** 採掘成功時にクレジットマーク "$" を Ship 上方に浮かせてフェードアウトさせる。 */
  private spawnMineFx(): void {
    const t = this.scene.add
      .text(this.x, this.y - SHIP.radius - 4, '$', {
        fontFamily: 'Courier New, monospace',
        fontSize: '18px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 22,
      alpha: 0,
      scale: 1.15,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /** HP 回復 (編集画面の修理ボタン経由)。最大 HP を超えない。死亡 Ship には効かない。 */
  public heal(amount: number): void {
    if (this.dead || amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /**
   * Phase 6: 装着アイテムによる最大 stat (HP / エネルギー / 積載量) を再計算して適用する。
   * アイテム獲得・モジュール着脱など「最大値が変わりうる瞬間」に呼ぶ (仕様 A5)。
   *  - 最大値が増えたら現在値を差分ぶん回復
   *  - 最大値が減って現在値が超過したら新最大値まで clamp (超過分は失われる)
   */
  public applyMaxStats(effects: EffectSystem): void {
    this.setMaxHp(Math.round(effects.shipStat(this, 'maxHp', SHIP.hp)));
    this.setMaxEnergy(Math.round(effects.shipStat(this, 'maxEnergy', SHIP.energy)));
    const cap = Math.max(1, Math.round(effects.shipStat(this, 'inventoryCap', SHIP.inventoryCap)));
    this.inventoryCap = cap;
    if (this.inventory > cap) this.inventory = cap;
  }

  private setMaxHp(newMax: number): void {
    const delta = newMax - this.maxHp;
    this.maxHp = newMax;
    if (delta > 0) this.hp += delta;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  private setMaxEnergy(newMax: number): void {
    const delta = newMax - this.maxEnergy;
    this.maxEnergy = newMax;
    if (delta > 0) this.energy += delta;
    if (this.energy > this.maxEnergy) this.energy = this.maxEnergy;
  }

  private die(): void {
    this.dead = true;
    this.lowEnergyTween?.stop();
    this.lowEnergyTween = undefined;
    this.scene.tweens.add({
      targets: this.bodyGfx,
      alpha: 0,
      scale: 1.8,
      duration: 260,
      onComplete: () => this.bodyGfx.destroy(),
    });
    this.barGfx.destroy();
    this.thrustGfx.destroy();
    this.refuelGfx.destroy();
    this.lowEnergyGfx.destroy();
  }

  public destroy(): void {
    if (!this.dead) {
      this.lowEnergyTween?.stop();
      this.lowEnergyTween = undefined;
      this.bodyGfx.destroy();
      this.barGfx.destroy();
      this.thrustGfx.destroy();
      this.refuelGfx.destroy();
      this.lowEnergyGfx.destroy();
    }
    this.dead = true;
  }
}
