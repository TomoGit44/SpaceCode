import Phaser from 'phaser';
import { COLORS } from '../config';
import type { CodeType } from '../program/Code';
import type { ItemCodeType } from '../items/types/itemCodes';
import { RARITY_COLOR } from '../items/itemTypes';

const FONT = 'system-ui, "Segoe UI", sans-serif';

const CODE_LABEL: Record<CodeType, string> = {
  MOVE_TO: '移動',
  MINE: '採掘',
  DEPOSIT: '納品',
  ATTACK_NEAREST: '攻撃',
  WAIT_UNTIL_FULL: '満タンまで待機',
  REPEAT: '繰り返し (N 回)',
};

const CODE_COLOR: Record<CodeType, number> = {
  MOVE_TO: COLORS.ally,
  MINE: COLORS.resource,
  DEPOSIT: COLORS.resource,
  ATTACK_NEAREST: COLORS.enemy,
  WAIT_UNTIL_FULL: COLORS.uiDim,
  REPEAT: COLORS.accent,
};

const INITIAL_TYPES: ReadonlyArray<CodeType> = [
  'MOVE_TO',
  'MINE',
  'DEPOSIT',
  'ATTACK_NEAREST',
  'WAIT_UNTIL_FULL',
  'REPEAT',
];

/** CodePalette が ProgramEditorScene から受け取るアイテムコード 1 行ぶんの情報。 */
export interface ItemCodeEntry {
  type: ItemCodeType;
  label: string;
  rarity: import('../items/itemTypes').Rarity;
  /** 未配置 (= これから配置できる) 残数。 */
  available: number;
}

export interface CodePaletteEvents {
  addCode: (type: CodeType) => void;
  addItemCode: (type: ItemCodeType) => void;
  loadSample: () => void;
  close: () => void;
}

/**
 * 編集オーバーレイ左カラム: コードの追加。
 *
 * Phase 6 (§2.3):
 *  - 初期コード 6 種 — 無制限 (∞)
 *  - アイテムコード — 所持しているものを残数つきで表示。残数 0 は無効化。
 *    残数は全 Ship 共通のグローバル値で、ProgramEditorScene が `setItemCodes` で渡す。
 */
export class CodePalette {
  private scene: Phaser.Scene;
  private emitter: Phaser.Events.EventEmitter;
  private staticObjects: Phaser.GameObjects.GameObject[] = [];
  private itemObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly x: number;
  private readonly width: number;
  private readonly itemRegionY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    this.scene = scene;
    this.emitter = new Phaser.Events.EventEmitter();
    this.x = x;
    this.width = width;

    this.addText(x + width / 2, y, '─ 初期コード (無制限) ─', '13px', COLORS.uiDim).setOrigin(0.5, 0);

    let cy = y + 24;
    for (const t of INITIAL_TYPES) {
      this.makeButton(x, cy, width, `${CODE_LABEL[t]}　∞`, CODE_COLOR[t], 32, true, () =>
        this.emitter.emit('addCode', t)
      );
      cy += 36;
    }

    const itemHeaderY = cy + 4;
    this.addText(x + width / 2, itemHeaderY, '─ アイテムコード ─', '13px', COLORS.uiDim).setOrigin(
      0.5,
      0
    );
    this.itemRegionY = itemHeaderY + 22;

    // 下部固定: サンプル読み込み / 閉じる
    const sampleY = y + 422;
    this.makeButton(x, sampleY, width, 'サンプル読み込み', COLORS.resource, 30, true, () =>
      this.emitter.emit('loadSample')
    );
    this.makeButton(x, sampleY + 36, width, '✕ 閉じる', COLORS.enemy, 30, true, () =>
      this.emitter.emit('close')
    );

    this.setItemCodes([]);
  }

  /** アイテムコードのボタン群を (残数つきで) 再構築する。 */
  public setItemCodes(entries: ReadonlyArray<ItemCodeEntry>): void {
    for (const g of this.itemObjects) g.destroy();
    this.itemObjects = [];

    if (entries.length === 0) {
      const t = this.scene.add
        .text(this.x + this.width / 2, this.itemRegionY + 8, '(アイテムコード未所持)', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        })
        .setOrigin(0.5, 0)
        .setDepth(3);
      this.itemObjects.push(t);
      return;
    }

    let cy = this.itemRegionY;
    for (const e of entries) {
      const enabled = e.available > 0;
      const accent = RARITY_COLOR[e.rarity];
      this.makeButton(
        this.x,
        cy,
        this.width,
        `${e.label}　×${e.available}`,
        accent,
        30,
        enabled,
        () => this.emitter.emit('addItemCode', e.type),
        this.itemObjects
      );
      cy += 34;
    }
  }

  private addText(
    x: number,
    y: number,
    text: string,
    fontSize: string,
    colorHex: number
  ): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize,
        color: '#' + colorHex.toString(16).padStart(6, '0'),
      })
      .setDepth(3);
    this.staticObjects.push(t);
    return t;
  }

  private makeButton(
    x: number,
    y: number,
    width: number,
    label: string,
    accent: number,
    h: number,
    enabled: boolean,
    onClick: () => void,
    sink: Phaser.GameObjects.GameObject[] = this.staticObjects
  ): void {
    const bg = this.scene.add
      .rectangle(x + width / 2, y + h / 2, width, h, COLORS.panelBg, enabled ? 1 : 0.4)
      .setStrokeStyle(1, accent, enabled ? 0.7 : 0.3)
      .setDepth(2);
    const text = this.scene.add
      .text(x + width / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '13px',
        color: enabled ? '#cfd6e6' : '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
      bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        onClick();
      });
    }
    sink.push(bg, text);
  }

  public on<K extends keyof CodePaletteEvents>(event: K, fn: CodePaletteEvents[K]): void {
    this.emitter.on(event, fn as (...args: unknown[]) => void);
  }

  public destroy(): void {
    for (const g of this.staticObjects) g.destroy();
    for (const g of this.itemObjects) g.destroy();
    this.staticObjects = [];
    this.itemObjects = [];
    this.emitter.removeAllListeners();
  }
}
