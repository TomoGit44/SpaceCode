import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SHIP } from '../config';
import type { Ship } from '../entities/Ship';
import type { Inventory } from '../items/Inventory';
import type { EffectSystem } from '../items/effects';
import {
  type Rarity,
  type ItemInstance,
  ALL_RARITIES,
  RARITY_SHORT,
  RARITY_COLOR,
} from '../items/itemTypes';
import {
  MODULE_TYPES,
  isModule,
  moduleEffectLines,
  makeRandomModule,
} from '../items/types/modules';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ShipListData {
  inventory: Inventory;
  /** 現在の生存 Ship を返す getter (GameScene が毎フレーム作る配列を返す)。 */
  getShips: () => Ship[];
  /** 装着構成変更時に GameScene が最大 stat 再計算 + バッジ更新する。 */
  onChanged: () => void;
  /**
   * 「プログラム編集」ボタンが押された時に、編集オーバーレイを本シーンの上に重ねて起動するよう
   * GameScene に依頼する。閉じた時に `onClosed` を呼んでもらい、本シーンを resume する。
   */
  onRequestEditProgram: (ship: Ship, onClosed: () => void) => void;
}

interface CardLiveRefs {
  ship: Ship;
  hpBar: Phaser.GameObjects.Rectangle;
  enBar: Phaser.GameObjects.Rectangle;
  inBar: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  enText: Phaser.GameObjects.Text;
  inText: Phaser.GameObjects.Text;
}

interface DetailLiveRefs {
  ship: Ship;
  hpText: Phaser.GameObjects.Text;
  enText: Phaser.GameObjects.Text;
  inText: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  enBar: Phaser.GameObjects.Rectangle;
  inBar: Phaser.GameObjects.Rectangle;
  stateText: Phaser.GameObjects.Text;
}

/**
 * 宇宙船一覧画面 (2026-05-27)。
 *
 * 旧モジュール画面 (ItemInventoryScene) を Pokemon Box 風の「船所持画面」に刷新。
 * 左に船グリッド (S1..SN)、右に選択船の詳細 + 装着モジュール + 所持モジュール一覧。
 *
 * 操作:
 *   - 船カードクリックで選択
 *   - モジュールチップを船カードへドラッグ → 装着 (既存装着があれば自動で移し替え)
 *   - 装着モジュールを下端「外す」ゾーンへドラッグ → 取り外し
 *   - 「プログラム編集」ボタンで編集オーバーレイを本シーンの上に重ねる
 *
 * GameScene を pause せず並行 active で起動する。
 */
export class ShipListScene extends Phaser.Scene {
  private inventory!: Inventory;
  private getShips!: () => Ship[];
  private onChanged!: () => void;
  private onRequestEditProgram!: (ship: Ship, onClosed: () => void) => void;

  private selectedShipId: string | null = null;

  private dyn: Phaser.GameObjects.GameObject[] = [];
  private chrome: Phaser.GameObjects.GameObject[] = [];

  private cardLiveRefs: CardLiveRefs[] = [];
  private detailLiveRefs: DetailLiveRefs | null = null;

  private shipCardBgs: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private detachZoneRect: Phaser.GameObjects.Rectangle | null = null;

  private escHandler?: () => void;

  /** ドロップ成功時の保留情報。drop イベントで設定し、続く dragend で実行する。 */
  private pendingDrop: { moduleUid: string; target: string } | null = null;

  /** シーンが破棄された後にコールバックが呼ばれた時の保護フラグ。 */
  private alive: boolean = true;
  /** プログラム編集オーバーレイ表示中フラグ (pause 中)。 */
  private editorOpen: boolean = false;

  /** 直近の船数とアイテム数。背景で変化したら再描画。 */
  private lastShipsKey: string = '';
  private lastItemsCount: number = -1;

  // レイアウト
  private cardLeft = 0;
  private cardTop = 0;
  private readonly cardW = 1180;
  private readonly cardH = 640;
  private colLeftX = 0;
  private colRightX = 0;
  private rightW = 0;
  private readonly leftW = 340;

  constructor() {
    super({ key: 'ShipListScene' });
  }

  init(data: ShipListData): void {
    this.inventory = data.inventory;
    this.getShips = data.getShips;
    this.onChanged = data.onChanged;
    this.onRequestEditProgram = data.onRequestEditProgram;
    this.selectedShipId = null;
    this.alive = true;
    this.editorOpen = false;
    this.pendingDrop = null;
    this.lastShipsKey = '';
    this.lastItemsCount = -1;
  }

