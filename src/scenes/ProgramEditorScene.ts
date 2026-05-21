import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import type { Ship } from '../entities/Ship';
import type { Program } from '../program/Program';
import type { Code, CodeType } from '../program/Code';
import { createCode } from '../program/Code';
import { Executor } from '../program/Executor';
import { sampleCodes } from '../program/samples';
import { CodePalette } from '../ui/CodePalette';
import { ProgramList } from '../ui/ProgramList';
import { CodeParamEditor } from '../ui/CodeParamEditor';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ProgramEditorData {
  ship: Ship;
}

/** path 同値判定 */
function pathEquals(a: ReadonlyArray<number> | null, b: ReadonlyArray<number> | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Ship のプログラムを編集するオーバーレイシーン。
 *
 * GameScene を pause せずに並行 active で起動。
 *
 * Phase 5 後 (インライン階層編集):
 * REPEAT の中身は drill-in せず、その場でインデント表示する (Scratch 風)。
 * 編集対象を `selectedPath: number[]` (root 起点) で扱い、root scope/ ネスト内ともに
 * 同じハンドラで操作できる構造に刷新した。
 */
export class ProgramEditorScene extends Phaser.Scene {
  private targetShip!: Ship;
  private program!: Program;
  private executor: Executor | null = null;
  private selectedPath: number[] | null = null;

  private backdrop!: Phaser.GameObjects.Rectangle;
  private card!: Phaser.GameObjects.Rectangle;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private palette!: CodePalette;
  private list!: ProgramList;
  private paramEditor!: CodeParamEditor;
  private escHandler?: () => void;

  // レイアウト計算で使う領域
  private cardLeft: number = 0;
  private cardTop: number = 0;

  // 走行 path の前回値 (再描画判定用)
  private lastRunningPath: number[] | null = null;

  constructor() {
    super({ key: 'ProgramEditorScene' });
  }

  init(data: ProgramEditorData): void {
    this.targetShip = data.ship;
    this.selectedPath = null;
    this.executor = null;
    this.lastRunningPath = null;
  }

  create(): void {
    const program = this.targetShip.getProgram();
    if (!program) {
      this.scene.stop();
      return;
    }
    this.program = program;
    const behavior = (this.targetShip as unknown as { behavior: Executor | null }).behavior;
    this.executor = behavior instanceof Executor ? behavior : null;

    // ─── バックドロップ ───────────────────────────────────────
    this.backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.55)
      .setDepth(0)
      .setInteractive();
    this.backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });

    // ─── 中央カード ───────────────────────────────────────────
    const cardW = 1040;
    const cardH = 580;
    const cardX = GAME_WIDTH / 2;
    const cardY = GAME_HEIGHT / 2;
    this.card = this.add
      .rectangle(cardX, cardY, cardW, cardH, COLORS.bgAlt, 0.97)
      .setStrokeStyle(1, COLORS.ally, 0.4)
      .setDepth(1)
      .setInteractive();
    this.card.on('pointerdown', () => {});
    this.cardLeft = cardX - cardW / 2;
    this.cardTop = cardY - cardH / 2;

    // ─── タイトル + 説明 ──────────────────────────────────
    const title = this.add
      .text(this.cardLeft + 24, this.cardTop + 16, 'プログラム編集', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setDepth(2);
    const hint = this.add
      .text(
        this.cardLeft + 24,
        this.cardTop + 44,
        'コードを置いた順に実行 → 末尾まで来たら自動で先頭にループ。「繰り返し」は N 回だけ繰り返したい時に使用。',
        {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        }
      )
      .setDepth(2);
    this.chrome.push(title, hint);

    // 右上の ✕ ボタン
    this.makeCloseButton(cardX + cardW / 2 - 50, this.cardTop + 30);

    // ─── 3 カラムレイアウト ──────────────────────────────────
    const innerTop = this.cardTop + 76;
    const innerHeight = cardH - 96;
    const colGap = 16;
    const totalInnerW = cardW - 48;
    const leftW = 220;
    const rightW = 260;
    const midW = totalInnerW - leftW - rightW - colGap * 2;

    const leftX = this.cardLeft + 24;
    const midX = leftX + leftW + colGap;
    const rightX = midX + midW + colGap;

    this.palette = new CodePalette(this, leftX, innerTop, leftW);
    this.list = new ProgramList(this, midX, innerTop, midW, innerHeight);
    this.paramEditor = new CodeParamEditor(this, rightX, innerTop, rightW);

    // ─── 配線 ────────────────────────────────────────────────
    this.palette.on('addCode', (type: CodeType) => this.handleAddCode(type));
    this.palette.on('loadSample', () => this.handleLoadSample());
    this.palette.on('close', () => this.close());

    this.list.on('select', (path: number[]) => {
      this.selectedPath = path;
      this.refresh();
    });
    this.list.on('moveUp', (path: number[]) => this.handleMoveUp(path));
    this.list.on('moveDown', (path: number[]) => this.handleMoveDown(path));
    this.list.on('remove', (path: number[]) => this.handleRemove(path));
    this.paramEditor.on('change', (code) => this.handleParamChange(code));

    // ─── ESC で閉じる ────────────────────────────────────────
    this.escHandler = () => this.close();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.refresh();
  }

  // ─── ハンドラ ───────────────────────────────────────────────

  /**
   * 新規コードの挿入位置を決める:
   *  - 何も選択されていなければ root scope の末尾
   *  - 選択中コードが REPEAT なら、その children の末尾 (= REPEAT 内に追加)
   *  - 選択中コードがそれ以外なら、選択コードの直後 (= 同じ scope の +1 位置)
   */
  private handleAddCode(type: CodeType): void {
    const code = createCode(type);
    if (this.selectedPath === null) {
      this.program.append(code);
      this.selectedPath = [this.program.length - 1];
    } else {
      const sel = this.program.getCodeAt(this.selectedPath);
      if (sel && sel.type === 'REPEAT') {
        // REPEAT を選択中: 中に追加
        sel.children.push(code);
        this.selectedPath = [...this.selectedPath, sel.children.length - 1];
      } else {
        // 通常: 同じ scope の直後に挿入
        const parentPath = this.selectedPath.slice(0, -1);
        const insertIdx = this.selectedPath[this.selectedPath.length - 1]! + 1;
        this.program.insertAtPath(parentPath, insertIdx, code);
        this.selectedPath = [...parentPath, insertIdx];
      }
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleLoadSample(): void {
    // root scope を入れ替える (Program インスタンスは保持し、中身だけ差し替え)
    while (this.program.length > 0) this.program.removeAt(0);
    for (const c of sampleCodes()) this.program.append(c);
    this.selectedPath = null;
    this.ensureRunning();
    this.refresh();
  }

  private handleMoveUp(path: number[]): void {
    this.program.moveUpAtPath(path);
    const last = path[path.length - 1]!;
    if (last > 0) {
      const newPath = [...path.slice(0, -1), last - 1];
      this.selectedPath = pathEquals(this.selectedPath, path) ? newPath : this.selectedPath;
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleMoveDown(path: number[]): void {
    const parent = this.program.getCodesAtParent(path);
    if (!parent) return;
    const last = path[path.length - 1]!;
    if (last < parent.length - 1) {
      this.program.moveDownAtPath(path);
      const newPath = [...path.slice(0, -1), last + 1];
      this.selectedPath = pathEquals(this.selectedPath, path) ? newPath : this.selectedPath;
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleRemove(path: number[]): void {
    this.program.removeAtPath(path);
    // 選択 path 更新: 削除位置と同じか deeper なら無効化、同じ scope で後ろなら -1
    if (this.selectedPath !== null) {
      if (pathEquals(this.selectedPath, path)) {
        this.selectedPath = null;
      } else if (
        this.selectedPath.length > path.length &&
        path.every((v, i) => v === this.selectedPath![i])
      ) {
        // 削除した REPEAT の中にいたら無効
        this.selectedPath = null;
      } else if (
        this.selectedPath.length === path.length &&
        path.slice(0, -1).every((v, i) => v === this.selectedPath![i]) &&
        this.selectedPath[this.selectedPath.length - 1]! > path[path.length - 1]!
      ) {
        // 同じ scope の後ろなら -1
        const np = [...this.selectedPath];
        np[np.length - 1]! -= 1;
        this.selectedPath = np;
      }
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleParamChange(code: Code): void {
    if (this.selectedPath === null) return;
    this.program.replaceCodeAtPath(this.selectedPath, code);
    this.ensureRunning();
    this.refresh();
  }

  /**
   * 編集の結果、Executor が末尾停止 (idle) だったら先頭から再実行する。
   *
   * 背景: root cursor が末尾に到達した Ship は `getRunningPath() === null` の idle 状態に落ち、
   * その状態でコードを追加・編集しても再評価されない (cursor は既に末尾を指している)。
   * 編集と同時に Ship を動かしたい (走行マーカーも表示したい) ので、idle 検知時のみ reset する。
   * 採掘・移動など実行中のときは無干渉でライブ編集が反映される。
   */
  private ensureRunning(): void {
    if (!this.executor) return;
    if (this.executor.getRunningPath() === null) {
      this.executor.reset();
    }
  }

  // ─── 描画 ───────────────────────────────────────────────────

  private refresh(): void {
    // 選択 path が不正なら null に
    if (this.selectedPath !== null) {
      const c = this.program.getCodeAt(this.selectedPath);
      if (!c) this.selectedPath = null;
    }
    const runningPath = this.executor?.getRunningPath() ?? null;
    this.lastRunningPath = runningPath;
    this.list.render(this.program.getCodes(), this.selectedPath, runningPath);
    const sel = this.selectedPath !== null ? this.program.getCodeAt(this.selectedPath) : null;
    this.paramEditor.render(sel);
  }

  // ─── 閉じる ─────────────────────────────────────────────────

  private close(): void {
    this.scene.stop();
  }

  private makeCloseButton(cx: number, cy: number): void {
    const bg = this.add
      .rectangle(cx, cy, 80, 32, COLORS.panelBg, 1)
      .setStrokeStyle(1, COLORS.enemy, 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(cx, cy, '✕ 閉じる', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5)
      .setDepth(3);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });
    this.chrome.push(bg, t);
  }

  /**
   * 毎フレーム呼ばれる。走行中 path が変わったときだけ再描画。
   */
  public update(): void {
    if (!this.executor) return;
    const current = this.executor.getRunningPath();
    if (!pathEquals(current, this.lastRunningPath)) {
      this.lastRunningPath = current;
      this.refresh();
    }
  }

  private shutdown(): void {
    if (this.escHandler) {
      this.input.keyboard?.off('keydown-ESC', this.escHandler);
      this.escHandler = undefined;
    }
    this.palette?.destroy();
    this.list?.destroy();
    this.paramEditor?.destroy();
    for (const g of this.chrome) g.destroy();
    this.chrome = [];
    this.backdrop?.destroy();
    this.card?.destroy();
  }
}
