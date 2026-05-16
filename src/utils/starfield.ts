import Phaser from 'phaser';
import { COLORS } from '../config';

/**
 * 暗背景に薄く星をばら撒く軽量ヘルパ。
 * Graphics で点を打つだけなのでテクスチャ不要。
 * Phase 進行で密度を上げたい場合は density 引数を上げる。
 */
export function drawStarfield(
  scene: Phaser.Scene,
  width: number,
  height: number,
  density: number = 0.00018 // 1280x720 で ~166 個
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const count = Math.floor(width * height * density);

  for (let i = 0; i < count; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const isBright = Phaser.Math.FloatBetween(0, 1) < 0.18;
    const color = isBright ? COLORS.starBright : COLORS.starDim;
    const radius = isBright ? 1.4 : 0.8;
    g.fillStyle(color, isBright ? 0.9 : 0.55);
    g.fillCircle(x, y, radius);
  }

  return g;
}
