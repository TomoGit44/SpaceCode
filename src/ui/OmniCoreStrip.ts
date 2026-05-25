import Phaser from 'phaser';
import { COLORS } from '../config';
import type { Inventory } from '../items/Inventory';
import { OMNI_CORE_TYPES, isOmniCore, omniCorePercent } from '../items/types/omniCores';
import { RARITY_COLOR, RARITY_SHORT, RARITY_LABEL } from '../items/itemTypes';

const FONT = 'system-ui, "Segoe UI", sans-serif';

/** アイコン 1 個のサイズ (正方形)。 */
const ICON_SIZE = 40;
/** アイコン間の間隔。 */
const ICON_GAP = 8;

/**
 * OmniCoreStrip — 画面左上に常時表示する所持オムニ・コアの帯 (2026-05-25 新規)。
 *
 * 各コアにそれぞれ固有アイコンを Graphics で描画する (画像アセット不使用方針)。
 * Inventory.items を参照し、`refresh()` で再描画する。GameScene 側はアイテム
 * 構成変化のたびに refresh を呼ぶ。
 *
 * 同種コアを複数所持している場合は 1 アイコンにまとめ、右下に ×N バッジを出す。
 * 各アイコン hover で右に詳細テキスト (名前 / 効果) を表示。
 */
