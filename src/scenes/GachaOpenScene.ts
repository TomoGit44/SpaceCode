import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import type { Inventory } from '../items/Inventory';
import {
  type ItemInstance,
  type CodeItemInstance,
  RARITY_LABEL,
  RARITY_SHORT,
  RARITY_COLOR,
} from '../items/itemTypes';
import { drawGacha, gachaCategoryOf, type GachaCandidate } from '../items/gacha';
import { OMNI_CORE_TYPES, omniCorePercent } from '../items/types/omniCores';
import { MODULE_TYPES, moduleEffectText } from '../items/types/modules';
import { ITEM_CODE_DEFS, type ItemCodeType } from '../items/types/itemCodes';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface GachaOpenData {
  /** 開封対象のガチャアイテム (typeId は 'codeGacha' | 'moduleGacha')。 */
  gacha: ItemInstance;
  inventory: Inventory;
  /** 開封後 (consume / cancel どちらでも) に親シーンへ再描画を促すコールバック。 */
  onClosed: () => void;
}

/**
 * ガチャ開封オーバーレイ (Phase 6 Step 6)。
 *
 * 親 (ItemInventoryScene) を pause せず並行 active で起動するが、
 * 全画面バックドロップ + bringToTop で親への入力を遮断する。
 *
 * フロー:
 *   1. 起動時に drawGacha() で 3 候補を生成
 *   2. カードをアニメーションで提示 (フェード + スケールイン + stagger)
 *   3. プレイヤーが 1 枚クリック → ハイライト → 「これを選ぶ」ボタンで確定
 *   4. 確定で選んだアイテムを Inventory に追加、ガチャ個体を消費 → 閉じる
 *   5. ESC / バックドロップでキャンセル (ガチャ未消費のまま閉じる)
 */
export class GachaOpenScene extends Phaser.Scene {
  private gacha!: ItemInstance;
  private inventory!: Inventory;
  private onClosed!: () => void;

  private candidates: GachaCandidate[] = [];
  private selectedIndex: number | null = null;
  private consumed = false;

  private chrome: Phaser.GameObjects.GameObject[] = [];
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private cardObjects: Array<{
    bg: Phaser.GameObjects.Rectangle;
    border: Phaser.GameObjects.Rectangle;
  }> = [];
  private escHandler?: () => void;

  constructor() {
    super({ key: 'GachaOpenScene' });
  }

  init(data: GachaOpenData): void {
    this.gacha = data.gacha;
    this.inventory = data.inventory;
    this.onClosed = data.onClosed;
    this.selectedIndex = null;
    this.consumed = false;
    this.candidates = [];
    this.cardObjects = [];
  }

