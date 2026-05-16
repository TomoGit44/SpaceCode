import Phaser from 'phaser';
import { COLORS } from '../config';
import type { Block } from '../program/Block';
import { LOCATION_LABELS } from '../program/locations';

const FONT = 'system-ui, "Segoe UI", sans-serif';
const ROW_HEIGHT = 36;
const ROW_GAP = 4;
const INDENT_PX = 18;        // ネスト 1 段あたりの左インデント
const BRACKET_GAP = 4;       // 罫線とブロック本体の間隔

export interface ProgramListEvents {
  select: (path: number[]) => void;
  moveUp: (path: number[]) => void;
  moveDown: (path: number[]) => void;
  remove: (path: number[]) => void;
}

function blockLabel(block: Block): string {
  switch (block.type) {
    case 'MOVE_TO':
      return `移動 → ${LOCATION_LABELS[block.target]}`;
    case 'MINE':
      return `採掘: ${LOCATION_LABELS[block.target]}`;
    case 'DEPOSIT':
      return '納品';
    case 'ATTACK_NEAREST':
      return '攻撃 (最寄り)';
    case 'WAIT_UNTIL_FULL':
      return '満タンまで待機';
    case 'REPEAT':
      return `繰り返し × ${block.times}`;
  }
}

/** Row 展開時の各エントリ。1 ブロック = 1 row として表現。 */
interface Row {
  block: Block;
  path: number[];
  depth: number;          // ネスト深さ (0 = root)
  parentRow: Row | null;  // 親 REPEAT 行への参照 (罫線描画用)
}

/**
 * 編集オーバーレイ中央: ブロック一覧を **階層構造で** 縦に並べる。
 *
 * Phase 5 後 (インライン階層編集):
 * REPEAT のネストを drill-in せず、その場でインデント + 罫線で囲んで表現する。
 *   ┌─ [繰り返し × 10]
 *   │  [攻撃 (最寄り)]   ▲ ▼ ✕
 *   │  [移動 → 基地]    ▲ ▼ ✕
 *   └────────────────────
 *
 * 罫線 (縦線 + 閉じ線) は Graphics で描画。ブロック本体は Rectangle + Text。
 */
export class ProgramList {
  private scene: Phaser.Scene;
  private emitter: Phaser.Events.EventEmitter;
  private x: number;
  private y: number;
  private width: number;
  private height: number;
  private header: Phaser.GameObjects.Text;
  private bracketGfx: Phaser.GameObjects.Graphics;
  private rowObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    this.scene = scene;
    this.emitter = new Phaser.Events.EventEmitter();
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    this.header = scene.add
      .text(x + width / 2, y, 'プログラム', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#6b7da0',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);

    this.bracketGfx = scene.add.graphics();
    this.bracketGfx.setDepth(2);
  }

  /**
   * 描画。ブロック列を再帰展開し、行を順次レイアウトする。
   *
   * @param blocks root の Block[]
   * @param selectedPath 選択中ブロックの path (null = 未選択)
   * @param runningPath 走行中ブロックの path (null = idle / 末尾停止)
   */
  public render(
    blocks: ReadonlyArray<Block>,
    selectedPath: number[] | null,
    runningPath: number[] | null
  ): void {
    this.clearRows();
    this.bracketGfx.clear();

    if (blocks.length === 0) {
      const t = this.scene.add
        .text(this.x + this.width / 2, this.y + 60, '(ブロックがありません)', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#6b7da0',
        })
        .setOrigin(0.5, 0)
        .setDepth(3);
      this.rowObjects.push(t);
      return;
    }

    const rows = this.expandRows(blocks, 0, [], null);

    // 各行を描画 + REPEAT スコープの top/bottom y を集計
    const scopeBounds = new Map<Row, { topY: number; bottomY: number }>();
    rows.forEach((row, i) => {
      const rowY = this.y + 28 + i * (ROW_HEIGHT + ROW_GAP);
      if (rowY + ROW_HEIGHT > this.y + this.height) return; // 画面外省略
      this.makeRow(row, rowY, selectedPath, runningPath);

      // この row が REPEAT なら、bounds を初期化 (topY だけ確定)
      if (row.block.type === 'REPEAT') {
        scopeBounds.set(row, { topY: rowY, bottomY: rowY + ROW_HEIGHT });
      }

      // 親 row の bottomY を「子 row の下端」まで拡張
      let p = row.parentRow;
      while (p) {
        const b = scopeBounds.get(p);
        if (b) b.bottomY = Math.max(b.bottomY, rowY + ROW_HEIGHT);
        p = p.parentRow;
      }
    });

