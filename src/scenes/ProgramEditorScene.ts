import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SHIP } from '../config';
import type { Ship } from '../entities/Ship';
import { Program } from '../program/Program';
import type { Code, CodeType } from '../program/Code';
import { createCode, codeChildren } from '../program/Code';
import { Executor } from '../program/Executor';
import { sampleCodes } from '../program/samples';
import { CodePalette, type ItemCodeEntry } from '../ui/CodePalette';
import { ProgramList } from '../ui/ProgramList';
import { CodeParamEditor } from '../ui/CodeParamEditor';
import type { Inventory } from '../items/Inventory';
import { ALL_RARITIES, RARITY_SHORT, RARITY_COLOR } from '../items/itemTypes';
import { MODULE_TYPES } from '../items/types/modules';
import {
  type ItemCodeType,
  ALL_ITEM_CODE_TYPES,
  ITEM_CODE_DEFS,
  createItemCodeNode,
  makeRandomItemCode,
} from '../items/types/itemCodes';
import {
  collectPlacedCodeUids,
  availableCodeCounts,
  pickUnplacedInstance,
} from '../items/codePlacement';
import type { EconomySystem } from '../systems/EconomySystem';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface ProgramEditorData {
  ship: Ship;
  /** アイテムコードの所持・残数算出に使う共有インベントリ。 */
  inventory: Inventory;
  /** 全 Ship を返す getter (残数のグローバル走査用)。 */
  getShips: () => Ship[];
  /** クレジット消費で補給/修理するため EconomySystem を渡す (2026-05-25)。 */
  economy: EconomySystem;
}

