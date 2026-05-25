import Phaser from 'phaser';
import { ENEMY_TYPES, COLORS, type EnemyType, type EnemyTypeStats } from '../config';
import { EnemyBullet } from './EnemyBullet';
import type { Ship } from './Ship';
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
 * - **2026-05-25 後**: hunter (prefersShip:true) を追加。`update` が ships を受け取り、
 *   船が居れば最寄り船を毎フレーム狙い、居なければ基地に向かう。船接触時は
 *   reachedBase を立てないので、船にぶつかり続けて接触ダメージを与える。
 */
export interface EnemyTickContext {
  enemyBullets: EnemyBullet[];
  /** hunter (prefersShip) の動的ターゲティング用。GameScene が毎フレーム ships 配列を渡す。 */
  ships?: ReadonlyArray<Ship>;
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
  /** 基地座標 (hunter で船を狩り切ったあと基地ターゲットに戻すため保持)。 */
  private readonly baseX: number;
  private readonly baseY: number;
  /** 直前 tick で船を狙っていたか (船接触で reachedBase を立てないため、毎フレーム参照)。 */
  private targetIsShip: boolean = false;
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
    this.baseX = baseX;
    this.baseY = baseY;
    // shoot 種別は射程内到達後すぐに 1 発撃てるよう初期 timer を短めに
    this.fireTimerMs = this.stats.behavior === 'shoot' ? 600 : 0;

    this.gfx = scene.add.graphics();
    this.redraw();
    this.gfx.setPosition(x, y);