  create(): void {
    const category = gachaCategoryOf(this.gacha.typeId);
    if (!category) {
      this.close();
      return;
    }
    this.candidates = drawGacha(category, this.gacha.rarity);

    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.7)
      .setDepth(0)
      .setInteractive();
    backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });
    this.chrome.push(backdrop);

    // タイトル
    const titleText = category === 'code' ? 'コードガチャを開封' : 'モジュールガチャを開封';
    const rc = RARITY_COLOR[this.gacha.rarity];
    this.chrome.push(
      this.add
        .text(GAME_WIDTH / 2, 96, titleText, {
          fontFamily: FONT,
          fontSize: '24px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(2),
      this.add
        .text(GAME_WIDTH / 2, 128, `${RARITY_LABEL[this.gacha.rarity]} ガチャ — 3 つから 1 つ選んでください`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#' + rc.toString(16).padStart(6, '0'),
        })
        .setOrigin(0.5)
        .setDepth(2)
    );

    this.renderCards();
    this.renderFooter();

    this.escHandler = () => this.close();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  // ─── カード描画 ────────────────────────────────────────────

  private renderCards(): void {
    const cardW = 240;
    const cardH = 320;
    const gap = 32;
    const totalW = cardW * 3 + gap * 2;
    const startX = (GAME_WIDTH - totalW) / 2;
    const y = GAME_HEIGHT / 2 - 20;

    this.candidates.forEach((cand, i) => {
      const cx = startX + i * (cardW + gap) + cardW / 2;
      this.makeCard(cand, i, cx, y, cardW, cardH);
    });
  }

  private makeCard(cand: GachaCandidate, index: number, cx: number, cy: number, w: number, h: number): void {
    const rc = RARITY_COLOR[cand.rarity];

    // ハイライト用の枠 (選択時に強調)
    const border = this.add
      .rectangle(cx, cy, w + 8, h + 8, rc, 0)
      .setStrokeStyle(3, rc, 0)
      .setDepth(2);

    const bg = this.add
      .rectangle(cx, cy, w, h, COLORS.panelBg, 0.95)
      .setStrokeStyle(2, rc, 0.85)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });

    bg.on('pointerover', () => {
      if (this.selectedIndex !== index) bg.setFillStyle(COLORS.panelHover, 1);
    });
    bg.on('pointerout', () => {
      if (this.selectedIndex !== index) bg.setFillStyle(COLORS.panelBg, 0.95);
    });
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.selectCard(index);
    });

    this.chrome.push(border, bg);
    this.cardObjects.push({ bg, border });

    // カード中身
    const top = cy - h / 2;
    const left = cx - w / 2;

    // レア度バッジ
    this.chrome.push(
      this.add
        .rectangle(left + 26, top + 22, 36, 22, rc, 0.18)
        .setStrokeStyle(1, rc, 1)
        .setDepth(4),
      this.add
        .text(left + 26, top + 22, RARITY_SHORT[cand.rarity], {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(5)
    );

    // カテゴリラベル (右上)
    const catLabel = cand.category === 'code' ? 'コード' : 'モジュール';
    this.chrome.push(
      this.add
        .text(cx + w / 2 - 12, top + 22, catLabel, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
        })
        .setOrigin(1, 0.5)
        .setDepth(5)
    );

    // アイテム名
    this.chrome.push(
      this.add
        .text(cx, top + 78, this.candName(cand), {
          fontFamily: FONT,
          fontSize: '18px',
          color: '#cfd6e6',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: w - 32 },
        })
        .setOrigin(0.5, 0)
        .setDepth(5)
    );

    // 効果テキスト
    const eff = this.candEffect(cand);
    this.chrome.push(
      this.add
        .text(cx, top + 160, eff, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
          align: 'center',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setOrigin(0.5, 0)
        .setDepth(5)
    );

    // アニメーション: 小さく / 透明から拡大 + フェードイン (stagger)
    bg.setAlpha(0).setScale(0.85);
    border.setAlpha(0).setScale(0.85);
    this.tweens.add({
      targets: [bg, border],
      alpha: 1,
      scale: 1,
      duration: 280,
      delay: index * 90,
      ease: 'Back.easeOut',
    });
  }

  /** 候補の表示名 (typeId からアイテムテーブル経由)。 */
  private candName(cand: GachaCandidate): string {
    if (cand.category === 'module') return MODULE_TYPES[cand.typeId]?.nameJa ?? cand.typeId;
    // category === 'code': cand.typeId は ItemCodeType
    const def = ITEM_CODE_DEFS[cand.typeId as ItemCodeType];
    return def?.nameJa ?? cand.typeId;
  }

  /** 候補の効果テキスト。 */
  private candEffect(cand: GachaCandidate): string {
    if (cand.category === 'module') {
      const m = MODULE_TYPES[cand.typeId];
      return m ? `${m.descJa}\n\n${moduleEffectText(cand.typeId, cand.rarity)}` : '';
    }
    const def = ITEM_CODE_DEFS[cand.typeId as ItemCodeType];
    if (!def) return '';
    const first = def.params[0];
    const range = first ? `\n\n最大: ${first.label} = ${first.rarityMax[cand.rarity]}${first.unit}` : '';
    return `${def.descJa}${range}`;
  }

  // ─── 選択 / 確定 ───────────────────────────────────────────

  private selectCard(index: number): void {
    this.selectedIndex = index;
    // 全カードのハイライトを更新
    this.cardObjects.forEach((co, i) => {
      const cand = this.candidates[i]!;
      const rc = RARITY_COLOR[cand.rarity];
      if (i === index) {
        co.bg.setFillStyle(COLORS.panelHover, 1);
        co.border.setStrokeStyle(3, rc, 1);
      } else {
        co.bg.setFillStyle(COLORS.panelBg, 0.95);
        co.border.setStrokeStyle(3, rc, 0);
      }
    });
    this.renderFooter();
  }

  // ─── フッター (アクションボタン) ──────────────────────────

  private renderFooter(): void {
    for (const g of this.dyn) g.destroy();
    this.dyn = [];

    const y = GAME_HEIGHT - 90;
    const sel = this.selectedIndex !== null ? this.candidates[this.selectedIndex] : null;

    if (sel) {
      const w = 220;
      this.makeButton(GAME_WIDTH / 2 - w / 2 - 16, y, w, 'これを選ぶ', COLORS.accent, () => {
        this.confirmPick();
      });
      this.makeButton(GAME_WIDTH / 2 + 16, y, w, 'やめる', COLORS.uiDim, () => {
        this.close();
      });
    } else {
      const w = 240;
      this.dyn.push(
        this.add
          .text(GAME_WIDTH / 2, y - 16, 'カードをクリックして選択', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(4)
      );
      this.makeButton(GAME_WIDTH / 2 - w / 2, y, w, 'やめる', COLORS.uiDim, () => {
        this.close();
      });
    }
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    label: string,
    accent: number,
    onClick: () => void
  ): void {
    const h = 36;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(1, accent, 0.85)
      .setDepth(4)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(5);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      onClick();
    });
    this.dyn.push(bg, t);
  }

  // ─── 確定処理 ──────────────────────────────────────────────

  private confirmPick(): void {
    if (this.selectedIndex === null || this.consumed) return;
    const cand = this.candidates[this.selectedIndex]!;

    // ガチャ個体を消費
    this.inventory.items = this.inventory.items.filter((i) => i.uid !== this.gacha.uid);

    // 選んだアイテムを Inventory に追加
    if (cand.category === 'module') {
      const item: ItemInstance = {
        uid: crypto.randomUUID(),
        typeId: cand.typeId,
        rarity: cand.rarity,
      };
      this.inventory.items.push(item);
    } else {
      const code: CodeItemInstance = {
        uid: crypto.randomUUID(),
        codeType: cand.typeId,
        rarity: cand.rarity,
      };
      this.inventory.codes.push(code);
    }

    this.consumed = true;
    this.close();
  }

  // ─── 閉じる ───────────────────────────────────────────────

  private close(): void {
    this.scene.stop();
  }

  private shutdown(): void {
    if (this.escHandler) {
      this.input.keyboard?.off('keydown-ESC', this.escHandler);
      this.escHandler = undefined;
    }
    for (const g of this.dyn) g.destroy();
    for (const g of this.chrome) g.destroy();
    this.dyn = [];
    this.chrome = [];
    this.cardObjects = [];
    this.onClosed();
  }
}
