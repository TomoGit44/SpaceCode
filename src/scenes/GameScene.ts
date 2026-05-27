import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, ECONOMY, PLANETS, SHIP, GAME_SPEED } from '../config';
import { drawStarfield } from '../utils/starfield';
import { Base } from '../entities/Base';
import { Enemy, spawnElectricArc } from '../entities/Enemy';
import { Bullet } from '../entities/Bullet';
import { EnemyBullet } from '../entities/EnemyBullet';
import { Planet } from '../entities/Planet';
import { Ship } from '../entities/Ship';
import { Executor } from '../program/Executor';
import { Program } from '../program/Program';
import { Inventory } from '../items/Inventory';
import { EffectSystem } from '../items/effects';
import { OmniCoreStrip } from '../ui/OmniCoreStrip';
import {
  rollPhaseRewardRarity,
  phaseRewardCategory,
  type GachaCategory,
} from '../items/gacha';
import type { RewardPayload } from './RewardPopupScene';
import { SpawnSystem } from '../systems/SpawnSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { HUD } from '../ui/HUD';
import { RewardBanner } from '../ui/RewardBanner';
import { ShopPanel, type ShopAction } from '../ui/ShopPanel';

const FONT = 'system-ui, "Segoe UI", sans-serif';

/**
 * メインゲームシーン。
 *
 * Phase C:
 *  - WaveSystem が Phase(1..5) を進行
 *  - 敵撃破でクレジット加算 (Phase クリアでボーナス)
 *  - HUD: 基地 HP / クレジット / Phase / ステータス & 中央バナー
 *  - 5 Phase クリアで VictoryScene へ
 */
export class GameScene extends Phaser.Scene {
  private base!: Base;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBullets: EnemyBullet[] = []; // 2026-05-25: sniper が発射する弾
  private planets: Planet[] = [];
  private ships: Ship[] = [];

  private spawner!: SpawnSystem;
  private waves!: WaveSystem;
  private economy!: EconomySystem;
  private hud!: HUD;
  private rewardBanner!: RewardBanner; // Step 3-D: 報酬専用バナー (HUD と並存)
  private shop!: ShopPanel;

  // Phase 6: アイテムシステム。Inventory は Run 毎にここで作り直す = リセット
  // (localStorage 非永続、仕様 §8.5)。
  private inventory!: Inventory;
  private effects!: EffectSystem;
  // 2026-05-25: 画面左上に常時表示する所持オムニ・コアの帯
  private omniCoreStrip!: OmniCoreStrip;

  private terminating: boolean = false; // GameOver / Victory 遷移中

  // 並行 active オーバーレイ (ProgramEditor / ShipList / Gacha) の開いている数。
  // > 0 のとき GameScene の入力を抑止する (Phase 6: editorOpen から一般化)。
  private overlayDepth: number = 0;

  // 当該 Phase 内の累計撃破数 (基地接触は数えない) と、半数到達ボーナス ($80) を
  // 1 回付与したかのフラグ。phaseStart で 0 / false にリセットする。
  private phaseKillCount: number = 0;
  private phaseHalfRewarded: boolean = false;

  // 選択中宇宙船のステータス表示 (HP / エネルギー / 積載量)。同時に表示できるのは 1 隻のみ。
  // クリックで select、空クリックで解除、Ship 死亡で自動解除、別船クリックで移動。
  private selectedShip: Ship | null = null;
  private statPanelContainer: Phaser.GameObjects.Container | null = null;
  private statPanelTexts: Phaser.GameObjects.Text[] = [];
  private selectionRing: Phaser.GameObjects.Graphics | null = null;

  // 右端「アイテム」ボタンのラベル (所持総数バッジ更新用)
  private itemBtnLabel?: Phaser.GameObjects.Text;
  // 報酬ポップアップ用にアイテムボタンの中心座標を保持 (飛行演出のゴール)
  private itemBtnCenter: { x: number; y: number } = { x: 0, y: 0 };

  // 報酬ポップアップのキュー (戦闘中ドロップが連続したときも 1 件ずつ確実に処理)
  private rewardQueue: RewardPayload[] = [];
  private rewardPopupActive = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.fadeIn(280, 5, 7, 13);

