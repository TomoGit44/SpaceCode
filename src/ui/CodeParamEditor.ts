import Phaser from 'phaser';
import { COLORS } from '../config';
import type { Code } from '../program/Code';
import { ITEM_CODE_DEFS } from '../items/types/itemCodes';
import {
  ALL_LOCATION_IDS,
  LOCATION_LABELS,
  type LocationId,
} from '../program/locations';

const FONT = 'system-ui, "Segoe UI", sans-serif';

/** REPEAT の繰り返し回数 UI クランプ範囲 (内部値は無制限だがスピナー上はこの範囲)。 */
const REPEAT_TIMES_MIN = 1;
const REPEAT_TIMES_MAX = 20;

/** WAIT の秒数 UI クランプ範囲。 */
const WAIT_SECONDS_MIN = 1;
const WAIT_SECONDS_MAX = 60;

/** Phase 7: タッチ操作向けに拡大したスピナー / chip サイズ。 */
const SPIN_BTN_SIZE = 38;    // was 32
const CHIP_HEIGHT = 38;       // was 32

export interface CodeParamEditorEvents {
  /** 新しい code オブジェクトを emit (元の code は変更しない)。
   *  REPEAT のときは `children` は同じ配列参照を保つ (エディタが直接編集中の参照を切らない)。 */
  change: (code: Code) => void;
}

/**
 * 編集オーバーレイ右カラム: 選択中コードのパラメータを編集する。
 *  - MOVE_TO: LocationId のチップ選択
 *  - ATTACK_NEAREST: 「設定なし」
 *  - WAIT: 秒数スピナー (1〜60)
 *  - REPEAT: 回数スピナー (1〜20、Phase 5 後: 中身はリストでインライン編集)
 *  - ITEM_CODE: レア度ごとに最大値が変わるパラメータスピナー
 */
export class CodeParamEditor {
  private scene: Phaser.Scene;
  private emitter: Phaser.Events.EventEmitter;
  private x: number;
  private y: number;
  private width: number;
  private header: Phaser.GameObjects.Text;
  private controls: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    this.scene = scene;
    this.emitter = new Phaser.Events.EventEmitter();
    this.x = x;
    this.y = y;
    this.width = width;
    this.header = scene.add
      .text(x + width / 2, y, 'パラメータ', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#6b7da0',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  public render(code: Code | null): void {
    this.clear();
    if (!code) {
      this.addNote('コードを選択してください');
      return;
    }
    switch (code.type) {
      case 'ATTACK_NEAREST':
        this.addNote('攻撃 — 設定なし');
        return;
      case 'MOVE_TO':
        this.addTitle('移動先');
        this.renderLocationChips(ALL_LOCATION_IDS, code.target, (id) =>
          this.emitter.emit('change', { type: 'MOVE_TO', target: id } as Code)
        );
        return;
      case 'WAIT':
        this.renderWait(code);
        return;
      case 'REPEAT':
        this.renderRepeat(code);
        return;
      case 'ITEM_CODE':
        this.renderItemCode(code);
        return;
    }
  }