    // 罫線描画 (REPEAT スコープごとに縦線 + 閉じ線)
    for (const [repeatRow, bounds] of scopeBounds.entries()) {
      this.drawScopeBracket(repeatRow, bounds.topY, bounds.bottomY);
    }
  }

  /** ブロック列を再帰展開して Row[] にする。 */
  private expandRows(
    blocks: ReadonlyArray<Block>,
    depth: number,
    parentPath: number[],
    parentRow: Row | null
  ): Row[] {
    const out: Row[] = [];
    blocks.forEach((b, i) => {
      const path = [...parentPath, i];
      const row: Row = { block: b, path, depth, parentRow };
      out.push(row);
      if (b.type === 'REPEAT' && b.children.length > 0) {
        out.push(...this.expandRows(b.children, depth + 1, path, row));
      }
    });
    return out;
  }

  /** path 同値判定 */
  private pathEq(a: ReadonlyArray<number> | null, b: ReadonlyArray<number> | null): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  private clearRows(): void {
    for (const g of this.rowObjects) g.destroy();
    this.rowObjects = [];
  }

  private makeRow(
    row: Row,
    rowY: number,
    selectedPath: number[] | null,
    runningPath: number[] | null
  ): void {
    const selected = this.pathEq(row.path, selectedPath);
    const onCursor = this.pathEq(row.path, runningPath);
    const isRepeat = row.block.type === 'REPEAT';

    // ブロック本体の x 範囲
    const leftPad = row.depth * INDENT_PX + (row.depth > 0 ? BRACKET_GAP + 6 : 0);
    const rightBtnSpace = 26 * 3 + 6 * 2 + 8; // ▲ ▼ ✕ のスペース
    const blockX = this.x + leftPad;
    const blockW = this.width - leftPad - rightBtnSpace;

    const bgColor = selected
      ? COLORS.ally
      : onCursor
        ? COLORS.accent
        : isRepeat
          ? COLORS.accent
          : COLORS.panelBg;
    const bgAlpha = selected ? 0.22 : onCursor ? 0.16 : isRepeat ? 0.08 : 0.6;

    const bg = this.scene.add
      .rectangle(blockX + blockW / 2, rowY + ROW_HEIGHT / 2, blockW, ROW_HEIGHT, bgColor, bgAlpha)
      .setStrokeStyle(
        1,
        selected ? COLORS.ally : isRepeat ? COLORS.accent : COLORS.panelBorder,
        selected ? 1 : isRepeat ? 0.7 : 0.9
      )
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.emitter.emit('select', [...row.path]);
    });

    // 走行中マーカー
    if (onCursor) {
      const m = this.scene.add
        .text(blockX + 6, rowY + ROW_HEIGHT / 2, '▶', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#3ee0c5',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setDepth(3);
      this.rowObjects.push(m);
    }

    const labelX = blockX + (onCursor ? 22 : 10);
    const label = this.scene.add
      .text(labelX, rowY + ROW_HEIGHT / 2, blockLabel(row.block), {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#cfd6e6',
        fontStyle: isRepeat ? 'bold' : 'normal',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    this.rowObjects.push(bg, label);

    // 右端のボタン群 ▲▼✕
    const parent = this.parentLength(row.path);
    const btnW = 26;
    const gap = 6;
    const rightEdge = this.x + this.width - 6;
    const removeX = rightEdge - btnW / 2;
    const downX = removeX - btnW - gap;
    const upX = downX - btnW - gap;
    const lastIdx = row.path[row.path.length - 1]!;

    this.makeRowButton(upX, rowY + ROW_HEIGHT / 2, '▲', lastIdx > 0, () =>
      this.emitter.emit('moveUp', [...row.path])
    );
    this.makeRowButton(downX, rowY + ROW_HEIGHT / 2, '▼', lastIdx < parent - 1, () =>
      this.emitter.emit('moveDown', [...row.path])
    );
    this.makeRowButton(removeX, rowY + ROW_HEIGHT / 2, '✕', true, () =>
      this.emitter.emit('remove', [...row.path])
    );
  }

  /** 親 scope のブロック総数 (▼ の有効/無効判定用) — Row.parentRow から計算。 */
  private parentLength(path: number[]): number {
    // ProgramList は blocks を保持していないので、親の長さを直接求められない。
    // 代わりに「現在描画中の rows から path を比較して同じ scope に居る兄弟を数える」のが正攻法だが、
    // expandRows の戻り値を再走査するコストを避けるため、ここでは ▼ ボタンを常に有効化し
    // ProgramEditorScene 側で範囲外チェック (`moveDownAtPath`) する設計にする。
    // → 常に有効として「とりあえず ▼ を出す」。実際の no-op は scene 側で吸収。
    return Number.MAX_SAFE_INTEGER;
  }

  /** REPEAT スコープの罫線 (縦線 + 閉じ線) を描画する。 */
  private drawScopeBracket(repeatRow: Row, topY: number, bottomY: number): void {
    const g = this.bracketGfx;
    const lineColor = COLORS.accent;
    const lineAlpha = 0.55;
    g.lineStyle(2, lineColor, lineAlpha);
    // 縦線の x 位置: REPEAT 行の左端より少しだけ左
    const lineX = this.x + (repeatRow.depth + 1) * INDENT_PX + BRACKET_GAP - 8;
    // 縦線: REPEAT 行の下端から、最終子の下端まで
    const startY = topY + ROW_HEIGHT;
    const endY = bottomY;
    g.beginPath();
    g.moveTo(lineX, startY);
    g.lineTo(lineX, endY);
    g.strokePath();
    // 閉じ線 (└): 縦線の終点から右に短く伸ばす
    g.beginPath();
    g.moveTo(lineX, endY);
    g.lineTo(lineX + 12, endY);
    g.strokePath();
  }

  private makeRowButton(
    cx: number,
    cy: number,
    label: string,
    enabled: boolean,
    onClick: () => void
  ): void {
    const bg = this.scene.add
      .rectangle(cx, cy, 24, 24, COLORS.panelBg, enabled ? 1 : 0.4)
      .setStrokeStyle(1, enabled ? COLORS.ally : COLORS.uiDim, enabled ? 0.7 : 0.4)
      .setDepth(3);
    const t = this.scene.add
      .text(cx, cy, label, {
        fontFamily: FONT,
        fontSize: '13px',
        color: enabled ? '#cfd6e6' : '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(4);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
      bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        onClick();
      });
    }
    this.rowObjects.push(bg, t);
  }

  public on<K extends keyof ProgramListEvents>(event: K, fn: ProgramListEvents[K]): void {
    this.emitter.on(event, fn as (...args: unknown[]) => void);
  }

  public destroy(): void {
    this.clearRows();
    this.bracketGfx.destroy();
    this.header.destroy();
    this.emitter.removeAllListeners();
  }
}
