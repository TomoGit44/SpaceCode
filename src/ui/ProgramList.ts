import Phaser from 'phaser';
import { COLORS } from '../config';
import type { Code } from '../program/Code';
import { codeChildren } from '../program/Code';
import { itemCodeLabel } from '../items/types/itemCodes';
import { LOCATION_LABELS } from '../program/locations';

const FONT = 'system-ui, "Segoe UI", sans-serif';
const ROW_HEIGHT = 40;       // Phase 7: タッチ操作向けに 36 → 40
const ROW_GAP = 4;
const INDENT_PX = 18;        // ネスト 1 段あたりの左インデント
const BRACKET_GAP = 4;       // 罫線とコード本体の間隔
const ROW_BTN_SIZE = 30;     // Phase 7: ▲▼✕ ボタン 24 → 30 (タッチ向け)

export interface ProgramListEvents {
  select: (path: number[]) => void;
  moveUp: (path: number[]) => void;
  moveDown: (path: number[]) => void;
  remove: (path: number[]) => void;
}

function codeLabel(code: Code): string {
  switch (code.type) {
    case 'MOVE_TO':
      return `移動 → ${LOCATION_LABELS[code.target]}`;
    case 'ATTACK_NEAREST':
      return '攻撃 (最寄り)';
    case 'WAIT':
      return `待機 ${code.seconds} 秒`;
    case 'REPEAT':
      return `繰り返し × ${code.times}`;
    case 'ITEM_CODE':
      return itemCodeLabel(code);
  }
}

/** Row 展開時の各エントリ。1 コード = 1 row として表現。 */
interface Row {
  code: Code;
  path: number[];
  depth: number;          // ネスト深さ (0 = root)
  parentRow: Row | null;  // 親 REPEAT 行への参照 (罫線描画用)
}

