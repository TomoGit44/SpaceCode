import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { drawStarfield } from '../utils/starfield';
import { getBestScore, formatClearTime, totalDiscoveredCount } from '../items/codex';

/**
 * タイトル画面。SPACE / クリックでゲーム開始。
 * ミニマル・ベクター方針: 画像なしで全てテキストと図形で構成。
 *
 * Phase 5: 起動時フェードイン + タイトル軽スケールインを追加 (派手にしすぎない)。
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    // Phase 5: シーン遷移フェードイン
    this.cameras.main.fadeIn(320, 5, 7, 13);

    // 星空背景
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // タイトル (軽いスケールイン)
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, 'SpaceCode', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '88px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScale(0.92)
      .setAlpha(0);
    this.tweens.add({
      targets: title,
      scale: 1,
      alpha: 1,
      duration: 520,
      ease: 'Cubic.easeOut',
    });

    // サブタイトル (タイトル直後にフェードイン)
    const subtitle = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.32 + 70,
        '— 宇宙タワーディフェンス × コードプログラミング —',
        {
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          fontSize: '20px',
          color: '#3ee0c5',
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      duration: 420,
      delay: 320,
    });

    // 開始プロンプト (点滅)
    const prompt = this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT * 0.7,
        'クリック または SPACE でスタート',
        {
          fontFamily: 'system-ui, "Segoe UI", sans-serif',
          fontSize: '22px',
          color: '#cfd6e6',
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: prompt,
      alpha: 0.85,
      duration: 320,
      delay: 600,
      onComplete: () => {
        this.tweens.add({
          targets: prompt,
          alpha: { from: 0.3, to: 1 },
          duration: 900,
          yoyo: true,
          repeat: -1,
        });
      },
    });

    // 2026-06-05 Step 5: ベストスコア + 図鑑ボタン
    this.renderBestScore();
    this.makeCodexButton();

    // フッター
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'MVP v1.0 — Phase 5 完成', {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '13px',
        color: '#6b7da0',
      })
      .setOrigin(0.5);

    // 入力 (背景クリック = スタート、ボタンは自分のクリックを stopPropagation 不要なので
    // 図鑑ボタンを押した時に startGame が走らないよう、図鑑ボタン側で flag を立てる)
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
      // 何かボタンが押されている (= targets が非空) ならスタートさせない
      if (targets && targets.length > 0) return;
      this.startGame();
    });
    this.input.keyboard?.once('keydown-SPACE', () => this.startGame());
  }

  private renderBestScore(): void {
    const best = getBestScore();
    if (!best) return;
    const phaseText = best.phaseReached >= 100 ? 'ALL CLEAR' : `Phase ${best.phaseReached}`;
    const timeText = best.clearTimeMs !== null
      ? ` / ${formatClearTime(best.clearTimeMs)}`
      : '';
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 78, `ベスト: ${phaseText}${timeText}`, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '14px',
        color: '#3ee0c5',
      })
      .setOrigin(0.5);
  }

  private makeCodexButton(): void {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 116;
    const w = 200;
    const h = 36;
    const bg = this.add
      .rectangle(x, y, w, h, COLORS.panelBg, 0.9)
      .setStrokeStyle(2, COLORS.accent, 0.7)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0);
    const discovered = totalDiscoveredCount();
    const label = this.add
      .text(x, y, `📖 図鑑 (${discovered} 発見)`, {
        fontFamily: 'system-ui, "Segoe UI", sans-serif',
        fontSize: '14px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({
      targets: [bg, label],
      alpha: 1,
      duration: 320,
      delay: 700,
    });
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 0.9));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.openCodex();
    });
  }

  private openCodex(): void {
    this.cameras.main.fadeOut(280, 5, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('CodexScene');
    });
  }

  private startGame(): void {
    this.cameras.main.fadeOut(280, 5, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('GameScene');
    });
  }
}
