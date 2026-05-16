import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { drawStarfield } from '../utils/starfield';

/**
 * ゲームオーバー画面。
 * Phase B 時点ではメニューへ戻る/リトライのみ。
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(): void {
    this.cameras.main.fadeIn(380, 5, 7, 13);
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // Phase 5: タイトル + サブを軽くスライドイン + フェード
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.35 - 30, 'GAME OVER', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '96px',
        color: '#ff4d5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: title,
      y: GAME_HEIGHT * 0.35,
      alpha: 1,
      duration: 420,
      ease: 'Cubic.easeOut',
    });

    const sub = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.35 + 80, '基地が破壊された', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '22px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: sub, alpha: 1, duration: 320, delay: 260 });

    const retry = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.6, '[ R ] リトライ', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '22px',
        color: '#3ee0c5',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const back = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.6 + 36, '[ ESC ] メニューに戻る', {
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
      delay: 520,
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
