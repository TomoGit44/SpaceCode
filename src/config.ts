/**
 * SpaceCode 全体で参照するゲーム定数。
 * バランス調整はまずここを触る (設計書 §8 参照)。
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * ゲーム全体の速度倍率 (2026-05-25)。
 *
 * GameScene.update が `delta *= GAME_SPEED` を冒頭で適用するため、
 * 0.5 にすると敵移動 / 船移動 / スポーン間隔 / 採掘速度 / 弾速度 /
 * WAIT 秒数 / ATTACK 持続 / 基地砲塔発射間隔 すべてが半速になる。
 *
 * UI 演出 (Phaser tween / camera flash / showBanner) は scene 時間ベースで
 * 別経路のため影響を受けない (キビキビ感を保てる)。
 */
export const GAME_SPEED = 0.5;

/**
 * 配色 (Phase 5 で統一): 暗背景 + 高彩度アクセント (味方=青 / 敵=赤 / 資源=黄 / 基地=紫)。
 * UI コンポーネントは panel* / ui / uiDim を使う。エンティティの単発色は base/ally/enemy/resource/accent を直接参照。
 */
export const COLORS = {
  // 背景
  bg: 0x05070d,
  bgAlt: 0x0a1020,
  starDim: 0x1a2540,
  starBright: 0x6b7da0,

  // メインアクセント
  base: 0xa07bff,        // 紫: 基地
  baseRing: 0x5a3ec9,
  ally: 0x4ea1ff,        // 青: 味方 (タワー/宇宙船)
  enemy: 0xff4d5a,       // 赤: 敵
  resource: 0xffd24a,    // 黄: 資源
  accent: 0x3ee0c5,      // ティール: ハイライト
  highlight: 0xffffff,   // 白: コアの中心ハイライト (Bullet/Base 等)

  // テキスト
  ui: 0xcfd6e6,
  uiDim: 0x6b7da0,

  // UI パネル共通色 (Phase 5: HUD / ShopPanel / 編集オーバーレイで共通参照)
  panelBg: 0x1a2540,     // パネル/ボタン背景
  panelHover: 0x223151,  // ホバー時の明るめ
  panelBorder: 0x3a4a6a, // 弱めの境界線

  // 惑星 (Phase 5: ハードコード色を昇格)
  planetBody: 0x8a6f1f,
  planetMark: 0x6b551a,

  // アイテムレア度 (Phase 6)
  rarityN: 0x9aa4ba,     // ノーマル: グレー
  rarityR: 0x4ea1ff,     // レア: 青 (ally 流用)
  raritySR: 0xc66cff,    // スーパーレア: 紫
  rarityL: 0xffd24a,     // レジェンド: 金 (resource 流用)
} as const;

/** 基地: HP=100, ゲームオーバー判定の中心 */
export const BASE = {
  hp: 100,
  radius: 28,
  ringRadius: 36,
} as const;

/**
 * 基地砲塔 (Phase 5 後): タワーを廃止し、基地自体が固定砲塔として機能する。
 * 射程は基地中心から計算し、範囲リングは常時可視化される。
 */
export const BASE_TURRET = {
  range: 260,           // タワー単独 (200) より広く: 唯一の自動防衛になるため
  damagePerShot: 12,    // タワー (10) より少し強い
  fireIntervalMs: 800,  // 1.25 shot/sec → 15 DPS
  bulletSpeed: 420,
} as const;

/** 宇宙船 (Phase 4 バランス調整) */
export const SHIP = {
  hp: 30,
  energy: 100,
  cost: 70,                  // Phase 4: 80 → 70 (敵が強くなる分 Ship 投入のハードルを下げる)
  moveSpeed: 100,            // px/s
  mineRate: 5,               // res/s
  inventoryCap: 20,          // 1 往復で運べる資源量
  energyConsumePerSec: 2,    // 移動中のみ消費 (100/2 = 50s 走行可)
  hpThresholdForRetreat: 8,  // この HP 以下で採掘中断・基地退避
  contactRadius: 18,         // 敵接触判定半径
  depositRadius: 12,         // base.radius + これで納品判定
  damagePerShot: 8,          // attackNearest 時の弾威力
  energyPerShot: 5,          // Phase 4: 射撃 1 発あたりエネルギー消費 (energy 100 で 20 発)
  attackDurationMs: 500,     // Phase 4: ATTACK_NEAREST コード 1 回ぶんの持続時間 (Phase 3 の 600 から短縮)
  bulletSpeed: 380,          // 攻撃弾速 (タワーより遅め)
  attackRange: 220,          // attackNearest の射程
  refuelOnDeposit: true,     // 基地待機中に energy を時間回復するか (Wait コード / 納品)
  refuelDurationMs: 2000,    // 基地での自動補給で maxEnergy を満タンにするまでの所要時間 (ms)。Ship.requestRefuel 経由
  radius: 12,                // 描画基準半径
  // 2026-05-25: 編集画面からクレジット消費で補給/修理 (常時可、ダウン/スタール復帰経路)
  refuelCost: 20,            // エネルギー全回復のクレジット
  repairCost: 40,            // HP 全回復 (ダウン復活含む) のクレジット
} as const;

/** 惑星 (Phase D) */
export const PLANETS: ReadonlyArray<{
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly resources: number;
}> = [
  { x: 220,  y: 200, radius: 30, resources: 80 },
  { x: 1060, y: 540, radius: 30, resources: 80 },
];

/** 惑星共通定数 */
export const PLANET = {
  mineRadiusPadding: 8, // ship が planet.radius + これの距離内で採掘可
  respawnMs: 60000,     // Phase 4: 枯渇後この時間で resources が全回復
} as const;

/**
 * 敵 (Phase 4 で 3 種類化 / Phase 6 Step 7 で boss 追加 /
 * 2026-05-25 で sniper 追加 + 接触ダメ ×1.5 + 電気スタン演出 /
 * 2026-05-25 後で hunter 追加: 宇宙船を優先ターゲットにする charge 系)。
 */
export type EnemyType = 'basic' | 'fast' | 'tank' | 'boss' | 'sniper' | 'hunter';

/** 敵の行動様式。'charge' は基地へ直進+体当たり、'shoot' は射程内で停止+弾発射。 */
export type EnemyBehavior = 'charge' | 'shoot';

