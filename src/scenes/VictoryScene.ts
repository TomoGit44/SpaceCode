import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { drawStarfield } from '../utils/starfield';
import { updateBestScore, formatClearTime } from '../items/codex';

/**
 * 全 Phase クリア時の勝利画面。
 * 残 HP / 獲得クレジット / クリア時間 / ベスト更新表示。
 * R で再挑戦、ESC でメニュー。
 */
export class VictoryScene extends Phaser.Scene {
  private finalHp: number = 0;
  private finalMaxHp: number = 0;
  private finalCredits: number = 0;
  private phaseReached: number = 100;
  private clearTimeMs: number | null = null;
  private isNewBest: boolean = false;

  constructor() {
    super({ key: 'VictoryScene' });
  }

  init(data: {
    hp: number;
    maxHp: number;
    credits: number;
    phaseReached?: number;
    clearTimeMs?: number | null;
  }): void {
    this.finalHp = data?.hp ?? 0;
    this.finalMaxHp = data?.maxHp ?? 100;
    this.finalCredits = data?.credits ?? 0;
    this.phaseReached = data?.phaseReached ?? 100;
    this.clearTimeMs = data?.clearTimeMs ?? null;
    // 2026-06-05 Step 5: ベスト更新判定 (init で実行 → create での表示に使う)
    this.isNewBest = updateBestScore(this.phaseReached, this.clearTimeMs);
  }

  create(): void {
    this.cameras.main.fadeIn(380, 5, 7, 13);
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // Phase 5: タイトルをスライドイン (2026-05-26: 全 5 Stage クリア表示に)
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.28 - 30, 'ALL STAGES CLEAR', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '76px',
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
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.28 + 80, '全 5 Stage を踏破した', {
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
    // Step 5: クリア時間 + ベスト更新表示
    const timeStr = formatClearTime(this.clearTimeMs);
    const time = this.add
      .text(
        GAME_WIDTH / 2,
        summaryY + 60,
        this.isNewBest ? `★ クリア時間   ${timeStr}   ★ NEW BEST` : `クリア時間   ${timeStr}`,
        {
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          fontSize: '20px',
          color: this.isNewBest ? '#3ee0c5' : '#cfd6e6',
          fontStyle: this.isNewBest ? 'bold' : 'normal',
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: [hp, cr, time], alpha: 1, duration: 380, delay: 520 });

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
