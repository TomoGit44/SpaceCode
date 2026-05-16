import Phaser from 'phaser';

/**
 * 起動シーン。アセットがほぼ無いMVPでは初期化と即遷移のみ。
 * 将来ローディング表示・グローバル状態の初期化を担う想定。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    // すぐ Menu に遷移
    this.scene.start('MenuScene');
  }
}
