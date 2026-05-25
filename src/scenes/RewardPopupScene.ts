import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import type { Inventory } from '../items/Inventory';
import { RARITY_COLOR, RARITY_LABEL, RARITY_SHORT, type Rarity, type ItemInstance } from '../items/itemTypes';
import { CHEMICAL_TYPES } from '../items/types/chemicals';

const FONT = 'system-ui, "Segoe UI", sans-serif';

/**
 * 報酬の中身 (2026-05-25)。
 * - gacha: タップでガチャ開封フローに進む (GachaOpenScene を mandatory で起動)
 * - chemical: タップで Inventory に追加 (ケミカルは即時インベントリ入り)
 */
export type RewardPayload =
  | {
      kind: 'gacha';
      category: 'code' | 'module';
      rarity: Rarity;
      /** カード上部の見出し (例: "PHASE 1 CLEAR" / "BOSS DROP")。 */
      heading: string;
    }
  | {
      kind: 'chemical';
      chem: ItemInstance;
      heading: string;
    };

export interface RewardPopupData {
  reward: RewardPayload;
  inventory: Inventory;
  /** 飛んでいく先 (右上「アイテム」ボタン中央)。 */
  itemBtnTarget: { x: number; y: number };
  /** 報酬付与が完全に終わったあとに呼ばれる (GameScene が次の queue を消化する)。 */
  onClosed: () => void;
}

const CARD_W = 220;
const CARD_H = 340;

/**
 * 報酬ポップアップ (2026-05-25)。
 *
 * モーダルで全画面を覆い、画面中央に縦長カードを 1 枚出す。
 * プレイヤーがカードをタップすると:
 *   - gacha: GachaOpenScene (3 候補選択) を mandatory モードで起動 →
 *            選択完了後に「飛行演出」(右上アイテムボタンへ縮小フェード) → close
 *   - chemical: Inventory に push → 飛行演出 → close
 *
 * GameScene 側はこのシーンが active な間ゲーム更新を凍結する責務を持つ
 * (本シーンでは関知しない)。
 */
export class RewardPopupScene extends Phaser.Scene {
  private reward!: RewardPayload;
  private inventory!: Inventory;
  private itemBtnTarget!: { x: number; y: number };
  private onClosed!: () => void;

  private chrome: Phaser.GameObjects.GameObject[] = [];
  private cardContainer?: Phaser.GameObjects.Container;
  private cardTween?: Phaser.Tweens.Tween;
  private claimed = false;

  constructor() {
    super({ key: 'RewardPopupScene' });
  }

  init(data: RewardPopupData): void {
    this.reward = data.reward;
    this.inventory = data.inventory;
    this.itemBtnTarget = data.itemBtnTarget;
    this.onClosed = data.onClosed;
    this.claimed = false;
    this.chrome = [];
  }

  create(): void {
    // モーダル backdrop (タップ抜けを防ぐためにクリック吸収のみ、close はカードタップに限定)
    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070d, 0.72)
      .setDepth(0)
      .setInteractive();
    backdrop.on('pointerdown', () => {
      // カード以外のタップでもカードのタップ判定にフォールバックさせる (誤クリック許容)
      if (!this.claimed) this.handleTap();
    });
    this.chrome.push(backdrop);

    // 見出し (画面上部の小さなラベル)
    const heading = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - CARD_H / 2 - 56, this.reward.heading, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#6b7da0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.chrome.push(heading);

    // タップ案内
    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + CARD_H / 2 + 36, 'カードをタップして受け取る', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd6e6',
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.chrome.push(hint);

