import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SHIP, TOWER } from '../config';
import type { EconomySystem } from '../systems/EconomySystem';

export type ShopAction = 'buyShip' | 'placeTower';

export interface ShopPanelEvents {
  request: (action: ShopAction) => void;
}

interface ShopButton {
  action: ShopAction;
  cost: number;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  enabled: boolean;
}

const PANEL_HEIGHT = 60;
const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 40;
const BUTTON_GAP = 16;

/**
 * 画面下端のショップパネル (Phase D Step 4)。
 * クリックで `request` イベントを発火し、購入処理は GameScene 側で行う。
 */
export class ShopPanel {
  private scene: Phaser.Scene;
  private bg: Phaser.GameObjects.Rectangle;
  private hint: Phaser.GameObjects.Text;
  private buttons: ShopButton[] = [];
  private emitter: Phaser.Events.EventEmitter;

  constructor(scene: Phaser.Scene, economy: EconomySystem) {
    this.scene = scene;
    this.emitter = new Phaser.Events.EventEmitter();

    const panelY = GAME_HEIGHT - PANEL_HEIGHT / 2;

    // 半透明背景バー
    this.bg = scene.add
      .rectangle(GAME_WIDTH / 2, panelY, GAME_WIDTH, PANEL_HEIGHT, 0x0a1020, 0.85)
      .setStrokeStyle(1, COLORS.panelBg, 1);
    this.bg.setDepth(10);

    // ボタン作成
    const items: Array<{ action: ShopAction; cost: number; label: string }> = [
      { action: 'buyShip', cost: SHIP.cost, label: `宇宙船  $${SHIP.cost}` },
      { action: 'placeTower', cost: TOWER.cost, label: `タワー  $${TOWER.cost}` },
    ];
    const totalWidth = items.length * BUTTON_WIDTH + (items.length - 1) * BUTTON_GAP;
    const startX = GAME_WIDTH / 2 - totalWidth / 2 + BUTTON_WIDTH / 2;
    items.forEach((it, i) => {
      const x = startX + i * (BUTTON_WIDTH + BUTTON_GAP);
      this.buttons.push(this.createButton(x, panelY, it.action, it.cost, it.label));
    });

    // 設置モード等のヒントテキスト (パネル左上)
    this.hint = scene.add
      .text(16, GAME_HEIGHT - PANEL_HEIGHT - 4, '', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '12px',
        color: '#3ee0c5',
      })
      .setDepth(11);

    // 初期 enable 状態を残高で決定
    this.refreshFromCredits(economy.credits);

    // 経済変動で自動更新
    economy.on('change', (credits) => this.refreshFromCredits(credits));
  }

  private createButton(
    x: number,
    y: number,
    action: ShopAction,
    cost: number,
    label: string
  ): ShopButton {
    const bg = this.scene.add
      .rectangle(x, y, BUTTON_WIDTH, BUTTON_HEIGHT, COLORS.panelBg, 1)
      .setStrokeStyle(1, COLORS.ally, 0.7)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    const text = this.scene.add
      .text(x, y, label, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '15px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(12);

    const btn: ShopButton = { action, cost, bg, label: text, enabled: true };

    bg.on('pointerover', () => {
      if (btn.enabled) bg.setFillStyle(COLORS.panelHover, 1);
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(COLORS.panelBg, 1);
    });
    bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!btn.enabled) return;
      // 左クリックのみ反応 (右クリックは設置キャンセル用)
      if (pointer.rightButtonDown()) return;
      this.emitter.emit('request', action);
    });

    return btn;
  }

  private refreshFromCredits(credits: number): void {
    for (const b of this.buttons) {
      const ok = credits >= b.cost;
      this.setEnabled(b.action, ok);
    }
  }

  public on(event: 'request', fn: ShopPanelEvents['request']): void {
    this.emitter.on(event, fn);
  }

  public setEnabled(action: ShopAction, enabled: boolean): void {
    const b = this.buttons.find((x) => x.action === action);
    if (!b || b.enabled === enabled) return;
    b.enabled = enabled;
    if (enabled) {
      b.bg.setAlpha(1);
      b.label.setColor('#cfd6e6');
      b.bg.setStrokeStyle(1, COLORS.ally, 0.7);
    } else {
      b.bg.setAlpha(0.45);
      b.label.setColor('#6b7da0');
      b.bg.setStrokeStyle(1, 0x6b7da0, 0.5);
    }
  }

  /** 配置モード中などにパネル左上に表示するヒント。null で消去。 */
  public showHint(text: string | null): void {
    this.hint.setText(text ?? '');
  }

  public destroy(): void {
    for (const b of this.buttons) {
      b.bg.destroy();
      b.label.destroy();
    }
    this.bg.destroy();
    this.hint.destroy();
    this.emitter.removeAllListeners();
  }
}