/** path 同値判定 */
function pathEquals(a: ReadonlyArray<number> | null, b: ReadonlyArray<number> | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Ship のプログラムを編集するオーバーレイシーン。
 *
 * GameScene を pause せずに並行 active で起動。
 *
 * Phase 5 後 (インライン階層編集):
 * REPEAT の中身は drill-in せず、その場でインデント表示する (Scratch 風)。
 * 編集対象を `selectedPath: number[]` (root 起点) で扱い、root scope/ ネスト内ともに
 * 同じハンドラで操作できる構造に刷新した。
 */
export class ProgramEditorScene extends Phaser.Scene {
  private targetShip!: Ship;
  private inventory!: Inventory;
  private getShips!: () => Ship[];
  private economy!: EconomySystem;
  private program!: Program;
  private executor: Executor | null = null;
  private selectedPath: number[] | null = null;

  private backdrop!: Phaser.GameObjects.Rectangle;
  private card!: Phaser.GameObjects.Rectangle;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private palette!: CodePalette;
  private list!: ProgramList;
  private paramEditor!: CodeParamEditor;
  private escHandler?: () => void;

  // レイアウト計算で使う領域
  private cardLeft: number = 0;
  private cardTop: number = 0;

  // 走行 path の前回値 (再描画判定用)
  private lastRunningPath: number[] | null = null;

  // 2026-05-25: 編集画面に持ち込んだ Ship ステータス UI / クレジット補給修理ボタン
  private statTexts: Phaser.GameObjects.Text[] = [];
  private statBtns: Phaser.GameObjects.GameObject[] = [];
  private warningText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: 'ProgramEditorScene' });
  }

  init(data: ProgramEditorData): void {
    this.targetShip = data.ship;
    this.inventory = data.inventory;
    this.getShips = data.getShips;
    this.economy = data.economy;
    this.selectedPath = null;
    this.executor = null;
    this.lastRunningPath = null;
    this.statTexts = [];
    this.statBtns = [];
    this.warningText = null;
  }

  create(): void {
    const program = this.targetShip.getProgram();
    if (!program) {
      this.scene.stop();
      return;
    }
    this.program = program;
    const behavior = (this.targetShip as unknown as { behavior: Executor | null }).behavior;
    this.executor = behavior instanceof Executor ? behavior : null;

    // ─── バックドロップ ───────────────────────────────────────
    this.backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.55)
      .setDepth(0)
      .setInteractive();
    this.backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      this.close();
    });

    // ─── 中央カード ───────────────────────────────────────────
    const cardW = 1040;
    const cardH = 580;
    const cardX = GAME_WIDTH / 2;
    const cardY = GAME_HEIGHT / 2;
    this.card = this.add
      .rectangle(cardX, cardY, cardW, cardH, COLORS.bgAlt, 0.97)
      .setStrokeStyle(1, COLORS.ally, 0.4)
      .setDepth(1)
      .setInteractive();
    this.card.on('pointerdown', () => {});
    this.cardLeft = cardX - cardW / 2;
    this.cardTop = cardY - cardH / 2;

    // ─── タイトル + 説明 ──────────────────────────────────
    const title = this.add
      .text(this.cardLeft + 24, this.cardTop + 16, 'プログラム編集', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setDepth(2);
    const hint = this.add
      .text(
        this.cardLeft + 24,
        this.cardTop + 44,
        'コードを置いた順に実行 → 末尾まで来たら自動で先頭にループ。「繰り返し」は N 回だけ繰り返したい時に使用。',
        {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        }
      )
      .setDepth(2);
    this.chrome.push(title, hint);

    // 右上の ✕ ボタン
    this.makeCloseButton(cardX + cardW / 2 - 50, this.cardTop + 30);

    // ─── 装着モジュールチップ行 (Phase 6 Step 9, read-only) ──
    this.renderEquippedModules(this.cardLeft + 24, this.cardTop + 70, cardW - 48);

    // ─── Ship ステータス + 補給/修理ボタン (2026-05-25) ──────
    // カード右上、✕ ボタンの下から 3 行
    this.renderShipStatusPanel();

    // ─── 3 カラムレイアウト ──────────────────────────────────
    const innerTop = this.cardTop + 100;
    const innerHeight = cardH - 120;
    const colGap = 16;
    const totalInnerW = cardW - 48;
    const leftW = 220;
    const rightW = 260;
    const midW = totalInnerW - leftW - rightW - colGap * 2;

    const leftX = this.cardLeft + 24;
    const midX = leftX + leftW + colGap;
    const rightX = midX + midW + colGap;

    this.palette = new CodePalette(this, leftX, innerTop, leftW);
    this.list = new ProgramList(this, midX, innerTop, midW, innerHeight);
    this.paramEditor = new CodeParamEditor(this, rightX, innerTop, rightW);

    // ─── 配線 ────────────────────────────────────────────────
    this.palette.on('addCode', (type: CodeType) => this.handleAddCode(type));
    this.palette.on('addItemCode', (type: ItemCodeType) => this.handleAddItemCode(type));
    this.palette.on('loadSample', () => this.handleLoadSample());
    this.palette.on('close', () => this.close());

    this.list.on('select', (path: number[]) => {
      this.selectedPath = path;
      this.refresh();
    });
    this.list.on('moveUp', (path: number[]) => this.handleMoveUp(path));
    this.list.on('moveDown', (path: number[]) => this.handleMoveDown(path));
    this.list.on('remove', (path: number[]) => this.handleRemove(path));
    this.paramEditor.on('change', (code) => this.handleParamChange(code));

    // ─── ESC で閉じる ────────────────────────────────────────
    this.escHandler = () => this.close();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.makeDebugRow();
    this.refresh();
  }

  // ─── ハンドラ ───────────────────────────────────────────────

  /**
   * 新規コードの挿入位置を決めて挿入する:
   *  - 何も選択されていなければ root scope の末尾
   *  - 選択中コードが wrapper (REPEAT / ITEM_CODE) なら、その children の末尾
   *  - それ以外なら、選択コードの直後 (= 同じ scope の +1 位置)
   */
  private insertNewCode(code: Code): void {
    if (this.selectedPath === null) {
      this.program.append(code);
      this.selectedPath = [this.program.length - 1];
      return;
    }
    const sel = this.program.getCodeAt(this.selectedPath);
    const selChildren = sel ? codeChildren(sel) : null;
    if (selChildren) {
      selChildren.push(code);
      this.selectedPath = [...this.selectedPath, selChildren.length - 1];
    } else {
      const parentPath = this.selectedPath.slice(0, -1);
      const insertIdx = this.selectedPath[this.selectedPath.length - 1]! + 1;
      this.program.insertAtPath(parentPath, insertIdx, code);
      this.selectedPath = [...parentPath, insertIdx];
    }
  }

  private handleAddCode(type: CodeType): void {
    this.insertNewCode(createCode(type));
    this.ensureRunning();
    this.refresh();
  }

  /** アイテムコードを配置する。未配置インスタンスを 1 個選んで ITEM_CODE ノード化。 */
  private handleAddItemCode(type: ItemCodeType): void {
    const inst = pickUnplacedInstance(this.inventory.codes, this.collectPlaced(), type);
    if (!inst) return; // 残数 0 (パレットが無効化しているはず)
    this.insertNewCode(createItemCodeNode(inst));
    this.ensureRunning();
    this.refresh();
  }

  /** 全 Ship のプログラムを走査し、配置済みアイテムコードの uid 集合を返す。 */
  private collectPlaced(): Set<string> {
    const programs: ReadonlyArray<Code>[] = [];
    for (const s of this.getShips()) {
      const p = s.getProgram();
      if (p) programs.push(p.getCodes());
    }
    return collectPlacedCodeUids(programs);
  }

  private handleLoadSample(): void {
    // root scope を入れ替える (Program インスタンスは保持し、中身だけ差し替え)
    while (this.program.length > 0) this.program.removeAt(0);
    for (const c of sampleCodes()) this.program.append(c);
    this.selectedPath = null;
    this.ensureRunning();
    this.refresh();
  }

  private handleMoveUp(path: number[]): void {
    this.program.moveUpAtPath(path);
    const last = path[path.length - 1]!;
    if (last > 0) {
      const newPath = [...path.slice(0, -1), last - 1];
      this.selectedPath = pathEquals(this.selectedPath, path) ? newPath : this.selectedPath;
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleMoveDown(path: number[]): void {
    const parent = this.program.getCodesAtParent(path);
    if (!parent) return;
    const last = path[path.length - 1]!;
    if (last < parent.length - 1) {
      this.program.moveDownAtPath(path);
      const newPath = [...path.slice(0, -1), last + 1];
      this.selectedPath = pathEquals(this.selectedPath, path) ? newPath : this.selectedPath;
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleRemove(path: number[]): void {
    this.program.removeAtPath(path);
    // 選択 path 更新: 削除位置と同じか deeper なら無効化、同じ scope で後ろなら -1
    if (this.selectedPath !== null) {
      if (pathEquals(this.selectedPath, path)) {
        this.selectedPath = null;
      } else if (
        this.selectedPath.length > path.length &&
        path.every((v, i) => v === this.selectedPath![i])
      ) {
        // 削除した REPEAT の中にいたら無効
        this.selectedPath = null;
      } else if (
        this.selectedPath.length === path.length &&
        path.slice(0, -1).every((v, i) => v === this.selectedPath![i]) &&
        this.selectedPath[this.selectedPath.length - 1]! > path[path.length - 1]!
      ) {
        // 同じ scope の後ろなら -1
        const np = [...this.selectedPath];
        np[np.length - 1]! -= 1;
        this.selectedPath = np;
      }
    }
    this.ensureRunning();
    this.refresh();
  }

  private handleParamChange(code: Code): void {
    if (this.selectedPath === null) return;
    this.program.replaceCodeAtPath(this.selectedPath, code);
    this.ensureRunning();
    this.refresh();
  }

  /**
   * 編集の結果、Executor が末尾停止 (idle) だったら先頭から再実行する。
   *
   * 背景: root cursor が末尾に到達した Ship は `getRunningPath() === null` の idle 状態に落ち、
   * その状態でコードを追加・編集しても再評価されない (cursor は既に末尾を指している)。
   * 編集と同時に Ship を動かしたい (走行マーカーも表示したい) ので、idle 検知時のみ reset する。
   * 採掘・移動など実行中のときは無干渉でライブ編集が反映される。
   */
  private ensureRunning(): void {
    if (!this.executor) return;
    if (this.executor.getRunningPath() === null) {
      this.executor.reset();
    }
  }

  // ─── 描画 ───────────────────────────────────────────────────

  private refresh(): void {
    // 選択 path が不正なら null に
    if (this.selectedPath !== null) {
      const c = this.program.getCodeAt(this.selectedPath);
      if (!c) this.selectedPath = null;
    }
    const runningPath = this.executor?.getRunningPath() ?? null;
    this.lastRunningPath = runningPath;
    this.list.render(this.program.getCodes(), this.selectedPath, runningPath);
    const sel = this.selectedPath !== null ? this.program.getCodeAt(this.selectedPath) : null;
    this.paramEditor.render(sel);
    this.refreshPalette();
  }

  /** コードパレットのアイテムコード残数を再計算して反映する。 */
  private refreshPalette(): void {
    const placed = this.collectPlaced();
    const counts = availableCodeCounts(this.inventory.codes, placed);
    const order: Record<string, number> = { L: 3, SR: 2, R: 1, N: 0 };
    const entries: ItemCodeEntry[] = [];
    for (const type of ALL_ITEM_CODE_TYPES) {
      const owned = this.inventory.codes.filter((c) => c.codeType === type);
      if (owned.length === 0) continue;
      // 表示色は所持インスタンス中で最も高いレア度
      const best = owned.reduce((a, b) => ((order[b.rarity] ?? 0) > (order[a.rarity] ?? 0) ? b : a));
      entries.push({
        type,
        label: ITEM_CODE_DEFS[type].nameJa,
        rarity: best.rarity,
        available: counts[type] ?? 0,
      });
    }
    this.palette.setItemCodes(entries);
  }

  /**
   * Phase 6 Step 9: この Ship に装着中のモジュールを read-only チップで表示する。
   * 装着なしならその旨のヒント文。装着/取り外しは ShipListScene 側で完結する。
   */
  private renderEquippedModules(x: number, y: number, w: number): void {
    const uids = this.inventory.shipModules[this.targetShip.id] ?? [];

    // ラベル
    this.chrome.push(
      this.add
        .text(x, y, '装着中:', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        })
        .setOrigin(0, 0.5)
        .setDepth(2)
    );

    if (uids.length === 0) {
      this.chrome.push(
        this.add
          .text(x + 56, y, 'モジュールなし — 📦 アイテムから装着できます', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#6b7da0',
            fontStyle: 'italic',
          })
          .setOrigin(0, 0.5)
          .setDepth(2)
      );
      return;
    }

    let chipX = x + 56;
    const maxX = x + w - 4;
    for (const uid of uids) {
      const it = this.inventory.items.find((i) => i.uid === uid);
      if (!it) continue;
      const mt = MODULE_TYPES[it.typeId];
      if (!mt) continue;
      const rc = RARITY_COLOR[it.rarity];
      const label = `${RARITY_SHORT[it.rarity]} ${mt.nameJa}`;
      // 仮の Text を作って幅を測り、その幅で背景チップを描く
      const t = this.add
        .text(0, 0, label, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      const chipW = t.width + 16;
      if (chipX + chipW > maxX) {
        // チップが入り切らないときはここで省略マーカー
        t.destroy();
        this.chrome.push(
          this.add
            .text(chipX, y, '…', {
              fontFamily: FONT,
              fontSize: '12px',
              color: '#6b7da0',
            })
            .setOrigin(0, 0.5)
            .setDepth(2)
        );
        break;
      }
      const bg = this.add
        .rectangle(chipX + chipW / 2, y, chipW, 22, rc, 0.15)
        .setStrokeStyle(1, rc, 0.85)
        .setDepth(2);
      t.setPosition(chipX + 8, y).setDepth(3);
      this.chrome.push(bg, t);
      chipX += chipW + 6;
    }
  }

  // ─── Ship ステータス UI (2026-05-25) ──────────────────────

  /**
   * 編集カード右上に Ship ステータス (HP / ENE / INV) と
   * クレジット消費の [補給]/[修理] ボタンを表示する。
   * HP / ENE が 0 のときは赤強調 + 上部に警告メッセージを出す。
   *
   * 値の追従は `update()` (Phaser scene update) から `refreshShipStatus()` 経由。
   */
  private renderShipStatusPanel(): void {
    // 3 行ぶんの Text プレースホルダ + warning text を生成し、
    // 実値の流し込みは refreshShipStatus() に任せる
    const cardRight = this.cardLeft + 1040 - 24; // cardW=1040 と一致 (create で使用)
    const baseX = cardRight - 130;
    const baseY = this.cardTop + 60;

    for (let i = 0; i < 3; i++) {
      const t = this.add
        .text(baseX, baseY + i * 18, '', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0)
        .setDepth(3);
      this.statTexts.push(t);
    }
    this.chrome.push(...this.statTexts);

    // 警告メッセージ (ダウン or ストール時のみ表示)
    this.warningText = this.add
      .text(this.cardLeft + 24, this.cardTop + 88, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ff4d5a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
      .setDepth(3);
    this.chrome.push(this.warningText);

    this.refreshShipStatus();
  }

  /** ステータス値とボタンを毎フレーム更新する。 */
  private refreshShipStatus(): void {
    if (!this.targetShip || this.statTexts.length < 3) return;
    const s = this.targetShip;
    const normalColor = '#cfd6e6';
    const alertColor = '#ff4d5a';

    const hpDown = s.hp <= 0;
    const eneOut = s.energy <= 0;

    this.statTexts[0]!.setText(`HP   ${Math.ceil(s.hp)} / ${s.maxHp}${hpDown ? '  ⚠ 戦闘不能' : ''}`);
    this.statTexts[0]!.setColor(hpDown ? alertColor : normalColor);

    this.statTexts[1]!.setText(`ENE  ${Math.ceil(s.energy)} / ${s.maxEnergy}${eneOut ? '  ⚠ 切れ' : ''}`);
    this.statTexts[1]!.setColor(eneOut ? alertColor : normalColor);

    this.statTexts[2]!.setText(`INV  ${Math.floor(s.inventory)} / ${s.inventoryCap}`);

    // ボタン再構築 (HP/ENE 値で enable/disable が変わるので毎フレーム作り直す)
    for (const g of this.statBtns) g.destroy();
    this.statBtns = [];

    const btnY = this.cardTop + 60;
    const btnRightX = this.cardLeft + 1040 - 24;

    // [修理] (左) / [補給] (右) を 2 段で重ねず横並び
    const canRepair = s.hp < s.maxHp;
    const canRefuel = s.energy < s.maxEnergy;
    const repairAffordable = this.economy.credits >= SHIP.repairCost;
    const refuelAffordable = this.economy.credits >= SHIP.refuelCost;

    if (canRepair) {
      this.makeStatusButton(
        btnRightX - 220,
        btnY + 56,
        100,
        `修理 $${SHIP.repairCost}`,
        hpDown ? COLORS.enemy : COLORS.ally,
        repairAffordable,
        () => this.handleRepair()
      );
    }
    if (canRefuel) {
      this.makeStatusButton(
        btnRightX - 110,
        btnY + 56,
        100,
        `補給 $${SHIP.refuelCost}`,
        eneOut ? COLORS.enemy : COLORS.ally,
        refuelAffordable,
        () => this.handleRefuel()
      );
    }

    // 警告メッセージ
    if (this.warningText) {
      if (hpDown && eneOut) {
        this.warningText.setText('⚠ 戦闘不能 + エネルギー切れ — クレジットで修理 + 補給してください');
      } else if (hpDown) {
        this.warningText.setText('⚠ 戦闘不能 — クレジットで修理してください');
      } else if (eneOut) {
        this.warningText.setText('⚠ エネルギー切れ — クレジットで補給してください');
      } else {
        this.warningText.setText('');
      }
    }
  }

  private handleRepair(): void {
    if (this.targetShip.hp >= this.targetShip.maxHp) return;
    if (!this.economy.spend(SHIP.repairCost, 'repair')) return;
    this.targetShip.heal(this.targetShip.maxHp); // 全回復
    this.refreshShipStatus();
  }

  private handleRefuel(): void {
    if (this.targetShip.energy >= this.targetShip.maxEnergy) return;
    if (!this.economy.spend(SHIP.refuelCost, 'refuel')) return;
    this.targetShip.refuel();
    this.refreshShipStatus();
  }

  /** 補給 / 修理用の小ボタン。enabled=false でグレーアウト。 */
  private makeStatusButton(
    x: number,
    y: number,
    w: number,
    label: string,
    accent: number,
    enabled: boolean,
    onClick: () => void
  ): void {
    const h = 26;
    const bg = this.add
      .rectangle(x + w / 2, y + h / 2, w, h, COLORS.panelBg, enabled ? 1 : 0.4)
      .setStrokeStyle(1, accent, enabled ? 0.9 : 0.4)
      .setDepth(3);
    const t = this.add
      .text(x + w / 2, y + h / 2, label, {
        fontFamily: FONT,
        fontSize: '12px',
        color: enabled ? '#cfd6e6' : '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(4);
    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
      bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        onClick();
      });
    }
    this.statBtns.push(bg, t);
  }

  /** デバッグ用: レア度別にアイテムコードを獲得する暫定行 (カード上部)。 */
  private makeDebugRow(): void {
    const y = this.cardTop + 30;
    this.chrome.push(
      this.add
        .text(this.cardLeft + 540, y, 'DEBUG コード獲得:', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#6b7da0',
        })
        .setOrigin(0, 0.5)
        .setDepth(2)
    );
    let x = this.cardLeft + 662;
    for (const r of ALL_RARITIES) {
      const rc = RARITY_COLOR[r];
      const bg = this.add
        .rectangle(x, y, 52, 24, COLORS.panelBg, 1)
        .setStrokeStyle(1, rc, 0.9)
        .setDepth(2)
        .setInteractive({ useHandCursor: true });
      const t = this.add
        .text(x, y, RARITY_SHORT[r], {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3);
      bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
      bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 1));
      bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        const granted = makeRandomItemCode(r);
        if (!granted) return; // 該当 rarity のコードがなければ no-op
        this.inventory.codes.push(granted);
        this.refresh();
      });
      this.chrome.push(bg, t);
      x += 60;
    }
  }

  // ─── 閉じる ─────────────────────────────────────────────────

  private close(): void {
    this.scene.stop();
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

  /**
   * 毎フレーム呼ばれる。
   *  - 走行中 path が変わったときだけ list を再描画
   *  - Ship ステータス (HP / ENE / INV) は毎フレーム数値だけ refresh (2026-05-25)
   */
  public update(): void {
    this.refreshShipStatus();
    if (!this.executor) return;
    const current = this.executor.getRunningPath();
    if (!pathEquals(current, this.lastRunningPath)) {
      this.lastRunningPath = current;
      this.refresh();
    }
  }

  private shutdown(): void {
    if (this.escHandler) {
      this.input.keyboard?.off('keydown-ESC', this.escHandler);
      this.escHandler = undefined;
    }
    this.palette?.destroy();
    this.list?.destroy();
    this.paramEditor?.destroy();
    for (const g of this.statBtns) g.destroy();
    this.statBtns = [];
    this.statTexts = [];
    this.warningText = null;
    for (const g of this.chrome) g.destroy();
    this.chrome = [];
    this.backdrop?.destroy();
    this.card?.destroy();
  }
}
