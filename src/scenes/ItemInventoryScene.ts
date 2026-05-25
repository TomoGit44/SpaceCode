import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import type { Ship } from '../entities/Ship';
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
import { MODULE_TYPES, isModule, moduleEffectText, makeRandomModule } from '../items/types/modules';
import { CHEMICAL_TYPES, isChemical, chemicalEffectText, makeRandomChemical } from '../items/types/chemicals';
import { isCodeGacha, isModuleGacha, isGacha, gachaItemName, makeGachaItem } from '../items/gacha';
import { ItemCard } from '../ui/ItemCard';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ItemInventoryData {
  inventory: Inventory;
  /** 現在の生存 Ship を返す (GameScene が毎フレーム配列を作り直すため getter で渡す)。 */
  getShips: () => Ship[];
  /** アイテム構成が変わったとき呼ぶ (GameScene が最大 stat 再計算 + バッジ更新)。 */
  onChanged: () => void;
  /** ケミカル使用効果を適用する (GameScene が base/ships/economy 等に反映)。 */
  useChemical: (typeId: string, rarity: Rarity) => void;
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
 * アイテム一覧オーバーレイ (Step 3-A 再構築, 2026-05-25)。
 *
 * 3 カラムレイアウト:
 *   - 左 (200px): カテゴリタブ縦並び + 件数バッジ
 *   - 中央 (560px): 4 列 × N 行 のカードグリッド (ItemCard)
 *   - 右 (340px): 選択アイテムの詳細 (ヒーロー領域 + 説明 + アクション)
 *
 * GameScene を pause せず並行 active で起動する (ProgramEditorScene と同じパターン)。
 */
export class ItemInventoryScene extends Phaser.Scene {
  private inventory!: Inventory;
  private getShips!: () => Ship[];
  private onChanged!: () => void;
  private useChemicalCb!: (typeId: string, rarity: Rarity) => void;

  private selectedCategory: ItemCategory = 'omniCore';
  private selectedUid: string | null = null;
  private confirmingUse = false;

  private dyn: Phaser.GameObjects.GameObject[] = [];
  private dynCards: ItemCard[] = [];
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private escHandler?: () => void;

  // カードレイアウト
  private cardLeft = 0;
  private cardTop = 0;
  private readonly cardW = 1140;
  private readonly cardH = 600;

  // 各カラムの座標 (create で計算)
  private colLeftX = 0;
  private colCenterX = 0;
  private colRightX = 0;
  private readonly leftW = 200;
  private readonly rightW = 340;

  constructor() {
    super({ key: 'ItemInventoryScene' });
  }

  init(data: ItemInventoryData): void {
    this.inventory = data.inventory;
    this.getShips = data.getShips;
    this.onChanged = data.onChanged;
    this.useChemicalCb = data.useChemical;
    this.selectedCategory = 'omniCore';
    this.selectedUid = null;
    this.confirmingUse = false;
  }

  create(): void {
    this.cardLeft = (GAME_WIDTH - this.cardW) / 2;
    this.cardTop = (GAME_HEIGHT - this.cardH) / 2;

    // カラム座標 (24px パディング + gap 16)
    this.colLeftX = this.cardLeft + 24;
    this.colCenterX = this.colLeftX + this.leftW + 16;
    this.colRightX = this.cardLeft + this.cardW - 24 - this.rightW;

    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.55)
      .setDepth(0)
      .setInteractive();
    backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });
    this.chrome.push(backdrop);

    const card = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, this.cardW, this.cardH, COLORS.bgAlt, 0.97)
      .setStrokeStyle(1, COLORS.accent, 0.4)
      .setDepth(1)
      .setInteractive();
    card.on('pointerdown', () => {});
    this.chrome.push(card);

    // タイトル
    this.chrome.push(
      this.add
        .text(this.cardLeft + 24, this.cardTop + 16, '📦 アイテム', {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(this.cardLeft + 140, this.cardTop + 22, 'INVENTORY', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
          fontStyle: 'bold',
        })
        .setDepth(2)
    );

    this.makeCloseButton(this.cardLeft + this.cardW - 60, this.cardTop + 30);
    this.makeDebugRow();

    this.escHandler = () => this.close();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.render();
  }

  // ─── 描画 ──────────────────────────────────────────────────

  private render(): void {
    for (const g of this.dyn) g.destroy();
    for (const c of this.dynCards) c.destroy();
    this.dyn = [];
    this.dynCards = [];
    this.renderTabs();
    this.renderGrid();
    this.renderDetail();
  }

  /** 左: カテゴリタブ (件数バッジ付き、active バー). */
  private renderTabs(): void {
    const x = this.colLeftX;
    const w = this.leftW;
    let y = this.cardTop + 60;
    for (const cat of CATEGORIES) {
      const selected = cat.id === this.selectedCategory;
      const count = this.countForCategory(cat.id);
      // active ハイライト (左 2px バー)
      if (selected) {
        this.dyn.push(
          this.add.rectangle(x, y + 21, 2, 38, COLORS.accent, 1).setOrigin(0, 0.5).setDepth(3)
        );
      }
      const bg = this.add
        .rectangle(x + w / 2, y + 21, w, 42, selected ? COLORS.accent : COLORS.panelBg, selected ? 0.12 : 1)
        .setStrokeStyle(1, selected ? COLORS.accent : COLORS.panelBorder, selected ? 1 : 0.6)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + 16, y + 21, cat.label, {
          fontFamily: FONT,
          fontSize: '13px',
          color: selected ? '#3ee0c5' : '#cfd6e6',
          fontStyle: selected ? 'bold' : 'normal',
        })
        .setOrigin(0, 0.5)
        .setDepth(3);
      const countText = this.add
        .text(x + w - 14, y + 21, count > 0 ? `${count}` : '—', {
          fontFamily: FONT,
          fontSize: '12px',
          color: count > 0 ? '#cfd6e6' : '#6b7da0',
          fontStyle: count > 0 ? 'bold' : 'normal',
        })
        .setOrigin(1, 0.5)
        .setDepth(3);
      bg.on('pointerover', () => {
        if (!selected) bg.setFillStyle(COLORS.panelHover, 1);
      });
      bg.on('pointerout', () => {
        if (!selected) bg.setFillStyle(COLORS.panelBg, 1);
      });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        this.selectedCategory = cat.id;
        this.selectedUid = null;
        this.confirmingUse = false;
        this.render();
      });
      this.dyn.push(bg, label, countText);
      y += 50;
    }
  }

  private countForCategory(cat: ItemCategory): number {
    switch (cat) {
      case 'omniCore':    return this.inventory.items.filter((it) => isOmniCore(it.typeId)).length;
      case 'module':      return this.inventory.items.filter((it) => isModule(it.typeId)).length;
      case 'chemical':    return this.inventory.items.filter((it) => isChemical(it.typeId)).length;
      case 'codeGacha':   return this.inventory.items.filter((it) => isCodeGacha(it.typeId)).length;
      case 'moduleGacha': return this.inventory.items.filter((it) => isModuleGacha(it.typeId)).length;
      default:            return 0;
    }
  }

  /** 中央: 4 列 × N 行 のカードグリッド。 */
  private renderGrid(): void {
    const gridLeft = this.colCenterX;
    const gridTop = this.cardTop + 60;
    const gridW = this.colRightX - gridLeft - 16; // 右カラムとの gap 16
    const cols = 4;
    const gap = 8;
    const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
    const cardH = 140;

    // ヘッダー (カテゴリ名 + 件数)
    const items = this.categoryItems();
    this.dyn.push(
      this.add
        .text(gridLeft, this.cardTop + 28, this.headerForCategory(), {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(gridLeft + 120, this.cardTop + 32, `${items.length} 件`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
        })
        .setDepth(2)
    );

    if (items.length === 0) {
      this.dyn.push(
        this.add
          .rectangle(gridLeft + gridW / 2, gridTop + 120, gridW, 240, COLORS.bgAlt, 0.4)
          .setStrokeStyle(1, COLORS.panelBorder, 0.5)
          .setDepth(2),
        this.add
          .text(gridLeft + gridW / 2, gridTop + 120, 'このカテゴリのアイテムを所持していません', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
            align: 'center',
            wordWrap: { width: 360 },
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    // カード並べ
    const maxRows = 3; // グリッド表示の上限
    const maxCards = cols * maxRows;
    for (let i = 0; i < Math.min(items.length, maxCards); i++) {
      const it = items[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridLeft + col * (cardW + gap) + cardW / 2;
      const y = gridTop + row * (cardH + gap) + cardH / 2;
      const card = new ItemCard(this, x, y, {
        width: cardW,
        height: cardH,
        rarity: it.rarity,
        iconColor: this.iconColorFor(it.typeId),
        name: this.displayName(it.typeId),
        subtext: this.subtextFor(it),
        equippedBadge: this.equippedBadgeFor(it),
        selected: it.uid === this.selectedUid,
        depth: 3,
        onPointerDown: () => {
          this.selectedUid = it.uid;
          this.confirmingUse = false;
          this.render();
        },
      });
      this.dynCards.push(card);
    }
    if (items.length > maxCards) {
      this.dyn.push(
        this.add
          .text(gridLeft + gridW / 2, gridTop + cardH * maxRows + gap * (maxRows - 1) + 12,
            `… ほか ${items.length - maxCards} 件 (右の詳細で個別操作)`, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
    }
  }

  private headerForCategory(): string {
    const found = CATEGORIES.find((c) => c.id === this.selectedCategory);
    return found?.label ?? '';
  }

  /** カード中央アイコンの色 (カテゴリ別に固定)。 */
  private iconColorFor(typeId: string): number {
    if (isOmniCore(typeId))    return COLORS.base;
    if (isModule(typeId))      return COLORS.ally;
    if (isChemical(typeId))    return COLORS.accent;
    if (isCodeGacha(typeId))   return COLORS.raritySR;
    if (isModuleGacha(typeId)) return COLORS.rarityL;
    return COLORS.uiDim;
  }

  /** カード下部のサブテキスト (効果や状態)。 */
  private subtextFor(it: ItemInstance): string {
    if (isOmniCore(it.typeId)) return `+${omniCorePercent(it.typeId, it.rarity)}%`;
    if (isChemical(it.typeId)) return '使い切り';
    if (isGacha(it.typeId))    return '未開封';
    return '';
  }

  /** モジュール装着先を「S1」「S2」形式で返す (未装着は null)。 */
  private equippedBadgeFor(it: ItemInstance): string | null {
    if (!isModule(it.typeId)) return null;
    const idx = this.equippedShipIndex(it.uid);
    return idx >= 0 ? `S${idx + 1}` : null;
  }

  /** 選択カテゴリに属する所持アイテム。 */
  private categoryItems(): ItemInstance[] {
    if (this.selectedCategory === 'omniCore') {
      return this.inventory.items.filter((it) => isOmniCore(it.typeId));
    }
    if (this.selectedCategory === 'module') {
      return this.inventory.items.filter((it) => isModule(it.typeId));
    }
    if (this.selectedCategory === 'chemical') {
      return this.inventory.items.filter((it) => isChemical(it.typeId));
    }
    if (this.selectedCategory === 'codeGacha') {
      return this.inventory.items.filter((it) => isCodeGacha(it.typeId));
    }
    if (this.selectedCategory === 'moduleGacha') {
      return this.inventory.items.filter((it) => isModuleGacha(it.typeId));
    }
    return [];
  }

  private displayName(typeId: string): string {
    if (isGacha(typeId)) return gachaItemName(typeId);
    return (
      OMNI_CORE_TYPES[typeId]?.nameJa ??
      MODULE_TYPES[typeId]?.nameJa ??
      CHEMICAL_TYPES[typeId]?.nameJa ??
      typeId
    );
  }

  /** 右: 選択アイテムの詳細パネル (ヒーロー領域 + 説明 + アクション)。 */
  private renderDetail(): void {
    const x = this.colRightX;
    const w = this.rightW;
    const top = this.cardTop + 60;
    const h = this.cardH - 60 - 56; // 下端のデバッグ行を避ける

    // パネル背景
    this.dyn.push(
      this.add
        .rectangle(x + w / 2, top + h / 2, w, h, COLORS.bgAlt, 0.6)
        .setStrokeStyle(1, COLORS.panelBorder, 0.8)
        .setDepth(2)
    );

    const sel =
      this.selectedUid !== null
        ? this.inventory.items.find((it) => it.uid === this.selectedUid)
        : undefined;
    if (!sel) {
      this.dyn.push(
        this.add
          .text(x + w / 2, top + h / 2, '↑ カードを選択してください', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    // ヒーロー領域: 大きい六角アイコン + Rarity 表示
    const heroH = 180;
    const heroBg = this.add
      .rectangle(x + w / 2, top + heroH / 2 + 2, w - 4, heroH, COLORS.bg, 0.55)
      .setDepth(3);
    this.dyn.push(heroBg);

    // 大きい六角アイコン (decorative)
    const heroIcon = this.add.graphics().setDepth(4);
    const hr = 38;
    const hcx = x + w / 2;
    const hcy = top + heroH / 2;
    const iconColor = this.iconColorFor(sel.typeId);
    // 外枠
    this.drawHex(heroIcon, hcx, hcy, hr * 1.25, COLORS.bgAlt, 0.9);
    this.strokeHex(heroIcon, hcx, hcy, hr * 1.25, RARITY_COLOR[sel.rarity], 1.5);
    // 内側
    this.drawHex(heroIcon, hcx, hcy, hr * 0.9, iconColor, 0.9);
    heroIcon.fillStyle(COLORS.highlight, 0.95);
    heroIcon.fillCircle(hcx, hcy, hr * 0.2);
    this.dyn.push(heroIcon);

    const rc = RARITY_COLOR[sel.rarity];
    this.dyn.push(
      this.add
        .text(x + 16, top + heroH + 16, this.displayName(sel.typeId), {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#cfd6e6',
          fontStyle: 'bold',
          wordWrap: { width: w - 32 },
        })
        .setDepth(4),
      this.add
        .text(x + 16, top + heroH + 44, RARITY_LABEL[sel.rarity], {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setDepth(4)
    );

    const detailTop = top + heroH + 70;
    if (isOmniCore(sel.typeId)) this.renderCoreDetail(sel, x, w, detailTop);
    else if (isModule(sel.typeId)) this.renderModuleDetail(sel, x, w, detailTop);
    else if (isChemical(sel.typeId)) this.renderChemicalDetail(sel, x, w, detailTop);
    else if (isGacha(sel.typeId)) this.renderGachaDetail(sel, x, w, detailTop);
  }

  private renderGachaDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const category = isCodeGacha(it.typeId) ? 'code' : 'module';
    const note =
      category === 'code'
        ? 'アイテムコード 3 種から 1 つを獲得します。'
        : 'モジュール 3 種から 1 つを獲得します。';
    this.dyn.push(
      this.add
        .text(x + 16, top, note, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4)
    );
    this.makeActionButton(x + 16, top + 70, w - 32, '▶ 開封する', COLORS.accent, () => {
      this.openGacha(it);
    });
  }

  /** ガチャ開封シーンを launch する。閉じたら refresh + onChanged。 */
  private openGacha(it: ItemInstance): void {
    this.scene.launch('GachaOpenScene', {
      gacha: it,
      inventory: this.inventory,
      onClosed: () => {
        this.selectedUid = null;
        this.confirmingUse = false;
        this.onChanged();
        this.render();
      },
    });
    this.scene.bringToTop('GachaOpenScene');
  }

  private renderCoreDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const core = OMNI_CORE_TYPES[it.typeId]!;
    this.dyn.push(
      this.add
        .text(x + 16, top, `${core.descJa}\n\n効果: +${omniCorePercent(it.typeId, it.rarity)}%`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4),
      this.add
        .text(x + 16, top + 96, '所持しているだけで常時有効。\n同種コアの効果は加算で重なる。', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
          lineSpacing: 4,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4)
    );
  }

  private renderModuleDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const mod = MODULE_TYPES[it.typeId]!;
    this.dyn.push(
      this.add
        .text(x + 16, top, `${mod.descJa}\n\n${moduleEffectText(it.typeId, it.rarity)}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4)
    );
    this.renderModuleActions(it, x + 16, top + 84, w - 32);
  }

  private renderChemicalDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const chem = CHEMICAL_TYPES[it.typeId]!;
    this.dyn.push(
      this.add
        .text(x + 16, top, `${chem.descJa}\n\n効果: ${chemicalEffectText(it.typeId, it.rarity)}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4)
    );

    const ax = x + 16;
    const aw = w - 32;
    let ay = top + 90;
    if (this.confirmingUse) {
      this.dyn.push(
        this.add
          .text(ax, ay, '使用すると消費されます。', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
          })
          .setDepth(4)
      );
      ay += 22;
      this.makeActionButton(ax, ay, aw, '使用する', COLORS.accent, () => {
        this.consumeChemical(it);
      });
      this.makeActionButton(ax, ay + 34, aw, 'やめる', COLORS.uiDim, () => {
        this.confirmingUse = false;
        this.render();
      });
    } else {
      this.makeActionButton(ax, ay, aw, '▶ 使用する', COLORS.accent, () => {
        this.confirmingUse = true;
        this.render();
      });
    }
  }

  /** モジュールの装着 / 取り外し操作 UI。 */
  private renderModuleActions(it: ItemInstance, x: number, y: number, w: number): void {
    const idx = this.equippedShipIndex(it.uid);
    if (idx >= 0) {
      this.dyn.push(
        this.add
          .text(x, y, `装着中: 宇宙船 #${idx + 1}`, {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#3ee0c5',
          })
          .setDepth(4)
      );
      this.makeActionButton(x, y + 22, w, '取り外す', COLORS.enemy, () => {
        this.detachModule(it.uid);
      });
      return;
    }

    const ships = this.getShips();
    if (ships.length === 0) {
      this.dyn.push(
        this.add
          .text(x, y, '装着できる宇宙船がありません\n(先に宇宙船を購入してください)', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
            lineSpacing: 4,
          })
          .setDepth(4)
      );
      return;
    }

    this.dyn.push(
      this.add
        .text(x, y, '装着先を選択:', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
        })
        .setDepth(4)
    );
    let by = y + 22;
    ships.forEach((s, i) => {
      this.makeActionButton(x, by, w, `宇宙船 #${i + 1} に装着`, COLORS.ally, () => {
        this.attachModule(it.uid, s.id);
      });
      by += 32;
    });
  }

  // ─── アイテム操作 ──────────────────────────────────────────

  private equippedShipIndex(uid: string): number {
    const ships = this.getShips();
    for (let i = 0; i < ships.length; i++) {
      if ((this.inventory.shipModules[ships[i]!.id] ?? []).includes(uid)) return i;
    }
    return -1;
  }

  private attachModule(uid: string, shipId: string): void {
    this.detachUid(uid); // 排他: 他 Ship から外してから装着
    const list = this.inventory.shipModules[shipId] ?? [];
    list.push(uid);
    this.inventory.shipModules[shipId] = list;
    this.onChanged();
    this.render();
  }

  private detachModule(uid: string): void {
    this.detachUid(uid);
    this.onChanged();
    this.render();
  }

  /** uid を全 Ship の装着リストから取り除く。 */
  private detachUid(uid: string): void {
    for (const id of Object.keys(this.inventory.shipModules)) {
      const list = this.inventory.shipModules[id];
      if (!list) continue;
      const next = list.filter((u) => u !== uid);
      if (next.length > 0) this.inventory.shipModules[id] = next;
      else delete this.inventory.shipModules[id];
    }
  }

  /** ケミカルを使用 (効果適用 + インベントリから消費)。 */
  private consumeChemical(it: ItemInstance): void {
    this.useChemicalCb(it.typeId, it.rarity);
    this.inventory.items = this.inventory.items.filter((i) => i.uid !== it.uid);
    this.selectedUid = null;
    this.confirmingUse = false;
    this.onChanged();
    this.render();
  }

  // ─── デバッグ獲得行 ────────────────────────────────────────

  private makeDebugRow(): void {
    const y = this.cardTop + this.cardH - 38;
    this.chrome.push(
      this.add
        .text(this.cardLeft + 24, y, 'DEBUG 獲得 (選択中カテゴリ):', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        })
        .setOrigin(0, 0.5)
        .setDepth(3)
    );
    let x = this.cardLeft + 244;
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
      this.debugGrant(rarity);
    });
    this.chrome.push(bg, t);
  }

  /** 選択中カテゴリのアイテムを 1 個獲得する (全カテゴリ対応)。 */
  private debugGrant(rarity: Rarity): void {
    let granted: ItemInstance | null = null;
    if (this.selectedCategory === 'omniCore') granted = makeRandomOmniCore(rarity);
    else if (this.selectedCategory === 'module') granted = makeRandomModule(rarity);
    else if (this.selectedCategory === 'chemical') granted = makeRandomChemical(rarity);
    else if (this.selectedCategory === 'codeGacha') granted = makeGachaItem('code', rarity);
    else if (this.selectedCategory === 'moduleGacha') granted = makeGachaItem('module', rarity);
    if (!granted) return;
    this.inventory.items.push(granted);
    this.selectedUid = granted.uid;
    this.confirmingUse = false;
    this.onChanged();
    this.render();
  }

  // ─── 共通 ──────────────────────────────────────────────────

  private makeActionButton(
    x: number,
    y: number,
    w: number,
    label: string,
    accent: number,
    onClick: () => void
  ): void {
    const h = 30;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(1, accent, 0.85)
      .setDepth(4)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '13px',
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

  // ─── 六角ヘルパ (詳細ヒーロー用) ──────────────────

  private drawHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, alpha: number): void {
    g.fillStyle(color, alpha);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }

  private strokeHex(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number, width: number): void {
    g.lineStyle(width, color, 1);
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.strokePath();
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
    for (const c of this.dynCards) c.destroy();
    for (const g of this.chrome) g.destroy();
    this.dyn = [];
    this.dynCards = [];
    this.chrome = [];
  }
}
