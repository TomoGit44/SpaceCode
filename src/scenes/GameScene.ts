import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ECONOMY, PLANETS, SHIP, TOWER, BASE } from '../config';
import { drawStarfield } from '../utils/starfield';
import { Base } from '../entities/Base';
import { Tower } from '../entities/Tower';
import { Enemy } from '../entities/Enemy';
import { Bullet } from '../entities/Bullet';
import { Planet } from '../entities/Planet';
import { Ship } from '../entities/Ship';
import { Executor } from '../program/Executor';
import { Program } from '../program/Program';
import { loadShipTemplate } from '../utils/save';
import { SpawnSystem } from '../systems/SpawnSystem';
import { WaveSystem } from '../systems/WaveSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { HUD } from '../ui/HUD';
import { ShopPanel, type ShopAction } from '../ui/ShopPanel';

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
  private towers: Tower[] = [];
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private planets: Planet[] = [];
  private ships: Ship[] = [];

  private spawner!: SpawnSystem;
  private waves!: WaveSystem;
  private economy!: EconomySystem;
  private hud!: HUD;
  private shop!: ShopPanel;

  private terminating: boolean = false; // GameOver / Victory 遷移中

  // タワー設置モード (Phase D Step 4)
  private placingTower: boolean = false;
  private placeGhost?: Phaser.GameObjects.Graphics;

  // ブロック編集オーバーレイ展開中フラグ (Phase 2)
  private editorOpen: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.cameras.main.fadeIn(280, 5, 7, 13);

    // 状態リセット (Phaser はインスタンスを再利用するため明示リセット)
    this.towers = [];
    this.enemies = [];
    this.bullets = [];
    this.planets = [];
    this.ships = [];
    this.terminating = false;
    this.editorOpen = false;

    // 背景
    drawStarfield(this, GAME_WIDTH, GAME_HEIGHT);

    // 基地
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.base = new Base(this, cx, cy);

    // タワー × 2 (Phase B と同じ固定配置)
    this.towers.push(new Tower(this, cx - 150, cy));
    this.towers.push(new Tower(this, cx + 150, cy));

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

    // HUD
    this.hud = new HUD(this, this.base.maxHp);
    this.hud.setHp(this.base.hp);
    this.hud.setCredits(this.economy.credits);
    this.hud.setPhase(0, this.waves.getTotalPhases());
    this.hud.setStatus('開戦準備中…');

    // ShopPanel (Phase D Step 4)
    this.shop = new ShopPanel(this, this.economy);
    this.shop.on('request', (action) => this.handleShopRequest(action));

    // イベント配線
    this.economy.on('change', (credits, delta) => {
      this.hud.setCredits(credits);
      this.hud.flashCredits(delta);
    });

    this.waves.on('phaseStart', (n) => {
      this.hud.setPhase(n, this.waves.getTotalPhases());
      this.hud.setStatus('敵が接近中');
      this.hud.showBanner(`PHASE ${n}`);
    });

    this.waves.on('phaseClear', (n) => {
      this.economy.add(ECONOMY.phaseClearBonus, 'phaseClear');
      this.hud.showBanner(`PHASE ${n} CLEAR`, 1200);
      // Phase 5: クリア時に薄いカメラフラッシュ (alpha 0.12 / 220ms)
      this.cameras.main.flash(220, 62, 224, 197, true);
    });

    this.waves.on('state', (state, info) => {
      if (state === 'intermission' && info.remainingMs !== undefined) {
        // 状態テキストは update 側で常時更新するので、ここではプレースホルダ
      }
    });

    this.waves.on('victory', () => this.endGame('VictoryScene'));

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.terminating) return;
      if (this.editorOpen) return; // ESC は ProgramEditorScene 側が拾う
      if (this.placingTower) {
        this.cancelPlacement();
        return;
      }
      this.transitionTo('MenuScene');
    });

    // タワー設置モードのマウス処理 (Phase D Step 4)
    this.placeGhost = this.add.graphics();
    this.placeGhost.setDepth(9);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.editorOpen) return;
      if (!this.placingTower) return;
      this.drawPlaceGhost(p.worldX, p.worldY);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.terminating) return;
      if (this.editorOpen) return; // バックドロップが届けても scene-level は止まらないので明示ガード

      if (this.placingTower) {
        if (p.rightButtonDown()) {
          this.cancelPlacement();
          return;
        }
        // ShopPanel 領域 (下端) は除外: ボタン押下と衝突しないようにする
        if (p.y >= GAME_HEIGHT - 60) return;
        this.tryPlaceTower(p.worldX, p.worldY);
        return;
      }

      // 通常モード: Ship クリックでプログラム編集を開く
      if (p.rightButtonDown()) return;
      if (p.y >= GAME_HEIGHT - 60) return; // ShopPanel 帯
      const ship = this.findShipAt(p.worldX, p.worldY);
      if (ship) this.openProgramEditor(ship);
    });
  }

  private handleShopRequest(action: ShopAction): void {
    if (this.terminating) return;
    switch (action) {
      case 'buyShip':
        this.tryBuyShip();
        break;
      case 'placeTower':
        if (this.economy.credits < TOWER.cost) {
          this.hud.showBanner('クレジット不足', 700);
          return;
        }
        this.placingTower = true;
        this.shop.showHint('クリックで設置 / 右クリックでキャンセル');
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
    // Phase 4: localStorage にテンプレがあればロード、なければ空 Program。
    // 空テンプレの場合はコア原則どおり「組まなければ動かない」状態で生成される。
    const saved = loadShipTemplate();
    const program = saved ?? new Program([]);
    ship.setProgram(program, new Executor(program));
    this.ships.push(ship);
    const msg = saved && program.length > 0
      ? 'テンプレを読み込みました (クリックで編集)'
      : '船をクリックしてプログラムを編集';
    this.hud.showBanner(msg, 1100);
  }

  private cancelPlacement(): void {
    this.placingTower = false;
    this.placeGhost?.clear();
    this.shop.showHint(null);
  }

  /** ワールド座標 (x,y) にいる生存中の Ship を返す (なければ null)。SHIP.radius+4px の円判定。 */
  private findShipAt(x: number, y: number): Ship | null {
    for (const s of this.ships) {
      if (s.dead) continue;
      if (Math.hypot(s.x - x, s.y - y) <= SHIP.radius + 4) return s;
    }
    return null;
  }

  /** プログラム編集オーバーレイを開く。GameScene は active のまま並行更新される。 */
  private openProgramEditor(ship: Ship): void {
    if (this.editorOpen) return;
    const program = ship.getProgram();
    if (!program) return;
    this.editorOpen = true;
    this.scene.launch('ProgramEditorScene', { ship });
    const editor = this.scene.get('ProgramEditorScene');
    editor.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.editorOpen = false;
    });
    this.scene.bringToTop('ProgramEditorScene');
  }

  /** 配置可否を判定。OK なら null、NG なら理由文字列。 */
  private placementBlocker(x: number, y: number): string | null {
    if (x < 20 || x > GAME_WIDTH - 20) return '画面外';
    if (y < 60 || y > GAME_HEIGHT - 70) return '画面外';
    if (Math.hypot(x - this.base.x, y - this.base.y) < BASE.radius + 30) {
      return '基地に近すぎ';
    }
    for (const p of this.planets) {
      if (Math.hypot(x - p.x, y - p.y) < p.radius + 30) return '惑星に近すぎ';
    }
    for (const t of this.towers) {
      if (Math.hypot(x - t.x, y - t.y) < 24) return 'タワーが重複';
    }
    return null;
  }

  private drawPlaceGhost(x: number, y: number): void {
    if (!this.placeGhost) return;
    const g = this.placeGhost;
    g.clear();
    const blocker = this.placementBlocker(x, y);
    const ok = blocker === null;
    const color = ok ? 0x4ea1ff : 0xff4d5a;
    // 射程リング
    g.lineStyle(1, color, 0.4);
    g.strokeCircle(x, y, TOWER.range);
    // 本体プレビュー
    g.fillStyle(color, 0.35);
    g.fillCircle(x, y, 14);
    g.lineStyle(2, color, 0.9);
    g.strokeCircle(x, y, 14);
  }

  private tryPlaceTower(x: number, y: number): void {
    const blocker = this.placementBlocker(x, y);
    if (blocker !== null) {
      this.hud.showBanner(blocker, 600);
      return;
    }
    if (!this.economy.spend(TOWER.cost, 'buyTower')) {
      this.hud.showBanner('クレジット不足', 700);
      this.cancelPlacement();
      return;
    }
    this.towers.push(new Tower(this, x, y));
    this.cancelPlacement();
  }

  update(_time: number, delta: number): void {
    if (this.terminating) return;

    // 基地脈動
    this.base.update(delta);

    // 惑星 (脈動・残量バー)
    for (const p of this.planets) p.update(delta);

    // Wave 進行
    this.waves.update(delta, this.enemies);

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

    // タワー
    for (const t of this.towers) {
      t.update(delta, this.enemies, this.bullets);
    }

    // 宇宙船 (Phase D)
    if (this.ships.length > 0) {
      const world = {
        base: this.base,
        planets: this.planets,
        enemies: this.enemies,
        bullets: this.bullets,
        economy: this.economy,
      };
      for (const s of this.ships) s.update(delta, world);
    }

    // 弾
    for (const b of this.bullets) {
      b.update(delta);
    }

    // 撃破集計 (Phase 4: 敵種ごとの creditsValue で加算)
    let creditsThisFrame = 0;
    for (const e of this.enemies) {
      if (e.dead && !(e as Enemy & { _counted?: boolean })._counted) {
        // 基地接触で死んだ場合は reachedBase=true (報酬なし)
        if (!e.reachedBase) creditsThisFrame += e.creditsValue;
        (e as Enemy & { _counted?: boolean })._counted = true;
      }
    }
    if (creditsThisFrame > 0) {
      this.economy.add(creditsThisFrame, 'kill');
    }

    // 廃棄
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.ships = this.ships.filter((s) => !s.dead);

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
      case 'preparing':
        this.hud.setStatus(`開戦まで ${Math.ceil(this.waves.getRemainingMs() / 1000)}s`);
        break;
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
      case 'intermission':
        this.hud.setStatus(
          `次フェーズまで ${Math.ceil(this.waves.getRemainingMs() / 1000)}s`
        );
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
    // 編集オーバーレイを閉じてから GameScene を終了する
    if (this.editorOpen || this.scene.isActive('ProgramEditorScene')) {
      this.scene.stop('ProgramEditorScene');
    }
    this.editorOpen = false;

    for (const e of this.enemies) e.destroy();
    for (const b of this.bullets) b.destroy();
    for (const t of this.towers) t.destroy();
    for (const p of this.planets) p.destroy();
    for (const s of this.ships) s.destroy();
    this.enemies = [];
    this.bullets = [];
    this.towers = [];
    this.planets = [];
    this.ships = [];
    this.placeGhost?.destroy();
    this.placeGhost = undefined;
    this.placingTower = false;
    this.shop?.destroy();
    this.waves?.destroy();
    this.economy?.destroy();
  }
}
