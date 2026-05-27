/**
 * アイテムカード (Step 3-B, 2026-05-25)。
 *
 * Phaser Container 1 つに「Rarity 別装飾 + 六角アイコン + 名前 + (任意) 装着バッジ」を
 * まとめる。ShipListScene / GachaOpenScene の両方で使う。
 *
 * Rarity 別装飾:
 *   - N: 灰枠 1px
 *   - R: 青枠 1.5px
 *   - SR: 紫枠 1.5px + 回転する短い円弧 (conic-gradient 近似、4s 360°)
 *   - L: 金枠 2px + 金ハロー + 金粒子 3 個 (拡縮)
 */
import Phaser from 'phaser';
import { COLORS } from '../config';
import { RARITY_COLOR, RARITY_SHORT, type Rarity } from '../items/itemTypes';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ItemCardOptions {
  width: number;
  height: number;
  rarity: Rarity;
  /** 中央のアイコン色 (typeId 別に指定。指定なければ rarity 色)。 */
  iconColor?: number;
  /** カード下部に表示する名前 (1〜2 行)。 */
  name: string;
  /** 名前下に小さく出すサブテキスト (effect 等)。空文字で省略可。 */
  subtext?: string;
  /** 右上に装着済バッジ (例: "S1") を出す。null/undefined で非表示。 */
  equippedBadge?: string | null;
  selected?: boolean;
  onPointerDown?: () => void;
  /** depth (デフォルト 3)。 */
  depth?: number;
}

