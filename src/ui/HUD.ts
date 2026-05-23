import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';

const START_BUTTON_WIDTH = 280;
const START_BUTTON_HEIGHT = 56;
const SHOP_PANEL_HEIGHT = 64; // ShopPanel と一致 (HUD はその上に乗る)。Phase 7: 60 → 64

/**
 * 画面上部の HUD。基地 HP / 所持クレジット / Phase 進行 / 状態テキストを表示。
 * GameScene からプッシュベースで更新する設計 (HUD 側は描画と簡易演出だけ持つ)。
 */
export class HUD {
  private scene: Phaser.Scene;

  private hpLabel: Phaser.GameObjects.Text;
  private hpValue: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Graphics;
  private hpBar: Phaser.GameObjects.Graphics;
  private hpMax: number;

  private creditsLabel: Phaser.GameObjects.Text;
  private creditsValue: Phaser.GameObjects.Text;

  private phaseLabel: Phaser.GameObjects.Text;
  private phaseValue: Phaser.GameObjects.Text;

  private statusText: Phaser.GameObjects.Text;
  private bannerText: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;

  // 準備時間中の「開始」ボタン (Phase 5 後)
  private startBtnBg: Phaser.GameObjects.Rectangle;
  private startBtnLabel: Phaser.GameObjects.Text;
  private startBtnHint: Phaser.GameObjects.Text;
  private startBtnEnabled: boolean = false;
  private startBtnHandler?: () => void;
  private startBtnPulse?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, hpMax: number) {
    this.scene = scene;
    this.hpMax = hpMax;

    const top = 14;

    // 左: HP
    this.hpLabel = scene.add.text(16, top, '基地HP', {
      fontFamily: 'system-ui, "Segoe UI", sans-serif',
      fontSize: '12px',
      color: '#6b7da0',
    });
    this.hpValue = scene.add.text(16, top + 14, `${hpMax}/${hpMax}`, {
      fontFamily: 'system-ui, "Segoe UI", sans-serif',
      fontSize: '18px',
      color: '#cfd6e6',
      fontStyle: 'bold',
    });
    this.hpBarBg = scene.add.graphics();
    this.hpBarBg.fillStyle(COLORS.panelBg, 1);
    this.hpBarBg.fillRect(16, top + 38, 180, 6);
    this.hpBar = scene.add.graphics();
    this.drawHpBar(hpMax);

    // 中央: Phase
    const cx = GAME_WIDTH / 2;
    this.phaseLabel = scene.add
      .text(cx, top, 'PHASE', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '12px',
        color: '#6b7da0',
      })
      .setOrigin(0.5, 0);
    this.phaseValue = scene.add
      .text(cx, top + 14, '0 / 0', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '20px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    this.statusText = scene.add
      .text(cx, top + 42, '', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '13px',
        color: '#3ee0c5',
      })
      .setOrigin(0.5, 0);

    // 右: クレジット
    this.creditsLabel = scene.add
      .text(GAME_WIDTH - 16, top, 'クレジット', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '12px',
        color: '#6b7da0',
      })
      .setOrigin(1, 0);
    this.creditsValue = scene.add
      .text(GAME_WIDTH - 16, top + 14, '$0', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '20px',
        color: '#ffd24a',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);

    // 中央バナー (Phase 開始/クリア用に使う)
    this.bannerText = scene.add
      .text(cx, scene.scale.height * 0.35, '', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '56px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // 開始ボタン (Phase 5 後): ShopPanel の上に配置。準備時間中のみ表示。
    const btnY = GAME_HEIGHT - SHOP_PANEL_HEIGHT - START_BUTTON_HEIGHT / 2 - 24;
    this.startBtnBg = scene.add
      .rectangle(cx, btnY, START_BUTTON_WIDTH, START_BUTTON_HEIGHT, COLORS.panelBg, 0.95)
      .setStrokeStyle(2, COLORS.accent, 1)
      .setDepth(20)
      .setVisible(false);
    this.startBtnLabel = scene.add
      .text(cx, btnY, '', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '20px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setVisible(false);
    this.startBtnHint = scene.add
      .text(cx, btnY + START_BUTTON_HEIGHT / 2 + 8, '宇宙船を購入・船をクリックしてプログラム編集ができます', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '12px',
        color: '#6b7da0',
      })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setVisible(false);

    this.startBtnBg.on('pointerover', () => {
      if (this.startBtnEnabled) this.startBtnBg.setFillStyle(COLORS.panelHover, 0.95);
    });
    this.startBtnBg.on('pointerout', () => {
      if (this.startBtnEnabled) this.startBtnBg.setFillStyle(COLORS.panelBg, 0.95);
    });
    this.startBtnBg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.startBtnEnabled) return;
      if (pointer.rightButtonDown()) return;
      this.startBtnHandler?.();
    });
  }

  public setHp(hp: number): void {
    const clamped = Math.max(0, hp);
    this.hpValue.setText(`${clamped}/${this.hpMax}`);
    this.drawHpBar(clamped);
  }

  private drawHpBar(hp: number): void {
    const ratio = hp / this.hpMax;
    this.hpBar.clear();
    const color =
      ratio > 0.5 ? 0x3ee0c5 : ratio > 0.25 ? 0xffd24a : 0xff4d5a;
    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRect(16, 14 + 38, 180 * Math.max(0, ratio), 6);
  }

  public setCredits(credits: number): void {
    this.creditsValue.setText(`$${credits}`);
  }

  public flashCredits(delta: number): void {
    if (delta === 0) return;
    const color = delta > 0 ? '#3ee0c5' : '#ff4d5a';
    const sign = delta > 0 ? '+' : '';
    const popup = this.scene.add
      .text(GAME_WIDTH - 16, 36, `${sign}${delta}`, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '14px',
        color,
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    this.scene.tweens.add({
      targets: popup,
      y: 12,
      alpha: 0,
      duration: 700,
      onComplete: () => popup.destroy(),
    });
  }

  public setPhase(current: number, total: number): void {
    this.phaseValue.setText(`${current} / ${total}`);
  }

  public setStatus(text: string): void {
    this.statusText.setText(text);
  }

  /**
   * 準備時間中の「開始」ボタンを表示する。
   * onClick はクリック or キー入力 (GameScene 側) から呼ばれる handler を統一するため、
   * GameScene が SPACE/ENTER をハンドルしたいときは getStartHandler() で取得して使う。
   */
  public showStartButton(phaseNumber: number, totalPhases: number, onClick: () => void): void {
    this.startBtnHandler = onClick;
    this.startBtnEnabled = true;
    const isFirst = phaseNumber === 1;
    const label = isFirst
      ? `▶ PHASE ${phaseNumber} / ${totalPhases} 開始`
      : `▶ 次の PHASE ${phaseNumber} / ${totalPhases} を開始`;
    this.startBtnLabel.setText(label);
    this.startBtnBg.setFillStyle(COLORS.panelBg, 0.95);
    this.startBtnBg.setStrokeStyle(2, COLORS.accent, 1);
    this.startBtnBg.setInteractive({ useHandCursor: true });
    this.startBtnBg.setVisible(true);
    this.startBtnLabel.setVisible(true);
    this.startBtnHint.setVisible(true);

    // 注意を引くパルス
    this.stopStartButtonPulse();
    this.startBtnPulse = this.scene.tweens.add({
      targets: this.startBtnBg,
      scaleX: { from: 1.0, to: 1.04 },
      scaleY: { from: 1.0, to: 1.04 },
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  public hideStartButton(): void {
    this.startBtnEnabled = false;
    this.startBtnHandler = undefined;
    this.startBtnBg.disableInteractive();
    this.startBtnBg.setVisible(false);
    this.startBtnLabel.setVisible(false);
    this.startBtnHint.setVisible(false);
    this.stopStartButtonPulse();
    this.startBtnBg.setScale(1, 1);
  }

  /** SPACE/ENTER 等のキー入力から押下と同じ動作をさせるための API。 */
  public triggerStartButton(): void {
    if (!this.startBtnEnabled) return;
    this.startBtnHandler?.();
  }

  private stopStartButtonPulse(): void {
    if (this.startBtnPulse) {
      this.startBtnPulse.stop();
      this.startBtnPulse = undefined;
    }
  }

  /** 中央に大きく一瞬表示 (Phase 開始/クリア時など)。Phase 5 でイージング強化。 */
  public showBanner(text: string, durationMs: number = 1400): void {
    if (this.bannerTween) {
      this.bannerTween.stop();
    }
    this.bannerText.setText(text);
    this.bannerText.setAlpha(0);
    this.bannerText.setScale(0.7);
    this.bannerTween = this.scene.tweens.add({
      targets: this.bannerText,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.7, to: 1.08 },
      duration: 220,
      ease: 'Back.easeOut',
      hold: Math.max(0, durationMs - 460),
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.bannerText,
          alpha: 0,
          scale: 1.0,
          duration: 240,
        });
      },
    });
  }
}
