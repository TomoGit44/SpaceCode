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

const IMPLEMENTED: ReadonlyArray<ItemCategory> = ['omniCore', 'module', 'chemical', 'codeGacha', 'moduleGacha'];

/**
 * アイテム一覧オーバーレイ。
 *
 * GameScene を pause せずに並行 active で起動する (ProgramEditorScene と同じパターン)。
 * 左: カテゴリタブ / 中央: 所持アイテム一覧 / 右: 選択アイテムの詳細・操作。
 *
 * Phase 6 Step 4 時点: オムニ・コア + モジュール + ケミカルに対応。ガチャは後続。
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
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private escHandler?: () => void;

  private cardLeft = 0;
  private cardTop = 0;
  private readonly cardW = 980;
  private readonly cardH = 560;

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
        .rectangle(x + w / 2, y + 19, w, 38, selected ? COLORS.accent : COLORS.panelBg, selected ? 0.28 : 1)
        .setStrokeStyle(1, selected ? COLORS.accent : COLORS.panelBorder, selected ? 1 : 0.8)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + 12, y + 19, cat.label, {
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
        this.confirmingUse = false;
        this.render();
      });
      this.dyn.push(bg, label);
      y += 46;
    }
  }

  /** 中央: 選択カテゴリの所持アイテム一覧。 */
  private renderList(): void {
    const x = this.cardLeft + 24 + 170 + 16;
    const w = 480;
    const top = this.cardTop + 60;

    if (!IMPLEMENTED.includes(this.selectedCategory)) {
      this.addCenterNote(x + w / 2, top + 80, 'このカテゴリのアイテムは後のステップで実装予定です');
      return;
    }
    const items = this.categoryItems();
    if (items.length === 0) {
      this.addCenterNote(x + w / 2, top + 80, 'このカテゴリのアイテムを所持していません');
      return;
    }

    let y = top;
    for (const it of items) {
      this.makeItemRow(it, x, y, w);
      y += 48;
      if (y + 42 > this.cardTop + this.cardH - 56) break; // 下端のデバッグ行を侵食しない
    }
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

  private makeItemRow(it: ItemInstance, x: number, y: number, w: number): void {
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
      this.confirmingUse = false;
      this.render();
    });

    const badge = this.add
      .text(x + 14, y + 20, RARITY_SHORT[it.rarity], {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#' + rc.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    const nameText = this.add
      .text(x + 52, y + 20, this.displayName(it.typeId), {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#cfd6e6',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    this.dyn.push(bg, badge, nameText);

    // 右側: カテゴリ別の補助表示
    let sub = '';
    let subColor = '#6b7da0';
    if (isModule(it.typeId)) {
      const idx = this.equippedShipIndex(it.uid);
      sub = idx >= 0 ? `→ 宇宙船 #${idx + 1}` : '未装着';
      subColor = idx >= 0 ? '#3ee0c5' : '#6b7da0';
    } else if (isOmniCore(it.typeId)) {
      sub = `+${omniCorePercent(it.typeId, it.rarity)}%`;
      subColor = '#3ee0c5';
    } else if (isChemical(it.typeId)) {
      sub = '使い切り';
    } else if (isGacha(it.typeId)) {
      sub = '未開封';
      subColor = '#3ee0c5';
    }
    this.dyn.push(
      this.add
        .text(x + w - 14, y + 20, sub, {
          fontFamily: FONT,
          fontSize: '12px',
          color: subColor,
        })
        .setOrigin(1, 0.5)
        .setDepth(3)
    );
  }

  /** 右: 選択アイテムの詳細とアクション。 */
  private renderDetail(): void {
    const x = this.cardLeft + this.cardW - 24 - 240;
    const w = 240;
    const top = this.cardTop + 60;

    this.dyn.push(
      this.add
        .rectangle(x + w / 2, top + 175, w, 350, COLORS.panelBg, 0.6)
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
          .text(x + w / 2, top + 165, 'アイテムを選択', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    const rc = RARITY_COLOR[sel.rarity];
    this.dyn.push(
      this.add
        .text(x + 16, top + 18, this.displayName(sel.typeId), {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(3),
      this.add
        .text(x + 16, top + 46, RARITY_LABEL[sel.rarity], {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setDepth(3)
    );

    if (isOmniCore(sel.typeId)) this.renderCoreDetail(sel, x, w, top);
    else if (isModule(sel.typeId)) this.renderModuleDetail(sel, x, w, top);
    else if (isChemical(sel.typeId)) this.renderChemicalDetail(sel, x, w, top);
    else if (isGacha(sel.typeId)) this.renderGachaDetail(sel, x, w, top);
  }

  private renderGachaDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const category = isCodeGacha(it.typeId) ? 'code' : 'module';
    const note =
      category === 'code'
        ? 'アイテムコード 3 種から 1 つを獲得します。\n選択肢のレア度はガチャのレア度に従って決まります。'
        : 'モジュール 3 種から 1 つを獲得します。\n選択肢のレア度はガチャのレア度に従って決まります。';
    this.dyn.push(
      this.add
        .text(x + 16, top + 80, note, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          lineSpacing: 6,
          wordWrap: { width: w - 32 },
        })
        .setDepth(3)
    );
    this.makeActionButton(x + 16, top + 188, w - 32, '開封する', COLORS.accent, () => {
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
        .text(x + 16, top + 80, `${core.descJa}\n+${omniCorePercent(it.typeId, it.rarity)}%`, {
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

  private renderModuleDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const mod = MODULE_TYPES[it.typeId]!;
    this.dyn.push(
      this.add
        .text(x + 16, top + 80, `${mod.descJa}\n\n${moduleEffectText(it.typeId, it.rarity)}`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          lineSpacing: 6,
          wordWrap: { width: w - 32 },
        })
        .setDepth(3)
    );
    this.renderModuleActions(it, x + 16, top + 178, w - 32);
  }

  private renderChemicalDetail(it: ItemInstance, x: number, w: number, top: number): void {
    const chem = CHEMICAL_TYPES[it.typeId]!;
    this.dyn.push(
      this.add
        .text(x + 16, top + 80, `${chem.descJa}\n\n効果: ${chemicalEffectText(it.typeId, it.rarity)}`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          lineSpacing: 6,
          wordWrap: { width: w - 32 },
        })
        .setDepth(3)
    );

    const ax = x + 16;
    const aw = w - 32;
    let ay = top + 188;
    if (this.confirmingUse) {
      this.dyn.push(
        this.add
          .text(ax, ay, '使用すると消費されます。', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#6b7da0',
          })
          .setDepth(3)
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
      this.makeActionButton(ax, ay, aw, '使用する', COLORS.accent, () => {
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
            fontSize: '13px',
            color: '#3ee0c5',
          })
          .setDepth(3)
      );
      this.makeActionButton(x, y + 26, w, '取り外す', COLORS.enemy, () => {
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
            fontSize: '12px',
            color: '#6b7da0',
            lineSpacing: 5,
          })
          .setDepth(3)
      );
      return;
    }

    this.dyn.push(
      this.add
        .text(x, y, '装着先を選択:', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
        })
        .setDepth(3)
    );
    let by = y + 24;
    ships.forEach((s, i) => {
      this.makeActionButton(x, by, w, `宇宙船 #${i + 1} に装着`, COLORS.ally, () => {
        this.attachModule(it.uid, s.id);
      });
      by += 34;
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

  private addCenterNote(cx: number, cy: number, text: string): void {
    this.dyn.push(
      this.add
        .text(cx, cy, text, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#6b7da0',
          align: 'center',
          wordWrap: { width: 440 },
        })
        .setOrigin(0.5, 0)
        .setDepth(3)
    );
  }

  private makeActionButton(
    x: number,
    y: number,
    w: number,
    label: string,
    accent: number,
    onClick: () => void
  ): void {
    const h = 28;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(1, accent, 0.8)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(4);
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
