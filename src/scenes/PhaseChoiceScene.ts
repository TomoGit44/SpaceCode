import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import type { Inventory } from '../items/Inventory';
import type { EconomySystem } from '../systems/EconomySystem';
import type { ItemInstance } from '../items/itemTypes';
import {
  RARITY_LABEL,
  RARITY_SHORT,
  RARITY_COLOR,
} from '../items/itemTypes';
import {
  type PhaseChoice,
  describePhaseChoice,
  rollPhaseChoices,
  applyPhaseChoice,
} from '../items/phaseChoices';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export interface PhaseChoiceData {
  readonly phaseNumber: number;
  readonly inventory: Inventory;
  readonly economy: EconomySystem;
  /** 閉じる時 (適用完了後) に親シーンへ通知。 */
  readonly onClosed: () => void;
  /** ガチャ確定の選択肢を選んだ時、親シーン経由で GachaOpenScene を mandatory 起動する。 */
  readonly launchGachaOpen: (gachaItem: ItemInstance, onAfter: () => void) => void;
}

/**
 * Phase クリア時の 3 択イベントオーバーレイ (2026-06-05 追加, ローグライト Step 3)。
 *
 * `GachaOpenScene` のカード UI / Tween パターンを構造ごと流用 (見た目転写)。
 * Phase クリアの自動ガチャ付与を廃し、能動的選択を毎 Phase 提示する基盤。
 *
 * mandatory モード: backdrop タップ / ESC でキャンセル不可 (必ず 1 つ選ぶ)。
 *
 * フロー:
 *   1. 起動時に rollPhaseChoices() で 3 候補を生成
 *   2. カードを stagger フェード + スケールイン で提示
 *   3. プレイヤーが 1 枚クリック → ハイライト → 「これを選ぶ」で確定
 *   4. 確定で applyPhaseChoice
 *      - gacha: 内側で GachaOpenScene を mandatory 起動 → そのフローに合流
 *      - credits/guaranteedItem: 即時適用 → close
 */
export class PhaseChoiceScene extends Phaser.Scene {
  private phaseNumber!: number;
  private inventory!: Inventory;
  private economy!: EconomySystem;
  private onClosed!: () => void;
  private launchGachaOpen!: (gachaItem: ItemInstance, onAfter: () => void) => void;

  private choices: PhaseChoice[] = [];
  private selectedIndex: number | null = null;
  private consumed = false;

  private chrome: Phaser.GameObjects.GameObject[] = [];
  private dyn: Phaser.GameObjects.GameObject[] = [];
  private cardObjects: Array<{
    bg: Phaser.GameObjects.Rectangle;
    border: Phaser.GameObjects.Rectangle;
  }> = [];

  constructor() {
    super({ key: 'PhaseChoiceScene' });
  }

  init(data: PhaseChoiceData): void {
    this.phaseNumber = data.phaseNumber;
    this.inventory = data.inventory;
    this.economy = data.economy;
    this.onClosed = data.onClosed;
    this.launchGachaOpen = data.launchGachaOpen;
    this.selectedIndex = null;
    this.consumed = false;
    this.choices = [];
    this.cardObjects = [];
  }

  create(): void {
    this.choices = rollPhaseChoices(this.phaseNumber, this.inventory);
    if (this.choices.length === 0) {
      // セーフティ: 候補無しの場合は即閉じ (通常は起こらない)
      this.close();
      return;
    }

    // mandatory backdrop (タップしてもキャンセルしない)
    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.7)
      .setDepth(0)
      .setInteractive();
    backdrop.on('pointerdown', () => {});
    this.chrome.push(backdrop);