export class ItemCard {
  public readonly container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private rarity: Rarity;
  /** SR の回転アーク / L の粒子 Tween。destroy で停止する。 */
  private decorTweens: Phaser.Tweens.Tween[] = [];
  private decorObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: ItemCardOptions
  ) {
    this.rarity = opts.rarity;
    const { width: w, height: h } = opts;
    const rc = RARITY_COLOR[opts.rarity];
    const iconColor = opts.iconColor ?? rc;
    const depth = opts.depth ?? 3;

    this.container = scene.add.container(x, y).setDepth(depth);

    // ─── L の金ハロー (背面) ────────────────────────────
    if (opts.rarity === 'L') {
      const halo = scene.add.graphics();
      halo.fillStyle(COLORS.rarityL, 0.18);
      halo.fillCircle(0, 0, Math.max(w, h) * 0.55);
      this.container.add(halo);
      this.decorObjects.push(halo);
    }

    // ─── 背景 (Rarity 別の枠) ──────────────────────────
    const fillAlpha = opts.selected ? 0.95 : 0.9;
    this.bg = scene.add
      .rectangle(0, 0, w, h, COLORS.bgAlt, fillAlpha)
      .setStrokeStyle(
        opts.rarity === 'L' ? 2 : opts.rarity === 'SR' || opts.rarity === 'R' ? 1.5 : 1,
        rc,
        opts.selected ? 1 : 0.85
      )
      .setInteractive({ useHandCursor: true });
    if (opts.onPointerDown) {
      this.bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        opts.onPointerDown!();
      });
    }
    this.container.add(this.bg);

    // ─── SR の回転アーク (conic-gradient 近似) ─────────
    if (opts.rarity === 'SR') {
      const arc = scene.add.graphics();
      const r = Math.min(w, h) * 0.42;
      arc.lineStyle(2, rc, 0.7);
      arc.beginPath();
      arc.arc(0, 0, r, -Math.PI / 4, Math.PI / 4, false);
      arc.strokePath();
      arc.lineStyle(1.2, rc, 0.4);
      arc.beginPath();
      arc.arc(0, 0, r, Math.PI * 0.75, Math.PI * 1.05, false);
      arc.strokePath();
      this.container.add(arc);
      this.decorObjects.push(arc);
      const tw = scene.tweens.add({
        targets: arc,
        angle: 360,
        duration: 4000,
        repeat: -1,
        ease: 'Linear',
      });
      this.decorTweens.push(tw);
    }

    // ─── 中央の六角アイコン ─────────────────────────────
    const iconR = Math.min(w, h) * 0.28;
    const icon = scene.add.graphics();
    this.drawHex(icon, iconR, COLORS.bgAlt, 0.85);
    this.drawHexStroke(icon, iconR, iconColor, 1.4);
    // 内側の小六角 (色塗り)
    this.drawHex(icon, iconR * 0.7, iconColor, 0.9);
    // 中央 dot
    icon.fillStyle(COLORS.highlight, 0.95);
    icon.fillCircle(0, 0, iconR * 0.18);
    icon.setY(-h * 0.1);
    this.container.add(icon);

    // ─── レア度バッジ (左上) ────────────────────────────
    const badgeBg = scene.add
      .rectangle(-w / 2 + 16, -h / 2 + 12, 24, 16, rc, 0.18)
      .setStrokeStyle(1, rc, 1);
    const badgeText = scene.add
      .text(-w / 2 + 16, -h / 2 + 12, RARITY_SHORT[opts.rarity], {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#' + rc.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.container.add([badgeBg, badgeText]);

    // ─── 装着バッジ (右上、モジュール用) ──────────────
    if (opts.equippedBadge) {
      const eqBg = scene.add
        .rectangle(w / 2 - 18, -h / 2 + 12, 28, 14, COLORS.accent, 1)
        .setStrokeStyle(1, COLORS.accent, 1);
      const eqText = scene.add
        .text(w / 2 - 18, -h / 2 + 12, opts.equippedBadge, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#05070d',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.container.add([eqBg, eqText]);
    }

    // ─── 名前 (下部) ───────────────────────────────────
    const nameText = scene.add
      .text(0, h / 2 - 26, opts.name, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#cfd6e6',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: w - 8 },
      })
      .setOrigin(0.5, 1);
    this.container.add(nameText);

    // ─── サブテキスト (effect 等) ─────────────────────
    if (opts.subtext) {
      const sub = scene.add
        .text(0, h / 2 - 8, opts.subtext, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#3ee0c5',
          align: 'center',
        })
        .setOrigin(0.5, 1);
      this.container.add(sub);
    }

    // ─── L の金粒子 (3 個、ランダム位置で拡縮) ─────────
    if (opts.rarity === 'L') {
      for (let i = 0; i < 3; i++) {
        const px = (Math.random() - 0.5) * w * 0.6;
        const py = (Math.random() - 0.5) * h * 0.6;
        const p = scene.add.graphics();
        p.fillStyle(COLORS.rarityL, 1);
        p.fillCircle(0, 0, 1.5);
        p.setPosition(px, py).setScale(0.6);
        this.container.add(p);
        this.decorObjects.push(p);
        const tw = scene.tweens.add({
          targets: p,
          scale: 1.4,
          alpha: 0.3,
          duration: 700 + i * 250,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this.decorTweens.push(tw);
      }
    }
  }

  /** カードのレア度 (外部から判定用)。 */
  public getRarity(): Rarity {
    return this.rarity;
  }

  /** 選択状態を切り替える (枠の alpha のみ変える)。 */
  public setSelected(selected: boolean): void {
    const rc = RARITY_COLOR[this.rarity];
    this.bg.setStrokeStyle(
      this.rarity === 'L' ? 2 : this.rarity === 'SR' || this.rarity === 'R' ? 1.5 : 1,
      rc,
      selected ? 1 : 0.85
    );
    this.bg.setFillStyle(COLORS.bgAlt, selected ? 0.98 : 0.9);
  }

  public destroy(): void {
    for (const t of this.decorTweens) t.stop();
    this.decorTweens = [];
    this.container.destroy();
  }

  // ─── helper: 六角形描画 ────────────────────────────────

  private drawHex(g: Phaser.GameObjects.Graphics, r: number, color: number, alpha: number): void {
    g.fillStyle(color, alpha);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }

  private drawHexStroke(g: Phaser.GameObjects.Graphics, r: number, color: number, width: number): void {
    g.lineStyle(width, color, 1);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.strokePath();
  }
}