export interface EnemyTypeStats {
  readonly hp: number;
  readonly speed: number;        // px/s
  readonly damage: number;        // 基地接触時のダメージ (charge のみ) / contactDps もこれと連動
  readonly radius: number;        // 描画半径
  readonly hitRadius: number;     // 当たり判定 (弾)
  readonly contactRadius: number; // 基地への接触距離 (BASE.radius + α)
  readonly color: number;         // 描画色
  readonly creditsOnKill: number; // 撃破報酬
  readonly behavior: EnemyBehavior; // 'charge' (体当たり) or 'shoot' (弾発射) — 2026-05-25 追加
  /**
   * 2026-05-25 後追加。true のとき宇宙船を優先ターゲットにする (charge 系)。
   * 船が居れば最寄り船を毎フレーム狙い、居なければ基地に向かう。
   * 船接触時に `reachedBase` を立てないため、船にぶつかり続けて接触ダメージを与える挙動になる。
   */
  readonly prefersShip?: boolean;
  // 以下 'shoot' 専用の任意フィールド
  readonly attackRange?: number;     // 基地までこの距離で停止して発射開始
  readonly fireIntervalMs?: number;  // 発射間隔
  readonly bulletDamage?: number;    // 弾ダメージ
  readonly bulletSpeed?: number;     // 弾速 px/s
}

/**
 * 2026-05-25 改修:
 *   - 体当たり敵 (basic/fast/tank/boss) の `damage` を ×1.5 (電気スタンガン演出と整合)
 *   - sniper 追加 (新行動 'shoot': 距離 280 で停止して 1.8s ごとに弾発射)
 */
export const ENEMY_TYPES: Record<EnemyType, EnemyTypeStats> = {
  basic:  { hp: 20,  speed: 60, damage: 15, radius: 10, hitRadius: 12, contactRadius: 24, color: 0xff4d5a, creditsOnKill: 5,  behavior: 'charge' },
  fast:   { hp: 12,  speed: 95, damage: 12, radius: 8,  hitRadius: 10, contactRadius: 22, color: 0xff9040, creditsOnKill: 7,  behavior: 'charge' },
  tank:   { hp: 55,  speed: 38, damage: 22, radius: 14, hitRadius: 16, contactRadius: 28, color: 0xb01828, creditsOnKill: 14, behavior: 'charge' },
  // Phase 6 Step 7: Stage クリア直前のボス。HP 高め / 速度遅め / ダメ大。撃破で SR ガチャ確定 (GameScene 側)。
  boss:   { hp: 200, speed: 30, damage: 45, radius: 22, hitRadius: 26, contactRadius: 38, color: 0xa07bff, creditsOnKill: 50, behavior: 'charge' },
  // 2026-05-25: 遠距離狙撃手。基地まで 280px で停止 → 1.8 秒ごとに弾を直線発射。
  // 体当たり攻撃しないが、基地に弾が当たるとダメージ。船は素通り (バランス簡略化)。
  sniper: {
    hp: 25, speed: 45, damage: 0, radius: 11, hitRadius: 13, contactRadius: 20,
    color: 0x44ddaa, creditsOnKill: 10, behavior: 'shoot',
    attackRange: 280, fireIntervalMs: 1800, bulletDamage: 10, bulletSpeed: 240,
  },
  // 2026-05-25 後: 船狩り (hunter)。宇宙船が居れば最寄り船を最優先で追尾、
  // 居なければ基地へ直進する charge 系。船にぶつかっても reachedBase を立てず
  // 接触ダメージを与え続ける (船を狩り切ったら基地へ流れる)。
  hunter: {
    hp: 28, speed: 80, damage: 18, radius: 11, hitRadius: 13, contactRadius: 22,
    color: 0xe060ff, creditsOnKill: 12, behavior: 'charge',
    prefersShip: true,
  },
};

/** 敵 → 宇宙船 接触ダメージ (Phase D) — 2026-05-25 で 8 → 12 dps に bump (×1.5 整合) */
export const ENEMY_VS_SHIP = {
  contactDps: 12, // 接触持続中の DPS (charge 種別のみ実質ダメージ。sniper は damage=0 で無効化)
} as const;

/** Phase B のスポーン */
export const SPAWN = {
  intervalMs: 2200, // 2.2秒ごと
  initialDelayMs: 1500,
  edgePadding: 30,
} as const;

/** 経済 (Phase 4 バランス調整: 敵バリエーション対策で開戦余裕を増やす) */
export const ECONOMY = {
  resourceToCredit: 2,     // 資源 1 → お金 2
  startCredits: 120,       // Phase 4: 100 → 120 (Phase 1 で Ship 1 + タワー 1 が即購入可)
  creditsPerKill: 5,       // basic 撃破。fast/tank は ENEMY_TYPES.creditsOnKill が優先される
  phaseClearBonus: 30,     // Phase クリアボーナス
} as const;

/**
 * フェーズ進行。
 * Phase 5 後: 準備時間は「プレイヤーが開始ボタンを押すまでの手動待機」に変更。
 *             intermissionMs は廃止 (時間制ではない)。
 *
 * 2026-05-26: 5 Stage × 各 20 Phase = 合計 100 Phase に拡張。
 * - Phase 1-100 が真の番号、Stage は派生概念 (`stage = ceil(phase / 20)`)。
 * - ボス Phase は 20 / 40 / 60 / 80 / 100 の 5 箇所 (各 Stage 末尾)。
 * - WaveSystem の状態機械は Phase 単位の線形進行を維持し、Stage は UI/演出でのみ表現。
 */
export const STAGE = {
  totalPhases: 100,
  totalStages: 5,
  phasesPerStage: 20,
} as const;

/**
 * 各 Phase の敵編成。
 *
 * `enemySpecs` は **並行スポーンタイマー**。各 spec が独立に
 *   - `delayMs` (省略時 0) 経過後にスポーン開始
 *   - `intervalMs` ごとに 1 体出現
 *   - 合計 `count` 体出すと完了
 * Phase は全 spec が完了 + 残敵 0 でクリア扱い。
 *
 * 編成方針 (2026-05-26: 5 Stage × 20 Phase に拡張):
 *   - Stage 1 (Phase 1-20):  basic 中心。Phase 5 で sniper 増、Phase 9 で hunter、Phase 15 で fast 解禁。Phase 20 でボス。
 *   - Stage 2 (Phase 21-40): fast/sniper/hunter 標準化、Phase 35 前後で tank 解禁。Phase 40 でボス。
 *   - Stage 3 (Phase 41-60): 全敵タイプ混在、密度 +30%。Phase 60 でボス。
 *   - Stage 4 (Phase 61-80): 出現密度さらに上昇、特徴的編成。Phase 80 でボス。
 *   - Stage 5 (Phase 81-100): 全種高頻度、intervalMs 最短水準。Phase 100 でボス + 総力戦。
 */
export interface EnemySpec {
  readonly type: EnemyType;
  readonly count: number;
  readonly intervalMs: number;
  readonly delayMs?: number;
}