export class OmniCoreStrip {
  private scene: Phaser.Scene;
  private inventory: Inventory;
  private originX: number;
  private originY: number;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private tooltipObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, inventory: Inventory, x: number, y: number) {
    this.scene = scene;
    this.inventory = inventory;
    this.originX = x;
    this.originY = y;
    this.refresh();
  }

  /** インベントリ変化時に呼ぶ。既存描画を破棄して再構築。 */
  public refresh(): void {
    this.hideTooltip();
    for (const g of this.objects) g.destroy();
    this.objects = [];

    // typeId ごとに所持数 + 代表 rarity (最高レアを優先) を集計
    type Agg = { count: number; rarity: 'N' | 'R' | 'SR' | 'L' };
    const order: Record<string, number> = { L: 3, SR: 2, R: 1, N: 0 };
    const agg = new Map<string, Agg>();
    for (const it of this.inventory.items) {
      if (!isOmniCore(it.typeId)) continue;
      const cur = agg.get(it.typeId);
      if (!cur) {
        agg.set(it.typeId, { count: 1, rarity: it.rarity });
      } else {
        cur.count += 1;
        if ((order[it.rarity] ?? 0) > (order[cur.rarity] ?? 0)) cur.rarity = it.rarity;
      }
    }

    if (agg.size === 0) return; // 所持なし: 何も描かない

    // 横一列に配置
    let cx = this.originX + ICON_SIZE / 2;
    const cy = this.originY + ICON_SIZE / 2;
    for (const [typeId, info] of agg.entries()) {
      this.makeIcon(typeId, info.rarity, info.count, cx, cy);
      cx += ICON_SIZE + ICON_GAP;
    }
  }

  /** 1 つのアイコン (背景 + 型別シンボル + レア度ボーダー + count バッジ) を生成。 */
  private makeIcon(
    typeId: string,
    rarity: 'N' | 'R' | 'SR' | 'L',
    count: number,
    cx: number,
    cy: number
  ): void {
    const rc = RARITY_COLOR[rarity];
    const half = ICON_SIZE / 2;

    // 背景四角 (角丸風に Graphics で塗り + ボーダー)
    const bg = this.scene.add.graphics().setDepth(20);
    bg.fillStyle(COLORS.bgAlt, 0.92);
    bg.fillRoundedRect(cx - half, cy - half, ICON_SIZE, ICON_SIZE, 4);
    bg.lineStyle(2, rc, 0.95);
    bg.strokeRoundedRect(cx - half, cy - half, ICON_SIZE, ICON_SIZE, 4);
    this.objects.push(bg);

    // 型別シンボル
    const sym = this.scene.add.graphics().setDepth(21);
    drawOmniCoreSymbol(sym, typeId, cx, cy, ICON_SIZE);
    this.objects.push(sym);

    // count バッジ (右下、2 個以上のみ)
    if (count > 1) {
      const bx = cx + half - 4;
      const by = cy + half - 4;
      const badge = this.scene.add.graphics().setDepth(22);
      badge.fillStyle(rc, 0.95);
      badge.fillCircle(bx, by, 8);
      this.objects.push(badge);
      const t = this.scene.add
        .text(bx, by, String(count), {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#05070d',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(23);
      this.objects.push(t);
    }

    // 入力 (hover でツールチップ)
    const hit = this.scene.add
      .rectangle(cx, cy, ICON_SIZE, ICON_SIZE, 0xffffff, 0.001)
      .setDepth(24)
      .setInteractive({ useHandCursor: false });
    hit.on('pointerover', () => this.showTooltip(typeId, rarity, count, cx, cy + half + 4));
    hit.on('pointerout', () => this.hideTooltip());
    this.objects.push(hit);
  }

  /** 詳細ツールチップを表示。 */
  private showTooltip(
    typeId: string,
    rarity: 'N' | 'R' | 'SR' | 'L',
    count: number,
    px: number,
    py: number
  ): void {
    this.hideTooltip();
    const def = OMNI_CORE_TYPES[typeId];
    if (!def) return;
    const rc = RARITY_COLOR[rarity];
    const lines = [
      `${def.nameJa}  [${RARITY_LABEL[rarity]}]`,
      `${def.descJa}  ${signed(omniCorePercent(typeId, rarity))}%`,
      count > 1 ? `所持 ×${count} (効果は加算スタック)` : '',
    ].filter(Boolean);
    const text = this.scene.add
      .text(px, py, lines.join('\n'), {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#cfd6e6',
        backgroundColor: '#05070dee',
        padding: { left: 8, right: 8, top: 6, bottom: 6 },
        lineSpacing: 4,
      })
      .setOrigin(0, 0)
      .setDepth(40);
    // ボーダー線 (rarity 色)
    const w = text.width;
    const h = text.height;
    const border = this.scene.add.graphics().setDepth(41);
    border.lineStyle(1, rc, 0.9);
    border.strokeRect(px, py, w, h);
    this.tooltipObjects.push(text, border);
  }

  private hideTooltip(): void {
    for (const g of this.tooltipObjects) g.destroy();
    this.tooltipObjects = [];
  }

  public destroy(): void {
    this.hideTooltip();
    for (const g of this.objects) g.destroy();
    this.objects = [];
  }
}

/** +X / -X を符号付き整数文字列に。 */
function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * オムニ・コア種別ごとのシンボル描画 (画像アセット不使用、Graphics で完結)。
 * cx / cy は中心、`size` はアイコン全体の正方形サイズ。
 */
function drawOmniCoreSymbol(
  g: Phaser.GameObjects.Graphics,
  typeId: string,
  cx: number,
  cy: number,
  size: number
): void {
  const r = size * 0.32; // シンボル基本半径
  switch (typeId) {
    case 'core_attack':
      drawLightning(g, cx, cy, r, COLORS.enemy, false);
      break;
    case 'core_attack_plus':
      drawLightning(g, cx, cy, r * 1.05, COLORS.enemy, true);
      break;
    case 'core_thruster':
      drawArrow(g, cx, cy, r, COLORS.ally);
      break;
    case 'core_drill':
      drawDrill(g, cx, cy, r, COLORS.resource);
      break;
    case 'core_hull':
      drawShield(g, cx, cy, r, COLORS.ally, false);
      break;
    case 'core_endurance':
      drawShield(g, cx, cy, r, COLORS.accent, true);
      break;
    case 'core_turret':
      drawCrosshair(g, cx, cy, r, COLORS.base);
      break;
    case 'core_bounty':
      drawDollar(g, cx, cy, r, COLORS.resource);
      break;
    case 'core_efficiency':
      drawBattery(g, cx, cy, r, COLORS.accent);
      break;
    default:
      // フォールバック: 単純な塗り円
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(cx, cy, r * 0.6);
  }
}

// ─── シンボル描画ヘルパ ────────────────────────────────────

function drawLightning(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  withSparks: boolean
): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(cx + r * 0.2, cy - r);
  g.lineTo(cx - r * 0.4, cy + r * 0.1);
  g.lineTo(cx - r * 0.05, cy + r * 0.1);
  g.lineTo(cx - r * 0.2, cy + r);
  g.lineTo(cx + r * 0.4, cy - r * 0.1);
  g.lineTo(cx + r * 0.05, cy - r * 0.1);
  g.closePath();
  g.fillPath();
  if (withSparks) {
    g.fillStyle(color, 0.9);
    g.fillCircle(cx - r * 0.8, cy - r * 0.4, 2);
    g.fillCircle(cx + r * 0.7, cy + r * 0.6, 2);
    g.fillCircle(cx + r * 0.75, cy - r * 0.7, 1.5);
  }
}

