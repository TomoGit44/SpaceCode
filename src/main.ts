import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { ProgramEditorScene } from './scenes/ProgramEditorScene';
import { ItemInventoryScene } from './scenes/ItemInventoryScene';
import { GachaOpenScene } from './scenes/GachaOpenScene';
import { RewardPopupScene } from './scenes/RewardPopupScene';
import { GameOverScene } from './scenes/GameOverScene';
import { VictoryScene } from './scenes/VictoryScene';

/**
 * Phaser ゲームインスタンス起動点。
 * Scene の遷移: Boot → Menu → Game。
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // スマホ等で小数ピクセル位置になると線/テキストがにじむのを抑える
    autoRound: true,
  },
  render: {
    pixelArt: false,
    antialias: true,
  },
  // オーバーレイ系 (ProgramEditor / ItemInventory) は GameScene の後ろに登録
  // (並行 active 時に入力レイヤが上に乗る)
  scene: [
    BootScene,
    MenuScene,
    GameScene,
    ProgramEditorScene,
    ItemInventoryScene,
    GachaOpenScene,
    RewardPopupScene,
    GameOverScene,
    VictoryScene,
  ],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const game = new Phaser.Game(config);
