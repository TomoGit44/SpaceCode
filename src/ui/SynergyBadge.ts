import Phaser from 'phaser';
import { COLORS } from '../config';
import { RARITY_COLOR, RARITY_SHORT } from '../items/itemTypes';
import type { SynergyDef } from '../items/synergies';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface SynergyBadgeResult {
  /** バッジが占有する幅 (px)。レイアウト計算に使う。 */
  readonly width: number;
  /** 後で破棄するために返す GameObject 一覧。 */
  readonly objects: ReadonlyArray<Phaser.GameObjects.GameObject>;
}

/**
 * シナジー発動バッジ 1 個ぶんを描画するヘルパ (2026-06-05 追加)。
 *
 * 「発見」が肝なので、SR/L 級は ??? でネタバレ抑制する。N/R は実名表示。
 * 戻り値の objects はシーン側で破棄管理する。
 *
 * 状態:
 *  - 'active': 発動中 (鮮やかな枠 + 名前 + tooltip 文)。レア度色で縁取り
 *  - 'hint':   あと 1 個条件で発動可能 (半透明 + 名前 + "1/2" など)。Step 2 では未使用
 *
 * 描画は (leftX, centerY) の左端基準で行い、高さは固定 22px。
 * 幅は内容に応じて自動算出 (戻り値の width に入る)。
 */
export function createSynergyBadge(
  scene: Phaser.Scene,
  leftX: number,
  centerY: number,
  def: SynergyDef,
  state: 'active' | 'hint' = 'active',
): SynergyBadgeResult {
  const rc = RARITY_COLOR[def.rarity];
  const hideName = def.rarity === 'SR' || def.rarity === 'L';
  const labelText = state === 'active'
    ? `⚡ ${hideName ? '???' : def.nameJa}`
    : `${hideName ? '???' : def.nameJa}`;
  const rarityText = RARITY_SHORT[def.rarity];

  // 名前ラベルだけ先に作って実寸を測る (日本語可変長対応)
  const label = scene.add
    .text(0, centerY, labelText, {
      fontFamily: FONT,
      fontSize: '11px',
      color: state === 'active' ? '#cfd6e6' : '#6b7da0',
      fontStyle: 'bold',
    })
    .setOrigin(0, 0.5);
  const labelW = label.width;
  const w = labelW + 38; // rarity チップ (22px) + 内側余白 (16px)

  // 背景 (中心配置)
  const cx = leftX + w / 2;
  const bg = scene.add
    .rectangle(cx, centerY, w, 22, state === 'active' ? rc : COLORS.panelBg, state === 'active' ? 0.18 : 0.4)
    .setStrokeStyle(1, rc, state === 'active' ? 0.95 : 0.45)
    .setDepth(3);
  const rarityChip = scene.add
    .text(leftX + 12, centerY, rarityText, {
      fontFamily: FONT,
      fontSize: '11px',
      color: '#' + rc.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
    })
    .setOrigin(0.5)
    .setDepth(4);
  label.setPosition(leftX + 26, centerY).setDepth(4);

  // hover ツールチップ (発動中のみ)
  if (state === 'active') {
    bg.setInteractive({ useHandCursor: false });
    const tip = scene.add
      .text(cx, centerY + 16, hideName ? '装着構成で発動した隠しシナジー' : def.descJa, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#3ee0c5',
        backgroundColor: '#05070d',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 0)
      .setDepth(100)
      .setVisible(false);
    bg.on('pointerover', () => tip.setVisible(true));
    bg.on('pointerout', () => tip.setVisible(false));
    return { width: w, objects: [bg, rarityChip, label, tip] };
  }

  return { width: w, objects: [bg, rarityChip, label] };
}
