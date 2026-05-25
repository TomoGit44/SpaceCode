import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SHIP } from '../config';
import type { Ship } from '../entities/Ship';
import type { Inventory } from '../items/Inventory';
import type { EffectSystem } from '../items/effects';
import {
  type Rarity,
  type ItemInstance,
  ALL_RARITIES,
  RARITY_LABEL,
  RARITY_SHORT,
  RARITY_COLOR,
} from '../items/itemTypes';
import {
  MODULE_TYPES,
  isModule,
  moduleEffectLines,
  makeRandomModule,
} from '../items/types/modules';
import { ItemCard } from '../ui/ItemCard';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ItemInventoryData {
  inventory: Inventory;
  /** 現在の生存 Ship を返す (GameScene が毎フレーム配列を作り直すため getter で渡す)。 */
  getShips: () => Ship[];
  /** 装着構成変更時に GameScene が最大 stat 再計算 + バッジ更新する。 */
  onChanged: () => void;
}

/**
 * モジュール画面 (2026-05-25 後リデザイン: 船 × モジュールマトリックス)。
 *
 * レイアウト (1140 × 600 カード内):
 *   ├─ 左 (220px): 船リスト + 各船の HP/ENE/INV/モジュール数バッジ
 *   ├─ 中央 (~560px): 全所持モジュールのグリッド (4 列)
 *   └─ 右 (~340px): 選択モジュール詳細 + 選択船に対する装着前後 stat プレビュー + 装着/取り外しボタン
 *
 * ケミカル / オムニコア / ガチャは扱わない (本シーンに残るのはモジュールのみ)。
 * GameScene を pause せず並行 active で起動する。
 */
export class ItemInventoryScene extends Phaser.Scene {
  private inventory!: Inventory;
  private getShips!: () => Ship[];
  private onChanged!: () => void;

  /** 装着対象として選択中の船 (null = 自動選択 = 先頭船)。 */
  private selectedShipId: string | null = null;
  /** 選択中モジュール (Inventory.items.uid)。 */
  private selectedUid: string | null = null;

  private dyn: Phaser.GameObjects.GameObject[] = [];
  private dynCards: ItemCard[] = [];
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private escHandler?: () => void;

  // 全体カードレイアウト
  private cardLeft = 0;
  private cardTop = 0;
  private readonly cardW = 1140;
  private readonly cardH = 600;

  // 3 カラム座標
  private colLeftX = 0;
  private colCenterX = 0;
  private colRightX = 0;
  private readonly leftW = 220;
  private readonly rightW = 340;

  constructor() {
    super({ key: 'ItemInventoryScene' });
  }

  init(data: ItemInventoryData): void {
    this.inventory = data.inventory;
    this.getShips = data.getShips;
    this.onChanged = data.onChanged;
    this.selectedShipId = null;
    this.selectedUid = null;
  }