    // Step 2-E: tank だけ heavy-breath (2400ms 拡縮 1.0↔1.025) を仕込む
    if (type === 'tank') {
      scene.tweens.add({
        targets: this.gfx,
        scale: 1.025,
        duration: 2400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
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

  /**
   * Step 2-C/D/E (2026-05-25): 敵種別ごとに redraw を分岐。
   *  - basic: 三角 + 後方クロー + 白コアアイ
   *  - fast:  細身三角 + 後方スピードライン 3 本 + 白ノーズ + 白コア
   *  - tank:  二重三角アウトライン + 内側装甲 + ボルト + 装甲ハイライト + シールド点線リング
   *  - boss/sniper: 既存維持
   */
  private redraw(): void {
    const g = this.gfx;
    const stats = this.stats;
    g.clear();

    switch (this.type) {
      case 'basic':
        this.drawBasic(g);
        break;
      case 'fast':
        this.drawFast(g);
        break;
      case 'tank':
        this.drawTank(g);
        break;
      case 'boss':
        this.drawBoss(g);
        break;
      case 'sniper':
        this.drawSniper(g);
        break;
      case 'hunter':
        this.drawHunter(g);
        break;
      default: {
        // 念のためのフォールバック (旧描画)
        g.fillStyle(stats.color, 0.18);
        g.fillCircle(0, 0, stats.radius + 5);
        g.fillStyle(stats.color, 1);
        g.beginPath();
        g.moveTo(stats.radius, 0);
        g.lineTo(-stats.radius * 0.7, -stats.radius * 0.8);
        g.lineTo(-stats.radius * 0.7, stats.radius * 0.8);
        g.closePath();
        g.fillPath();
      }
    }
  }

  /** basic: 三角 + 後方クロー + 白コアアイ。 */
  private drawBasic(g: Phaser.GameObjects.Graphics): void {
    const r = this.stats.radius;
    const c = this.stats.color;
    // ハロー
    g.fillStyle(c, 0.22);
    g.fillCircle(0, 0, r + 6);
    // 本体三角
    g.fillStyle(c, 1);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.7, -r * 0.8);
    g.lineTo(-r * 0.7, r * 0.8);
    g.closePath();
    g.fillPath();
    // 後方クロー (本体後縁の外側に小三角)
    g.fillStyle(c, 0.9);
    g.beginPath();
    g.moveTo(-r * 0.7, -r * 0.8);
    g.lineTo(-r * 1.0, -r * 1.15);
    g.lineTo(-r * 0.35, -r * 0.6);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(-r * 0.7, r * 0.8);
    g.lineTo(-r * 1.0, r * 1.15);
    g.lineTo(-r * 0.35, r * 0.6);
    g.closePath();
    g.fillPath();
    // コアアイ (白 + 赤コア)
    g.fillStyle(COLORS.highlight, 0.92);
    g.fillCircle(0, 0, r * 0.36);
    g.fillStyle(c, 1);
    g.fillCircle(0, 0, r * 0.16);
  }

  /** fast: 細身 + 後方スピードライン 3 本 + 白ノーズ + 白コア。 */
  private drawFast(g: Phaser.GameObjects.Graphics): void {
    const r = this.stats.radius;
    const c = this.stats.color;
    // ハロー
    g.fillStyle(c, 0.22);
    g.fillCircle(0, 0, r + 6);
    // 後方スピードライン 3 本 (移動方向の反対側)
    g.fillStyle(c, 0.75);
    g.fillRect(-r * 4.0, -0.6, r * 2.0, 1.2);
    g.fillStyle(c, 0.55);
    g.fillRect(-r * 3.4, -r * 0.7, r * 1.5, 1);
    g.fillRect(-r * 3.4, r * 0.7 - 1, r * 1.5, 1);
    // 細身本体 (くびれ付き)
    g.fillStyle(c, 1);
    g.beginPath();
    g.moveTo(r * 1.1, 0);
    g.lineTo(-r * 0.6, -r * 0.7);
    g.lineTo(-r * 0.2, 0);
    g.lineTo(-r * 0.6, r * 0.7);
    g.closePath();
    g.fillPath();
    // ウィングチップ薄め
    g.fillStyle(c, 0.7);
    g.beginPath();
    g.moveTo(-r * 0.6, -r * 0.7);
    g.lineTo(-r * 0.85, -r * 0.95);
    g.lineTo(-r * 0.25, -r * 0.45);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(-r * 0.6, r * 0.7);
    g.lineTo(-r * 0.85, r * 0.95);
    g.lineTo(-r * 0.25, r * 0.45);
    g.closePath();
    g.fillPath();
    // ノーズマーカー (白短棒)
    g.fillStyle(COLORS.highlight, 1);
    g.fillRect(r * 1.0, -0.5, r * 0.6, 1);
    // 白コア
    g.fillCircle(0, 0, r * 0.3);
  }

  /** tank: 二重三角アウトライン + 内側装甲 + ボルト + シールド点線リング。 */
  private drawTank(g: Phaser.GameObjects.Graphics): void {
    const r = this.stats.radius;
    const c = this.stats.color;
    // ハロー
    g.fillStyle(c, 0.25);
    g.fillCircle(0, 0, r + 8);
    // シールド点線リング (24 セグメント、半数を打って点線化)
    g.lineStyle(1.2, COLORS.enemy, 0.4);
    const seg = 24;
    const sr = r * 2.0;
    for (let i = 0; i < seg; i += 2) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, sr, a0, a1, false);
      g.strokePath();
    }
    // 外装甲アウトライン (大きめ三角)
    g.lineStyle(2, c, 0.9);
    g.beginPath();
    g.moveTo(r * 1.7, 0);
    g.lineTo(-r * 1.2, -r * 1.45);
    g.lineTo(-r * 1.2, r * 1.45);
    g.closePath();
    g.strokePath();
    // 本体三角
    g.fillStyle(c, 1);
    g.beginPath();
    g.moveTo(r * 1.4, 0);
    g.lineTo(-r * 1.0, -r * 1.15);
    g.lineTo(-r * 1.0, r * 1.15);
    g.closePath();
    g.fillPath();
    // 内側装甲セグメント (暗赤)
    g.fillStyle(0x7a0f1c, 1);
    g.beginPath();
    g.moveTo(r * 1.0, 0);
    g.lineTo(-r * 0.65, -r * 0.7);
    g.lineTo(-r * 0.65, r * 0.7);
    g.closePath();
    g.fillPath();
    // プレートボルト 3 個 (灰色)
    g.fillStyle(COLORS.ui, 0.7);
    g.fillCircle(-r * 0.45, -r * 0.65, 1.6);
    g.fillCircle(-r * 0.45, r * 0.65, 1.6);
    g.fillCircle(r * 0.3, 0, 1.6);
    // 装甲ハイライト (薄赤線で前縁→後縁の上下)
    g.lineStyle(0.8, COLORS.enemy, 0.7);
    g.beginPath();
    g.moveTo(r * 1.4, 0);
    g.lineTo(-r * 1.0, -r * 1.15);
    g.moveTo(r * 1.4, 0);
    g.lineTo(-r * 1.0, r * 1.15);
    g.strokePath();
    // コア (赤 + 白 dot)
    g.fillStyle(COLORS.enemy, 1);
    g.fillCircle(0, 0, r * 0.36);
    g.fillStyle(COLORS.highlight, 0.9);
    g.fillCircle(0, 0, r * 0.14);
  }