function drawArrow(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number
): void {
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(cx + r, cy);
  g.lineTo(cx - r * 0.5, cy - r * 0.7);
  g.lineTo(cx - r * 0.2, cy);
  g.lineTo(cx - r * 0.5, cy + r * 0.7);
  g.closePath();
  g.fillPath();
  g.fillStyle(color, 0.6);
  g.fillRect(cx - r, cy - 1.4, r * 0.6, 2.8);
}

function drawDrill(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number
): void {
  // 円錐 (下向き) + 螺旋を意識した内側 V
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(cx - r * 0.7, cy - r * 0.6);
  g.lineTo(cx + r * 0.7, cy - r * 0.6);
  g.lineTo(cx, cy + r);
  g.closePath();
  g.fillPath();
  // 内側ライン (削る感)
  g.lineStyle(1, 0x05070d, 0.6);
  g.beginPath();
  g.moveTo(cx - r * 0.3, cy - r * 0.4);
  g.lineTo(cx, cy + r * 0.3);
  g.lineTo(cx + r * 0.3, cy - r * 0.4);
  g.strokePath();
  // 持ち手 (上)
  g.fillStyle(color, 0.7);
  g.fillRect(cx - r * 0.25, cy - r, r * 0.5, r * 0.3);
}

function drawShield(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
  withCross: boolean
): void {
  // 上部直線 + 下部尖り
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(cx - r * 0.75, cy - r * 0.85);
  g.lineTo(cx + r * 0.75, cy - r * 0.85);
  g.lineTo(cx + r * 0.7, cy + r * 0.2);
  g.lineTo(cx, cy + r);
  g.lineTo(cx - r * 0.7, cy + r * 0.2);
  g.closePath();
  g.fillPath();
  if (withCross) {
    // 白い + で耐久を表現
    g.fillStyle(0xffffff, 1);
    g.fillRect(cx - r * 0.15, cy - r * 0.45, r * 0.3, r * 1.0);
    g.fillRect(cx - r * 0.45, cy - r * 0.15, r * 0.9, r * 0.3);
  } else {
    // 装甲ライン (横一本)
    g.lineStyle(1.5, 0x05070d, 0.6);
    g.beginPath();
    g.moveTo(cx - r * 0.6, cy - r * 0.2);
    g.lineTo(cx + r * 0.6, cy - r * 0.2);
    g.strokePath();
  }
}

function drawCrosshair(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number
): void {
  g.lineStyle(2, color, 0.95);
  g.strokeCircle(cx, cy, r);
  // 4 方向のティック
  g.beginPath();
  g.moveTo(cx - r * 1.2, cy);
  g.lineTo(cx - r * 0.4, cy);
  g.moveTo(cx + r * 0.4, cy);
  g.lineTo(cx + r * 1.2, cy);
  g.moveTo(cx, cy - r * 1.2);
  g.lineTo(cx, cy - r * 0.4);
  g.moveTo(cx, cy + r * 0.4);
  g.lineTo(cx, cy + r * 1.2);
  g.strokePath();
  // 中心ドット
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy, 2);
}

function drawDollar(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number
): void {
  // S 字を 2 つの円弧で簡易表現 + 縦棒
  g.lineStyle(2.2, color, 1);
  // 上半円 (左に開く)
  g.beginPath();
  g.arc(cx, cy - r * 0.4, r * 0.55, Math.PI * 0.1, Math.PI * 1.1, false);
  g.strokePath();
  // 下半円 (右に開く)
  g.beginPath();
  g.arc(cx, cy + r * 0.4, r * 0.55, Math.PI * 1.1, Math.PI * 2.1, false);
  g.strokePath();
  // 縦棒
  g.lineStyle(1.4, color, 1);
  g.beginPath();
  g.moveTo(cx, cy - r);
  g.lineTo(cx, cy + r);
  g.strokePath();
}

function drawBattery(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number
): void {
  // 本体 (縦長矩形) + 上に小キャップ + 内側に充電バー 3 本
  const w = r * 0.9;
  const h = r * 1.6;
  // キャップ
  g.fillStyle(color, 1);
  g.fillRect(cx - w * 0.3, cy - h / 2 - 4, w * 0.6, 4);
  // 本体アウトライン
  g.lineStyle(1.6, color, 1);
  g.strokeRect(cx - w / 2, cy - h / 2, w, h);
  // 充電バー 3 本
  g.fillStyle(color, 0.85);
  const barH = (h - 8) / 3 - 1;
  for (let i = 0; i < 3; i++) {
    g.fillRect(cx - w / 2 + 3, cy - h / 2 + 3 + i * (barH + 1), w - 6, barH);
  }
}
