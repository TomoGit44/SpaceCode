import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, ECONOMY, PLANETS, SHIP, GAME_SPEED } from '../config';
import { drawStarfield } from '../utils/starfield';
import { Base } from '../entities/Base';
import { Enemy } from '../entities/Enemy';
import { Bullet } from '../entities/Bullet';
import { Planet } from '../entities/Planet';
import { Ship } from '../entities/Ship';
import { Executor } from '../program/Executor';
import { Program } from '../program/Program';
import { Inventory } from '../items/Inventory';
import { EffectSystem } from '../items/effects';
import type { Rarity } from '../items/itemTypes';
import { CHEMICAL_TYPES, makeRandomChemical } from '../items/types/chemicals';
import {
  makeGachaItem,
  rollPhaseRewardRarity,
  phaseRewardCategory,
  type GachaCategory,
} from '../items/gacha';
import { SpawnSystem } from '../systems/SpawnSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { HUD } from '../ui/HUD';
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
  private planets: Planet[] = [];
  private ships: Ship[] = [];

  private spawner!: SpawnSystem;
  private waves!: WaveSystem;
  private economy!: EconomySystem;
  private hud!: HUD;
  private shop!: ShopPanel;

  // Phase 6: アイテムシステム。Inventory は Run 毎にここで作り直す = リセット
  // (localStorage 非永続、仕様 §8.5)。
  private inventory!: Inventory;
  private effects!: EffectSystem;

  private terminating: boolean = false; // GameOver / Victory 遷移中

  // 並行 active オーバーレイ (ProgramEditor / ItemInventory / Gacha) の開いている数。
  // > 0 のとき GameScene の入力を抑止する (Phase 6: editorOpen から一般化)。
  private overlayDepth: number = 0;

  // Phase 6 Step 8: 当該 Phase 内の累計撃破数 (基地接触は数えない) と
  // 半数到達ボーナス (ケミカル N) を 1 回付与したかのフラグ。
  // phaseStart で 0 / false にリセットする。
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

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.fadeIn(280, 5, 7, 13);

    // 状態リセット (Phaser はインスタンスを再利用するため明示リセット)
    this.enemies = [];
    this.bullets = [];
    this.planets = [];
    this.ships = [];
    this.terminating = false;
    this.overlayDepth = 0;
    this.itemBtnLabel = undefined;
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

    // HUD
    this.hud = new HUD(this, this.base.maxHp);
    this.hud.setHp(this.base.hp);
    this.hud.setCredits(this.economy.credits);
    this.hud.setPhase(0, this.waves.getTotalPhases());
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

    this.waves.on('phaseStart', (n) => {
      this.hud.setPhase(n, this.waves.getTotalPhases());
      this.hud.setStatus('敵が接近中');
      this.hud.showBanner(`PHASE ${n}`);
      this.hud.hideStartButton();
      // Phase 6 Step 8: 半数ボーナス用カウンタを Phase 開始ごとにリセット
      this.phaseKillCount = 0;
      this.phaseHalfRewarded = false;
    });

    this.waves.on('phaseClear', (n) => {
      this.economy.add(ECONOMY.phaseClearBonus, 'phaseClear');
      this.hud.showBanner(`PHASE ${n} CLEAR`, 1200);
      // Phase 5: クリア時に薄いカメラフラッシュ (alpha 0.12 / 220ms)
      this.cameras.main.flash(220, 62, 224, 197, true);
      // Phase 6 Step 6: クリア報酬としてガチャを 1 個付与
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
    const total = this.waves.getTotalPhases();
    this.hud.showStartButton(upcoming, total, () => {
      if (this.terminating) return;
      if (this.overlayDepth > 0) return; // オーバーレイ中は弾く (ボタンはバックドロップで隠れる)
      this.waves.startNextPhase();
    });
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
    if (this.selectionRing) {
      const ringColor = hpDown || eneOut ? COLORS.enemy : COLORS.accent;
      this.selectionRing.clear();
      this.selectionRing.lineStyle(2, ringColor, 0.85);
      this.selectionRing.strokeCircle(s.x, s.y, SHIP.radius + 5);
      this.selectionRing.lineStyle(1, ringColor, 0.3);
      this.selectionRing.strokeCircle(s.x, s.y, SHIP.radius + 9);
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

  /** アイテム一覧オーバーレイを開く (ProgramEditor とは排他)。 */
  private openItemInventory(): void {
    if (this.overlayDepth > 0) return;
    this.overlayDepth += 1;
    this.scene.launch('ItemInventoryScene', {
      inventory: this.inventory,
      getShips: () => this.ships,
      onChanged: () => {
        this.recomputeShipStats();
        this.refreshItemButton();
      },
      useChemical: (typeId: string, rarity: Rarity) => this.applyChemical(typeId, rarity),
    });
    const ov = this.scene.get('ItemInventoryScene');
    ov.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.overlayDepth -= 1;
      this.refreshItemButton();
    });
    this.scene.bringToTop('ItemInventoryScene');
  }

  /** 右端「アイテム」ボタンを作る。 */
  private createItemButton(): void {
    // Phase 7: タッチ向けに 130×34 → 160×44 (44pt 以上)、フォントも 14→16
    const w = 160;
    const h = 44;
    const cx = GAME_WIDTH - 12 - w / 2;
    const cy = 96;
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
      this.openItemInventory();
    });
  }

  /** アイテムボタンの所持総数バッジを更新する。 */
  private refreshItemButton(): void {
    if (!this.itemBtnLabel) return;
    const n = this.inventory.items.length + this.inventory.codes.length;
    this.itemBtnLabel.setText(`📦 アイテム (${n})`);
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
   * Phase クリア報酬: カテゴリは Phase 番号で交互 (奇数=code / 偶数=module)、
   * レア度は重み付き抽選 (R 55% / SR 30% / L 15%)。バナーで通知。
   */
  private grantPhaseClearGacha(phaseNumber: number): void {
    const category = phaseRewardCategory(phaseNumber);
    const rarity = rollPhaseRewardRarity();
    const item = makeGachaItem(category, rarity);
    this.inventory.items.push(item);
    this.refreshItemButton();
    const label = category === 'code' ? 'コードガチャ' : 'モジュールガチャ';
    this.hud.showBanner(`報酬: ${rarity} ${label} を獲得`, 1400);
  }

  /**
   * Phase 6 Step 8: 当該 Phase の累計撃破数が合計の半数以上に達したら、
   * ケミカル N をランダムに 1 個ドロップする (Phase ごとに 1 回まで)。
   *
   * 「半数」は floor(total / 2) を超えた瞬間。ボスを含む特殊編成でも
   * 単純な総数比較で十分 (Phase 5 は 14 体 → 7 体撃破で発火)。
   */
  private checkPhaseHalfReward(): void {
    if (this.phaseHalfRewarded) return;
    const total = this.waves.getPhaseTotal();
    if (total <= 0) return;
    const threshold = Math.floor(total / 2);
    if (this.phaseKillCount < threshold) return;
    this.phaseHalfRewarded = true;
    const chem = makeRandomChemical('N');
    this.inventory.items.push(chem);
    this.refreshItemButton();
    const name = CHEMICAL_TYPES[chem.typeId]?.nameJa ?? 'ケミカル';
    this.hud.showBanner(`中盤ボーナス: ${name} を獲得`, 1300);
  }

  /**
   * 敵撃破時のガチャドロップ判定。
   * - basic: ドロップなし
   * - fast: 4% で R ガチャ
   * - tank: 12% で R ガチャ
   * - boss: 100% で SR ガチャ確定 (Phase 6 Step 7)
   * カテゴリは 50/50 ランダム。
   */
  private rollEnemyDropGacha(enemy: Enemy): void {
    if (enemy.type === 'boss') {
      const category: GachaCategory = Math.random() < 0.5 ? 'code' : 'module';
      const item = makeGachaItem(category, 'SR');
      this.inventory.items.push(item);
      this.refreshItemButton();
      const label = category === 'code' ? 'コードガチャ' : 'モジュールガチャ';
      this.hud.showBanner(`ボス撃破! SR ${label} を獲得`, 1600);
      this.cameras.main.flash(280, 160, 123, 255, true);
      return;
    }
    let chance = 0;
    if (enemy.type === 'fast') chance = 0.04;
    else if (enemy.type === 'tank') chance = 0.12;
    if (chance <= 0) return;
    if (Math.random() >= chance) return;
    const category: GachaCategory = Math.random() < 0.5 ? 'code' : 'module';
    const item = makeGachaItem(category, 'R');
    this.inventory.items.push(item);
    this.refreshItemButton();
    const label = category === 'code' ? 'コードガチャ' : 'モジュールガチャ';
    this.hud.showBanner(`ドロップ: R ${label}`, 1100);
  }

  /** ケミカル使用効果を適用する (ItemInventoryScene から呼ばれる)。 */
  private applyChemical(typeId: string, rarity: Rarity): void {
    const chem = CHEMICAL_TYPES[typeId];
    if (!chem) return;
    const v = chem.rarityValue[rarity];
    switch (chem.kind) {
      case 'baseHeal':
        this.base.heal(v);
        this.hud.setHp(this.base.hp);
        break;
      case 'shipHeal':
        for (const s of this.ships) s.heal(v);
        break;
      case 'shipRefuel':
        for (const s of this.ships) s.refuel();
        break;
      case 'credits':
        this.economy.add(v, 'chemical');
        break;
      case 'timedAttack':
        this.effects.addTimedShipBuff(
          chem.buffStat ?? 'damagePerShot',
          v,
          chem.durationMs ?? 20000
        );
        break;
      case 'aoeDamage': {
        const r = chem.radius ?? 300;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - this.base.x, e.y - this.base.y) <= r) e.takeDamage(v);
        }
        break;
      }
    }
  }

  update(_time: number, delta: number): void {
    if (this.terminating) return;

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

    // Phase 6: 装着アイテム効果の時間管理 (時限バフ等。Step 1 は no-op)
    this.effects.tick(delta);

    // 敵更新
    for (const e of this.enemies) {
      const wasAlive = !e.dead;
      e.update(delta);
      if (e.reachedBase && wasAlive && !e.dead) {
        this.base.takeDamage(e.damage);
        this.hud.setHp(this.base.hp);
        e.consumeOnBaseHit();
        this.cameras.main.shake(120, 0.005);
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

    // 弾
    for (const b of this.bullets) {
      b.update(delta);
    }

    // 撃破集計 (Phase 4: 敵種ごとの creditsValue で加算)
    // Phase 6 Step 6: 撃破時にガチャドロップ判定 (基地接触で死んだ敵は対象外)
    // Phase 6 Step 8: 当該 Phase の累計撃破数を更新し、半数到達でケミカル N をドロップ
    let creditsThisFrame = 0;
    for (const e of this.enemies) {
      if (e.dead && !(e as Enemy & { _counted?: boolean })._counted) {
        // 基地接触で死んだ場合は reachedBase=true (報酬なし)
        if (!e.reachedBase) {
          creditsThisFrame += e.creditsValue;
          this.rollEnemyDropGacha(e);
          this.phaseKillCount += 1;
          this.checkPhaseHalfReward();
        }
        (e as Enemy & { _counted?: boolean })._counted = true;
      }
    }
    if (creditsThisFrame > 0) {
      // Phase 6: 撃破報酬は賞金コア (オムニ・コア) で倍率がかかる
      const credits = Math.round(
        this.effects.economyStat('creditsPerKill', creditsThisFrame)
      );
      this.economy.add(credits, 'kill');
    }

    // 廃棄
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
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
        const upcoming = this.waves.getUpcomingPhaseNumber();
        this.hud.setStatus(`準備時間 — PHASE ${upcoming} 開始待ち`);
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
    for (const key of ['ProgramEditorScene', 'ItemInventoryScene', 'GachaOpenScene']) {
      if (this.scene.isActive(key)) this.scene.stop(key);
    }
    this.overlayDepth = 0;

    // 選択 Ship のステータスパネル / リングを破棄
    this.setSelectedShip(null);

    for (const e of this.enemies) e.destroy();
    for (const b of this.bullets) b.destroy();
    for (const p of this.planets) p.destroy();
    for (const s of this.ships) s.destroy();
    this.base?.destroy();
    this.enemies = [];
    this.bullets = [];
    this.planets = [];
    this.ships = [];
    this.shop?.destroy();
    this.waves?.destroy();
    this.economy?.destroy();
  }
}
