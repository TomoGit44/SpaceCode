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

/** スクロール: ヘッダ ("プログラム ...") とリスト本体の間。 */
const HEADER_HEIGHT = 28;
/** リスト本体の上端から先頭マーカー (「▼ ここから実行」) までの余白。 */
const START_MARKER_HEIGHT = 20;
/** 末尾マーカー (「↻ 先頭に戻る」) のぶん下に確保する余白。 */
const END_MARKER_HEIGHT = 28;

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
 *
 * 2026-05-25 後: 縦スクロールに対応。コード行数が表示領域を超えた場合、
 *   - マウスホイール / トラックパッド: 領域内で wheel イベントを受けてスクロール
 *   - 右端に細いスクロールバー (現在位置インジケータ) を表示
 *  rows をすべて算出した上で表示領域外の row はカリングする (描画コスト抑制)。
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

  /** スクロール位置 (px、上端からのオフセット)。 0 = 一番上。 */
  private scrollY: number = 0;
  /** 直近 render() のスクロール可能最大値 (= 総コンテンツ高 − 可視高、>= 0)。 */
  private maxScroll: number = 0;
  /** 直近 render() のパラメータを保持しておく (wheel イベントで再描画するため)。 */
  private lastCodes: ReadonlyArray<Code> | null = null;
  private lastSelectedPath: number[] | null = null;
  private lastRunningPath: number[] | null = null;
  /** 領域内ホイールでだけスクロールするためのヒットゾーン (見えない透明 rect)。 */
  private hitZone: Phaser.GameObjects.Rectangle;
  /** wheel ハンドラ (destroy で剥がす)。 */
  private wheelHandler?: (
    pointer: Phaser.Input.Pointer,
    over: Phaser.GameObjects.GameObject[],
    dx: number,
    dy: number,
    dz: number
  ) => void;

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

    // ホイール受け取り用の透明ヒットゾーン (リスト本体の表示領域全体)
    const zoneTop = y + HEADER_HEIGHT;
    const zoneH = height - HEADER_HEIGHT;
    this.hitZone = scene.add
      .rectangle(x + width / 2, zoneTop + zoneH / 2, width, zoneH, 0xffffff, 0)
      .setDepth(1)
      .setInteractive();

    // 2026-05-25 後: Phaser の wheel イベントは scene 全体に流れるため、
    // hitZone の上にポインタが居るかを毎回チェックしてスクロールする。
    this.wheelHandler = (_pointer, _over, _dx, dy) => {
      if (!this.lastCodes) return;
      const p = this.scene.input.activePointer;
      const inside =
        p.x >= this.x &&
        p.x <= this.x + this.width &&
        p.y >= zoneTop &&
        p.y <= zoneTop + zoneH;
      if (!inside) return;
      // dy > 0 で下スクロール (内容を上に動かす)
      const next = Math.max(0, Math.min(this.maxScroll, this.scrollY + dy * 0.6));
      if (next === this.scrollY) return;
      this.scrollY = next;
      this.rerenderFromCache();
    };
    scene.input.on('wheel', this.wheelHandler);
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
    // 内部 cache を更新 (wheel 時の再描画用)
    this.lastCodes = codes;
    this.lastSelectedPath = selectedPath;
    this.lastRunningPath = runningPath;

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
      this.maxScroll = 0;
      this.scrollY = 0;
      return;
    }

    // 可視領域 (ヘッダの下 → リスト下端の手前)
    const viewTop = this.y + HEADER_HEIGHT;
    const viewBottom = this.y + this.height;
    // 行を並べる上端 (先頭マーカー後)
    const rowsTopY = viewTop + START_MARKER_HEIGHT - this.scrollY;

    const rows = this.expandRows(codes, 0, [], null);

    // 全行の合計高さを先に計算してスクロール上限を確定
    const contentHeight =
      START_MARKER_HEIGHT +
      rows.length * (ROW_HEIGHT + ROW_GAP) +
      END_MARKER_HEIGHT;
    const visibleHeight = this.height - HEADER_HEIGHT;
    this.maxScroll = Math.max(0, contentHeight - visibleHeight);
    // 行数減少などで scrollY が範囲外になっていたら clamp
    if (this.scrollY > this.maxScroll) this.scrollY = this.maxScroll;

    // 先頭マーカー (「▼ ここから実行」)。スクロールにより上端の外へ出たら描かない。
    const startY = viewTop + 4 - this.scrollY;
    if (startY + 16 > viewTop && startY < viewBottom) {
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
    }

    // 各行を描画 + REPEAT スコープの top/bottom y を集計
    const scopeBounds = new Map<Row, { topY: number; bottomY: number }>();
    let lastRowBottomY = rowsTopY;
    rows.forEach((row, i) => {
      const rowY = rowsTopY + i * (ROW_HEIGHT + ROW_GAP);
      // 可視領域外はカリング (上にも下にも出る可能性あり)
      const inView = rowY + ROW_HEIGHT > viewTop && rowY < viewBottom;
      if (inView) {
        this.makeRow(row, rowY, selectedPath, runningPath);
      }
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

    // 罫線描画 (REPEAT スコープごとに縦線 + 閉じ線)。
    // 全 row 計算した bounds に対して描画するが、視野外部分は clip。
    for (const [repeatRow, bounds] of scopeBounds.entries()) {
      this.drawScopeBracket(repeatRow, bounds.topY, bounds.bottomY, viewTop, viewBottom);
    }

    // ─── 末尾マーカー: 「↻ 先頭に戻る」 ──────────────────
    const endY = lastRowBottomY + 6;
    if (endY < viewBottom && endY + 16 > viewTop) {
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
    }

    // ループ矢印 (右端の縦線 + ▲): 視野内に収まる範囲だけ描く
    const g = this.bracketGfx;
    g.lineStyle(1.5, COLORS.accent, 0.45);
    const loopX = this.x + this.width - 10;
    const topYLoop = Math.max(viewTop, viewTop + 4 - this.scrollY);
    const bottomYLoop = Math.min(viewBottom - 4, endY + 18);
    if (bottomYLoop > topYLoop) {
      g.beginPath();
      g.moveTo(loopX, bottomYLoop);
      g.lineTo(loopX, topYLoop);
      g.strokePath();
      // 上端の矢印 (▲): スクロール最上端のときだけ表示
      if (this.scrollY === 0) {
        g.fillStyle(COLORS.accent, 0.55);
        g.fillTriangle(loopX - 4, topYLoop + 6, loopX + 4, topYLoop + 6, loopX, topYLoop);
      }
    }

    // スクロールバー (スクロール可能なときだけ表示)
    if (this.maxScroll > 0) {
      this.drawScrollbar(viewTop, viewBottom, contentHeight, visibleHeight);
    }
  }

  /** wheel イベントから内部で呼び出す再描画 (キャッシュした codes で再 render)。 */
  private rerenderFromCache(): void {
    if (!this.lastCodes) return;
    this.render(this.lastCodes, this.lastSelectedPath, this.lastRunningPath);
  }

  /** スクロールバーを右端に描画 (本体右端の内側 6px)。 */
  private drawScrollbar(viewTop: number, viewBottom: number, contentH: number, visibleH: number): void {
    const g = this.bracketGfx;
    const trackX = this.x + this.width - 4;
    const trackTop = viewTop + 4;
    const trackBottom = viewBottom - 4;
    const trackH = trackBottom - trackTop;
    if (trackH <= 0) return;
    // トラック (薄)
    g.lineStyle(2, COLORS.panelBorder, 0.55);
    g.beginPath();
    g.moveTo(trackX, trackTop);
    g.lineTo(trackX, trackBottom);
    g.strokePath();
    // つまみ
    const ratio = visibleH / contentH;
    const thumbH = Math.max(20, trackH * ratio);
    const thumbStartRatio = this.scrollY / Math.max(1, this.maxScroll);
    const thumbY = trackTop + (trackH - thumbH) * thumbStartRatio;
    g.lineStyle(3, COLORS.accent, 0.85);
    g.beginPath();
    g.moveTo(trackX, thumbY);
    g.lineTo(trackX, thumbY + thumbH);
    g.strokePath();
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

    // コード本体の x 範囲 (スクロールバー用に右端 6px 確保)
    const scrollbarPad = 8;
    const leftPad = row.depth * INDENT_PX + (row.depth > 0 ? BRACKET_GAP + 6 : 0);
    const rightBtnSpace = ROW_BTN_SIZE * 3 + 6 * 2 + 8; // ▲ ▼ ✕ のスペース
    const codeX = this.x + leftPad;
    const codeW = this.width - leftPad - rightBtnSpace - scrollbarPad;

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

    // 右端のボタン群 ▲▼✕ (スクロールバー分だけ内側にずらす)
    const parent = this.parentLength(row.path);
    const btnW = ROW_BTN_SIZE;
    const gap = 6;
    const rightEdge = this.x + this.width - 6 - scrollbarPad;
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

  /**
   * REPEAT スコープの罫線 (縦線 + 閉じ線) を描画する。
   * viewTop / viewBottom で clip して、視野外には描かない。
   */
  private drawScopeBracket(
    repeatRow: Row,
    topY: number,
    bottomY: number,
    viewTop: number,
    viewBottom: number
  ): void {
    const g = this.bracketGfx;
    const lineColor = COLORS.accent;
    const lineAlpha = 0.55;
    g.lineStyle(2, lineColor, lineAlpha);
    // 縦線の x 位置: REPEAT 行の左端より少しだけ左
    const lineX = this.x + (repeatRow.depth + 1) * INDENT_PX + BRACKET_GAP - 8;
    // 縦線: REPEAT 行の下端から、最終子の下端まで
    let startY = topY + ROW_HEIGHT;
    let endY = bottomY;
    // 視野外を clip
    startY = Math.max(startY, viewTop);
    endY = Math.min(endY, viewBottom);
    if (endY <= startY) return;
    g.beginPath();
    g.moveTo(lineX, startY);
    g.lineTo(lineX, endY);
    g.strokePath();
    // 閉じ線 (└): 縦線の終点から右に短く伸ばす (元の終点が視野内のときだけ)
    if (bottomY <= viewBottom && bottomY >= viewTop) {
      g.beginPath();
      g.moveTo(lineX, endY);
      g.lineTo(lineX + 12, endY);
      g.strokePath();
    }
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
    if (this.wheelHandler) {
      this.scene.input.off('wheel', this.wheelHandler);
      this.wheelHandler = undefined;
    }
    this.clearRows();
    this.bracketGfx.destroy();
    this.hitZone.destroy();
    this.header.destroy();
    this.emitter.removeAllListeners();
  }
}
