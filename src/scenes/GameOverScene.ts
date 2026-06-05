import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { drawStarfield } from '../utils/starfield';
import { updateBestScore, getBestScore } from '../items/codex';

/**
 * ゲームオーバー画面。
 * 到達 Phase + ベスト記録 (Step 5)。
 */
export class GameOverScene extends Phaser.Scene {
  private phaseReached: number = 0;
  private isNewBest: boolean = false;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { phaseReached?: number }): void {
    this.phaseReached = data?.phaseReached ?? 0;
    // 2026-06-05 Step 5: Game Over でも到達 Phase でベスト更新を試みる (clearTimeMs は null)
    this.isNewBest = updateBestScore(this.phaseReached, null);
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

    // Step 5: 到達 Phase + ベスト表示
    const best = getBestScore();
    const reached = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.35 + 120,
        this.isNewBest
          ? `★ 到達 Phase ${this.phaseReached}   ★ NEW BEST`
          : `到達 Phase ${this.phaseReached}${best ? `   (BEST: ${best.phaseReached})` : ''}`,
        {
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          fontSize: '18px',
          color: this.isNewBest ? '#3ee0c5' : '#9aa4ba',
          fontStyle: this.isNewBest ? 'bold' : 'normal',
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: reached, alpha: 1, duration: 320, delay: 380 });

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