  create(): void {
    this.cardLeft = (GAME_WIDTH - this.cardW) / 2;
    this.cardTop = (GAME_HEIGHT - this.cardH) / 2;
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

    this.chrome.push(
      this.add
        .text(this.cardLeft + 24, this.cardTop + 16, '🔧 モジュール', {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(this.cardLeft + 168, this.cardTop + 22, 'SHIP × MODULE MATRIX', {
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

  // ─── 描画 (3 カラム) ──────────────────────────────────────

  private render(): void {
    for (const g of this.dyn) g.destroy();
    for (const c of this.dynCards) c.destroy();
    this.dyn = [];
    this.dynCards = [];

    // 先頭船を自動選択 (まだ無選択かつ船が居れば)
    const ships = this.getShips();
    if (!this.selectedShipId && ships.length > 0) {
      this.selectedShipId = ships[0]!.id;
    }
    // 選択船が消えていたら解除
    if (this.selectedShipId && !ships.some((s) => s.id === this.selectedShipId)) {
      this.selectedShipId = ships[0]?.id ?? null;
    }

    this.renderShipColumn();
    this.renderModuleGrid();
    this.renderDetail();
  }

  /** 左: 船リスト。各エントリは選択中船をハイライト + 装着済みモジュール数バッジ + HP/ENE/INV mini bar。 */
  private renderShipColumn(): void {
    const x = this.colLeftX;
    const w = this.leftW;
    const top = this.cardTop + 60;

    this.dyn.push(
      this.add
        .text(x, this.cardTop + 28, '宇宙船', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2)
    );

    const ships = this.getShips();
    if (ships.length === 0) {
      this.dyn.push(
        this.add
          .rectangle(x + w / 2, top + 60, w, 100, COLORS.bgAlt, 0.4)
          .setStrokeStyle(1, COLORS.panelBorder, 0.5)
          .setDepth(2),
        this.add
          .text(x + w / 2, top + 60, '宇宙船がいません\n先に下のショップで購入', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
            align: 'center',
            lineSpacing: 4,
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    let y = top;
    const itemH = 76;
    ships.forEach((s, i) => {
      const selected = s.id === this.selectedShipId;
      const moduleCount = (this.inventory.shipModules[s.id] ?? []).length;
      // 背景
      const bg = this.add
        .rectangle(x + w / 2, y + itemH / 2, w, itemH, selected ? COLORS.accent : COLORS.panelBg, selected ? 0.16 : 1)
        .setStrokeStyle(1.5, selected ? COLORS.accent : COLORS.panelBorder, selected ? 1 : 0.6)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        if (!selected) bg.setFillStyle(COLORS.panelHover, 1);
      });
      bg.on('pointerout', () => {
        if (!selected) bg.setFillStyle(COLORS.panelBg, 1);
      });
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        this.selectedShipId = s.id;
        this.render();
      });

      // 選択バー (左 2px)
      if (selected) {
        this.dyn.push(
          this.add.rectangle(x, y + itemH / 2, 3, itemH - 4, COLORS.accent, 1).setOrigin(0, 0.5).setDepth(3)
        );
      }

      // ヘッダ: 船番号 + モジュール数バッジ
      const label = this.add
        .text(x + 14, y + 12, `S${i + 1}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: selected ? '#3ee0c5' : '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(3);
      const badge = this.add
        .rectangle(x + w - 20, y + 18, 32, 18, COLORS.bgAlt, 0.9)
        .setStrokeStyle(1, COLORS.accent, 0.6)
        .setDepth(3);
      const badgeText = this.add
        .text(x + w - 20, y + 18, `M${moduleCount}`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: moduleCount > 0 ? '#3ee0c5' : '#6b7da0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(4);

      // ミニバー: HP / ENE / INV
      const barX = x + 14;
      const barTop = y + 36;
      const barW = w - 28;
      const barH = 6;
      const barGap = 10;
      const hpRatio = Math.max(0, s.hp / s.maxHp);
      const eRatio = Math.max(0, s.energy / s.maxEnergy);
      const iRatio = s.inventoryCap > 0 ? Math.min(1, s.inventory / s.inventoryCap) : 0;
      this.drawMiniBar(barX, barTop, barW, barH, hpRatio, COLORS.enemy, 'HP');
      this.drawMiniBar(barX, barTop + barGap, barW, barH, eRatio, COLORS.ally, 'EN');
      this.drawMiniBar(barX, barTop + barGap * 2, barW, barH, iRatio, COLORS.resource, 'IN');

      this.dyn.push(bg, label, badge, badgeText);
      y += itemH + 8;
    });
  }

  /** ミニバー (左ラベル + バー + 数値テキストは省略、色で意味を示す)。 */
  private drawMiniBar(x: number, y: number, w: number, h: number, ratio: number, color: number, label: string): void {
    const labelText = this.add
      .text(x, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);
    const barX = x + 18;
    const barW = w - 18;
    const bg = this.add
      .rectangle(barX, y, barW, h, COLORS.bg, 0.85)
      .setOrigin(0, 0)
      .setDepth(3);
    const fg = this.add
      .rectangle(barX, y, Math.max(1, barW * ratio), h, color, 0.95)
      .setOrigin(0, 0)
      .setDepth(4);
    this.dyn.push(labelText, bg, fg);
  }

  /** 中央: モジュールグリッド (4 列 × N 行)。装着船バッジで配属を示す。 */
  private renderModuleGrid(): void {
    const gridLeft = this.colCenterX;
    const gridTop = this.cardTop + 60;
    const gridW = this.colRightX - gridLeft - 16;
    const cols = 4;
    const gap = 8;
    const cardW = Math.floor((gridW - gap * (cols - 1)) / cols);
    const cardH = 140;

    const items = this.inventory.items.filter((it) => isModule(it.typeId));
    this.dyn.push(
      this.add
        .text(gridLeft, this.cardTop + 28, '所持モジュール', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(gridLeft + 150, this.cardTop + 32, `${items.length} 件`, {
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
          .text(gridLeft + gridW / 2, gridTop + 120, 'モジュールを所持していません\n\nガチャを引いて獲得しましょう', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
            align: 'center',
            lineSpacing: 6,
            wordWrap: { width: 360 },
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    const maxRows = 3;
    const maxCards = cols * maxRows;
    const shipsList = this.getShips();
    for (let i = 0; i < Math.min(items.length, maxCards); i++) {
      const it = items[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridLeft + col * (cardW + gap) + cardW / 2;
      const y = gridTop + row * (cardH + gap) + cardH / 2;
      const equippedIdx = this.equippedShipIndex(it.uid, shipsList);
      const card = new ItemCard(this, x, y, {
        width: cardW,
        height: cardH,
        rarity: it.rarity,
        iconColor: COLORS.ally,
        name: MODULE_TYPES[it.typeId]?.nameJa ?? it.typeId,
        subtext: this.shortEffect(it),
        equippedBadge: equippedIdx >= 0 ? `S${equippedIdx + 1}` : null,
        selected: it.uid === this.selectedUid,
        depth: 3,
        onPointerDown: () => {
          this.selectedUid = it.uid;
          this.render();
        },
      });
      this.dynCards.push(card);
    }
    if (items.length > maxCards) {
      this.dyn.push(
        this.add
          .text(
            gridLeft + gridW / 2,
            gridTop + cardH * maxRows + gap * (maxRows - 1) + 12,
            `… ほか ${items.length - maxCards} 件`,
            {
              fontFamily: FONT,
              fontSize: '11px',
              color: '#6b7da0',
            }
          )
          .setOrigin(0.5)
          .setDepth(3)
      );
    }
  }

  /** モジュールカード下部のサブテキスト (最初の効果 1 行のみ)。 */
  private shortEffect(it: ItemInstance): string {
    const lines = moduleEffectLines(it.typeId, it.rarity);
    return lines[0] ?? '';
  }

  /** 右: 選択モジュール詳細 + 装着前後 stat プレビュー + アクション。 */
  private renderDetail(): void {
    const x = this.colRightX;
    const w = this.rightW;
    const top = this.cardTop + 60;
    const h = this.cardH - 60 - 56;

    this.dyn.push(
      this.add
        .rectangle(x + w / 2, top + h / 2, w, h, COLORS.bgAlt, 0.6)
        .setStrokeStyle(1, COLORS.panelBorder, 0.8)
        .setDepth(2)
    );

    const sel = this.selectedUid
      ? this.inventory.items.find((it) => it.uid === this.selectedUid)
      : undefined;
    if (!sel || !isModule(sel.typeId)) {
      this.dyn.push(
        this.add
          .text(x + w / 2, top + h / 2, 'モジュールを選択してください', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
            align: 'center',
            wordWrap: { width: w - 32 },
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    const mod = MODULE_TYPES[sel.typeId]!;
    const rc = RARITY_COLOR[sel.rarity];

    // ヘッダ: 名前 + Rarity
    this.dyn.push(
      this.add
        .text(x + 16, top + 14, mod.nameJa, {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#cfd6e6',
          fontStyle: 'bold',
          wordWrap: { width: w - 32 },
        })
        .setDepth(4),
      this.add
        .rectangle(x + w - 40, top + 22, 40, 18, rc, 0.18)
        .setStrokeStyle(1, rc, 1)
        .setDepth(4),
      this.add
        .text(x + w - 40, top + 22, RARITY_SHORT[sel.rarity], {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(5),
      this.add
        .text(x + 16, top + 42, RARITY_LABEL[sel.rarity], {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setDepth(4),
      // 説明
      this.add
        .text(x + 16, top + 62, mod.descJa, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
          lineSpacing: 4,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4),
      // 効果 (改行で並べる)
      this.add
        .text(x + 16, top + 108, '効果', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
          fontStyle: 'bold',
        })
        .setDepth(4),
      this.add
        .text(x + 16, top + 124, moduleEffectLines(sel.typeId, sel.rarity).join('\n'), {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#3ee0c5',
          fontStyle: 'bold',
          lineSpacing: 5,
          wordWrap: { width: w - 32 },
        })
        .setDepth(4)
    );

    // 装着前後 stat プレビュー
    const previewTop = top + 200;
    this.renderStatPreview(sel, x + 16, previewTop, w - 32);

    // アクションボタン
    this.renderModuleActions(sel, x + 16, top + h - 78, w - 32);
  }

  /**
   * 装着前後の stat プレビュー (選択中船に対して)。
   * 船が居なければ「先に船を選んでください」。
   * 装着済み (この船) なら「取り外し後」、未装着なら「装着後」を比較。
   */
  private renderStatPreview(it: ItemInstance, x: number, y: number, w: number): void {
    this.dyn.push(
      this.add
        .text(x, y, this.selectedShipId ? '装着プレビュー (選択中の船)' : '装着先', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
          fontStyle: 'bold',
        })
        .setDepth(4)
    );
    const ship = this.getShips().find((s) => s.id === this.selectedShipId) ?? null;
    if (!ship) {
      this.dyn.push(
        this.add
          .text(x, y + 18, '船を購入して左から選択してください', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
            wordWrap: { width: w },
          })
          .setDepth(4)
      );
      return;
    }

    // 一時的にモジュール装着構成を変えて effects.shipStat を再計算するヘルパ
    const effects = this.findEffectSystem();
    if (!effects) return;
    const idx = this.equippedShipIndex(it.uid, [ship]);
    const isOnThisShip = idx === 0;
    const before = computeShipStats(ship, effects);
    // 「もし切り替えたら」値: 装着なら追加、装着済みなら外す
    const after = withToggledModule(this.inventory, ship.id, it.uid, isOnThisShip, () =>
      computeShipStats(ship, effects)
    );

    const rows: Array<[string, number, number]> = [
      ['最大HP', before.maxHp, after.maxHp],
      ['最大エネ', before.maxEnergy, after.maxEnergy],
      ['積載量', before.inventoryCap, after.inventoryCap],
      ['攻撃力', before.damagePerShot, after.damagePerShot],
      ['移動速度', before.moveSpeed, after.moveSpeed],
    ];
    let ry = y + 18;
    for (const [label, b, a] of rows) {
      const diff = a - b;
      const diffStr =
        Math.abs(diff) < 0.05 ? '' : diff > 0 ? `  +${formatNum(diff)}` : `  ${formatNum(diff)}`;
      const diffColor = diff > 0 ? '#3ee0c5' : diff < 0 ? '#ff4d5a' : '#6b7da0';
      this.dyn.push(
        this.add
          .text(x, ry, label, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#cfd6e6',
          })
          .setDepth(4),
        this.add
          .text(x + 80, ry, formatNum(b), {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#cfd6e6',
          })
          .setDepth(4),
        this.add
          .text(x + 130, ry, '→', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
          })
          .setDepth(4),
        this.add
          .text(x + 150, ry, formatNum(a), {
            fontFamily: FONT,
            fontSize: '11px',
            color: diff !== 0 ? diffColor : '#cfd6e6',
            fontStyle: diff !== 0 ? 'bold' : 'normal',
          })
          .setDepth(4),
        this.add
          .text(x + 195, ry, diffStr, {
            fontFamily: FONT,
            fontSize: '11px',
            color: diffColor,
            fontStyle: 'bold',
          })
          .setDepth(4)
      );
      ry += 16;
    }
  }

  /**
   * GameScene の EffectSystem を取得する。
   * Inventory への参照は scene.scene.get('GameScene') 経由で辿らずに、
   * GameScene が effects を渡してくれていないので、自前で再構築して使う。
   * → ItemInventoryScene 単体で再構築せずに済むよう、GameScene 側で EffectSystem を
   *   data で渡すのが本来は綺麗だが、現状の onChanged コールバックで recomputeShipStats
   *   が実装上動くので、プレビューも GameScene の effects を参照する経路を取る。
   *
   * 暫定実装: GameScene の `effects` フィールドを scene.get で読み取る。
   */
  private findEffectSystem(): EffectSystem | null {
    const gs = this.scene.get('GameScene') as Phaser.Scene & { effects?: EffectSystem };
    return gs.effects ?? null;
  }

  private equippedShipIndex(uid: string, ships: ReadonlyArray<Ship>): number {
    for (let i = 0; i < ships.length; i++) {
      if ((this.inventory.shipModules[ships[i]!.id] ?? []).includes(uid)) return i;
    }
    return -1;
  }

  /** モジュール装着/取り外しボタン群 (選択船に対して)。 */
  private renderModuleActions(it: ItemInstance, x: number, y: number, w: number): void {
    const ships = this.getShips();
    if (ships.length === 0) {
      this.dyn.push(
        this.add
          .text(x, y, '船がいないため装着できません', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
          })
          .setDepth(4)
      );
      return;
    }

    const targetShip = ships.find((s) => s.id === this.selectedShipId) ?? null;
    if (!targetShip) return;
    const equippedOnTarget = (this.inventory.shipModules[targetShip.id] ?? []).includes(it.uid);
    const equippedOnAnyOther = this.equippedShipIndex(it.uid, ships) >= 0 && !equippedOnTarget;
    const targetIdx = ships.indexOf(targetShip);

    if (equippedOnTarget) {
      this.makeActionButton(x, y, w, `S${targetIdx + 1} から取り外す`, COLORS.enemy, () => {
        this.detachModule(it.uid);
      });
    } else if (equippedOnAnyOther) {
      const otherIdx = this.equippedShipIndex(it.uid, ships);
      this.makeActionButton(
        x,
        y,
        w,
        `S${otherIdx + 1} → S${targetIdx + 1} に移し替える`,
        COLORS.accent,
        () => this.attachModule(it.uid, targetShip.id)
      );
    } else {
      this.makeActionButton(x, y, w, `S${targetIdx + 1} に装着`, COLORS.ally, () => {
        this.attachModule(it.uid, targetShip.id);
      });
    }
  }

  private attachModule(uid: string, shipId: string): void {
    this.detachUid(uid);
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

  private detachUid(uid: string): void {
    for (const id of Object.keys(this.inventory.shipModules)) {
      const list = this.inventory.shipModules[id];
      if (!list) continue;
      const next = list.filter((u) => u !== uid);
      if (next.length > 0) this.inventory.shipModules[id] = next;
      else delete this.inventory.shipModules[id];
    }
  }

  // ─── デバッグ獲得行 ────────────────────────────────────────

  private makeDebugRow(): void {
    const y = this.cardTop + this.cardH - 38;
    this.chrome.push(
      this.add
        .text(this.cardLeft + 24, y, 'DEBUG モジュール獲得:', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        })
        .setOrigin(0, 0.5)
        .setDepth(3)
    );
    let x = this.cardLeft + 200;
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

  private debugGrant(rarity: Rarity): void {
    const granted = makeRandomModule(rarity);
    this.inventory.items.push(granted);
    this.selectedUid = granted.uid;
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
    const h = 36;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(1.5, accent, 0.9)
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

// ─── ヘルパ (本シーン内専用) ────────────────────────────────

interface ShipStatsSnapshot {
  maxHp: number;
  maxEnergy: number;
  inventoryCap: number;
  damagePerShot: number;
  moveSpeed: number;
}

function computeShipStats(ship: Ship, effects: EffectSystem): ShipStatsSnapshot {
  return {
    maxHp: effects.shipStat(ship, 'maxHp', SHIP.hp),
    maxEnergy: effects.shipStat(ship, 'maxEnergy', SHIP.energy),
    inventoryCap: effects.shipStat(ship, 'inventoryCap', SHIP.inventoryCap),
    damagePerShot: effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot),
    moveSpeed: effects.shipStat(ship, 'moveSpeed', SHIP.moveSpeed),
  };
}

/**
 * inventory.shipModules を一時的に切り替えて compute を実行し、必ず元に戻す。
 * プレビュー用 (実装着はしない)。
 *
 * - `isOnShip=true`: その船から uid を外した状態で compute
 * - `isOnShip=false`: その船に uid を一時追加した状態で compute
 */
function withToggledModule<T>(
  inv: Inventory,
  shipId: string,
  uid: string,
  isOnShip: boolean,
  compute: () => T
): T {
  const snapshot: Record<string, string[]> = {};
  for (const k of Object.keys(inv.shipModules)) {
    snapshot[k] = [...(inv.shipModules[k] ?? [])];
  }
  try {
    if (isOnShip) {
      // この船から外し、他船にも一切付いていない状態にする
      for (const k of Object.keys(inv.shipModules)) {
        inv.shipModules[k] = (inv.shipModules[k] ?? []).filter((u) => u !== uid);
      }
    } else {
      // 他船から外し、この船に追加する
      for (const k of Object.keys(inv.shipModules)) {
        inv.shipModules[k] = (inv.shipModules[k] ?? []).filter((u) => u !== uid);
      }
      const list = inv.shipModules[shipId] ?? [];
      list.push(uid);
      inv.shipModules[shipId] = list;
    }
    return compute();
  } finally {
    // 元に戻す
    inv.shipModules = snapshot;
  }
}

function formatNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.05) return `${Math.round(n)}`;
  return n.toFixed(1);
}
