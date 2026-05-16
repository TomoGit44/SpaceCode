import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { drawStarfield } from '../utils/starfield';

/**
 * 全 Phase クリア時の勝利画面。
 * 残 HP / 獲得クレジットを表示。R で再挑戦、ESC でメニュー。
 */
export class VictoryScene extends Phaser.Scene {
  private finalHp: number = 0;
  private finalMaxHp: number = 0;
  private finalCredits: number = 0;

  constructor() {
    super({ key: 'VictoryScene' });
  }

  init(data: { hp: number; maxHp: number; credits: number }): void {
    this.finalHp = data?.hp ?? 0;
    this.finalMaxHp = data?.maxHp ?? 100;
    this.finalCredits = data?.credits ?? 0;
  }

  create(): void {
    this.cameras.main.fadeIn(380, 5, 7, 13);
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // Phase 5: タイトルをスライドイン
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.28 - 30, 'STAGE CLEAR', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '96px',
        color: '#3ee0c5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: title,
      y: GAME_HEIGHT * 0.28,
      alpha: 1,
      duration: 480,
      ease: 'Cubic.easeOut',
    });

    const sub = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.28 + 80, '基地を守り抜いた', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '22px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, duration: 320, delay: 300 });

    // 結果サマリ
    const summaryY = GAME_HEIGHT * 0.5;
    const hp = this.add
      .text(GAME_WIDTH / 2, summaryY, `残HP   ${this.finalHp} / ${this.finalMaxHp}`, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '20px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    const cr = this.add
      .text(GAME_WIDTH / 2, summaryY + 30, `クレジット   $${this.finalCredits}`, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '20px',
        color: '#ffd24a',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: [hp, cr], alpha: 1, duration: 380, delay: 520 });

    const retry = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.72, '[ R ] もう一度', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '22px',
        color: '#3ee0c5',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const back = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.72 + 36, '[ ESC ] メニューに戻る', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '18px',
        color: '#6b7da0',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({
      targets: [retry, back],
      alpha: 1,
      duration: 320,
      delay: 820,
      onComplete: () => {
        this.tweens.add({
          targets: retry,
          alpha: { from: 0.5, to: 1 },
          duration: 1100,
          yoyo: true,
          repeat: -1,
        });
      },
    });

    this.input.keyboard?.once('keydown-R', () => this.goto('GameScene'));
    this.input.keyboard?.once('keydown-ESC', () => this.goto('MenuScene'));
  }

  private goto(key: string): void {
    this.cameras.main.fadeOut(280, 5, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(key);
    });
  }
}