    // 状態リセット (Phaser はインスタンスを再利用するため明示リセット)
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.planets = [];
    this.ships = [];
    this.terminating = false;
    this.overlayDepth = 0;
    this.itemBtnLabel = undefined;
    this.itemBtnCenter = { x: 0, y: 0 };
    this.rewardQueue = [];
    this.rewardPopupActive = false;
    this.phaseKillCount = 0;
    this.phaseHalfRewarded = false;
    this.selectedShip = null;
    this.statPanelContainer = null;
    this.statPanelTexts = [];
    this.selectionRing = null;

    // 背景
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // 基地 (Phase 5 後: 砲塔機能内蔵 / 射程リング常時表示)
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.base = new Base(this, cx, cy);

    // 惑星 (Phase D Step 1: 固定 2 個)
    for (const p of PLANETS) {
      this.planets.push(
        new Planet(this, {
          x: p.x,
          y: p.y,
          radius: p.radius,
          initialResources: p.resources,
        })
      );
    }

    // システム
    this.spawner = new SpawnSystem(this, cx, cy);
    this.waves = new WaveSystem(this.spawner);
    this.economy = new EconomySystem();

    // Phase 6: アイテムシステム (新しい Run = 空のインベントリから開始)
    this.inventory = new Inventory();
    this.effects = new EffectSystem(this.inventory);

    // 2026-05-25: スターターオムニ・コア 3 個を装着済みで開始
    // (新コア core_attack_plus / core_efficiency / core_endurance)。
    // 既存 6 個 (core_attack/_thruster/_drill/_hull/_turret/_bounty) は現状の入手経路なし。
    for (const typeId of ['core_attack_plus', 'core_efficiency', 'core_endurance'] as const) {
      this.inventory.items.push({
        uid: crypto.randomUUID(),
        typeId,
        rarity: 'SR',
      });
    }

    // 左上オムニ・コア帯 (HUD HP/Phase 表示の下あたり)
    this.omniCoreStrip = new OmniCoreStrip(this, this.inventory, 12, 76);

    // HUD + 報酬バナー (Step 3-D: 別経路で並存)
    this.hud = new HUD(this, this.base.maxHp);
    this.rewardBanner = new RewardBanner(this);
    this.hud.setHp(this.base.hp);
    this.hud.setCredits(this.economy.credits);
    this.hud.setStageAndPhase(0, this.waves.getTotalStages(), 0, this.waves.getPhasesPerStage());
    this.hud.setStatus('準備時間');

    // ShopPanel (Phase D Step 4)
    this.shop = new ShopPanel(this, this.economy);
    this.shop.on('request', (action) => this.handleShopRequest(action));

    // Phase 6: 右端「アイテム」ボタン
    this.createItemButton();

    // イベント配線
    this.economy.on('change', (credits, delta) => {
      this.hud.setCredits(credits);
      this.hud.flashCredits(delta);
    });

    // 2026-05-26: Stage 拡張。Stage 先頭 Phase (1/21/41/61/81) では stageStart が先に発火する。
    this.waves.on('stageStart', (stageNumber) => {
      // STAGE バナーを先に出す (1.0s)。続く Phase バナーは phaseStart 側で少し遅らせる。
      this.hud.showBanner(`STAGE ${stageNumber}`, 1000, '#3ee0c5');
      this.cameras.main.flash(280, 62, 224, 197, true);
    });

    this.waves.on('phaseStart', (n) => {
      const stage = this.waves.getStageNumber();
      const phaseInStage = this.waves.getPhaseInStage();
      this.hud.setStageAndPhase(
        stage,
        this.waves.getTotalStages(),
        phaseInStage,
        this.waves.getPhasesPerStage(),
      );
      this.hud.setStatus('敵が接近中');
      // Stage 先頭 Phase は stageStart バナー (1.0s) と被るので、Phase バナーを少し遅らせる。
      if (this.waves.isStageBoundary()) {
        this.time.delayedCall(1050, () => {
          if (this.terminating) return;
          this.hud.showBanner(`PHASE ${phaseInStage}`, 1100);
        });
      } else {
        this.hud.showBanner(`PHASE ${phaseInStage}`);
      }
      this.hud.hideStartButton();
      // Phase 6 Step 8: 半数ボーナス用カウンタを Phase 開始ごとにリセット
      this.phaseKillCount = 0;
      this.phaseHalfRewarded = false;
      void n; // n は通し Phase 番号 (1-100)。表示は Stage 内 phase に切替済。
    });