  /** WAIT の秒数スピナー (1〜60 秒)。 */
  private renderWait(code: Extract<Code, { type: 'WAIT' }>): void {
    this.addTitle('待機する秒数');
    const cy = this.y + 56;
    const cur = Math.max(WAIT_SECONDS_MIN, Math.min(WAIT_SECONDS_MAX, code.seconds));

    const minus = this.makeStepButton(this.x + 4, cy, '−', () => {
      const next = Math.max(WAIT_SECONDS_MIN, cur - 1);
      if (next === cur) return;
      this.emitter.emit('change', { type: 'WAIT', seconds: next } as Code);
    });
    const value = this.scene.add
      .text(this.x + this.width / 2, cy + SPIN_BTN_SIZE / 2, `${cur}秒`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    const plus = this.makeStepButton(this.x + this.width - 4 - SPIN_BTN_SIZE, cy, '+', () => {
      const next = Math.min(WAIT_SECONDS_MAX, cur + 1);
      if (next === cur) return;
      this.emitter.emit('change', { type: 'WAIT', seconds: next } as Code);
    });
    this.controls.push(value, ...minus, ...plus);

    const hintY = cy + SPIN_BTN_SIZE + 14;
    const hint = this.scene.add
      .text(
        this.x + this.width / 2,
        hintY,
        '惑星のそばで待機 → 自動採掘\n基地のそばで待機 → 自動納品 + 補給',
        {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
          align: 'center',
          lineSpacing: 5,
        }
      )
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.controls.push(hint);
  }

  /** ITEM_CODE のパラメータ編集 (レア度で最大値が変わる、§2.4)。 */
  private renderItemCode(code: Extract<Code, { type: 'ITEM_CODE' }>): void {
    const def = ITEM_CODE_DEFS[code.itemCodeType];
    if (!def || def.params.length === 0) {
      this.addNote('このコードに設定はありません');
      return;
    }
    let cy = this.y + 28;
    for (const spec of def.params) {
      const max = spec.rarityMax[code.rarity];
      const cur = code.params[spec.key] ?? spec.fallbackDefault;
      const title = this.scene.add
        .text(this.x + 4, cy, `${spec.label} (${spec.min}〜${max}${spec.unit})`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
        })
        .setDepth(3);
      this.controls.push(title);

      const rowY = cy + 22;
      const emit = (next: number): void => {
        const clamped = Math.min(max, Math.max(spec.min, next));
        if (clamped === cur) return;
        this.emitter.emit('change', {
          ...code,
          params: { ...code.params, [spec.key]: clamped },
        } as Code);
      };
      const minus = this.makeStepButton(this.x + 4, rowY, '−', () => emit(cur - spec.step));
      const value = this.scene.add
        .text(this.x + this.width / 2, rowY + SPIN_BTN_SIZE / 2, `${cur}${spec.unit}`, {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3);
      const plus = this.makeStepButton(this.x + this.width - 4 - SPIN_BTN_SIZE, rowY, '+', () =>
        emit(cur + spec.step)
      );
      this.controls.push(value, ...minus, ...plus);
      cy = rowY + SPIN_BTN_SIZE + 14;
    }
  }

  private addNote(text: string): void {
    const t = this.scene.add
      .text(this.x + this.width / 2, this.y + 60, text, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#6b7da0',
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.controls.push(t);
  }

  private addTitle(text: string): void {
    const t = this.scene.add
      .text(this.x + 4, this.y + 28, text, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd6e6',
      })
      .setDepth(3);
    this.controls.push(t);
  }

  private renderLocationChips<T extends LocationId>(
    ids: ReadonlyArray<T>,
    current: T,
    onPick: (id: T) => void
  ): void {
    let cy = this.y + 56;
    for (const id of ids) {
      const selected = id === current;
      const w = this.width - 8;
      const h = CHIP_HEIGHT;
      const bg = this.scene.add
        .rectangle(this.x + 4 + w / 2, cy + h / 2, w, h, selected ? COLORS.ally : COLORS.panelBg, selected ? 0.4 : 1)
        .setStrokeStyle(1, selected ? COLORS.accent : COLORS.ally, selected ? 1 : 0.5)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add
        .text(this.x + 4 + w / 2, cy + h / 2, LOCATION_LABELS[id], {
          fontFamily: FONT,
          fontSize: '14px',
          color: selected ? '#3ee0c5' : '#cfd6e6',
          fontStyle: selected ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(3);
      bg.on('pointerover', () => {
        if (!selected) bg.setFillStyle(COLORS.panelHover, 1);
      });
      bg.on('pointerout', () => {
        if (!selected) bg.setFillStyle(COLORS.panelBg, 1);
      });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        if (selected) return;
        onPick(id);
      });
      this.controls.push(bg, label);
      cy += h + 4;
    }
  }

  private renderRepeat(code: Extract<Code, { type: 'REPEAT' }>): void {
    this.addTitle('繰り返し回数');
    const cy = this.y + 56;

    // ▼ N ▲ スピナー
    const minus = this.makeStepButton(this.x + 4, cy, '−', () => {
      const next = Math.max(REPEAT_TIMES_MIN, code.times - 1);
      if (next === code.times) return;
      this.emitter.emit('change', {
        type: 'REPEAT',
        times: next,
        children: code.children,
      } as Code);
    });
    const value = this.scene.add
      .text(this.x + this.width / 2, cy + SPIN_BTN_SIZE / 2, `${code.times}`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    const plus = this.makeStepButton(this.x + this.width - 4 - SPIN_BTN_SIZE, cy, '+', () => {
      const next = Math.min(REPEAT_TIMES_MAX, code.times + 1);
      if (next === code.times) return;
      this.emitter.emit('change', {
        type: 'REPEAT',
        times: next,
        children: code.children,
      } as Code);
    });
    this.controls.push(value, ...minus, ...plus);

    // ヒント (Phase 5 後: 中身編集はリスト側でインラインに行う)
    const hintY = cy + SPIN_BTN_SIZE + 14;
    const hint = this.scene.add
      .text(
        this.x + this.width / 2,
        hintY,
        '中身はリストでそのまま編集',
        {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        }
      )
      .setOrigin(0.5, 0)
      .setDepth(3);
    const hint2 = this.scene.add
      .text(
        this.x + this.width / 2,
        hintY + 18,
        `子コード: ${code.children.length}`,
        {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#3ee0c5',
        }
      )
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.controls.push(hint, hint2);
  }

  private makeStepButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void
  ): Phaser.GameObjects.GameObject[] {
    const w = SPIN_BTN_SIZE;
    const h = SPIN_BTN_SIZE;
    const bg = this.scene.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(1, COLORS.ally, 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const t = this.scene.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      onClick();
    });
    return [bg, t];
  }

  private clear(): void {
    for (const g of this.controls) g.destroy();
    this.controls = [];
  }

  public on<K extends keyof CodeParamEditorEvents>(
    event: K,
    fn: CodeParamEditorEvents[K]
  ): void {
    this.emitter.on(event, fn as (...args: unknown[]) => void);
  }

  public destroy(): void {
    this.clear();
    this.header.destroy();
    this.emitter.removeAllListeners();
  }
}
