import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, SPAWN, type EnemyType } from '../config';
import { Enemy } from '../entities/Enemy';

type Edge = 'top' | 'bottom' | 'left' | 'right';

/**
 * 敵を「今すぐ 1 体作る」だけのヘルパ。
 *
 * Phase B では自分で時間管理していたが、Phase C で WaveSystem に集約したため
 * このクラスは「ランダム辺の出現位置を決めて Enemy を作る」役割に専念する。
 * (設計書のモジュール分割を維持)
 */
export class SpawnSystem {
  private scene: Phaser.Scene;
  private baseX: number;
  private baseY: number;

  constructor(scene: Phaser.Scene, baseX: number, baseY: number) {
    this.scene = scene;
    this.baseX = baseX;
    this.baseY = baseY;
  }

  /** 4 辺のランダム位置から 1 体生成して返す。 */
  public spawnAtRandomEdge(type: EnemyType = 'basic'): Enemy {
    const edge: Edge = (['top', 'bottom', 'left', 'right'] as const)[
      Phaser.Math.Between(0, 3)
    ];
    const pad = SPAWN.edgePadding;
    let x = 0;
    let y = 0;
    switch (edge) {
      case 'top':
        x = Phaser.Math.Between(pad, GAME_WIDTH - pad);
        y = pad;
        break;
      case 'bottom':
        x = Phaser.Math.Between(pad, GAME_WIDTH - pad);
        y = GAME_HEIGHT - pad;
        break;
      case 'left':
        x = pad;
        y = Phaser.Math.Between(pad, GAME_HEIGHT - pad);
        break;
      case 'right':
        x = GAME_WIDTH - pad;
        y = Phaser.Math.Between(pad, GAME_HEIGHT - pad);
        break;
    }
    return new Enemy(this.scene, x, y, this.baseX, this.baseY, type);
  }
}
