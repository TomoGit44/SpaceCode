/**
 * SpaceCode 全体で参照するゲーム定数。
 * バランス調整はまずここを触る (設計書 §8 参照)。
 */

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

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
  attackDurationMs: 500,     // Phase 4: ATTACK_NEAREST ブロック 1 回ぶんの持続時間 (Phase 3 の 600 から短縮)
  bulletSpeed: 380,          // 攻撃弾速 (タワーより遅め)
  attackRange: 220,          // attackNearest の射程
  refuelOnDeposit: true,     // 納品時に energy 全回復するか
  radius: 12,                // 描画基準半径
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

/** 敵 (Phase 4 で 3 種類化) */
export type EnemyType = 'basic' | 'fast' | 'tank';

export interface EnemyTypeStats {
  readonly hp: number;
  readonly speed: number;        // px/s
  readonly damage: number;        // 基地接触時のダメージ
  readonly radius: number;        // 描画半径
  readonly hitRadius: number;     // 当たり判定 (弾)
  readonly contactRadius: number; // 基地への接触距離 (BASE.radius + α)
  readonly color: number;         // 描画色
  readonly creditsOnKill: number; // 撃破報酬
}

export const ENEMY_TYPES: Record<EnemyType, EnemyTypeStats> = {
  basic: { hp: 20, speed: 60, damage: 10, radius: 10, hitRadius: 12, contactRadius: 24, color: 0xff4d5a, creditsOnKill: 5 },
  fast:  { hp: 12, speed: 95, damage: 8,  radius: 8,  hitRadius: 10, contactRadius: 22, color: 0xff9040, creditsOnKill: 7 },
  tank:  { hp: 55, speed: 38, damage: 15, radius: 14, hitRadius: 16, contactRadius: 28, color: 0xb01828, creditsOnKill: 14 },
};

/** 敵 → 宇宙船 接触ダメージ (Phase D) */
export const ENEMY_VS_SHIP = {
  contactDps: 8, // 接触持続中の DPS
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

/** フェーズ進行 (Phase 4 バランス調整) */
export const STAGE = {
  totalPhases: 5,
  intermissionMs: 7000,    // Phase 4: 6000 → 7000 (敵編成が複雑化するため準備時間を伸ばす)
} as const;

/**
 * 各 Phase の敵編成 (Phase 4)。
 *
 * `enemySpecs` は **並行スポーンタイマー**。各 spec が独立に
 *   - `delayMs` (省略時 0) 経過後にスポーン開始
 *   - `intervalMs` ごとに 1 体出現
 *   - 合計 `count` 体出すと完了
 * Phase は全 spec が完了 + 残敵 0 でクリア扱い。
 *
 * 編成方針:
 *   - Phase 1-2: basic のみ (チュートリアル相当)
 *   - Phase 3-4: basic + fast (速度差で射撃編成が必要に)
 *   - Phase 5:   basic + fast + tank (全種混在で総合力)
 */
export interface EnemySpec {
  readonly type: EnemyType;
  readonly count: number;
  readonly intervalMs: number;
  readonly delayMs?: number;
}

export const PHASES: ReadonlyArray<{ readonly enemySpecs: ReadonlyArray<EnemySpec> }> = [
  { enemySpecs: [{ type: 'basic', count: 5,  intervalMs: 2200 }] },
  { enemySpecs: [{ type: 'basic', count: 7,  intervalMs: 1900 }] },
  { enemySpecs: [
      { type: 'basic', count: 6, intervalMs: 1800 },
      { type: 'fast',  count: 3, intervalMs: 1400, delayMs: 4000 },
  ]},
  { enemySpecs: [
      { type: 'basic', count: 7, intervalMs: 1600 },
      { type: 'fast',  count: 5, intervalMs: 1300, delayMs: 3500 },
  ]},
  { enemySpecs: [
      { type: 'basic', count: 6, intervalMs: 1500 },
      { type: 'fast',  count: 5, intervalMs: 1200, delayMs: 2500 },
      { type: 'tank',  count: 2, intervalMs: 4000, delayMs: 6000 },
  ]},
];
