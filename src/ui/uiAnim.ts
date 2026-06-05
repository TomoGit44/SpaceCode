/**
 * UI 共通アニメーションヘルパ (M-1, 2026-06-06)。
 *
 * SpaceCode 全体で再利用する 4 つの小さなユーティリティ:
 *   - `hoverPop`    : ボタン hover で軽い scale + 同色 halo を出す
 *   - `popText`     : Text 値変更直前にスケールポップさせて視認性を上げる
 *   - `tweenBarWidth`: Graphics 描画のバー幅を滑らかに変化
 *   - `valueTweenInt`: 整数値を tween で滑らかに数え上げ/下げ表示
 *
 * 既存パターン (HUD.startButton の pulse / showBanner の Back.easeOut /
 * RewardBanner のスライドチェーン) と矛盾しないよう、ease / duration は
 * design system 既定値 (Cubic.easeOut, Back.easeOut) に揃える。
 *
 * 注意: GAME_SPEED (0.5) は GameScene.update の delta スケールであり、
 * scene.tweens は影響を受けないため、UI 演出はキビキビ感を維持する。
 */
import Phaser from 'phaser';
import { COLORS } from '../config';

const HOVER_DURATION = 140;
const POP_DURATION = 180;

export interface HoverPopOptions {
  /** hover 時の scale ターゲット。デフォルト 1.02。 */
  scaleTo?: number;
  /** halo の色 (デフォルト accent)。 */
  halo?: number;
  /** halo の alpha (デフォルト 0.18)。 */
  haloAlpha?: number;
  /** halo を出すかどうか (デフォルト true)。 */
  withHalo?: boolean;
  /** halo の余白 (デフォルト 6px)。 */
  haloPad?: number;
}

/**
 * ボタン hover で scale + halo を表示。
 *
 * 既存の `pointerover` で背景色を変更するパターンと共存可能 (この関数は
 * scale と halo のみ管理し、fill 色には触らない)。
 *
 * 対象は `setInteractive()` 済の Rectangle / Container / Graphics いずれも可。
 * `width` `height` プロパティがあれば halo サイズに利用する (Rectangle は標準で持つ)。
 * Graphics の場合は `haloRadius` を opts で渡すか、自前で halo を管理してほしい。
 */
export function hoverPop(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject & { x: number; y: number; setScale: (s: number) => unknown },
  opts: HoverPopOptions = {}
): void {
  const scaleTo = opts.scaleTo ?? 1.02;
  const haloColor = opts.halo ?? COLORS.accent;
  const haloAlpha = opts.haloAlpha ?? 0.18;
  const withHalo = opts.withHalo ?? true;
  const haloPad = opts.haloPad ?? 6;

  // halo は hover 中のみ存在 (毎回作って消す)
  let halo: Phaser.GameObjects.Graphics | null = null;
  let scaleTween: Phaser.Tweens.Tween | null = null;

  target.on('pointerover', () => {
    scaleTween?.stop();
    scaleTween = scene.tweens.add({
      targets: target,
      scale: scaleTo,
      duration: HOVER_DURATION,
      ease: 'Cubic.easeOut',
    });
    if (withHalo && !halo) {
      const w = (target as { width?: number }).width ?? 40;
      const h = (target as { height?: number }).height ?? 40;
      halo = scene.add.graphics();
      halo.fillStyle(haloColor, haloAlpha);
      halo.fillRect(-w / 2 - haloPad, -h / 2 - haloPad, w + haloPad * 2, h + haloPad * 2);
      halo.setPosition(target.x, target.y);
      // halo は target より背面 (depth - 1)
      const targetDepth = (target as { depth?: number }).depth ?? 0;
      halo.setDepth(targetDepth - 1);
    }
  });
  target.on('pointerout', () => {
    scaleTween?.stop();
    scaleTween = scene.tweens.add({
      targets: target,
      scale: 1,
      duration: HOVER_DURATION,
      ease: 'Cubic.easeOut',
    });
    if (halo) {
      halo.destroy();
      halo = null;
    }
  });
  // target 破棄時に halo もクリーンアップ
  target.on(Phaser.GameObjects.Events.DESTROY, () => {
    scaleTween?.stop();
    if (halo) {
      halo.destroy();
      halo = null;
    }
  });
}

/**
 * Text オブジェクトの値が変わったことを視覚的に強調する。
 * setText() を呼ぶ「直前」または「直後」に呼べばよい (Tween は scale のみ操作)。
 *
 * 使い方:
 * ```
 * popText(scene, textObj);
 * textObj.setText('new value');
 * ```
 *
 * または:
 * ```
 * textObj.setText('new value');
 * popText(scene, textObj);
 * ```
 */
export function popText(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  opts: { from?: number; to?: number; duration?: number; ease?: string } = {}
): void {
  const from = opts.from ?? 0.85;
  const to = opts.to ?? 1;
  const duration = opts.duration ?? POP_DURATION;
  const ease = opts.ease ?? 'Back.easeOut';

  // 既存 scale tween を kill して再生 (連続呼び出し対策)
  scene.tweens.killTweensOf(text);
  text.setScale(from);
  scene.tweens.add({
    targets: text,
    scale: to,
    duration,
    ease,
  });
}

/**
 * Graphics 描画されるバーの「幅 ratio」を tween で滑らかに変化させる。
 * 内部に { r: fromRatio } の数値を持ち、毎フレーム drawFn(r) を呼んで再描画する。
 *
 * 使い方:
 * ```
 * tweenBarWidth(scene, gfx, (r) => {
 *   gfx.clear();
 *   gfx.fillStyle(color, 1);
 *   gfx.fillRect(x, y, w * r, h);
 * }, oldRatio, newRatio, 280);
 * ```
 */
export function tweenBarWidth(
  scene: Phaser.Scene,
  ownerKey: object,
  drawFn: (ratio: number) => void,
  fromRatio: number,
  toRatio: number,
  duration: number = 280,
  ease: string = 'Quad.easeOut'
): void {
  // owner オブジェクトをキーに既存 tween を kill (HP バー連射対応)
  scene.tweens.killTweensOf(ownerKey);
  const state = { r: fromRatio };
  scene.tweens.add({
    targets: state,
    r: toRatio,
    duration,
    ease,
    onUpdate: () => drawFn(state.r),
    onComplete: () => drawFn(toRatio),
  });
  // 初回 frame でも drawFn を呼んでおく (即時反映)
  drawFn(fromRatio);
}

/**
 * Text の数値表示を fromN から toN まで tween で滑らかに変化させる。
 * `formatter` で表示形式 (例: クレジット `$120`) をカスタマイズ可能。
 */
export function valueTweenInt(
  scene: Phaser.Scene,
  text: Phaser.GameObjects.Text,
  fromN: number,
  toN: number,
  duration: number = 200,
  formatter: (n: number) => string = (n) => String(Math.round(n))
): void {
  scene.tweens.killTweensOf(text);
  const state = { n: fromN };
  text.setText(formatter(fromN));
  scene.tweens.add({
    targets: state,
    n: toN,
    duration,
    ease: 'Cubic.easeOut',
    onUpdate: () => text.setText(formatter(state.n)),
    onComplete: () => text.setText(formatter(toN)),
  });
}