    // タイトル
    this.chrome.push(
      this.add
        .text(GAME_WIDTH / 2, 86, '✦ PHASE 報酬を選ぶ', {
          fontFamily: FONT,
          fontSize: '26px',
          color: '#cfd6e6',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(2),
      this.add
        .text(GAME_WIDTH / 2, 118, `Phase ${this.phaseNumber} クリア — 3 つから 1 つ選んでください`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#3ee0c5',
        })
        .setOrigin(0.5)
        .setDepth(2)
    );

    this.renderCards();
    this.renderFooter();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private renderCards(): void {
    const cardW = 240;
    const cardH = 320;
    const gap = 32;
    const totalW = cardW * 3 + gap * 2;
    const startX = (GAME_WIDTH - totalW) / 2;
    const y = GAME_HEIGHT / 2 - 20;

    this.choices.forEach((choice, i) => {
      const cx = startX + i * (cardW + gap) + cardW / 2;
      this.makeCard(choice, i, cx, y, cardW, cardH);
    });
  }

  private makeCard(choice: PhaseChoice, index: number, cx: number, cy: number, w: number, h: number): void {
    const disp = describePhaseChoice(choice);
    const rc = RARITY_COLOR[disp.rarity];

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

    const top = cy - h / 2;
    const left = cx - w / 2;

    // レア度バッジ
    this.chrome.push(
      this.add
        .rectangle(left + 26, top + 22, 36, 22, rc, 0.18)
        .setStrokeStyle(1, rc, 1)
        .setDepth(4),
      this.add
        .text(left + 26, top + 22, RARITY_SHORT[disp.rarity], {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(5)
    );

    // カテゴリラベル (右上)
    this.chrome.push(
      this.add
        .text(cx + w / 2 - 12, top + 22, disp.categoryLabel, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
        })
        .setOrigin(1, 0.5)
        .setDepth(5)
    );

    // メインアイコン (kind 別の Graphics シンボル)
    const iconG = this.add.graphics().setDepth(5);
    iconG.setPosition(cx, top + 78);
    this.drawChoiceIcon(iconG, choice, rc);
    this.chrome.push(iconG);

    // タイトル
    this.chrome.push(
      this.add
        .text(cx, top + 138, disp.titleJa, {
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
    this.chrome.push(
      this.add
        .text(cx, top + 200, disp.descJa, {
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

    // レア度ラベル (下)
    this.chrome.push(
      this.add
        .text(cx, top + h - 24, RARITY_LABEL[disp.rarity], {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(5)
    );

    // 出現アニメ
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

  /** kind 別のメインアイコン (画像アセット不使用、Graphics で記号的に表現)。 */
  private drawChoiceIcon(g: Phaser.GameObjects.Graphics, choice: PhaseChoice, rc: number): void {
    g.clear();
    if (choice.kind === 'gacha') {
      // ガチャ: 開いた箱風 (台 + 蓋)
      g.fillStyle(rc, 0.3);
      g.fillRect(-22, -6, 44, 18);
      g.lineStyle(2, rc, 1);
      g.strokeRect(-22, -6, 44, 18);
      g.fillStyle(rc, 0.85);
      g.fillTriangle(-22, -6, 22, -6, 0, -22);
      // 中央の星 (ガチャ感)
      g.fillStyle(COLORS.highlight, 1);
      g.fillCircle(0, 4, 3);
    } else if (choice.kind === 'credits') {
      // クレジット: $ マーク + 円
      g.fillStyle(rc, 0.18);
      g.fillCircle(0, 0, 22);
      g.lineStyle(2, rc, 1);
      g.strokeCircle(0, 0, 22);
      // $ シンボルは Text で別途出すと縦中心が合わないので、棒+S で代用
      g.fillStyle(rc, 1);
      g.fillRect(-1.5, -16, 3, 32);
      g.lineStyle(3, rc, 1);
      g.beginPath();
      g.arc(0, -6, 8, Math.PI * 0.2, Math.PI * 1.4, false);
      g.strokePath();
      g.beginPath();
      g.arc(0, 6, 8, Math.PI * 1.2, Math.PI * 0.4, false);
      g.strokePath();
    } else {
      // guaranteedItem: モジュール = 歯車風
      g.fillStyle(rc, 0.2);
      g.fillCircle(0, 0, 22);
      g.lineStyle(2, rc, 1);
      g.strokeCircle(0, 0, 22);
      // 中央コア
      g.fillStyle(rc, 0.9);
      g.fillCircle(0, 0, 8);
      // 6 つの突起
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const x1 = Math.cos(a) * 18;
        const y1 = Math.sin(a) * 18;
        const x2 = Math.cos(a) * 28;
        const y2 = Math.sin(a) * 28;
        g.lineStyle(4, rc, 1);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.strokePath();
      }
    }
  }

  // ─── 選択 / 確定 ─────────────────────────────

  private selectCard(index: number): void {
    this.selectedIndex = index;
    this.cardObjects.forEach((co, i) => {
      const disp = describePhaseChoice(this.choices[i]!);
      const rc = RARITY_COLOR[disp.rarity];
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

  // ─── フッター (mandatory: 「これを選ぶ」だけ) ─────

  private renderFooter(): void {
    for (const g of this.dyn) g.destroy();
    this.dyn = [];

    const y = GAME_HEIGHT - 90;
    const sel = this.selectedIndex !== null ? this.choices[this.selectedIndex] : null;

    if (sel) {
      const w = 280;
      this.makeButton(GAME_WIDTH / 2 - w / 2, y, w, 'これを選ぶ', COLORS.accent, () => {
        this.confirmPick();
      });
    } else {
      this.dyn.push(
        this.add
          .text(GAME_WIDTH / 2, y + 12, 'カードをクリックして選択', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#6b7da0',
          })
          .setOrigin(0.5)
          .setDepth(4)
      );
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

  // ─── 確定処理 ───────────────────────────────

  private confirmPick(): void {
    if (this.selectedIndex === null || this.consumed) return;
    this.consumed = true;
    const choice = this.choices[this.selectedIndex]!;

    // 確定演出: 選んだカードをフラッシュ + 拡大 fade
    const picked = this.cardObjects[this.selectedIndex]!;
    const disp = describePhaseChoice(choice);
    const rc = RARITY_COLOR[disp.rarity];
    const flash = this.add.graphics().setDepth(7);
    flash.fillStyle(0xffffff, 0.9);
    flash.fillCircle(0, 0, 60);
    flash.fillStyle(rc, 0.7);
    flash.fillCircle(0, 0, 100);
    flash.setPosition(picked.bg.x, picked.bg.y).setScale(0.4);
    this.tweens.add({
      targets: flash,
      scale: 2.4,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // 選択以外のカードはフェードアウト
    for (let i = 0; i < this.cardObjects.length; i++) {
      if (i === this.selectedIndex) continue;
      const co = this.cardObjects[i]!;
      this.tweens.add({
        targets: [co.bg, co.border],
        alpha: 0,
        scale: 0.85,
        duration: 280,
        ease: 'Cubic.easeIn',
      });
    }

    // 選択カードを拡大 fade
    this.tweens.add({
      targets: [picked.bg, picked.border],
      scale: 1.3,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // 確定演出が終わってから適用 (ガチャは内側で別 Scene が立ち上がる)
        applyPhaseChoice(choice, {
          inventory: this.inventory,
          economy: this.economy,
          launchGachaOpen: this.launchGachaOpen,
          onImmediateDone: () => this.close(),
        });
      },
    });
  }

  private close(): void {
    this.scene.stop();
  }

  private shutdown(): void {
    for (const g of this.dyn) g.destroy();
    for (const g of this.chrome) g.destroy();
    this.dyn = [];
    this.chrome = [];
    this.cardObjects = [];
    this.onClosed();
  }
}