/**
 * 編集オーバーレイ中央: コード一覧を **階層構造で** 縦に並べる。
 *
 * Phase 5 後 (インライン階層編集):
 * REPEAT のネストを drill-in せず、その場でインデント + 罫線で囲んで表現する。
 *   ┌─ [繰り返し × 10]
 *   │  [攻撃 (最寄り)]   ▲ ▼ ✕
 *   │  [移動 → 基地]    ▲ ▼ ✕
 *   └────────────────────
 *
 * 罫線 (縦線 + 閉じ線) は Graphics で描画。コード本体は Rectangle + Text。
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
      .text(x + width / 2, y, 'プログラム (上から下へ → 末尾まで来たら自動で先頭へループ)', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#8aa3c8',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);

    this.bracketGfx = scene.add.graphics();
    this.bracketGfx.setDepth(2);
  }

  /**
   * 描画。コード列を再帰展開し、行を順次レイアウトする。
   *
   * @param codes root の Code[]
   * @param selectedPath 選択中コードの path (null = 未選択)
   * @param runningPath 走行中コードの path (null = idle / 末尾停止)
   */
  public render(
    codes: ReadonlyArray<Code>,
    selectedPath: number[] | null,
    runningPath: number[] | null
  ): void {
    this.clearRows();
    this.bracketGfx.clear();

    if (codes.length === 0) {
      const t = this.scene.add
        .text(this.x + this.width / 2, this.y + 60, '(コードがありません — 左から追加してください)', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#6b7da0',
        })
        .setOrigin(0.5, 0)
        .setDepth(3);
      this.rowObjects.push(t);
      return;
    }

    // ─── 先頭マーカー: 「▼ ここから実行」 ─────────────────
    const startY = this.y + 28;
    const startMarker = this.scene.add
      .text(this.x + this.width / 2, startY, '▼ ここから実行', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#3ee0c5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.rowObjects.push(startMarker);

    const rows = this.expandRows(codes, 0, [], null);

    // 各行を描画 + REPEAT スコープの top/bottom y を集計
    const scopeBounds = new Map<Row, { topY: number; bottomY: number }>();
    // 先頭マーカー分のオフセット (16px) を加味
    const rowsTopY = this.y + 48;
    let lastRowBottomY = rowsTopY;
    rows.forEach((row, i) => {
      const rowY = rowsTopY + i * (ROW_HEIGHT + ROW_GAP);
      if (rowY + ROW_HEIGHT > this.y + this.height - 24) return; // 末尾マーカー分の余白を確保
      this.makeRow(row, rowY, selectedPath, runningPath);
      lastRowBottomY = rowY + ROW_HEIGHT;

      // この row が wrapper (REPEAT / ITEM_CODE) なら、bounds を初期化 (topY だけ確定)
      if (codeChildren(row.code)) {
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

    // ─── 末尾マーカー: 「↻ 先頭に戻る」 ──────────────────
    const endY = lastRowBottomY + 6;
    const endMarker = this.scene.add
      .text(this.x + this.width / 2, endY, '↻ 末尾まで来たら先頭に戻る (自動ループ)', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8aa3c8',
        fontStyle: 'italic',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.rowObjects.push(endMarker);

    // ループを示す右側の細い縦線 + 弧 (末尾 → 先頭)
    const g = this.bracketGfx;
    g.lineStyle(1.5, COLORS.accent, 0.45);
    const loopX = this.x + this.width - 10;
    const topY2 = this.y + 44;
    const bottomY2 = endY + 18;
    g.beginPath();
    g.moveTo(loopX, bottomY2);
    g.lineTo(loopX, topY2);
    g.strokePath();
    // 上端の矢印 (▲)
    g.fillStyle(COLORS.accent, 0.55);
    g.fillTriangle(loopX - 4, topY2 + 6, loopX + 4, topY2 + 6, loopX, topY2);
  }

  /** コード列を再帰展開して Row[] にする。 */
  private expandRows(
    codes: ReadonlyArray<Code>,
    depth: number,
    parentPath: number[],
    parentRow: Row | null
  ): Row[] {
    const out: Row[] = [];
    codes.forEach((c, i) => {
      const path = [...parentPath, i];
      const row: Row = { code: c, path, depth, parentRow };
      out.push(row);
      const ch = codeChildren(c);
      if (ch && ch.length > 0) {
        out.push(...this.expandRows(ch, depth + 1, path, row));
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
    const isWrapper = codeChildren(row.code) !== null;

    // コード本体の x 範囲
    const leftPad = row.depth * INDENT_PX + (row.depth > 0 ? BRACKET_GAP + 6 : 0);
    const rightBtnSpace = ROW_BTN_SIZE * 3 + 6 * 2 + 8; // ▲ ▼ ✕ のスペース
    const codeX = this.x + leftPad;
    const codeW = this.width - leftPad - rightBtnSpace;

    const bgColor = selected
      ? COLORS.ally
      : onCursor
        ? COLORS.accent
        : isWrapper
          ? COLORS.accent
          : COLORS.panelBg;
    const bgAlpha = selected ? 0.22 : onCursor ? 0.16 : isWrapper ? 0.08 : 0.6;

    const bg = this.scene.add
      .rectangle(codeX + codeW / 2, rowY + ROW_HEIGHT / 2, codeW, ROW_HEIGHT, bgColor, bgAlpha)
      .setStrokeStyle(
        1,
        selected ? COLORS.ally : isWrapper ? COLORS.accent : COLORS.panelBorder,
        selected ? 1 : isWrapper ? 0.7 : 0.9
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
        .text(codeX + 6, rowY + ROW_HEIGHT / 2, '▶', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#3ee0c5',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setDepth(3);
      this.rowObjects.push(m);
    }

    const labelX = codeX + (onCursor ? 22 : 10);
    const label = this.scene.add
      .text(labelX, rowY + ROW_HEIGHT / 2, codeLabel(row.code), {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#cfd6e6',
        fontStyle: isWrapper ? 'bold' : 'normal',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    this.rowObjects.push(bg, label);

    // 右端のボタン群 ▲▼✕
    const parent = this.parentLength(row.path);
    const btnW = ROW_BTN_SIZE;
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

  /** 親 scope のコード総数 (▼ の有効/無効判定用) — Row.parentRow から計算。 */
  private parentLength(path: number[]): number {
    // ProgramList は codes を保持していないので、親の長さを直接求められない。
    // 代わりに「現在描画中の rows から path を比較して同じ scope に居る兄弟を数える」のが正攻法だが、
    // expandRows の戻り値を再走査するコストを避けるため、ここでは ▼ ボタンを常に有効化し
    // ProgramEditorScene 側で範囲外チェック (`moveDownAtPath`) する設計にする。
    // → 常に有効として「とりあえず ▼ を出す」。実際の no-op は scene 側で吸収。
    void path;
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
      .rectangle(cx, cy, ROW_BTN_SIZE, ROW_BTN_SIZE, COLORS.panelBg, enabled ? 1 : 0.4)
      .setStrokeStyle(1, enabled ? COLORS.ally : COLORS.uiDim, enabled ? 0.7 : 0.4)
      .setDepth(3);
    const t = this.scene.add
      .text(cx, cy, label, {
        fontFamily: FONT,
        fontSize: '15px',
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
