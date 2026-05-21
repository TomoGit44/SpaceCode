import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import type { Inventory } from '../items/Inventory';
import {
  type ItemCategory,
  type Rarity,
  type ItemInstance,
  ALL_RARITIES,
  RARITY_LABEL,
  RARITY_SHORT,
  RARITY_COLOR,
} from '../items/itemTypes';
import { OMNI_CORE_TYPES, isOmniCore, omniCorePercent, makeRandomOmniCore } from '../items/types/omniCores';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ItemInventoryData {
  inventory: Inventory;
  /** 任意: 後続ステップ (ガチャ戦闘中ガード等) で使用。Step 2 では未使用。 */
  waveState?: string;
}

interface CategoryDef {
  id: ItemCategory;
  label: string;
}

const CATEGORIES: ReadonlyArray<CategoryDef> = [
  { id: 'omniCore', label: 'オムニ・コア' },
  { id: 'module', label: 'モジュール' },
  { id: 'chemical', label: 'ケミカル' },
  { id: 'codeGacha', label: 'コードガチャ' },
  { id: 'moduleGacha', label: 'モジュールガチャ' },
];

/**
 * アイテム一覧オーバーレイ。
 *
 * GameScene を pause せずに並行 active で起動する (ProgramEditorScene と同じパターン)。
 * 左: カテゴリタブ / 中央: 所持アイテム一覧 / 右: 選択アイテムの詳細。
 *
 * Phase 6 Step 2: オムニ・コアのみ実装。他カテゴリのタブは空状態を表示する。
 * デバッグ用にオムニ・コア獲得ボタンを下部に置く (検証手段。最終的に全カテゴリ分)。
 */
export class ItemInventoryScene extends Phaser.Scene {
  private inventory!: Inventory;
  private selectedCategory: ItemCategory = 'omniCore';
  private selectedUid: string | null = null;

  private dyn: Phaser.GameObjects.GameObject[] = [];
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private escHandler?: () => void;

  // レイアウト
  private cardLeft = 0;
  private cardTop = 0;
  private readonly cardW = 980;
  private readonly cardH = 560;

  constructor() {
    super({ key: 'ItemInventoryScene' });
  }

  init(data: ItemInventoryData): void {
    this.inventory = data.inventory;
    this.selectedCategory = 'omniCore';
    this.selectedUid = null;
  }

