import Phaser from 'phaser';
import { COLORS } from '../config';
import type { Block } from '../program/Block';
import {
  ALL_LOCATION_IDS,
  ALL_PLANET_IDS,
  LOCATION_LABELS,
  type LocationId,
  type PlanetId,
} from '../program/locations';

const FONT = 'system-ui, "Segoe UI", sans-serif';

/** REPEAT の繰り返し回数 UI クランプ範囲 (内部値は無制限だがスピナー上はこの範囲)。 */
const REPEAT_TIMES_MIN = 1;
const REPEAT_TIMES_MAX = 20;

export interface BlockParamEditorEvents {
  /** 新しい block オブジェクトを emit (元の block は変更しない)。
   *  REPEAT のときは `children` は同じ配列参照を保つ (エディタが直接編集中の参照を切らない)。 */
  change: (block: Block) => void;
}

/**
 * 編集オーバーレイ右カラム: 選択中ブロックのパラメータを編集する。
 *  - MOVE_TO / MINE: LocationId / PlanetId のチップ選択
 *  - DEPOSIT / ATTACK_NEAREST / WAIT_UNTIL_FULL: 「設定なし」
 *  - REPEAT: 回数スピナーのみ (Phase 5 後: 中身はリストでインライン編集するためボタン不要)
 */
export class BlockParamEditor {
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

  public render(block: Block | null): void {
    this.clear();
    if (!block) {
      this.addNote('ブロックを選択してください');
      return;
    }
    switch (block.type) {
      case 'DEPOSIT':
        this.addNote('納品 — 設定なし');
        return;
      case 'ATTACK_NEAREST':
        this.addNote('攻撃 — 設定なし');
        return;
      case 'WAIT_UNTIL_FULL':
        this.addNote('満タンまで待機 — 設定なし');
        return;
      case 'MOVE_TO':
        this.addTitle('移動先');
        this.renderLocationChips(ALL_LOCATION_IDS, block.target, (id) =>
          this.emitter.emit('change', { type: 'MOVE_TO', target: id } as Block)
        );
        return;
      case 'MINE':
        this.addTitle('採掘先');
        this.renderLocationChips(ALL_PLANET_IDS, block.target, (id) =>
          this.emitter.emit('change', { type: 'MINE', target: id as PlanetId } as Block)
        );
        return;
      case 'REPEAT':
        this.renderRepeat(block);
        return;
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
      const h = 32;
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

  private renderRepeat(block: Extract<Block, { type: 'REPEAT' }>): void {
    this.addTitle('繰り返し回数');
    const cy = this.y + 56;

    // ▼ N ▲ スピナー
    const minus = this.makeStepButton(this.x + 4, cy, '−', () => {
      const next = Math.max(REPEAT_TIMES_MIN, block.times - 1);
      if (next === block.times) return;
      this.emitter.emit('change', {
        type: 'REPEAT',
        times: next,
        children: block.children,
      } as Block);
    });
    const value = this.scene.add
      .text(this.x + this.width / 2, cy + 16, `${block.times}`, {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    const plus = this.makeStepButton(this.x + this.width - 36, cy, '+', () => {
      const next = Math.min(REPEAT_TIMES_MAX, block.times + 1);
      if (next === block.times) return;
      this.emitter.emit('change', {
        type: 'REPEAT',
        times: next,
        children: block.children,
      } as Block);
    });
    this.controls.push(value, ...minus, ...plus);

    // ヒント (Phase 5 後: 中身編集はリスト側でインラインに行う)
    const hint = this.scene.add
      .text(
        this.x + this.width / 2,
        cy + 56,
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
        cy + 74,
        `子ブロック: ${block.children.length}`,
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
    const w = 32;
    const h = 32;
    const bg = this.scene.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(1, COLORS.ally, 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const t = this.scene.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '18px',
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

  public on<K extends keyof BlockParamEditorEvents>(
    event: K,
    fn: BlockParamEditorEvents[K]
  ): void {
    this.emitter.on(event, fn as (...args: unknown[]) => void);
  }

  public destroy(): void {
    this.clear();
    this.header.destroy();
    this.emitter.removeAllListeners();
  }
}