    // カード本体
    this.cardContainer = this.makeCard(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // 軽い脈動 (「押せる」感を出す)
    this.cardTween = this.tweens.add({
      targets: this.cardContainer,
      scale: 1.04,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 登場演出: 透明 + 拡大から
    this.cardContainer.setAlpha(0).setScale(0.7);
    this.tweens.add({
      targets: this.cardContainer,
      alpha: 1,
      scale: 1,
      duration: 280,
      ease: 'Back.easeOut',
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cardTween?.stop();
      for (const g of this.chrome) g.destroy();
      this.chrome = [];
      this.cardContainer?.destroy();
      this.cardContainer = undefined;
    });
  }

  /** カード (縦長 + コード/モジュール風装飾) を生成。 */
  private makeCard(cx: number, cy: number): Phaser.GameObjects.Container {
    const container = this.add.container(cx, cy).setDepth(3);

    const rarity: Rarity = this.reward.kind === 'gacha' ? this.reward.rarity : this.reward.chem.rarity;
    const rc = RARITY_COLOR[rarity];

    // 背景パネル
    const bg = this.add
      .rectangle(0, 0, CARD_W, CARD_H, COLORS.panelBg, 0.98)
      .setStrokeStyle(2.5, rc, 1)
      .setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 0.98));
    bg.on('pointerdown', () => this.handleTap());
    container.add(bg);

    // 縦アクセント (左端 + 右端)
    container.add(this.add.rectangle(-CARD_W / 2 + 4, 0, 4, CARD_H, rc, 1));
    container.add(this.add.rectangle(CARD_W / 2 - 4, 0, 4, CARD_H, rc, 1));

    // レア度バッジ (右上)
    container.add(
      this.add
        .rectangle(CARD_W / 2 - 28, -CARD_H / 2 + 22, 40, 22, rc, 0.2)
        .setStrokeStyle(1, rc, 1)
    );
    container.add(
      this.add
        .text(CARD_W / 2 - 28, -CARD_H / 2 + 22, RARITY_SHORT[rarity], {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    // カテゴリラベル (左上)
    const categoryLabel = this.categoryLabel();
    container.add(
      this.add
        .text(-CARD_W / 2 + 14, -CARD_H / 2 + 22, categoryLabel, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#6b7da0',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
    );

    // 中央アート (種類別)
    const artY = -CARD_H / 2 + 110;
    const art = this.add.graphics();
    if (this.reward.kind === 'gacha') {
      if (this.reward.category === 'code') this.drawCodeArt(art, 0, artY, rc);
      else this.drawModuleArt(art, 0, artY, rc);
    } else {
      this.drawChemicalArt(art, 0, artY, rc);
    }
    container.add(art);

    // タイトル (中央下)
    container.add(
      this.add
        .text(0, CARD_H / 2 - 80, this.cardTitle(), {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#cfd6e6',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: CARD_W - 32 },
        })
        .setOrigin(0.5)
    );

    // レア度フルラベル
    container.add(
      this.add
        .text(0, CARD_H / 2 - 50, RARITY_LABEL[rarity], {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#' + rc.toString(16).padStart(6, '0'),
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
    );

    // 補助テキスト (下端)
    container.add(
      this.add
        .text(0, CARD_H / 2 - 26, this.cardSubtitle(), {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#6b7da0',
        })
        .setOrigin(0.5)
    );

    return container;
  }

  private categoryLabel(): string {
    if (this.reward.kind === 'gacha') {
      return this.reward.category === 'code' ? 'CODE PACK' : 'MODULE PACK';
    }
    return 'CHEMICAL';
  }

  private cardTitle(): string {
    if (this.reward.kind === 'gacha') {
      return this.reward.category === 'code' ? 'コードガチャ' : 'モジュールガチャ';
    }
    return CHEMICAL_TYPES[this.reward.chem.typeId]?.nameJa ?? 'ケミカル';
  }

  private cardSubtitle(): string {
    if (this.reward.kind === 'gacha') return 'タップで開封 — 3 候補から 1 つ選択';
    return 'タップで受け取り';
  }

  // ─── 中央アート (Graphics で完結、画像アセット不使用) ───────────────

  /** コードパック風: 角ブラケット {} と擬似コード行 (横線 3 本)。 */
  private drawCodeArt(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    const w = 110;
    const h = 110;
    // 外枠
    g.fillStyle(COLORS.bg, 0.85);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 6);
    // { } ブラケット
    g.lineStyle(3, color, 1);
    // 左 {
    g.beginPath();
    g.moveTo(cx - w / 2 + 26, cy - h / 2 + 16);
    g.lineTo(cx - w / 2 + 16, cy - h / 2 + 16);
    g.lineTo(cx - w / 2 + 16, cy);
    g.lineTo(cx - w / 2 + 10, cy);
    g.lineTo(cx - w / 2 + 16, cy);
    g.lineTo(cx - w / 2 + 16, cy + h / 2 - 16);
    g.lineTo(cx - w / 2 + 26, cy + h / 2 - 16);
    g.strokePath();
    // 右 }
    g.beginPath();
    g.moveTo(cx + w / 2 - 26, cy - h / 2 + 16);
    g.lineTo(cx + w / 2 - 16, cy - h / 2 + 16);
    g.lineTo(cx + w / 2 - 16, cy);
    g.lineTo(cx + w / 2 - 10, cy);
    g.lineTo(cx + w / 2 - 16, cy);
    g.lineTo(cx + w / 2 - 16, cy + h / 2 - 16);
    g.lineTo(cx + w / 2 - 26, cy + h / 2 - 16);
    g.strokePath();
    // 擬似コード行 (3 本)
    g.fillStyle(color, 0.7);
    const lines = [
      { x: -22, w: 44 },
      { x: -28, w: 56 },
      { x: -16, w: 32 },
    ];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      g.fillRect(cx + l.x, cy - 18 + i * 14, l.w, 4);
    }
  }

  /** モジュールパック風: 中央チップ + ピン + 歯車的な四隅ノッチ。 */
  private drawModuleArt(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    const w = 100;
    const h = 100;
    // 外枠
    g.fillStyle(COLORS.bg, 0.85);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 4);
    g.lineStyle(2, color, 0.9);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 4);

    // 中央チップ
    g.fillStyle(color, 0.5);
    g.fillRoundedRect(cx - 26, cy - 26, 52, 52, 4);
    g.lineStyle(1.5, color, 1);
    g.strokeRoundedRect(cx - 26, cy - 26, 52, 52, 4);
    // 中央ドット
    g.fillStyle(color, 1);
    g.fillRect(cx - 4, cy - 4, 8, 8);

    // ピン (4 辺、各 4 本)
    g.lineStyle(2, color, 0.95);
    g.beginPath();
    for (let i = 0; i < 4; i++) {
      const o = -18 + i * 12;
      // top
      g.moveTo(cx + o, cy - 30);
      g.lineTo(cx + o, cy - 40);
      // bottom
      g.moveTo(cx + o, cy + 30);
      g.lineTo(cx + o, cy + 40);
      // left
      g.moveTo(cx - 30, cy + o);
      g.lineTo(cx - 40, cy + o);
      // right
      g.moveTo(cx + 30, cy + o);
      g.lineTo(cx + 40, cy + o);
    }
    g.strokePath();
  }

  /** ケミカル風: フラスコ。 */
  private drawChemicalArt(g: Phaser.GameObjects.Graphics, cx: number, cy: number, color: number): void {
    // フラスコ口
    g.fillStyle(color, 0.9);
    g.fillRect(cx - 10, cy - 50, 20, 14);
    // 首
    g.fillRect(cx - 4, cy - 36, 8, 14);
    // 本体 (三角形)
    g.fillStyle(color, 0.35);
    g.beginPath();
    g.moveTo(cx - 8, cy - 22);
    g.lineTo(cx - 40, cy + 36);
    g.lineTo(cx + 40, cy + 36);
    g.lineTo(cx + 8, cy - 22);
    g.closePath();
    g.fillPath();
    g.lineStyle(2, color, 1);
    g.beginPath();
    g.moveTo(cx - 8, cy - 22);
    g.lineTo(cx - 40, cy + 36);
    g.lineTo(cx + 40, cy + 36);
    g.lineTo(cx + 8, cy - 22);
    g.closePath();
    g.strokePath();
    // 液面
    g.fillStyle(color, 0.85);
    g.fillRect(cx - 28, cy + 14, 56, 22);
    // 泡
    g.fillStyle(COLORS.highlight, 0.85);
    g.fillCircle(cx - 10, cy + 22, 3);
    g.fillCircle(cx + 6, cy + 16, 2);
    g.fillCircle(cx + 14, cy + 26, 2);
  }

  // ─── タップ処理 ─────────────────────────────────────────────

  private handleTap(): void {
    if (this.claimed) return;
    this.claimed = true;
    this.cardTween?.stop();

    if (this.reward.kind === 'gacha') {
      // GachaOpenScene を mandatory モードで起動 (キャンセル不可)。
      // 合成 ItemInstance を渡す: Inventory には入っていないが、GachaOpenScene の
      // 個体削除 filter は uid 未一致なら no-op なので問題なく動く。
      const syntheticGacha: ItemInstance = {
        uid: crypto.randomUUID(),
        typeId: this.reward.category === 'code' ? 'codeGacha' : 'moduleGacha',
        rarity: this.reward.rarity,
      };
      // 一旦カードを非インタラクティブにして、ガチャシーン中の重ね押しを防ぐ
      this.cardContainer?.setAlpha(0); // カードは飛ばさず単純に消す (ガチャ画面が前面に出るため)
      for (const g of this.chrome) {
        const obj = g as Phaser.GameObjects.GameObject & { disableInteractive?: () => void };
        if (typeof obj.disableInteractive === 'function') obj.disableInteractive();
      }

      this.scene.launch('GachaOpenScene', {
        gacha: syntheticGacha,
        inventory: this.inventory,
        mandatory: true,
        onClosed: () => {
          // ガチャ確定後: 自分自身を閉じる (アイテムボタンへの飛行演出は GachaOpenScene 側で完結)
          this.scene.stop();
          this.onClosed();
        },
      });
      this.scene.bringToTop('GachaOpenScene');
      return;
    }

    // ケミカル: Inventory に追加 → カードを右上アイテムボタンへ飛ばす
    this.inventory.items.push(this.reward.chem);
    this.flyCardToButton();
  }

  /** 受け取り演出: カードを右上アイテムボタンへ縮小 + フェードで飛ばす。 */
  private flyCardToButton(): void {
    const c = this.cardContainer;
    if (!c) {
      this.scene.stop();
      this.onClosed();
      return;
    }
    this.tweens.add({
      targets: c,
      x: this.itemBtnTarget.x,
      y: this.itemBtnTarget.y,
      scale: 0.18,
      alpha: 0.1,
      duration: 520,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.scene.stop();
        this.onClosed();
      },
    });
  }
}
