/**
 * 報酬バナー (Step 3-D, 2026-05-25)。
 *
 * 画面上端から滑り込みで表示する独立 UI。HUD.showBanner (画面中央の Phase 系) と
 * 並存する別経路。Phase クリア / 敵ドロップ / 中盤ボーナス用。
 *
 * 動き: y=-80 (画面外) からターゲット y=68 へスライドイン (240ms ease-out)
 *      → 表示 displayMs (デフォルト 1800ms)
 *      → y=-80 へスライドアウト (240ms ease-in)
 * 連続 show は既存 tween を kill してから新規再生 (重なり防止)。
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config';
import { RARITY_COLOR, RARITY_SHORT, type Rarity } from '../items/itemTypes';

const FONT = 'system-ui, "Segoe UI", sans-serif';
const BANNER_W = 460;
const BANNER_H = 56;
const Y_HIDDEN = -80;
const Y_SHOWN = 68;

export interface RewardShowOptions {
  /** Rarity (枠色 + バッジ)。 */
  rarity: Rarity;
  /** カテゴリ別アクセント色 (省略時 rarity 色)。 */
  accentColor?: number;
  /** 上段の小見出し (例: "PHASE 2 CLEAR" / "BOSS DROP" / "中盤ボーナス")。 */
  heading: string;
  /** メインテキスト (アイテム名)。 */
  name: string;
  /** 表示時間 (ms)。デフォルト 1800。 */
  displayMs?: number;
}

export class RewardBanner {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private accentBar: Phaser.GameObjects.Rectangle;
  private hexIcon: Phaser.GameObjects.Graphics;
  private badgeBg: Phaser.GameObjects.Rectangle;
  private badgeText: Phaser.GameObjects.Text;
  private headingText: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private activeTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const cx = GAME_WIDTH / 2;
    this.container = scene.add.container(cx, Y_HIDDEN).setDepth(22);

    // 背景パネル
    this.bg = scene.add
      .rectangle(0, 0, BANNER_W, BANNER_H, COLORS.bgAlt, 0.96)
      .setStrokeStyle(1.5, COLORS.accent, 0.85);
    // 左端の縦アクセントバー (Rarity 色)
    this.accentBar = scene.add
      .rectangle(-BANNER_W / 2 + 3, 0, 4, BANNER_H, COLORS.accent, 1)
      .setOrigin(0.5);
    // 中央左寄せの六角アイコン
    this.hexIcon = scene.add.graphics();
    // Rarity バッジ (中央左、アイコン左)
    this.badgeBg = scene.add
      .rectangle(-BANNER_W / 2 + 64, -14, 26, 16, COLORS.accent, 0.18)
      .setStrokeStyle(1, COLORS.accent, 1);
    this.badgeText = scene.add
      .text(-BANNER_W / 2 + 64, -14, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    // 見出し (小さく上)
    this.headingText = scene.add
      .text(-BANNER_W / 2 + 86, -14, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    // メインテキスト (アイテム名)
    this.nameText = scene.add
      .text(-BANNER_W / 2 + 86, 10, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);

    this.container.add([
      this.bg,
      this.accentBar,
      this.hexIcon,
      this.badgeBg,
      this.badgeText,
      this.headingText,
      this.nameText,
    ]);
  }

  /** バナーを表示。既に表示中なら上書きして再生。 */
  public show(opts: RewardShowOptions): void {
    const rc = RARITY_COLOR[opts.rarity];
    const accent = opts.accentColor ?? rc;
    const displayMs = opts.displayMs ?? 1800;

    // 枠と装飾を Rarity 色に更新
    this.bg.setStrokeStyle(1.5, rc, 0.85);
    this.accentBar.setFillStyle(rc, 1);
    this.badgeBg.setFillStyle(rc, 0.2).setStrokeStyle(1, rc, 1);
    this.badgeText.setText(RARITY_SHORT[opts.rarity]).setColor('#' + rc.toString(16).padStart(6, '0'));
    this.headingText.setText(opts.heading);
    this.nameText.setText(opts.name);

    // 六角アイコン (内外二重 + 中心 dot)
    this.hexIcon.clear();
    this.hexIcon.setPosition(-BANNER_W / 2 + 36, 0);
    this.drawHex(this.hexIcon, 0, 0, 18, COLORS.bg, 0.9);
    this.strokeHex(this.hexIcon, 0, 0, 18, accent, 1.4);
    this.drawHex(this.hexIcon, 0, 0, 12, accent, 0.85);
    this.hexIcon.fillStyle(COLORS.highlight, 1);
    this.hexIcon.fillCircle(0, 0, 3);

    // 既存 tween を kill して位置をリセット
    this.activeTween?.stop();
    this.container.setY(Y_HIDDEN).setAlpha(1);

    // in → hold → out のチェーン
    this.activeTween = this.scene.tweens.add({
      targets: this.container,
      y: Y_SHOWN,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.scene.time.delayedCall(displayMs, () => {
          this.activeTween = this.scene.tweens.add({
            targets: this.container,
            y: Y_HIDDEN,
            duration: 240,
            ease: 'Cubic.easeIn',
          });
        });
      },
    });
  }

  public destroy(): void {
    this.activeTween?.stop();
    this.container.destroy();
  }

  // ─── 六角ヘルパ ────────────────────────────────────────

  private drawHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha: number): void {
    g.fillStyle(color, alpha);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }

  private strokeHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, width: number): void {
    g.lineStyle(width, color, 1);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.strokePath();
  }
}