export const PHASES: ReadonlyArray<{ readonly enemySpecs: ReadonlyArray<EnemySpec> }> = [
  // ═══════════════════════════════════════════════════════════════════
  //  Stage 1 (Phase 1-20) — 入門: basic 中心、sniper/hunter/fast を段階導入
  // ═══════════════════════════════════════════════════════════════════
  // Phase 1: 超初心者向け。basic だけ少量。
  { enemySpecs: [
      { type: 'basic',  count: 4, intervalMs: 2400 },
  ]},
  // Phase 2
  { enemySpecs: [
      { type: 'basic',  count: 5, intervalMs: 2300 },
  ]},
  // Phase 3
  { enemySpecs: [
      { type: 'basic',  count: 6, intervalMs: 2200 },
  ]},
  // Phase 4: sniper 初登場 (1 体だけ)。
  { enemySpecs: [
      { type: 'basic',  count: 5, intervalMs: 2100 },
      { type: 'sniper', count: 1, intervalMs: 1,    delayMs: 5000 },
  ]},
  // Phase 5: sniper 増。
  { enemySpecs: [
      { type: 'basic',  count: 6, intervalMs: 2000 },
      { type: 'sniper', count: 2, intervalMs: 5500, delayMs: 4000 },
  ]},
  // Phase 6
  { enemySpecs: [
      { type: 'basic',  count: 7, intervalMs: 1950 },
      { type: 'sniper', count: 2, intervalMs: 5000, delayMs: 4000 },
  ]},
  // Phase 7
  { enemySpecs: [
      { type: 'basic',  count: 7, intervalMs: 1900 },
      { type: 'sniper', count: 2, intervalMs: 5000, delayMs: 4000 },
  ]},
  // Phase 8
  { enemySpecs: [
      { type: 'basic',  count: 8, intervalMs: 1900 },
      { type: 'sniper', count: 2, intervalMs: 4800, delayMs: 4000 },
  ]},
  // Phase 9: hunter 初登場 (1 体だけ)。
  { enemySpecs: [
      { type: 'basic',  count: 8, intervalMs: 1850 },
      { type: 'sniper', count: 2, intervalMs: 4500, delayMs: 4000 },
      { type: 'hunter', count: 1, intervalMs: 1,    delayMs: 6000 },
  ]},
  // Phase 10
  { enemySpecs: [
      { type: 'basic',  count: 8, intervalMs: 1800 },
      { type: 'sniper', count: 2, intervalMs: 4500, delayMs: 3500 },
      { type: 'hunter', count: 1, intervalMs: 1,    delayMs: 6000 },
  ]},
  // Phase 11
  { enemySpecs: [
      { type: 'basic',  count: 9, intervalMs: 1800 },
      { type: 'sniper', count: 2, intervalMs: 4500, delayMs: 3500 },
      { type: 'hunter', count: 2, intervalMs: 5500, delayMs: 5000 },
  ]},
  // Phase 12
  { enemySpecs: [
      { type: 'basic',  count: 9, intervalMs: 1750 },
      { type: 'sniper', count: 2, intervalMs: 4300, delayMs: 3000 },
      { type: 'hunter', count: 2, intervalMs: 5000, delayMs: 5000 },
  ]},
  // Phase 13
  { enemySpecs: [
      { type: 'basic',  count: 10, intervalMs: 1700 },
      { type: 'sniper', count: 3,  intervalMs: 4500, delayMs: 3000 },
      { type: 'hunter', count: 2,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 14
  { enemySpecs: [
      { type: 'basic',  count: 10, intervalMs: 1700 },
      { type: 'sniper', count: 3,  intervalMs: 4300, delayMs: 3000 },
      { type: 'hunter', count: 2,  intervalMs: 4800, delayMs: 4500 },
  ]},
  // Phase 15: fast 初登場。
  { enemySpecs: [
      { type: 'basic',  count: 8,  intervalMs: 1700 },
      { type: 'sniper', count: 2,  intervalMs: 4300, delayMs: 3000 },
      { type: 'hunter', count: 2,  intervalMs: 4500, delayMs: 4500 },
      { type: 'fast',   count: 2,  intervalMs: 1500, delayMs: 5000 },
  ]},
  // Phase 16
  { enemySpecs: [
      { type: 'basic',  count: 9,  intervalMs: 1650 },
      { type: 'sniper', count: 3,  intervalMs: 4300, delayMs: 3000 },
      { type: 'hunter', count: 2,  intervalMs: 4500, delayMs: 4500 },
      { type: 'fast',   count: 3,  intervalMs: 1500, delayMs: 4500 },
  ]},
  // Phase 17
  { enemySpecs: [
      { type: 'basic',  count: 10, intervalMs: 1600 },
      { type: 'sniper', count: 3,  intervalMs: 4200, delayMs: 2800 },
      { type: 'hunter', count: 2,  intervalMs: 4300, delayMs: 4000 },
      { type: 'fast',   count: 3,  intervalMs: 1450, delayMs: 4500 },
  ]},
  // Phase 18
  { enemySpecs: [
      { type: 'basic',  count: 10, intervalMs: 1600 },
      { type: 'sniper', count: 3,  intervalMs: 4000, delayMs: 2800 },
      { type: 'hunter', count: 3,  intervalMs: 4500, delayMs: 4000 },
      { type: 'fast',   count: 3,  intervalMs: 1400, delayMs: 4000 },
  ]},
  // Phase 19
  { enemySpecs: [
      { type: 'basic',  count: 11, intervalMs: 1550 },
      { type: 'sniper', count: 3,  intervalMs: 4000, delayMs: 2500 },
      { type: 'hunter', count: 3,  intervalMs: 4500, delayMs: 4000 },
      { type: 'fast',   count: 4,  intervalMs: 1400, delayMs: 4000 },
  ]},
  // Phase 20: ★ Stage 1 ボス Phase ★ 雑魚を捌いたあとに boss が遅れて 1 体登場。
  { enemySpecs: [
      { type: 'basic',  count: 10, intervalMs: 1500 },
      { type: 'sniper', count: 3,  intervalMs: 4000, delayMs: 2500 },
      { type: 'hunter', count: 3,  intervalMs: 4500, delayMs: 4000 },
      { type: 'fast',   count: 4,  intervalMs: 1400, delayMs: 4000 },
      { type: 'boss',   count: 1,  intervalMs: 1,    delayMs: 16000 },
  ]},

  // ═══════════════════════════════════════════════════════════════════
  //  Stage 2 (Phase 21-40) — 中盤前: fast/sniper/hunter 標準化、Phase 35 で tank 解禁
  // ═══════════════════════════════════════════════════════════════════
  // Phase 21
  { enemySpecs: [
      { type: 'basic',  count: 10, intervalMs: 1500 },
      { type: 'sniper', count: 3,  intervalMs: 4000, delayMs: 2500 },
      { type: 'hunter', count: 3,  intervalMs: 4500, delayMs: 4000 },
      { type: 'fast',   count: 4,  intervalMs: 1400, delayMs: 3500 },
  ]},
  // Phase 22
  { enemySpecs: [
      { type: 'basic',  count: 11, intervalMs: 1500 },
      { type: 'sniper', count: 3,  intervalMs: 3800, delayMs: 2500 },
      { type: 'hunter', count: 3,  intervalMs: 4500, delayMs: 3800 },
      { type: 'fast',   count: 4,  intervalMs: 1400, delayMs: 3500 },
  ]},
  // Phase 23
  { enemySpecs: [
      { type: 'basic',  count: 11, intervalMs: 1450 },
      { type: 'sniper', count: 3,  intervalMs: 3800, delayMs: 2500 },
      { type: 'hunter', count: 3,  intervalMs: 4300, delayMs: 3500 },
      { type: 'fast',   count: 4,  intervalMs: 1350, delayMs: 3500 },
  ]},
  // Phase 24
  { enemySpecs: [
      { type: 'basic',  count: 12, intervalMs: 1400 },
      { type: 'sniper', count: 3,  intervalMs: 3800, delayMs: 2200 },
      { type: 'hunter', count: 3,  intervalMs: 4300, delayMs: 3500 },
      { type: 'fast',   count: 5,  intervalMs: 1350, delayMs: 3300 },
  ]},
  // Phase 25
  { enemySpecs: [
      { type: 'basic',  count: 12, intervalMs: 1400 },
      { type: 'sniper', count: 3,  intervalMs: 3700, delayMs: 2200 },
      { type: 'hunter', count: 3,  intervalMs: 4200, delayMs: 3500 },
      { type: 'fast',   count: 5,  intervalMs: 1300, delayMs: 3300 },
  ]},
  // Phase 26
  { enemySpecs: [
      { type: 'basic',  count: 12, intervalMs: 1380 },
      { type: 'sniper', count: 4,  intervalMs: 4000, delayMs: 2200 },
      { type: 'hunter', count: 3,  intervalMs: 4200, delayMs: 3200 },
      { type: 'fast',   count: 5,  intervalMs: 1300, delayMs: 3000 },
  ]},
  // Phase 27
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1350 },
      { type: 'sniper', count: 4,  intervalMs: 3800, delayMs: 2000 },
      { type: 'hunter', count: 3,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 5,  intervalMs: 1300, delayMs: 3000 },
  ]},
  // Phase 28
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1350 },
      { type: 'sniper', count: 4,  intervalMs: 3800, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4400, delayMs: 3500 },
      { type: 'fast',   count: 5,  intervalMs: 1300, delayMs: 3000 },
  ]},
  // Phase 29
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1300 },
      { type: 'sniper', count: 4,  intervalMs: 3700, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4300, delayMs: 3500 },
      { type: 'fast',   count: 6,  intervalMs: 1300, delayMs: 3000 },
  ]},
  // Phase 30
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1300 },
      { type: 'sniper', count: 4,  intervalMs: 3700, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4300, delayMs: 3300 },
      { type: 'fast',   count: 6,  intervalMs: 1250, delayMs: 2800 },
  ]},
  // Phase 31
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1280 },
      { type: 'sniper', count: 4,  intervalMs: 3600, delayMs: 1800 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3200 },
      { type: 'fast',   count: 6,  intervalMs: 1250, delayMs: 2800 },
  ]},
  // Phase 32
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1280 },
      { type: 'sniper', count: 4,  intervalMs: 3500, delayMs: 1800 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 6,  intervalMs: 1250, delayMs: 2800 },
  ]},
  // Phase 33
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1250 },
      { type: 'sniper', count: 5,  intervalMs: 3800, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 7,  intervalMs: 1250, delayMs: 2800 },
  ]},
  // Phase 34
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1250 },
      { type: 'sniper', count: 5,  intervalMs: 3700, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 7,  intervalMs: 1200, delayMs: 2800 },
  ]},
  // Phase 35: tank 初登場 (1 体)。
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1250 },
      { type: 'sniper', count: 4,  intervalMs: 3700, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 6,  intervalMs: 1200, delayMs: 2800 },
      { type: 'tank',   count: 1,  intervalMs: 1,    delayMs: 8000 },
  ]},
  // Phase 36
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1250 },
      { type: 'sniper', count: 4,  intervalMs: 3700, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 6,  intervalMs: 1200, delayMs: 2700 },
      { type: 'tank',   count: 1,  intervalMs: 1,    delayMs: 7000 },
  ]},
  // Phase 37
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1200 },
      { type: 'sniper', count: 5,  intervalMs: 3700, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4500, delayMs: 3500 },
      { type: 'fast',   count: 7,  intervalMs: 1200, delayMs: 2700 },
      { type: 'tank',   count: 2,  intervalMs: 6000, delayMs: 7000 },
  ]},
  // Phase 38
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1200 },
      { type: 'sniper', count: 5,  intervalMs: 3600, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4500, delayMs: 3500 },
      { type: 'fast',   count: 7,  intervalMs: 1200, delayMs: 2500 },
      { type: 'tank',   count: 2,  intervalMs: 5500, delayMs: 7000 },
  ]},
  // Phase 39
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1180 },
      { type: 'sniper', count: 5,  intervalMs: 3600, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4500, delayMs: 3300 },
      { type: 'fast',   count: 8,  intervalMs: 1200, delayMs: 2500 },
      { type: 'tank',   count: 2,  intervalMs: 5500, delayMs: 7000 },
  ]},
  // Phase 40: ★ Stage 2 ボス Phase ★
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1180 },
      { type: 'sniper', count: 5,  intervalMs: 3600, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4500, delayMs: 3500 },
      { type: 'fast',   count: 8,  intervalMs: 1200, delayMs: 2500 },
      { type: 'tank',   count: 2,  intervalMs: 5500, delayMs: 7000 },
      { type: 'boss',   count: 1,  intervalMs: 1,    delayMs: 16000 },
  ]},

  // ═══════════════════════════════════════════════════════════════════
  //  Stage 3 (Phase 41-60) — 中盤: 全敵タイプ混在、Stage 2 比で密度 +30%
  // ═══════════════════════════════════════════════════════════════════
  // Phase 41
  { enemySpecs: [
      { type: 'basic',  count: 11, intervalMs: 1150 },
      { type: 'sniper', count: 4,  intervalMs: 3500, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4300, delayMs: 3200 },
      { type: 'fast',   count: 5,  intervalMs: 1180, delayMs: 3000 },
      { type: 'tank',   count: 1,  intervalMs: 1,    delayMs: 8000 },
  ]},
  // Phase 42
  { enemySpecs: [
      { type: 'basic',  count: 12, intervalMs: 1130 },
      { type: 'sniper', count: 4,  intervalMs: 3500, delayMs: 2000 },
      { type: 'hunter', count: 4,  intervalMs: 4300, delayMs: 3000 },
      { type: 'fast',   count: 5,  intervalMs: 1180, delayMs: 2800 },
      { type: 'tank',   count: 1,  intervalMs: 1,    delayMs: 7500 },
  ]},
  // Phase 43
  { enemySpecs: [
      { type: 'basic',  count: 12, intervalMs: 1100 },
      { type: 'sniper', count: 4,  intervalMs: 3400, delayMs: 1800 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 3000 },
      { type: 'fast',   count: 6,  intervalMs: 1150, delayMs: 2800 },
      { type: 'tank',   count: 1,  intervalMs: 1,    delayMs: 7000 },
  ]},
  // Phase 44
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1100 },
      { type: 'sniper', count: 4,  intervalMs: 3400, delayMs: 1800 },
      { type: 'hunter', count: 4,  intervalMs: 4200, delayMs: 2800 },
      { type: 'fast',   count: 6,  intervalMs: 1150, delayMs: 2700 },
      { type: 'tank',   count: 2,  intervalMs: 6500, delayMs: 7000 },
  ]},
  // Phase 45
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1080 },
      { type: 'sniper', count: 5,  intervalMs: 3500, delayMs: 2000 },
      { type: 'hunter', count: 5,  intervalMs: 4400, delayMs: 3200 },
      { type: 'fast',   count: 6,  intervalMs: 1150, delayMs: 2500 },
      { type: 'tank',   count: 2,  intervalMs: 6300, delayMs: 6500 },
  ]},
  // Phase 46
  { enemySpecs: [
      { type: 'basic',  count: 13, intervalMs: 1080 },
      { type: 'sniper', count: 5,  intervalMs: 3400, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4300, delayMs: 3000 },
      { type: 'fast',   count: 7,  intervalMs: 1120, delayMs: 2500 },
      { type: 'tank',   count: 2,  intervalMs: 6200, delayMs: 6500 },
  ]},
  // Phase 47
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1050 },
      { type: 'sniper', count: 5,  intervalMs: 3400, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4300, delayMs: 2800 },
      { type: 'fast',   count: 7,  intervalMs: 1120, delayMs: 2300 },
      { type: 'tank',   count: 2,  intervalMs: 6000, delayMs: 6000 },
  ]},
  // Phase 48
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1050 },
      { type: 'sniper', count: 5,  intervalMs: 3300, delayMs: 1700 },
      { type: 'hunter', count: 5,  intervalMs: 4200, delayMs: 2800 },
      { type: 'fast',   count: 7,  intervalMs: 1100, delayMs: 2300 },
      { type: 'tank',   count: 3,  intervalMs: 6200, delayMs: 6500 },
  ]},
  // Phase 49
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1030 },
      { type: 'sniper', count: 5,  intervalMs: 3300, delayMs: 1700 },
      { type: 'hunter', count: 5,  intervalMs: 4200, delayMs: 2700 },
      { type: 'fast',   count: 8,  intervalMs: 1100, delayMs: 2200 },
      { type: 'tank',   count: 3,  intervalMs: 6000, delayMs: 6000 },
  ]},
  // Phase 50
  { enemySpecs: [
      { type: 'basic',  count: 15, intervalMs: 1030 },
      { type: 'sniper', count: 6,  intervalMs: 3400, delayMs: 1800 },
      { type: 'hunter', count: 5,  intervalMs: 4200, delayMs: 2700 },
      { type: 'fast',   count: 8,  intervalMs: 1080, delayMs: 2200 },
      { type: 'tank',   count: 3,  intervalMs: 5800, delayMs: 6000 },
  ]},
  // Phase 51
  { enemySpecs: [
      { type: 'basic',  count: 16, intervalMs: 1000 },
      { type: 'sniper', count: 6,  intervalMs: 3300, delayMs: 1700 },
      { type: 'hunter', count: 6,  intervalMs: 4400, delayMs: 3000 },
      { type: 'fast',   count: 8,  intervalMs: 1080, delayMs: 2000 },
      { type: 'tank',   count: 3,  intervalMs: 5800, delayMs: 5800 },
  ]},
  // Phase 52
  { enemySpecs: [
      { type: 'basic',  count: 16, intervalMs: 1000 },
      { type: 'sniper', count: 6,  intervalMs: 3300, delayMs: 1700 },
      { type: 'hunter', count: 6,  intervalMs: 4300, delayMs: 2800 },
      { type: 'fast',   count: 9,  intervalMs: 1080, delayMs: 2000 },
      { type: 'tank',   count: 3,  intervalMs: 5700, delayMs: 5800 },
  ]},
  // Phase 53
  { enemySpecs: [
      { type: 'basic',  count: 17, intervalMs: 980 },
      { type: 'sniper', count: 6,  intervalMs: 3200, delayMs: 1500 },
      { type: 'hunter', count: 6,  intervalMs: 4300, delayMs: 2800 },
      { type: 'fast',   count: 9,  intervalMs: 1060, delayMs: 2000 },
      { type: 'tank',   count: 3,  intervalMs: 5700, delayMs: 5500 },
  ]},
  // Phase 54
  { enemySpecs: [
      { type: 'basic',  count: 17, intervalMs: 980 },
      { type: 'sniper', count: 6,  intervalMs: 3200, delayMs: 1500 },
      { type: 'hunter', count: 6,  intervalMs: 4200, delayMs: 2600 },
      { type: 'fast',   count: 9,  intervalMs: 1060, delayMs: 1800 },
      { type: 'tank',   count: 4,  intervalMs: 6000, delayMs: 6000 },
  ]},
  // Phase 55
  { enemySpecs: [
      { type: 'basic',  count: 17, intervalMs: 960 },
      { type: 'sniper', count: 6,  intervalMs: 3200, delayMs: 1500 },
      { type: 'hunter', count: 7,  intervalMs: 4400, delayMs: 2800 },
      { type: 'fast',   count: 10, intervalMs: 1060, delayMs: 1800 },
      { type: 'tank',   count: 4,  intervalMs: 5800, delayMs: 5800 },
  ]},
  // Phase 56
  { enemySpecs: [
      { type: 'basic',  count: 18, intervalMs: 950 },
      { type: 'sniper', count: 6,  intervalMs: 3100, delayMs: 1400 },
      { type: 'hunter', count: 7,  intervalMs: 4300, delayMs: 2700 },
      { type: 'fast',   count: 10, intervalMs: 1050, delayMs: 1700 },
      { type: 'tank',   count: 4,  intervalMs: 5700, delayMs: 5500 },
  ]},
  // Phase 57
  { enemySpecs: [
      { type: 'basic',  count: 18, intervalMs: 930 },
      { type: 'sniper', count: 7,  intervalMs: 3300, delayMs: 1500 },
      { type: 'hunter', count: 7,  intervalMs: 4300, delayMs: 2700 },
      { type: 'fast',   count: 10, intervalMs: 1050, delayMs: 1700 },
      { type: 'tank',   count: 4,  intervalMs: 5500, delayMs: 5500 },
  ]},
  // Phase 58
  { enemySpecs: [
      { type: 'basic',  count: 18, intervalMs: 920 },
      { type: 'sniper', count: 7,  intervalMs: 3200, delayMs: 1400 },
      { type: 'hunter', count: 7,  intervalMs: 4200, delayMs: 2500 },
      { type: 'fast',   count: 11, intervalMs: 1050, delayMs: 1500 },
      { type: 'tank',   count: 4,  intervalMs: 5500, delayMs: 5300 },
  ]},
  // Phase 59
  { enemySpecs: [
      { type: 'basic',  count: 19, intervalMs: 900 },
      { type: 'sniper', count: 7,  intervalMs: 3200, delayMs: 1400 },
      { type: 'hunter', count: 7,  intervalMs: 4200, delayMs: 2500 },
      { type: 'fast',   count: 11, intervalMs: 1050, delayMs: 1500 },
      { type: 'tank',   count: 4,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 60: ★ Stage 3 ボス Phase ★
  { enemySpecs: [
      { type: 'basic',  count: 16, intervalMs: 900 },
      { type: 'sniper', count: 6,  intervalMs: 3200, delayMs: 1400 },
      { type: 'hunter', count: 6,  intervalMs: 4400, delayMs: 2700 },
      { type: 'fast',   count: 10, intervalMs: 1050, delayMs: 1700 },
      { type: 'tank',   count: 4,  intervalMs: 5500, delayMs: 5500 },
      { type: 'boss',   count: 1,  intervalMs: 1,    delayMs: 15000 },
  ]},

  // ═══════════════════════════════════════════════════════════════════
  //  Stage 4 (Phase 61-80) — 後半: 出現密度さらに上昇、特徴 Phase 3 種
  //    Phase 65: sniper ラッシュ (遠距離弾の圧)
  //    Phase 70: tank ラッシュ (重装甲多数)
  //    Phase 75: fast 速攻波 (短時間に大量 fast)
  // ═══════════════════════════════════════════════════════════════════
  // Phase 61
  { enemySpecs: [
      { type: 'basic',  count: 20, intervalMs: 880 },
      { type: 'sniper', count: 7,  intervalMs: 3100, delayMs: 1300 },
      { type: 'hunter', count: 7,  intervalMs: 4100, delayMs: 2400 },
      { type: 'fast',   count: 12, intervalMs: 1030, delayMs: 1500 },
      { type: 'tank',   count: 4,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 62
  { enemySpecs: [
      { type: 'basic',  count: 20, intervalMs: 860 },
      { type: 'sniper', count: 7,  intervalMs: 3100, delayMs: 1300 },
      { type: 'hunter', count: 7,  intervalMs: 4100, delayMs: 2400 },
      { type: 'fast',   count: 12, intervalMs: 1020, delayMs: 1400 },
      { type: 'tank',   count: 4,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 63
  { enemySpecs: [
      { type: 'basic',  count: 21, intervalMs: 850 },
      { type: 'sniper', count: 7,  intervalMs: 3000, delayMs: 1200 },
      { type: 'hunter', count: 7,  intervalMs: 4000, delayMs: 2300 },
      { type: 'fast',   count: 13, intervalMs: 1020, delayMs: 1400 },
      { type: 'tank',   count: 4,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 64
  { enemySpecs: [
      { type: 'basic',  count: 21, intervalMs: 830 },
      { type: 'sniper', count: 7,  intervalMs: 3000, delayMs: 1200 },
      { type: 'hunter', count: 8,  intervalMs: 4200, delayMs: 2500 },
      { type: 'fast',   count: 13, intervalMs: 1010, delayMs: 1300 },
      { type: 'tank',   count: 5,  intervalMs: 5500, delayMs: 5300 },
  ]},
  // Phase 65: ★特徴★ sniper ラッシュ。total は控えめだが遠距離弾の圧がきつい。
  { enemySpecs: [
      { type: 'basic',  count: 14, intervalMs: 1000 },
      { type: 'sniper', count: 12, intervalMs: 2800, delayMs: 1200 },
      { type: 'hunter', count: 5,  intervalMs: 4500, delayMs: 2700 },
      { type: 'fast',   count: 8,  intervalMs: 1100, delayMs: 1800 },
      { type: 'tank',   count: 3,  intervalMs: 6000, delayMs: 5500 },
  ]},
  // Phase 66
  { enemySpecs: [
      { type: 'basic',  count: 22, intervalMs: 820 },
      { type: 'sniper', count: 8,  intervalMs: 3000, delayMs: 1200 },
      { type: 'hunter', count: 8,  intervalMs: 4100, delayMs: 2300 },
      { type: 'fast',   count: 13, intervalMs: 1010, delayMs: 1300 },
      { type: 'tank',   count: 5,  intervalMs: 5500, delayMs: 5300 },
  ]},
  // Phase 67
  { enemySpecs: [
      { type: 'basic',  count: 22, intervalMs: 800 },
      { type: 'sniper', count: 8,  intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 8,  intervalMs: 4100, delayMs: 2300 },
      { type: 'fast',   count: 14, intervalMs: 1000, delayMs: 1300 },
      { type: 'tank',   count: 5,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 68
  { enemySpecs: [
      { type: 'basic',  count: 23, intervalMs: 800 },
      { type: 'sniper', count: 8,  intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 8,  intervalMs: 4000, delayMs: 2200 },
      { type: 'fast',   count: 14, intervalMs: 1000, delayMs: 1200 },
      { type: 'tank',   count: 5,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 69
  { enemySpecs: [
      { type: 'basic',  count: 23, intervalMs: 780 },
      { type: 'sniper', count: 9,  intervalMs: 3000, delayMs: 1300 },
      { type: 'hunter', count: 9,  intervalMs: 4200, delayMs: 2400 },
      { type: 'fast',   count: 14, intervalMs: 1000, delayMs: 1200 },
      { type: 'tank',   count: 5,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 70: ★特徴★ tank ラッシュ。重装甲多数で削るのに時間がかかる。
  { enemySpecs: [
      { type: 'basic',  count: 16, intervalMs: 900 },
      { type: 'sniper', count: 6,  intervalMs: 3200, delayMs: 1500 },
      { type: 'hunter', count: 6,  intervalMs: 4300, delayMs: 2500 },
      { type: 'fast',   count: 9,  intervalMs: 1050, delayMs: 1800 },
      { type: 'tank',   count: 8,  intervalMs: 4500, delayMs: 4000 },
  ]},
  // Phase 71
  { enemySpecs: [
      { type: 'basic',  count: 23, intervalMs: 770 },
      { type: 'sniper', count: 9,  intervalMs: 3000, delayMs: 1300 },
      { type: 'hunter', count: 9,  intervalMs: 4200, delayMs: 2400 },
      { type: 'fast',   count: 15, intervalMs: 1000, delayMs: 1200 },
      { type: 'tank',   count: 5,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 72
  { enemySpecs: [
      { type: 'basic',  count: 24, intervalMs: 770 },
      { type: 'sniper', count: 9,  intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 9,  intervalMs: 4100, delayMs: 2300 },
      { type: 'fast',   count: 15, intervalMs: 990,  delayMs: 1100 },
      { type: 'tank',   count: 5,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 73
  { enemySpecs: [
      { type: 'basic',  count: 24, intervalMs: 750 },
      { type: 'sniper', count: 9,  intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 9,  intervalMs: 4100, delayMs: 2300 },
      { type: 'fast',   count: 15, intervalMs: 990,  delayMs: 1100 },
      { type: 'tank',   count: 6,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 74
  { enemySpecs: [
      { type: 'basic',  count: 25, intervalMs: 750 },
      { type: 'sniper', count: 10, intervalMs: 3000, delayMs: 1200 },
      { type: 'hunter', count: 9,  intervalMs: 4000, delayMs: 2200 },
      { type: 'fast',   count: 15, intervalMs: 980,  delayMs: 1000 },
      { type: 'tank',   count: 6,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 75: ★特徴★ fast 速攻波。短時間に fast 大量。
  { enemySpecs: [
      { type: 'basic',  count: 18, intervalMs: 900 },
      { type: 'sniper', count: 6,  intervalMs: 3500, delayMs: 1500 },
      { type: 'hunter', count: 6,  intervalMs: 4300, delayMs: 2500 },
      { type: 'fast',   count: 22, intervalMs: 900,  delayMs: 800 },
      { type: 'tank',   count: 4,  intervalMs: 5500, delayMs: 5000 },
  ]},
  // Phase 76
  { enemySpecs: [
      { type: 'basic',  count: 25, intervalMs: 740 },
      { type: 'sniper', count: 10, intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 10, intervalMs: 4200, delayMs: 2300 },
      { type: 'fast',   count: 16, intervalMs: 980,  delayMs: 1000 },
      { type: 'tank',   count: 6,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 77
  { enemySpecs: [
      { type: 'basic',  count: 26, intervalMs: 730 },
      { type: 'sniper', count: 10, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 10, intervalMs: 4100, delayMs: 2200 },
      { type: 'fast',   count: 16, intervalMs: 970,  delayMs: 1000 },
      { type: 'tank',   count: 6,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 78
  { enemySpecs: [
      { type: 'basic',  count: 26, intervalMs: 720 },
      { type: 'sniper', count: 10, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 10, intervalMs: 4100, delayMs: 2200 },
      { type: 'fast',   count: 17, intervalMs: 970,  delayMs: 900 },
      { type: 'tank',   count: 6,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 79
  { enemySpecs: [
      { type: 'basic',  count: 27, intervalMs: 700 },
      { type: 'sniper', count: 11, intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 10, intervalMs: 4000, delayMs: 2100 },
      { type: 'fast',   count: 17, intervalMs: 960,  delayMs: 900 },
      { type: 'tank',   count: 7,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 80: ★ Stage 4 ボス Phase ★
  { enemySpecs: [
      { type: 'basic',  count: 22, intervalMs: 720 },
      { type: 'sniper', count: 9,  intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 9,  intervalMs: 4100, delayMs: 2200 },
      { type: 'fast',   count: 15, intervalMs: 970,  delayMs: 1000 },
      { type: 'tank',   count: 6,  intervalMs: 5200, delayMs: 4800 },
      { type: 'boss',   count: 1,  intervalMs: 1,    delayMs: 14000 },
  ]},

  // ═══════════════════════════════════════════════════════════════════
  //  Stage 5 (Phase 81-100) — 終盤: 全種高頻度、intervalMs 最短水準
  //    Phase 85: 混沌波 (全種大量で総数最高クラス)
  //    Phase 90: tank 多め詰め (削り耐久)
  //    Phase 95: 終末ラッシュ (intervalMs 全種最短)
  //    Phase 100: ★ FINAL ★ ボス早期登場 (12s) + 雑魚と被る総力戦
  // ═══════════════════════════════════════════════════════════════════
  // Phase 81
  { enemySpecs: [
      { type: 'basic',  count: 27, intervalMs: 700 },
      { type: 'sniper', count: 11, intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 10, intervalMs: 4000, delayMs: 2100 },
      { type: 'fast',   count: 17, intervalMs: 960,  delayMs: 900 },
      { type: 'tank',   count: 7,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 82
  { enemySpecs: [
      { type: 'basic',  count: 28, intervalMs: 680 },
      { type: 'sniper', count: 11, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 11, intervalMs: 4100, delayMs: 2200 },
      { type: 'fast',   count: 18, intervalMs: 950,  delayMs: 900 },
      { type: 'tank',   count: 7,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 83
  { enemySpecs: [
      { type: 'basic',  count: 28, intervalMs: 660 },
      { type: 'sniper', count: 11, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 11, intervalMs: 4000, delayMs: 2100 },
      { type: 'fast',   count: 18, intervalMs: 950,  delayMs: 800 },
      { type: 'tank',   count: 7,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 84
  { enemySpecs: [
      { type: 'basic',  count: 29, intervalMs: 650 },
      { type: 'sniper', count: 12, intervalMs: 2900, delayMs: 1100 },
      { type: 'hunter', count: 11, intervalMs: 4000, delayMs: 2100 },
      { type: 'fast',   count: 18, intervalMs: 940,  delayMs: 800 },
      { type: 'tank',   count: 8,  intervalMs: 5300, delayMs: 5000 },
  ]},
  // Phase 85: ★特徴★ 混沌波。全種大量で総数最高クラス。
  { enemySpecs: [
      { type: 'basic',  count: 25, intervalMs: 700 },
      { type: 'sniper', count: 14, intervalMs: 2700, delayMs: 900 },
      { type: 'hunter', count: 14, intervalMs: 3800, delayMs: 2000 },
      { type: 'fast',   count: 22, intervalMs: 920,  delayMs: 700 },
      { type: 'tank',   count: 8,  intervalMs: 4800, delayMs: 4200 },
  ]},
  // Phase 86
  { enemySpecs: [
      { type: 'basic',  count: 29, intervalMs: 640 },
      { type: 'sniper', count: 12, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 12, intervalMs: 4100, delayMs: 2100 },
      { type: 'fast',   count: 19, intervalMs: 940,  delayMs: 800 },
      { type: 'tank',   count: 8,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 87
  { enemySpecs: [
      { type: 'basic',  count: 30, intervalMs: 620 },
      { type: 'sniper', count: 12, intervalMs: 2700, delayMs: 900 },
      { type: 'hunter', count: 12, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 19, intervalMs: 930,  delayMs: 800 },
      { type: 'tank',   count: 8,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 88
  { enemySpecs: [
      { type: 'basic',  count: 30, intervalMs: 620 },
      { type: 'sniper', count: 13, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 12, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 20, intervalMs: 930,  delayMs: 700 },
      { type: 'tank',   count: 8,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 89
  { enemySpecs: [
      { type: 'basic',  count: 31, intervalMs: 600 },
      { type: 'sniper', count: 13, intervalMs: 2700, delayMs: 900 },
      { type: 'hunter', count: 13, intervalMs: 4100, delayMs: 2100 },
      { type: 'fast',   count: 20, intervalMs: 920,  delayMs: 700 },
      { type: 'tank',   count: 9,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 90: ★特徴★ tank 多め詰め (削り耐久)。
  { enemySpecs: [
      { type: 'basic',  count: 28, intervalMs: 650 },
      { type: 'sniper', count: 10, intervalMs: 2800, delayMs: 1000 },
      { type: 'hunter', count: 10, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 18, intervalMs: 950,  delayMs: 800 },
      { type: 'tank',   count: 12, intervalMs: 4500, delayMs: 3800 },
  ]},
  // Phase 91
  { enemySpecs: [
      { type: 'basic',  count: 31, intervalMs: 600 },
      { type: 'sniper', count: 13, intervalMs: 2700, delayMs: 900 },
      { type: 'hunter', count: 13, intervalMs: 4100, delayMs: 2100 },
      { type: 'fast',   count: 20, intervalMs: 920,  delayMs: 700 },
      { type: 'tank',   count: 9,  intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 92
  { enemySpecs: [
      { type: 'basic',  count: 32, intervalMs: 580 },
      { type: 'sniper', count: 13, intervalMs: 2600, delayMs: 800 },
      { type: 'hunter', count: 13, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 21, intervalMs: 910,  delayMs: 700 },
      { type: 'tank',   count: 9,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 93
  { enemySpecs: [
      { type: 'basic',  count: 32, intervalMs: 580 },
      { type: 'sniper', count: 14, intervalMs: 2700, delayMs: 900 },
      { type: 'hunter', count: 13, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 21, intervalMs: 910,  delayMs: 600 },
      { type: 'tank',   count: 9,  intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 94
  { enemySpecs: [
      { type: 'basic',  count: 33, intervalMs: 560 },
      { type: 'sniper', count: 14, intervalMs: 2600, delayMs: 800 },
      { type: 'hunter', count: 14, intervalMs: 4100, delayMs: 2100 },
      { type: 'fast',   count: 22, intervalMs: 900,  delayMs: 600 },
      { type: 'tank',   count: 10, intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 95: ★特徴★ 終末ラッシュ。intervalMs 全種最短、全種大量。
  { enemySpecs: [
      { type: 'basic',  count: 30, intervalMs: 550 },
      { type: 'sniper', count: 16, intervalMs: 2500, delayMs: 700 },
      { type: 'hunter', count: 16, intervalMs: 3800, delayMs: 1800 },
      { type: 'fast',   count: 26, intervalMs: 880,  delayMs: 500 },
      { type: 'tank',   count: 10, intervalMs: 4800, delayMs: 4000 },
  ]},
  // Phase 96
  { enemySpecs: [
      { type: 'basic',  count: 33, intervalMs: 550 },
      { type: 'sniper', count: 14, intervalMs: 2600, delayMs: 800 },
      { type: 'hunter', count: 14, intervalMs: 4100, delayMs: 2100 },
      { type: 'fast',   count: 22, intervalMs: 900,  delayMs: 600 },
      { type: 'tank',   count: 10, intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 97
  { enemySpecs: [
      { type: 'basic',  count: 34, intervalMs: 540 },
      { type: 'sniper', count: 15, intervalMs: 2700, delayMs: 900 },
      { type: 'hunter', count: 14, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 23, intervalMs: 900,  delayMs: 600 },
      { type: 'tank',   count: 10, intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 98
  { enemySpecs: [
      { type: 'basic',  count: 34, intervalMs: 520 },
      { type: 'sniper', count: 15, intervalMs: 2600, delayMs: 800 },
      { type: 'hunter', count: 15, intervalMs: 4100, delayMs: 2100 },
      { type: 'fast',   count: 23, intervalMs: 890,  delayMs: 500 },
      { type: 'tank',   count: 11, intervalMs: 5200, delayMs: 4800 },
  ]},
  // Phase 99
  { enemySpecs: [
      { type: 'basic',  count: 35, intervalMs: 500 },
      { type: 'sniper', count: 15, intervalMs: 2500, delayMs: 700 },
      { type: 'hunter', count: 15, intervalMs: 4000, delayMs: 2000 },
      { type: 'fast',   count: 24, intervalMs: 890,  delayMs: 500 },
      { type: 'tank',   count: 11, intervalMs: 5000, delayMs: 4500 },
  ]},
  // Phase 100: ★★ FINAL ★★ ボスを早期 (12s) 登場させ、雑魚と被るようにして総力戦感を強める。
  { enemySpecs: [
      { type: 'basic',  count: 30, intervalMs: 550 },
      { type: 'sniper', count: 14, intervalMs: 2600, delayMs: 800 },
      { type: 'hunter', count: 14, intervalMs: 4100, delayMs: 2000 },
      { type: 'fast',   count: 22, intervalMs: 900,  delayMs: 600 },
      { type: 'tank',   count: 10, intervalMs: 5000, delayMs: 4500 },
      { type: 'boss',   count: 1,  intervalMs: 1,    delayMs: 12000 },
  ]},
];
