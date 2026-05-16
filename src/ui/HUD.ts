import Phaser from 'phaser';
import { GAME_WIDTH, COLORS } from '../config';

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

    void COLORS;
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
