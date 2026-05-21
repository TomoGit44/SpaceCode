import Phaser from 'phaser';
import { COLORS } from '../config';
import type { CodeType } from '../program/Code';

const FONT = 'system-ui, "Segoe UI", sans-serif';

const CODE_LABEL: Record<CodeType, string> = {
  MOVE_TO: '移動',
  MINE: '採掘',
  DEPOSIT: '納品',
  ATTACK_NEAREST: '攻撃',
  WAIT_UNTIL_FULL: '満タンまで待機',
  REPEAT: '繰り返し (N 回)',
};

/** ボタンのアクセントカラー (種別ごと)。 */
const CODE_COLOR: Record<CodeType, number> = {
  MOVE_TO: COLORS.ally,
  MINE: COLORS.resource,
  DEPOSIT: COLORS.resource,
  ATTACK_NEAREST: COLORS.enemy,
  WAIT_UNTIL_FULL: COLORS.uiDim,
  REPEAT: COLORS.accent,
};

export interface CodePaletteEvents {
  addCode: (type: CodeType) => void;
  loadSample: () => void;
  close: () => void;
}

/**
 * 編集オーバーレイ左カラム: コードの追加とサンプル流し込み・閉じる。
 *
 * Phase 3 でコード種別が 3→6 に増えたため、ボタン高さを 36→32 に圧縮し、
 * Card 内に収まるようにしている。
 */
export class CodePalette {
  private scene: Phaser.Scene;
  private emitter: Phaser.Events.EventEmitter;
  private gameObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    this.scene = scene;
    this.emitter = new Phaser.Events.EventEmitter();

    this.addText(x + width / 2, y, 'コード追加', '14px', COLORS.uiDim).setOrigin(0.5, 0);
    this.addText(
      x + width / 2,
      y + 18,
      '置いた順に上から実行 → 自動でループ',
      '11px',
      COLORS.uiDim
    ).setOrigin(0.5, 0);

    const types: CodeType[] = [
      'MOVE_TO',
      'MINE',
      'DEPOSIT',
      'ATTACK_NEAREST',
      'WAIT_UNTIL_FULL',
      'REPEAT',
    ];
    let cy = y + 42;
    for (const t of types) {
      this.makeButton(x, cy, width, CODE_LABEL[t], CODE_COLOR[t], 32, () =>
        this.emitter.emit('addCode', t)
      );
      cy += 38;
    }

    cy += 8;
    this.addText(x + width / 2, cy, 'テンプレ', '12px', COLORS.uiDim).setOrigin(0.5, 0);
    cy += 20;
    this.makeButton(x, cy, width, 'サンプル読み込み', COLORS.resource, 32, () =>
      this.emitter.emit('loadSample')
    );
    cy += 50;

    this.makeButton(x, cy, width, '✕ 閉じる', COLORS.enemy, 32, () =>
      this.emitter.emit('close')
    );
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
    this.gameObjects.push(t);
    return t;
  }

  private makeButton(
    x: number,
    y: number,
    width: number,
    label: string,
    accent: number,
    h: number,
    onClick: () => void
  ): void {
    const bg = this.scene.add
      .rectangle(x + width / 2, y + h / 2, width, h, COLORS.panelBg, 1)
      .setStrokeStyle(1, accent, 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const text = this.scene.add
      .text(x + width / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '14px',
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

    this.gameObjects.push(bg, text);
  }

  public on<K extends keyof CodePaletteEvents>(event: K, fn: CodePaletteEvents[K]): void {
    this.emitter.on(event, fn as (...args: unknown[]) => void);
  }

  public destroy(): void {
    for (const g of this.gameObjects) g.destroy();
    this.gameObjects = [];
    this.emitter.removeAllListeners();
  }
}