  create(): void {
    this.cardLeft = (GAME_WIDTH - this.cardW) / 2;
    this.cardTop = (GAME_HEIGHT - this.cardH) / 2;
    this.colLeftX = this.cardLeft + 24;
    this.colRightX = this.colLeftX + this.leftW + 16;
    this.rightW = this.cardW - 24 - (this.colRightX - this.cardLeft);

    // バックドロップ
    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.55)
      .setDepth(0)
      .setInteractive();
    backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });
    this.chrome.push(backdrop);

    // メインカード
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
        .text(this.cardLeft + 24, this.cardTop + 16, '🚀 宇宙船一覧', {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(this.cardLeft + 188, this.cardTop + 22, 'SHIP COLLECTION', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(
          this.cardLeft + 24,
          this.cardTop + 42,
          'カードをクリックで選択 / モジュールをドラッグして船カードへドロップで装着',
          {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
          }
        )
        .setDepth(2)
    );

    this.makeCloseButton(this.cardLeft + this.cardW - 60, this.cardTop + 30);
    this.makeDebugRow();

    // ─── ドラッグ&ドロップ配線 ─────────────────────────────
    this.input.on(
      'drag',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
        const c = obj as Phaser.GameObjects.Container;
        c.x = dragX;
        c.y = dragY;
      }
    );
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      (obj as Phaser.GameObjects.Container).setDepth(100);
      this.highlightDropZones(true);
    });
    this.input.on(
      'drop',
      (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dropZone: Phaser.GameObjects.GameObject) => {
        const moduleUid = obj.getData('moduleUid') as string | undefined;
        const target = dropZone.getData('targetShipId') as string | undefined;
        if (moduleUid && target) {
          this.pendingDrop = { moduleUid, target };
        }
      }
    );
    this.input.on(
      'dragend',
      (_p: Phaser.Input.Pointer, _obj: Phaser.GameObjects.GameObject, dropped: boolean) => {
        this.highlightDropZones(false);
        if (dropped && this.pendingDrop) {
          const { moduleUid, target } = this.pendingDrop;
          this.pendingDrop = null;
          if (target === '__detach__') {
            this.detachModule(moduleUid);
          } else {
            this.attachModule(moduleUid, target);
          }
          return;
        }
        this.pendingDrop = null;
        // ドロップ失敗 = 元位置に戻すため再描画
        this.render();
      }
    );

    // ESC
    this.escHandler = () => {
      if (this.editorOpen) return; // 上にオーバーレイがある時は無視 (編集側 ESC が拾う)
      this.close();
    };
    this.input.keyboard?.on('keydown-ESC', this.escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.render();
  }

  update(): void {
    if (!this.alive || this.editorOpen) return;
    // 背景でゲームが進行している間、船の増減やアイテム獲得を検知して再描画。
    const ships = this.getShips();
    const key = ships.map((s) => s.id).join('|');
    if (key !== this.lastShipsKey || this.inventory.items.length !== this.lastItemsCount) {
      this.lastShipsKey = key;
      this.lastItemsCount = this.inventory.items.length;
      this.render();
      return;
    }
    this.updateLive();
  }

  // ─── render: 静的構造 ─────────────────────────────────────

  private render(): void {
    for (const g of this.dyn) g.destroy();
    this.dyn = [];
    this.cardLiveRefs = [];
    this.detailLiveRefs = null;
    this.shipCardBgs.clear();
    this.detachZoneRect = null;

    // 自動選択
    const ships = this.getShips();
    if (!this.selectedShipId && ships.length > 0) {
      this.selectedShipId = ships[0]!.id;
    }
    if (this.selectedShipId && !ships.some((s) => s.id === this.selectedShipId)) {
      this.selectedShipId = ships[0]?.id ?? null;
    }
    this.lastShipsKey = ships.map((s) => s.id).join('|');
    this.lastItemsCount = this.inventory.items.length;

    this.renderShipGrid();
    this.renderDetail();
  }

  /** 左カラム: 船グリッド (Pokemon Box 風 2 列カード)。各カードは drop zone を兼ねる。 */
  private renderShipGrid(): void {
    const x = this.colLeftX;
    const w = this.leftW;
    const top = this.cardTop + 72;
    const ships = this.getShips();

    this.dyn.push(
      this.add
        .text(x, top, '所持宇宙船', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(x + 90, top + 3, `${ships.length} 隻`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
        })
        .setDepth(2)
    );

    if (ships.length === 0) {
      this.dyn.push(
        this.add
          .rectangle(x + w / 2, top + 130, w, 200, COLORS.bgAlt, 0.4)
          .setStrokeStyle(1, COLORS.panelBorder, 0.5)
          .setDepth(2),
        this.add
          .text(x + w / 2, top + 130, '宇宙船がいません\n\n下のショップで購入してください', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#6b7da0',
            align: 'center',
            lineSpacing: 6,
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    const cols = 2;
    const cardW = 162;
    const cardH = 110;
    const gap = 8;
    const startX = x + 4;
    const startY = top + 28;
    const maxRows = 4;
    const maxCards = cols * maxRows;
    const visible = Math.min(ships.length, maxCards);
    for (let i = 0; i < visible; i++) {
      const s = ships[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap) + cardW / 2;
      const cy = startY + row * (cardH + gap) + cardH / 2;
      this.makeShipCard(s, cx, cy, cardW, cardH, i);
    }
    if (ships.length > maxCards) {
      this.dyn.push(
        this.add
          .text(
            x + w / 2,
            startY + maxRows * (cardH + gap) + 6,
            `… ほか ${ships.length - maxCards} 隻`,
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

  private makeShipCard(s: Ship, cx: number, cy: number, w: number, h: number, idx: number): void {
    const selected = s.id === this.selectedShipId;
    const moduleCount = (this.inventory.shipModules[s.id] ?? []).length;

    // 背景 (兼: drop zone)
    const bg = this.add
      .rectangle(cx, cy, w, h, selected ? COLORS.accent : COLORS.panelBg, selected ? 0.16 : 1)
      .setStrokeStyle(2, selected ? COLORS.accent : COLORS.panelBorder, selected ? 1 : 0.7)
      .setDepth(2)
      .setInteractive({ useHandCursor: true, dropZone: true });
    bg.setData('targetShipId', s.id);
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
    this.dyn.push(bg);
    this.shipCardBgs.set(s.id, bg);

    // 状態別の色分け (ダウン / スタール)
    const downedOrStalled = s.hp <= 0 || s.energy <= 0;
    const headColor = downedOrStalled ? '#ff4d5a' : selected ? '#3ee0c5' : '#cfd6e6';

    // S番号
    const sLabel = this.add
      .text(cx - w / 2 + 8, cy - h / 2 + 6, `S${idx + 1}`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: headColor,
        fontStyle: 'bold',
      })
      .setDepth(3);
    this.dyn.push(sLabel);

    // ship icon
    const iconG = this.add.graphics().setDepth(3);
    iconG.setPosition(cx + w / 2 - 28, cy - h / 2 + 20);
    this.drawShipIcon(iconG, 11);
    if (downedOrStalled) iconG.setAlpha(0.45);
    this.dyn.push(iconG);

    // モジュール数バッジ (右下)
    const badgeBg = this.add
      .rectangle(cx + w / 2 - 24, cy + h / 2 - 12, 36, 18, COLORS.bgAlt, 0.95)
      .setStrokeStyle(1, COLORS.accent, moduleCount > 0 ? 0.9 : 0.4)
      .setDepth(3);
    const badgeText = this.add
      .text(cx + w / 2 - 24, cy + h / 2 - 12, `M${moduleCount}`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: moduleCount > 0 ? '#3ee0c5' : '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(4);
    this.dyn.push(badgeBg, badgeText);

    // 3 バー (HP / EN / IN)
    const barX = cx - w / 2 + 10;
    const barW = w - 20;
    const barTop = cy - h / 2 + 36;
    const barH = 4;
    const barGap = 14;

    const hpText = this.add
      .text(barX, barTop, '', { fontFamily: FONT, fontSize: '9px', color: '#cfd6e6' })
      .setDepth(4);
    const hpBarBg = this.add
      .rectangle(barX, barTop + 10, barW, barH, COLORS.bg, 0.8)
      .setOrigin(0, 0)
      .setDepth(3);
    const hpBar = this.add
      .rectangle(barX, barTop + 10, barW, barH, COLORS.enemy, 1)
      .setOrigin(0, 0)
      .setDepth(4);

    const enText = this.add
      .text(barX, barTop + barGap + 2, '', { fontFamily: FONT, fontSize: '9px', color: '#cfd6e6' })
      .setDepth(4);
    const enBarBg = this.add
      .rectangle(barX, barTop + barGap + 12, barW, barH, COLORS.bg, 0.8)
      .setOrigin(0, 0)
      .setDepth(3);
    const enBar = this.add
      .rectangle(barX, barTop + barGap + 12, barW, barH, COLORS.ally, 1)
      .setOrigin(0, 0)
      .setDepth(4);

    const inText = this.add
      .text(barX, barTop + barGap * 2 + 4, '', { fontFamily: FONT, fontSize: '9px', color: '#cfd6e6' })
      .setDepth(4);
    const inBarBg = this.add
      .rectangle(barX, barTop + barGap * 2 + 14, barW, barH, COLORS.bg, 0.8)
      .setOrigin(0, 0)
      .setDepth(3);
    const inBar = this.add
      .rectangle(barX, barTop + barGap * 2 + 14, barW, barH, COLORS.resource, 1)
      .setOrigin(0, 0)
      .setDepth(4);

    this.dyn.push(hpText, hpBarBg, hpBar, enText, enBarBg, enBar, inText, inBarBg, inBar);

    // 初期値設定
    hpText.setText(`HP ${Math.ceil(s.hp)}/${s.maxHp}`);
    enText.setText(`EN ${Math.ceil(s.energy)}/${s.maxEnergy}`);
    inText.setText(`IN ${Math.floor(s.inventory)}/${s.inventoryCap}`);
    hpBar.scaleX = Math.max(0, s.hp / s.maxHp);
    enBar.scaleX = Math.max(0, s.energy / s.maxEnergy);
    inBar.scaleX = s.inventoryCap > 0 ? Math.min(1, s.inventory / s.inventoryCap) : 0;

    this.cardLiveRefs.push({ ship: s, hpBar, enBar, inBar, hpText, enText, inText });
  }

  /** 右カラム: 選択中船の詳細パネル (大アイコン + ステータス + 装着 + 所持 + 編集ボタン)。 */
  private renderDetail(): void {
    const x = this.colRightX;
    const w = this.rightW;
    const top = this.cardTop + 72;
    const ship = this.getShips().find((s) => s.id === this.selectedShipId) ?? null;

    if (!ship) {
      this.dyn.push(
        this.add
          .text(x + w / 2, top + 80, '左の宇宙船カードを選択してください', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      // 船が居ない時でも所持モジュールと検出ゾーンは表示しておく
      this.renderOwnedModulesPanel(x, w, top + 145, null);
      this.renderDetachZone(x, w);
      return;
    }

    const idx = this.getShips().indexOf(ship);
    const effects = this.findEffectSystem();

    // ─── ヘッダ: S番号 + 大アイコン + 状態 + プログラム編集ボタン ─────
    const headerY = top;
    this.dyn.push(
      this.add
        .text(x, headerY, `S${idx + 1}`, {
          fontFamily: FONT,
          fontSize: '24px',
          color: '#3ee0c5',
          fontStyle: 'bold',
        })
        .setDepth(2)
    );
    const headIcon = this.add.graphics().setDepth(3);
    headIcon.setPosition(x + 64, headerY + 16);
    this.drawShipIcon(headIcon, 18);
    this.dyn.push(headIcon);

    const stateText = this.add
      .text(x + 100, headerY + 10, this.translateState(ship.state), {
        fontFamily: FONT,
        fontSize: '12px',
        color: ship.hp <= 0 || ship.energy <= 0 ? '#ff4d5a' : '#9aa4ba',
        fontStyle: 'bold',
      })
      .setDepth(3);
    this.dyn.push(stateText);

    // プログラム編集ボタン (右上)
    const editBtnW = 200;
    const editBtnH = 36;
    this.makePrimaryButton(
      x + w - editBtnW,
      headerY,
      editBtnW,
      editBtnH,
      '📝 プログラムを編集',
      () => this.requestEditProgram(ship)
    );

    // ─── ステータス (HP/ENE/INV バー + 攻撃力/移動速度/採掘速度) ─────
    const statTop = headerY + 50;
    const halfW = (w - 12) / 2;

    const hpText = this.add.text(x, statTop, '', { fontFamily: FONT, fontSize: '12px', color: '#cfd6e6' }).setDepth(3);
    const hpBarBg = this.add.rectangle(x, statTop + 18, halfW, 6, COLORS.bg, 0.85).setOrigin(0, 0).setDepth(3);
    const hpBar = this.add.rectangle(x, statTop + 18, halfW, 6, COLORS.enemy, 1).setOrigin(0, 0).setDepth(4);

    const enText = this.add
      .text(x + halfW + 12, statTop, '', { fontFamily: FONT, fontSize: '12px', color: '#cfd6e6' })
      .setDepth(3);
    const enBarBg = this.add
      .rectangle(x + halfW + 12, statTop + 18, halfW, 6, COLORS.bg, 0.85)
      .setOrigin(0, 0)
      .setDepth(3);
    const enBar = this.add
      .rectangle(x + halfW + 12, statTop + 18, halfW, 6, COLORS.ally, 1)
      .setOrigin(0, 0)
      .setDepth(4);

    const inText = this.add
      .text(x, statTop + 32, '', { fontFamily: FONT, fontSize: '12px', color: '#cfd6e6' })
      .setDepth(3);
    const inBarBg = this.add.rectangle(x, statTop + 50, halfW, 6, COLORS.bg, 0.85).setOrigin(0, 0).setDepth(3);
    const inBar = this.add.rectangle(x, statTop + 50, halfW, 6, COLORS.resource, 1).setOrigin(0, 0).setDepth(4);

    this.dyn.push(hpText, hpBarBg, hpBar, enText, enBarBg, enBar, inText, inBarBg, inBar);

    this.detailLiveRefs = { ship, hpText, enText, inText, hpBar, enBar, inBar, stateText };

    // 攻撃力 / 移動速度 / 採掘速度 (effects 反映)。テキストのみ。
    if (effects) {
      const dmg = effects.shipStat(ship, 'damagePerShot', SHIP.damagePerShot);
      const mv = effects.shipStat(ship, 'moveSpeed', SHIP.moveSpeed);
      const mr = effects.shipStat(ship, 'mineRate', SHIP.mineRate);
      const extra = effects.shipExtraShots(ship);
      const contactDps = effects.shipContactDps(ship);
      const bombDmg = effects.shipBombDamage(ship);

      const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9aa4ba',
      };
      const valStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      };

      const sy = statTop + 64;
      this.dyn.push(
        this.add.text(x, sy, '攻撃力', labelStyle).setDepth(3),
        this.add
          .text(x + 64, sy, `${formatNum(dmg)}${extra > 0 ? ` ×${1 + extra}` : ''}`, valStyle)
          .setDepth(3),
        this.add.text(x + halfW + 12, sy, '移動速度', labelStyle).setDepth(3),
        this.add.text(x + halfW + 76, sy, formatNum(mv), valStyle).setDepth(3),
        this.add.text(x, sy + 18, '採掘速度', labelStyle).setDepth(3),
        this.add.text(x + 64, sy + 18, formatNum(mr), valStyle).setDepth(3)
      );
      if (contactDps > 0) {
        this.dyn.push(
          this.add.text(x + halfW + 12, sy + 18, '体当たり', labelStyle).setDepth(3),
          this.add.text(x + halfW + 76, sy + 18, `${formatNum(contactDps)} DPS`, valStyle).setDepth(3)
        );
      }
      if (bombDmg > 0) {
        this.dyn.push(
          this.add.text(x, sy + 36, 'ボム威力', labelStyle).setDepth(3),
          this.add.text(x + 64, sy + 36, formatNum(bombDmg), valStyle).setDepth(3)
        );
      }
    }

    // ─── 装着モジュール ─────────────────────────────────────
    this.renderEquippedModules(x, w, top + 156, ship);

    // ─── 所持モジュール一覧 ─────────────────────────────────
    this.renderOwnedModulesPanel(x, w, top + 270, ship);

    // ─── 「外す」ドロップゾーン ──────────────────────────────
    this.renderDetachZone(x, w);
  }

  private renderEquippedModules(x: number, w: number, y: number, ship: Ship): void {
    this.dyn.push(
      this.add
        .text(x, y, '装着中モジュール', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2)
    );
    const equipped = (this.inventory.shipModules[ship.id] ?? [])
      .map((uid) => this.inventory.items.find((it) => it.uid === uid))
      .filter((it): it is ItemInstance => !!it && isModule(it.typeId));

    this.dyn.push(
      this.add
        .text(x + 140, y + 3, `${equipped.length} 個`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
        })
        .setDepth(2)
    );

    if (equipped.length === 0) {
      this.dyn.push(
        this.add
          .rectangle(x + w / 2, y + 50, w, 60, COLORS.bgAlt, 0.3)
          .setStrokeStyle(1, COLORS.panelBorder, 0.4)
          .setDepth(2),
        this.add
          .text(x + w / 2, y + 50, '装着なし — 下の所持モジュールを船カードへドラッグして装着', {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(3)
      );
      return;
    }

    // チップを 4 列 × 必要行数で並べる (drag source として使う)
    const chipW = Math.floor((w - 6 * 3) / 4);
    const chipH = 38;
    const cols = 4;
    let i = 0;
    for (const it of equipped) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = x + col * (chipW + 6) + chipW / 2;
      const cy = y + 26 + row * (chipH + 6) + chipH / 2;
      this.makeModuleChip(cx, cy, chipW, chipH, it, true);
      i++;
    }
  }

  private renderOwnedModulesPanel(x: number, w: number, y: number, ship: Ship | null): void {
    this.dyn.push(
      this.add
        .text(x, y, '所持モジュール (未装着)', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setDepth(2),
      this.add
        .text(x, y + 20, '船カードへドラッグして装着 / 下の「外す」エリアへドラッグで取り外し', {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#6b7da0',
        })
        .setDepth(2)
    );

    const equippedUids = new Set<string>();
    for (const list of Object.values(this.inventory.shipModules)) {
      for (const u of list ?? []) equippedUids.add(u);
    }
    const stock = this.inventory.items.filter(
      (it) => isModule(it.typeId) && !equippedUids.has(it.uid)
    );

    if (stock.length === 0) {
      this.dyn.push(
        this.add
          .rectangle(x + w / 2, y + 70, w, 80, COLORS.bgAlt, 0.3)
          .setStrokeStyle(1, COLORS.panelBorder, 0.4)
          .setDepth(2),
        this.add
          .text(x + w / 2, y + 70, '未装着モジュールなし\nガチャを引いて獲得しましょう', {
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

    // 4 列 × 3 行 = 12 visible
    const cols = 4;
    const chipW = Math.floor((w - 6 * (cols - 1)) / cols);
    const chipH = 38;
    const maxRows = 3;
    const maxChips = cols * maxRows;
    const visible = Math.min(stock.length, maxChips);
    const baseY = y + 40;
    for (let i = 0; i < visible; i++) {
      const it = stock[i]!;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = x + col * (chipW + 6) + chipW / 2;
      const cy = baseY + row * (chipH + 6) + chipH / 2;
      this.makeModuleChip(cx, cy, chipW, chipH, it, false);
      // ship が null の時は装着先がないので drag を抑止
      if (!ship) {
        // 既に作成済みのチップを取得して draggable を解除する経路は取らず、
        // makeModuleChip 内では常に draggable にし、drop 先がなければ snap back する。
      }
    }
    if (stock.length > maxChips) {
      this.dyn.push(
        this.add
          .text(
            x + w / 2,
            baseY + maxRows * (chipH + 6) + 4,
            `… ほか ${stock.length - maxChips} 件`,
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

  private renderDetachZone(x: number, w: number): void {
    const detachH = 38;
    const detachY = this.cardTop + this.cardH - 64;
    const bg = this.add
      .rectangle(x + w / 2, detachY + detachH / 2, w, detachH, COLORS.bgAlt, 0.5)
      .setStrokeStyle(1, COLORS.enemy, 0.5)
      .setDepth(2)
      .setInteractive({ dropZone: true });
    bg.setData('targetShipId', '__detach__');
    const label = this.add
      .text(x + w / 2, detachY + detachH / 2, '↓ ここにドロップして外す ↓', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ff4d5a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    this.dyn.push(bg, label);
    this.detachZoneRect = bg;
  }

  /** モジュールチップ (drag source)。equipped=true は装着中、false は在庫。 */
  private makeModuleChip(
    cx: number,
    cy: number,
    w: number,
    h: number,
    it: ItemInstance,
    equipped: boolean
  ): void {
    const mod = MODULE_TYPES[it.typeId]!;
    const rc = RARITY_COLOR[it.rarity];

    const container = this.add.container(cx, cy);
    container.setDepth(5);
    container.setSize(w, h);

    const bg = this.add
      .rectangle(0, 0, w, h, COLORS.panelBg, 0.95)
      .setStrokeStyle(1.5, rc, equipped ? 1 : 0.85);
    const rarityBadge = this.add
      .rectangle(-w / 2 + 14, 0, 22, h - 10, rc, 0.18)
      .setStrokeStyle(1, rc, 1);
    const rarityText = this.add
      .text(-w / 2 + 14, 0, RARITY_SHORT[it.rarity], {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#' + rc.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const name = this.add
      .text(-w / 2 + 30, -8, mod.nameJa, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const effect = this.add
      .text(-w / 2 + 30, 9, this.shortEffect(it), {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#3ee0c5',
      })
      .setOrigin(0, 0.5);
    container.add([bg, rarityBadge, rarityText, name, effect]);

    container.setInteractive({ draggable: true, useHandCursor: true });
    container.setData('moduleUid', it.uid);

    this.dyn.push(container);
  }

  /** 装着 (uid を ship に付ける。他船に付いていたら自動で外す)。 */
  private attachModule(uid: string, shipId: string): void {
    const item = this.inventory.items.find((it) => it.uid === uid);
    if (!item || !isModule(item.typeId)) {
      this.render();
      return;
    }
    // 既に同じ船に装着済みなら no-op (再描画で原位置に戻る)
    const current = this.inventory.shipModules[shipId] ?? [];
    if (current.includes(uid)) {
      this.render();
      return;
    }
    // 元の装着先から取り外す
    for (const id of Object.keys(this.inventory.shipModules)) {
      const list = this.inventory.shipModules[id];
      if (!list) continue;
      const next = list.filter((u) => u !== uid);
      if (next.length > 0) this.inventory.shipModules[id] = next;
      else delete this.inventory.shipModules[id];
    }
    const list = this.inventory.shipModules[shipId] ?? [];
    list.push(uid);
    this.inventory.shipModules[shipId] = list;
    this.onChanged();
    this.render();
  }

  private detachModule(uid: string): void {
    let changed = false;
    for (const id of Object.keys(this.inventory.shipModules)) {
      const list = this.inventory.shipModules[id];
      if (!list) continue;
      const next = list.filter((u) => u !== uid);
      if (next.length !== list.length) changed = true;
      if (next.length > 0) this.inventory.shipModules[id] = next;
      else delete this.inventory.shipModules[id];
    }
    if (changed) this.onChanged();
    this.render();
  }

  /** drag 中だけ船カードと「外す」ゾーンの枠色を強調。 */
  private highlightDropZones(active: boolean): void {
    for (const bg of this.shipCardBgs.values()) {
      const shipId = bg.getData('targetShipId') as string;
      const selected = shipId === this.selectedShipId;
      bg.setStrokeStyle(
        active ? 2.5 : 2,
        active ? COLORS.accent : selected ? COLORS.accent : COLORS.panelBorder,
        active ? 0.95 : selected ? 1 : 0.7
      );
    }
    if (this.detachZoneRect) {
      this.detachZoneRect.setStrokeStyle(active ? 2 : 1, COLORS.enemy, active ? 0.95 : 0.5);
      this.detachZoneRect.setFillStyle(COLORS.bgAlt, active ? 0.75 : 0.5);
    }
  }

  /** プログラム編集オーバーレイを開く (本シーンは pause して裏に残す)。 */
  private requestEditProgram(ship: Ship): void {
    if (this.editorOpen) return;
    this.editorOpen = true;
    this.scene.pause();
    this.onRequestEditProgram(ship, () => {
      this.editorOpen = false;
      if (!this.alive) return;
      this.scene.resume();
      // 編集中に program / stat が変わっている可能性があるので再描画
      this.render();
    });
  }

  // ─── live update (バー幅 + 数値テキスト) ───────────────────

  private updateLive(): void {
    for (const ref of this.cardLiveRefs) {
      const s = ref.ship;
      ref.hpText.setText(`HP ${Math.ceil(s.hp)}/${s.maxHp}`);
      ref.enText.setText(`EN ${Math.ceil(s.energy)}/${s.maxEnergy}`);
      ref.inText.setText(`IN ${Math.floor(s.inventory)}/${s.inventoryCap}`);
      ref.hpBar.scaleX = Math.max(0, s.hp / s.maxHp);
      ref.enBar.scaleX = Math.max(0, s.energy / s.maxEnergy);
      ref.inBar.scaleX = s.inventoryCap > 0 ? Math.min(1, s.inventory / s.inventoryCap) : 0;
    }
    if (this.detailLiveRefs) {
      const s = this.detailLiveRefs.ship;
      this.detailLiveRefs.hpText.setText(`HP   ${Math.ceil(s.hp)} / ${s.maxHp}`);
      this.detailLiveRefs.enText.setText(`ENE  ${Math.ceil(s.energy)} / ${s.maxEnergy}`);
      this.detailLiveRefs.inText.setText(`INV  ${Math.floor(s.inventory)} / ${s.inventoryCap}`);
      this.detailLiveRefs.hpBar.scaleX = Math.max(0, s.hp / s.maxHp);
      this.detailLiveRefs.enBar.scaleX = Math.max(0, s.energy / s.maxEnergy);
      this.detailLiveRefs.inBar.scaleX =
        s.inventoryCap > 0 ? Math.min(1, s.inventory / s.inventoryCap) : 0;
      this.detailLiveRefs.stateText.setText(this.translateState(s.state));
      this.detailLiveRefs.stateText.setColor(s.hp <= 0 || s.energy <= 0 ? '#ff4d5a' : '#9aa4ba');
    }
  }

  // ─── ヘルパ ───────────────────────────────────────────────

  /** Ship.drawBody の縮小版アイコン。画像アセット不使用。 */
  private drawShipIcon(g: Phaser.GameObjects.Graphics, r: number): void {
    g.clear();
    g.fillStyle(COLORS.ally, 0.2);
    g.fillCircle(0, 0, r + 3);
    g.fillStyle(COLORS.ally, 1);
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(-r * 0.55, -r * 0.6);
    g.lineTo(-r * 0.25, 0);
    g.lineTo(-r * 0.55, r * 0.6);
    g.closePath();
    g.fillPath();
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(r * 0.15, 0, r * 0.28);
    g.fillStyle(COLORS.highlight, 1);
    g.fillCircle(r * 0.15, 0, r * 0.1);
  }

  private shortEffect(it: ItemInstance): string {
    const lines = moduleEffectLines(it.typeId);
    return lines[0] ?? '';
  }

  private translateState(state: Ship['state']): string {
    switch (state) {
      case 'idle':
        return '● 待機';
      case 'moving':
        return '● 移動中';
      case 'mining':
        return '● 採掘中';
      case 'depositing':
        return '● 納品中';
      case 'stalled':
        return '⚠ エネルギー切れ';
      case 'downed':
        return '⚠ 大破 (HP 0)';
    }
  }

  private findEffectSystem(): EffectSystem | null {
    const gs = this.scene.get('GameScene') as Phaser.Scene & { effects?: EffectSystem };
    return gs.effects ?? null;
  }

  // ─── デバッグ獲得行 ────────────────────────────────────────

  private makeDebugRow(): void {
    const y = this.cardTop + this.cardH - 20;
    this.chrome.push(
      this.add
        .text(this.cardLeft + 24, y, 'DEBUG モジュール獲得:', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
        })
        .setOrigin(0, 0.5)
        .setDepth(3)
    );
    let x = this.cardLeft + 180;
    for (const r of ALL_RARITIES) {
      this.makeDebugButton(x, y, r);
      x += 60;
    }
  }

  private makeDebugButton(cx: number, cy: number, rarity: Rarity): void {
    const rc = RARITY_COLOR[rarity];
    const bg = this.add
      .rectangle(cx, cy, 50, 22, COLORS.panelBg, 1)
      .setStrokeStyle(1, rc, 0.9)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(cx, cy, RARITY_SHORT[rarity], {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#' + rc.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      const granted = makeRandomModule(rarity);
      if (!granted) return; // 該当 rarity のモジュールがなければ no-op
      this.inventory.items.push(granted);
      this.onChanged();
      this.render();
    });
    this.chrome.push(bg, t);
  }

  private makePrimaryButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void
  ): void {
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, 1)
      .setStrokeStyle(2, COLORS.accent, 0.9)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    const t = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '14px',
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
    this.alive = false;
    if (this.escHandler) {
      this.input.keyboard?.off('keydown-ESC', this.escHandler);
      this.escHandler = undefined;
    }
    for (const g of this.dyn) g.destroy();
    for (const g of this.chrome) g.destroy();
    this.dyn = [];
    this.chrome = [];
    this.cardLiveRefs = [];
    this.detailLiveRefs = null;
    this.shipCardBgs.clear();
  }
}

function formatNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.05) return `${Math.round(n)}`;
  return n.toFixed(1);
}