  create(): void {
    this.cardLeft = (GAME_WIDTH - this.cardW) / 2;
    this.cardTop = (GAME_HEIGHT - this.cardH) / 2;

    // ─── バックドロップ ───
    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.55)
      .setDepth(0)
      .setInteractive();
    backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });
    this.chrome.push(backdrop);

    // ─── カード ───
    const card = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.cardW, this.cardH, COLORS.bgAlt, 0.97)
      .setStrokeStyle(1, COLORS.accent, 0.4)
      .setDepth(1)
      .setInteractive();
    card.on('pointerdown', () => {});
    this.chrome.push(card);

    this.chrome.push(
      this.add
        .text(this.cardLeft + 24, this.cardTop + 16, '📦 アイテム', {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2)
    );

    this.makeCloseButton(this.cardLeft + this.cardW - 60, this.cardTop + 30);
    this.makeDebugRow();

    // ─── ESC ───
    this.escHandler = () => this.close();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.render();
  }

  // ─── 描画 ──────────────────────────────────────────────────

  private render(): void {
    for (const g of this.dyn) g.destroy();
    this.dyn = [];

    this.renderTabs();
    this.renderList();
    this.renderDetail();
  }

  private renderTabs(): void {
    const x = this.cardLeft + 24;
    const w = 170;
    let y = this.cardTop + 60;
    for (const cat of CATEGORIES) {
      const selected = cat.id === this.selectedCategory;
      const bg = this.add
        .rectangle(x + w / 2, y + 20, w, 38, selected ? COLORS.accent : COLORS.panelBg, selected ? 0.28 : 1)
        .setStrokeStyle(1, selected ? COLORS.accent : COLORS.panelBorder, selected ? 1 : 0.8)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + 12, y + 20, cat.label, {
          fontFamily: FONT,
          fontSize: '14px',
          color: selected ? '#3ee0c5' : '#cfd6e6',
          fontStyle: selected ? 'bold' : 'normal',
        })
        .setOrigin(0, 0.5)
        .setDepth(3);
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        this.selectedCategory = cat.id;
        this.selectedUid = null;
        this.render();
      });
      this.dyn.push(bg, label);
      y += 46;
    }
  }

  private renderList(): void {
    const x = this.cardLeft + 24 + 170 + 16;
    const w = 480;
    const top = this.cardTop + 60;

    if (this.selectedCategory !== 'omniCore') {
      this.dyn.push(
        this.add
          .text(x + w / 2, top + 80, 'このカテゴリのアイテムはまだありません', {
            fontFamily: FONT,
            fontSize: '14px',
            color: '#6b7da0',
          })
          .setOrigin(0.5, 0)
          .setDepth(3)
      );
      return;
    }

    const cores = this.inventory.items.filter((it) => isOmniCore(it.typeId));
    if (cores.length === 0) {
      this.dyn.push(
        this.add
          .text(x + w / 2, top + 80, 'オムニ・コアを所持していません', {
            fontFamily: FONT,
            fontSize: '14px',
            color: '#6b7da0',
          })
          .setOrigin(0.5, 0)
          .setDepth(3)
      );
      return;
    }

    let y = top;
    for (const it of cores) {
      this.makeItemRow(it, x, y, w);
      y += 48;
    }
  }

  private makeItemRow(it: ItemInstance, x: number, y: number, w: number): void {
    const core = OMNI_CORE_TYPES[it.typeId];
    if (!core) return;
    const selected = it.uid === this.selectedUid;
    const rc = RARITY_COLOR[it.rarity];

    const bg = this.add
      .rectangle(x + w / 2, y + 20, w, 42, selected ? rc : COLORS.panelBg, selected ? 0.24 : 0.85)
      .setStrokeStyle(selected ? 2 : 1, rc, selected ? 1 : 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.selectedUid = it.uid;
      this.render();
    });

    // レア度バッジ
    const badge = this.add
      .text(x + 14, y + 20, RARITY_SHORT[it.rarity], {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#' + rc.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    const name = this.add
      .text(x + 52, y + 20, core.nameJa, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#cfd6e6',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    const eff = this.add
      .text(x + w - 14, y + 20, `+${omniCorePercent(it.typeId, it.rarity)}%`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#3ee0c5',
      })
      .setOrigin(1, 0.5)
      .setDepth(3);

    this.dyn.push(bg, badge, name, eff);
  }

  private renderDetail(): void {
    const x = this.cardLeft + this.cardW - 24 - 240;
    const w = 240;
    const top = this.cardTop + 60;

    const panel = this.add
      .rectangle(x + w / 2, top + 170, w, 340, COLORS.panelBg, 0.6)
      .setStrokeStyle(1, COLORS.panelBorder, 0.8)
      .setDepth(2);
    this.dyn.push(panel);

    const sel =
      this.selectedUid !== null
        ? this.inventory.items.find((it) => it.uid === this.selectedUid)
        : undefined;

    if (!sel || !isOmniCore(sel.typeId)) {
      this.dyn.push(
        this.add
          .text(x + w / 2, top + 160, 'アイテムを選択', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    const core = OMNI_CORE_TYPES[sel.typeId]!;
    const rc = RARITY_COLOR[sel.rarity];

    this.dyn.push(
      this.add
        .text(x + 16, top + 20, core.nameJa, {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(3),
      this.add
        .text(x + 16, top + 48, RARITY_LABEL[sel.rarity], {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setDepth(3),
      this.add
        .text(x + 16, top + 84, `${core.descJa}\n+${omniCorePercent(sel.typeId, sel.rarity)}%`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#cfd6e6',
          lineSpacing: 6,
          wordWrap: { width: w - 32 },
        })
        .setDepth(3),
      this.add
        .text(x + 16, top + 150, '所持しているだけで常時有効。\n同種コアの効果は加算で重なる。', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setDepth(3)
    );
  }

  // ─── デバッグ獲得行 ────────────────────────────────────────

  private makeDebugRow(): void {
    const y = this.cardTop + this.cardH - 38;
    const label = this.add
      .text(this.cardLeft + 24, y, 'DEBUG オムニ・コア獲得:', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#6b7da0',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.chrome.push(label);

    let x = this.cardLeft + 210;
    for (const r of ALL_RARITIES) {
      this.makeDebugButton(x, y, r);
      x += 70;
    }
  }

  private makeDebugButton(cx: number, cy: number, rarity: Rarity): void {
    const rc = RARITY_COLOR[rarity];
    const bg = this.add
      .rectangle(cx, cy, 60, 28, COLORS.panelBg, 1)
      .setStrokeStyle(1, rc, 0.9)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(cx, cy, RARITY_SHORT[rarity], {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#' + rc.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      const core = makeRandomOmniCore(rarity);
      this.inventory.items.push(core);
      this.selectedUid = core.uid;
      this.render();
    });
    this.chrome.push(bg, t);
  }

  // ─── 共通 ──────────────────────────────────────────────────

  private makeCloseButton(cx: number, cy: number): void {
    const bg = this.add
      .rectangle(cx, cy, 80, 32, COLORS.panelBg, 1)
      .setStrokeStyle(1, COLORS.enemy, 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(cx, cy, '✕ 閉じる', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5)
      .setDepth(3);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });
    this.chrome.push(bg, t);
  }

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
  }
}