    this.waves.on('phaseClear', (n) => {
      this.economy.add(ECONOMY.phaseClearBonus, 'phaseClear');
      const phaseInStage = this.waves.getPhaseInStage();
      this.hud.showBanner(`PHASE ${phaseInStage} CLEAR`, 1200);
      // Phase 5: クリア時に薄いカメラフラッシュ (alpha 0.12 / 220ms)
      this.cameras.main.flash(220, 62, 224, 197, true);
      // Phase 6 Step 6: クリア報酬としてガチャを 1 個付与 (通し Phase 番号 n でカテゴリ交互振り分け)
      this.grantPhaseClearGacha(n);
    });

    // 準備時間 (preparing) に入ったら開始ボタンを出す。
    this.waves.on('state', (state) => {
      if (state === 'preparing') {
        this.showStartButtonForCurrentPhase();
      } else {
        this.hud.hideStartButton();
      }
    });

    this.waves.on('victory', () => this.endGame('VictoryScene'));

    // Phase 6 Step 7: ボス出現バナー
    this.waves.on('enemySpawned', (e) => {
      if (e.type === 'boss') {
        this.hud.showBanner('⚠ BOSS 接近中', 1400);
        this.cameras.main.shake(180, 0.004);
      }
    });

    // 初回 Phase 1 も準備時間からスタートするので、初期表示でボタンを出す。
    this.showStartButtonForCurrentPhase();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.terminating) return;
      if (this.overlayDepth > 0) return; // ESC はオーバーレイ側が拾う
      this.transitionTo('MenuScene');
    });

    // SPACE / ENTER で開始ボタンを押す (準備時間中のみ HUD が受け付ける)
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.terminating || this.overlayDepth > 0) return;
      this.hud.triggerStartButton();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.terminating || this.overlayDepth > 0) return;
      this.hud.triggerStartButton();
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.terminating) return;
      if (this.overlayDepth > 0) return; // バックドロップが届けても scene-level は止まらないので明示ガード

      // Ship クリックでプログラム編集を開く + ステータス選択
      if (p.rightButtonDown()) return;
      if (p.y >= GAME_HEIGHT - 60) return; // ShopPanel 帯
      const ship = this.findShipAt(p.worldX, p.worldY);
      if (ship) {
        this.setSelectedShip(ship);
        this.openProgramEditor(ship);
      } else {
        // 空きエリアクリックで選択解除
        this.setSelectedShip(null);
      }
    });
  }

  /**
   * 準備時間中の開始ボタンを HUD に出す。
   * waves.startNextPhase() を呼んで spawning に遷移する。
   */
  private showStartButtonForCurrentPhase(): void {
    if (this.terminating) return;
    if (!this.waves.isAwaitingStart()) return;
    const upcoming = this.waves.getUpcomingPhaseNumber();
    const stage = this.waves.getStageNumber();
    const phaseInStage = this.waves.getPhaseInStage();
    this.hud.showStartButton(
      stage,
      phaseInStage,
      this.waves.getPhasesPerStage(),
      () => {
        if (this.terminating) return;
        if (this.overlayDepth > 0) return; // オーバーレイ中は弾く (ボタンはバックドロップで隠れる)
        this.waves.startNextPhase();
      },
      upcoming === 1,
    );
  }

  private handleShopRequest(action: ShopAction): void {
    if (this.terminating) return;
    switch (action) {
      case 'buyShip':
        this.tryBuyShip();
        break;
    }
  }

  private tryBuyShip(): void {
    if (!this.economy.spend(SHIP.cost, 'buyShip')) {
      this.hud.showBanner('クレジット不足', 700);
      return;
    }
    // 基地横に出現 (左右の空いている方)
    const offset = this.ships.length % 2 === 0 ? -1 : 1;
    const sx = this.base.x + offset * (this.base.radius + 24);
    const sy = this.base.y;
    const ship = new Ship(this, sx, sy);
    // Phase 6: プログラム永続化を廃止。新規 Ship は常に空 Program で生成され、
    // コア原則どおり「組まなければ動かない」状態から始まる。
    const program = new Program([]);
    ship.setProgram(program, new Executor(program));
    // Phase 6: 既にオムニ・コア等を所持していれば最大 stat に反映して出現させる
    ship.applyMaxStats(this.effects);
    this.ships.push(ship);
    this.hud.showBanner('船をクリックしてプログラムを編集', 1100);
  }

  /** ワールド座標 (x,y) にいる生存中の Ship を返す (なければ null)。SHIP.radius+4px の円判定。 */
  private findShipAt(x: number, y: number): Ship | null {
    for (const s of this.ships) {
      if (s.dead) continue;
      if (Math.hypot(s.x - x, s.y - y) <= SHIP.radius + 4) return s;
    }
    return null;
  }

  // ─── 選択中宇宙船のステータス表示 ────────────────────────

  /**
   * 選択 Ship を切り替える (null で解除)。
   * ステータスパネル + 目印リングを生成 / 破棄する。同時に表示できるのは 1 隻のみ。
   */
  private setSelectedShip(ship: Ship | null): void {
    if (this.selectedShip === ship) return;
    this.selectedShip = ship;
    if (ship === null) {
      this.destroyStatPanel();
      return;
    }
    this.ensureStatPanel();
    this.updateStatPanel();
  }

  private ensureStatPanel(): void {
    if (this.statPanelContainer) return;
    const container = this.add.container(0, 0).setDepth(18);
    // 3 行 (HP / ENE / INV)。padding 付きで暗背景にしておくと星空に重なっても可読
    for (let i = 0; i < 3; i++) {
      const t = this.add
        .text(0, i * 14, '', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#cfd6e6',
          backgroundColor: '#05070dcc',
          padding: { left: 5, right: 5, top: 1, bottom: 1 },
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(t);
      this.statPanelTexts.push(t);
    }
    this.statPanelContainer = container;
    // 選択中の船の足元に細いティールリング (目印)
    this.selectionRing = this.add.graphics().setDepth(2);
  }

  private destroyStatPanel(): void {
    if (this.statPanelContainer) {
      this.statPanelContainer.destroy();
      this.statPanelContainer = null;
      this.statPanelTexts = [];
    }
    if (this.selectionRing) {
      this.selectionRing.destroy();
      this.selectionRing = null;
    }
  }

  /** パネル位置 + 値を毎フレーム再計算する。HP/エネルギー 0 は赤強調。インベントリは floor。 */
  private updateStatPanel(): void {
    const s = this.selectedShip;
    if (!s || !this.statPanelContainer) return;
    // ship の上にパネル (3 行ぶん = 約 44px) を浮かべる
    this.statPanelContainer.setPosition(s.x, s.y - SHIP.radius - 50);

    const normalColor = '#cfd6e6';
    const alertColor = '#ff4d5a'; // COLORS.enemy

    // HP: 0 で赤 (ダウン状態)
    const hpDown = s.hp <= 0;
    const hpText = this.statPanelTexts[0];
    if (hpText) {
      hpText.setText(`HP  ${Math.ceil(s.hp)}/${s.maxHp}${hpDown ? '  ⚠' : ''}`);
      hpText.setColor(hpDown ? alertColor : normalColor);
    }

    // ENE: 0 で赤 (ストール状態)
    const eneOut = s.energy <= 0;
    const eneText = this.statPanelTexts[1];
    if (eneText) {
      eneText.setText(`ENE ${Math.ceil(s.energy)}/${s.maxEnergy}${eneOut ? '  ⚠' : ''}`);
      eneText.setColor(eneOut ? alertColor : normalColor);
    }

    // INV: 整数で表示 (Math.floor)
    this.statPanelTexts[2]?.setText(`INV ${Math.floor(s.inventory)}/${s.inventoryCap}`);

    // 目印リング: ダウン/ストール時は赤、それ以外はティール
    // 加えて攻撃範囲 (SHIP.attackRange) を破線風の薄いリングで可視化する (2026-05-25 後)。
    if (this.selectionRing) {
      const ringColor = hpDown || eneOut ? COLORS.enemy : COLORS.accent;
      this.selectionRing.clear();
      // 足元の細リング (船そのものの目印)
      this.selectionRing.lineStyle(2, ringColor, 0.85);
      this.selectionRing.strokeCircle(s.x, s.y, SHIP.radius + 5);
      this.selectionRing.lineStyle(1, ringColor, 0.3);
      this.selectionRing.strokeCircle(s.x, s.y, SHIP.radius + 9);
      // 攻撃捕捉範囲 (ATTACK_NEAREST がターゲットを選ぶ距離)
      // ダウン/ストール時はそもそも撃てないので非表示
      if (!hpDown && !eneOut) {
        this.selectionRing.lineStyle(2, ringColor, 0.35);
        this.selectionRing.strokeCircle(s.x, s.y, SHIP.attackRange);
        // 内側に低 alpha の塗りで領域感を出す
        this.selectionRing.fillStyle(ringColor, 0.04);
        this.selectionRing.fillCircle(s.x, s.y, SHIP.attackRange);
      }
    }
  }

  /** プログラム編集オーバーレイを開く。GameScene は active のまま並行更新される。 */
  private openProgramEditor(ship: Ship): void {
    if (this.overlayDepth > 0) return;
    const program = ship.getProgram();
    if (!program) return;
    this.overlayDepth += 1;
    this.scene.launch('ProgramEditorScene', {
      ship,
      inventory: this.inventory,
      getShips: () => this.ships,
      economy: this.economy,
    });
    const editor = this.scene.get('ProgramEditorScene');
    editor.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.overlayDepth -= 1;
      this.refreshItemButton();
    });
    this.scene.bringToTop('ProgramEditorScene');
  }

  /** 宇宙船一覧オーバーレイを開く (ProgramEditor とは排他、ただし船一覧の上に編集を重ねるのは可)。 */
  private openShipList(): void {
    if (this.overlayDepth > 0) return;
    this.overlayDepth += 1;
    this.scene.launch('ShipListScene', {
      inventory: this.inventory,
      getShips: () => this.ships,
      onChanged: () => {
        this.recomputeShipStats();
        this.refreshItemButton();
        this.omniCoreStrip?.refresh();
      },
      onRequestEditProgram: (ship: Ship, onClosed: () => void) =>
        this.openProgramEditorOnTopOfShipList(ship, onClosed),
    });
    const ov = this.scene.get('ShipListScene');
    ov.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.overlayDepth -= 1;
      this.refreshItemButton();
    });
    this.scene.bringToTop('ShipListScene');
  }

  /**
   * 船一覧シーンの上に重ねてプログラム編集を起動する。
   * overlayDepth は ShipList ぶん +1 が既に立っているので、ここでさらに +1 して二重にする。
   * 編集 SHUTDOWN で -1 + onClosed (ShipList 側 scene.resume) を呼ぶ。
   */
  private openProgramEditorOnTopOfShipList(ship: Ship, onClosed: () => void): void {
    this.overlayDepth += 1;
    this.scene.launch('ProgramEditorScene', {
      ship,
      inventory: this.inventory,
      getShips: () => this.ships,
      economy: this.economy,
    });
    const editor = this.scene.get('ProgramEditorScene');
    editor.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.overlayDepth -= 1;
      this.refreshItemButton();
      onClosed();
    });
    this.scene.bringToTop('ProgramEditorScene');
  }

  /** 右端「宇宙船」ボタンを作る (2026-05-27 後: モジュール → 宇宙船に再リデザイン)。 */
  private createItemButton(): void {
    const w = 160;
    const h = 44;
    const cx = GAME_WIDTH - 12 - w / 2;
    const cy = 96;
    this.itemBtnCenter = { x: cx, y: cy };
    const bg = this.add
      .rectangle(cx, cy, w, h, COLORS.panelBg, 0.92)
      .setStrokeStyle(1, COLORS.accent, 0.7)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    this.itemBtnLabel = this.add
      .text(cx, cy, '', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#cfd6e6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(21);
    this.refreshItemButton();
    bg.on('pointerover', () => bg.setFillStyle(COLORS.panelHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(COLORS.panelBg, 0.92));
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      if (this.terminating || this.overlayDepth > 0) return;
      this.openShipList();
    });
  }

  /** 宇宙船ボタンのバッジを更新する (所持船数を表示)。 */
  private refreshItemButton(): void {
    if (!this.itemBtnLabel) return;
    const n = this.ships.length;
    this.itemBtnLabel.setText(`🚀 宇宙船 (${n})`);
  }

  /** 全 Ship の最大 stat を装着アイテムに合わせて再計算する (アイテム構成変化時)。 */
  private recomputeShipStats(): void {
    for (const s of this.ships) s.applyMaxStats(this.effects);
  }

  /** Ship 破壊時: その Ship の装着モジュールをインベントリへ戻す (未装着状態にする)。 */
  private releaseShipItems(ship: Ship): void {
    delete this.inventory.shipModules[ship.id];
  }

  /**
   * Phase クリア報酬 (2026-05-25 新フロー):
   * - カテゴリは Phase 番号で交互 (奇数=code / 偶数=module)、レア度は重み付き抽選
   * - Inventory にガチャ個体を保管せず、RewardPopupScene を直接起動
   *   (タップ → 即時 GachaOpenScene → 1 つ選択 → アイテムボタンへ飛行)
   */
  private grantPhaseClearGacha(phaseNumber: number): void {
    const category = phaseRewardCategory(phaseNumber);
    const rarity = rollPhaseRewardRarity();
    this.enqueueReward({
      kind: 'gacha',
      category,
      rarity,
      heading: `PHASE ${phaseNumber} CLEAR`,
    });
  }

  /** 半数ボーナスのクレジット額。 */
  private static readonly HALF_REWARD_CREDITS = 80;

  /**
   * 当該 Phase の累計撃破数が合計の半数以上に達したら、+$80 クレジットを付与する。
   * モーダルポップアップは出さず、横バナー (RewardBanner) で軽量通知する。
   */
  private checkPhaseHalfReward(): void {
    if (this.phaseHalfRewarded) return;
    const total = this.waves.getPhaseTotal();
    if (total <= 0) return;
    const threshold = Math.floor(total / 2);
    if (this.phaseKillCount < threshold) return;
    this.phaseHalfRewarded = true;
    this.economy.add(GameScene.HALF_REWARD_CREDITS, 'halfReward');
    this.rewardBanner.show({
      rarity: 'N',
      accentColor: COLORS.resource,
      heading: '中盤ボーナス',
      name: `+$${GameScene.HALF_REWARD_CREDITS} クレジット`,
      displayMs: 1400,
    });
  }

  /**
   * 敵撃破時のガチャドロップ判定 (2026-05-25 新フロー: ポップアップ統一)。
   * - basic: ドロップなし
   * - fast: 4% で R ガチャ
   * - tank: 12% で R ガチャ
   * - boss: 100% で SR ガチャ確定
   * カテゴリは 50/50 ランダム。すべて RewardPopupScene 経由で受け取る。
   */
  private rollEnemyDropGacha(enemy: Enemy): void {
    if (enemy.type === 'boss') {
      const category: GachaCategory = Math.random() < 0.5 ? 'code' : 'module';
      this.cameras.main.flash(280, 160, 123, 255, true);
      this.enqueueReward({
        kind: 'gacha',
        category,
        rarity: 'SR',
        heading: 'BOSS DROP',
      });
      return;
    }
    let chance = 0;
    if (enemy.type === 'fast') chance = 0.04;
    else if (enemy.type === 'tank') chance = 0.12;
    if (chance <= 0) return;
    if (Math.random() >= chance) return;
    const category: GachaCategory = Math.random() < 0.5 ? 'code' : 'module';
    this.enqueueReward({
      kind: 'gacha',
      category,
      rarity: 'R',
      heading: enemy.type === 'tank' ? 'TANK DROP' : 'FAST DROP',
    });
  }

  /**
   * 報酬ポップアップキューに追加し、表示中でなければ即起動する (2026-05-25)。
   * 複数の報酬が同時発生した場合 (例: ボス撃破 + 半数ボーナス) も 1 件ずつ順番に表示。
   */
  private enqueueReward(payload: RewardPayload): void {
    this.rewardQueue.push(payload);
    this.tryStartNextReward();
  }

  private tryStartNextReward(): void {
    if (this.terminating) return;
    if (this.rewardPopupActive) return;
    const next = this.rewardQueue.shift();
    if (!next) return;
    this.rewardPopupActive = true;
    this.overlayDepth += 1;
    this.scene.launch('RewardPopupScene', {
      reward: next,
      inventory: this.inventory,
      itemBtnTarget: this.itemBtnCenter,
      onClosed: () => {
        this.rewardPopupActive = false;
        this.overlayDepth -= 1;
        this.refreshItemButton();
        // 次の報酬があれば連続表示
        this.tryStartNextReward();
      },
    });
    this.scene.bringToTop('RewardPopupScene');
  }

  update(_time: number, delta: number): void {
    if (this.terminating) return;

    // 2026-05-25: 準備時間中 (Phase 開始ボタン待ち) はゲーム全体を凍結する。
    // ここで早期 return することで Ship/敵/弾/惑星/Effects がすべて停止し、
    // プレイヤーはプログラム編集・アイテム装着・船購入に集中できる。
    // Phaser tween (バナーイージング、開始ボタン脈動、シーンフェード) は
    // `scene.time` ベースで別経路のため、この return に影響されず動き続ける。
    if (this.waves.getState() === 'preparing') return;

    // 2026-05-25: 報酬ポップアップ表示中もゲームを凍結する。
    // 戦闘中ドロップ (fast/tank/boss) でもプレイヤーが必ず受け取れるようにするため。
    if (this.rewardPopupActive) return;

    // 2026-05-25: ゲーム全体を GAME_SPEED 倍に減速する。
    // ここで delta を一度スケールするだけで、全サブシステム (Base / Planets /
    // Waves / Enemies / Ships / Bullets / Effects) が同じテンポで遅くなる。
    // Phaser tween / camera flash / showBanner は scene 時間ベースのため
    // この場で影響を受けず、UI フィードバックはキビキビ感を維持する。
    delta = delta * GAME_SPEED;

    // 基地: 脈動 + 砲塔発射 (Phase 5 後: タワーを撤廃して基地内蔵)
    this.base.update(delta, this.enemies, this.bullets, this.effects);

    // 惑星 (脈動・残量バー)
    for (const p of this.planets) p.update(delta);

    // Wave 進行
    this.waves.update(delta, this.enemies);

    // 敵更新 (sniper は enemyBullets[] に弾を push する context を受け取る)
    // 2026-05-25 後: hunter の動的ターゲティング用に ships を渡す
    const enemyCtx = { enemyBullets: this.enemyBullets, ships: this.ships };
    for (const e of this.enemies) {
      const wasAlive = !e.dead;
      e.update(delta, enemyCtx);
      if (e.reachedBase && wasAlive && !e.dead) {
        this.base.takeDamage(e.damage);
        this.hud.setHp(this.base.hp);
        // 2026-05-25: 体当たり (charge 種別) で電気スタン演出 + カメラ shake
        if (e.stats.behavior === 'charge') {
          spawnElectricArc(this, e.x, e.y, this.base.x, this.base.y);
        }
        e.consumeOnBaseHit();
        this.cameras.main.shake(120, 0.005);
      }
    }

    // 2026-05-25: 敵弾 (sniper の弾)
    for (const b of this.enemyBullets) {
      b.update(delta);
      if (!b.dead && b.hitsBase(this.base.x, this.base.y, this.base.radius)) {
        this.base.takeDamage(b.getDamage());
        this.hud.setHp(this.base.hp);
        this.cameras.main.shake(80, 0.003);
        b.destroy();
      }
    }

    // 宇宙船 (Phase D)
    if (this.ships.length > 0) {
      const world = {
        base: this.base,
        planets: this.planets,
        enemies: this.enemies,
        bullets: this.bullets,
        economy: this.economy,
        effects: this.effects,
      };
      for (const s of this.ships) s.update(delta, world);
    }

    // 弾 (2026-05-25 後: 直進化に伴い enemies を渡して衝突判定)
    for (const b of this.bullets) {
      b.update(delta, this.enemies);
    }

    // 撃破集計 (2026-05-25 後: 撃破クレジット報酬を廃止)
    //   - クレジット獲得経路は「採掘 → 基地納品」と「半数ボーナス」「Phase クリアボーナス」のみ
    //   - ガチャドロップ判定 / Phase 半数ボーナス判定はそのまま継続
    //   - 基地接触で死んだ敵 (reachedBase=true) はドロップ対象外
    for (const e of this.enemies) {
      if (e.dead && !(e as Enemy & { _counted?: boolean })._counted) {
        if (!e.reachedBase) {
          this.rollEnemyDropGacha(e);
          this.phaseKillCount += 1;
          this.checkPhaseHalfReward();
        }
        (e as Enemy & { _counted?: boolean })._counted = true;
      }
    }

    // 廃棄
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    // Phase 6: 破壊された Ship の装着モジュールはインベントリへ戻す
    const survivors: Ship[] = [];
    for (const s of this.ships) {
      if (s.dead) this.releaseShipItems(s);
      else survivors.push(s);
    }
    this.ships = survivors;

    // 選択 Ship のステータスパネル更新 (死亡や除去で居なくなったら解除)
    if (this.selectedShip) {
      if (this.selectedShip.dead || !this.ships.includes(this.selectedShip)) {
        this.setSelectedShip(null);
      } else {
        this.updateStatPanel();
      }
    }

    // ステータステキスト更新
    this.updateStatusText();

    // ゲームオーバー
    if (this.base.isDestroyed()) {
      this.endGame('GameOverScene');
    }
  }

  private updateStatusText(): void {
    const state = this.waves.getState();
    switch (state) {
      case 'preparing': {
        const stage = this.waves.getStageNumber();
        const phaseInStage = this.waves.getPhaseInStage();
        this.hud.setStatus(`準備時間 — Stage ${stage} / Phase ${phaseInStage} 開始待ち`);
        break;
      }
      case 'spawning': {
        const remaining = this.waves.getPhaseRemaining(
          this.enemies.filter((e) => !e.dead).length
        );
        this.hud.setStatus(`残り ${remaining} 体`);
        break;
      }
      case 'clearing':
        this.hud.setStatus(`残敵掃討中…`);
        break;
      case 'victory':
        this.hud.setStatus('全フェーズ達成');
        break;
    }
  }

  private endGame(targetScene: 'GameOverScene' | 'VictoryScene'): void {
    if (this.terminating) return;
    this.terminating = true;
    const payload = {
      hp: this.base.hp,
      maxHp: this.base.maxHp,
      credits: this.economy.credits,
    };
    this.cameras.main.fadeOut(400, 5, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.cleanup();
      this.scene.start(targetScene, payload);
    });
  }

  private transitionTo(key: string): void {
    if (this.terminating) return;
    this.terminating = true;
    this.cameras.main.fadeOut(280, 5, 7, 13);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.cleanup();
      this.scene.start(key);
    });
  }

  private cleanup(): void {
    // オーバーレイを閉じてから GameScene を終了する
    for (const key of ['ProgramEditorScene', 'ShipListScene', 'GachaOpenScene', 'RewardPopupScene']) {
      if (this.scene.isActive(key)) this.scene.stop(key);
    }
    this.overlayDepth = 0;
    this.rewardPopupActive = false;
    this.rewardQueue = [];

    // 選択 Ship のステータスパネル / リングを破棄
    this.setSelectedShip(null);

    for (const e of this.enemies) e.destroy();
    for (const b of this.bullets) b.destroy();
    for (const p of this.planets) p.destroy();
    for (const s of this.ships) s.destroy();
    for (const b of this.enemyBullets) b.destroy();
    this.base?.destroy();
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.planets = [];
    this.ships = [];
    this.shop?.destroy();
    this.omniCoreStrip?.destroy();
    this.waves?.destroy();
    this.economy?.destroy();
    this.rewardBanner?.destroy();
  }
}