  /** boss: 既存維持 (Step 2 範囲外、redesign 案も無いため最低限の刷新のみ)。 */
  private drawBoss(g: Phaser.GameObjects.Graphics): void {
    const r = this.stats.radius;
    const c = this.stats.color;
    g.fillStyle(c, 0.22);
    g.fillCircle(0, 0, r + 14);
    g.lineStyle(2, c, 0.7);
    g.strokeCircle(0, 0, r + 8);
    g.lineStyle(1, COLORS.highlight, 0.4);
    g.strokeCircle(0, 0, r + 2);
    g.fillStyle(c, 1);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.7, -r * 0.8);
    g.lineTo(-r * 0.7, r * 0.8);
    g.closePath();
    g.fillPath();
    g.fillStyle(COLORS.highlight, 0.85);
    g.fillCircle(0, 0, r * 0.35);
  }

  /**
   * hunter: 4 本腕のスター (×型クロー) + 中心の白コア。
   * 既存敵 (三角ベース) と一目で区別できるよう、対称の×形状にした。
   */
  private drawHunter(g: Phaser.GameObjects.Graphics): void {
    const r = this.stats.radius;
    const c = this.stats.color;
    // ハロー
    g.fillStyle(c, 0.25);
    g.fillCircle(0, 0, r + 7);
    // 4 本腕: 各腕は細長い菱形 (length r*1.4, half-width r*0.35)
    g.fillStyle(c, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4; // 斜め 4 方向
      const tipX = Math.cos(a) * r * 1.4;
      const tipY = Math.sin(a) * r * 1.4;
      // 法線
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const mid = r * 0.55;
      g.beginPath();
      g.moveTo(tipX, tipY);
      g.lineTo(Math.cos(a) * mid + nx * r * 0.32, Math.sin(a) * mid + ny * r * 0.32);
      g.lineTo(0, 0);
      g.lineTo(Math.cos(a) * mid - nx * r * 0.32, Math.sin(a) * mid - ny * r * 0.32);
      g.closePath();
      g.fillPath();
    }
    // 中心リング + 白コア + 中心点
    g.lineStyle(1.4, COLORS.highlight, 0.9);
    g.strokeCircle(0, 0, r * 0.5);
    g.fillStyle(COLORS.highlight, 0.95);
    g.fillCircle(0, 0, r * 0.32);
    g.fillStyle(c, 1);
    g.fillCircle(0, 0, r * 0.14);
  }

  /** sniper: 既存維持 (Step 2 範囲外)。 */
  private drawSniper(g: Phaser.GameObjects.Graphics): void {
    const r = this.stats.radius;
    const c = this.stats.color;
    g.fillStyle(c, 0.2);
    g.fillCircle(0, 0, r + 6);
    g.lineStyle(1, c, 0.7);
    g.strokeCircle(0, 0, r + 2);
    g.fillStyle(c, 1);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.7, -r * 0.8);
    g.lineTo(-r * 0.7, r * 0.8);
    g.closePath();
    g.fillPath();
    // 砲身を細い長方形で前方に伸ばす
    g.fillStyle(c, 1);
    g.fillRect(r - 1, -2, r * 0.9, 4);
    g.fillStyle(COLORS.highlight, 0.85);
    g.fillCircle(0, 0, r * 0.25);
  }

  /**
   * delta は ms。`ctx` は shoot 種別だけが弾を push するための配列を渡す。
   * charge 種別 (basic/fast/tank/boss) は ctx を使わない。
   */
  public update(delta: number, ctx?: EnemyTickContext): void {
    if (this.dead || this.reachedBase) return;

    // 2026-05-25 後: hunter は毎フレーム最寄り船をターゲットに更新する。
    // 船が居なければ基地に戻す (= 基本敵と同じ動き)。
    if (this.stats.prefersShip) {
      const ship = ctx?.ships ? nearestAliveShip(this.x, this.y, ctx.ships) : null;
      if (ship) {
        this.targetX = ship.x;
        this.targetY = ship.y;
        this.targetIsShip = true;
      } else {
        this.targetX = this.baseX;
        this.targetY = this.baseY;
        this.targetIsShip = false;
      }
    }

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
    // 2026-05-25 後: hunter で船を狙っているフレームは reachedBase を立てない。
    // 船に接触し続けて Ship.update 側の contactDps でダメージを与えるのが目的のため。
    // 船を狩り切って基地に向かい直したら通常通り基地接触で発火する。
    if (dist <= this.stats.contactRadius) {
      if (!this.targetIsShip) {
        this.reachedBase = true;
        return;
      }
      // 船接触中: 移動はせず ship 側のダメージ計算に任せる (突き刺さって押す挙動)
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

/**
 * (x,y) から見て最寄りの生存 Ship を返す (2026-05-25 後: hunter のターゲティング用)。
 * - dead な Ship はスキップ
 * - HP 0 でダウン状態の Ship もスキップ (敵接触免疫のため狙う意味がない)
 * - 居なければ null
 */
function nearestAliveShip(
  x: number,
  y: number,
  ships: ReadonlyArray<Ship>
): Ship | null {
  let best: Ship | null = null;
  let bestDist = Infinity;
  for (const s of ships) {
    if (s.dead) continue;
    if (s.hp <= 0) continue; // ダウン中の船は接触ダメージが入らない (Ship.update 早期 return) ので狙わない
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
