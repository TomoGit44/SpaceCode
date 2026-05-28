import type { Rarity, CodeItemInstance } from '../itemTypes';
import type { Code } from '../../program/Code';

/**
 * アイテムコード — プログラムに配置する有限のコード (仕様 §2)。
 *
 * 初期コード (MOVE_TO 等) と異なり、所持アイテム個体 (CodeItemInstance) と
 * 1:1 対応する。プログラムに配置すると 1 個「使用中」になる。
 *
 * 2026-05-28: 固定レア度制を導入。各コードは 1 つの `rarity` を持ち、
 * その rarity でしかガチャ排出されない。レア度ごとに値が変わる
 * `rarityMax: Record<Rarity, number>` は廃止し、単一の `max` を持つ。
 *
 * `kind` の意味:
 *  - 'wrapper'     : 既存の条件 wrapper (条件成立で子コード列を 1 周実行)
 *  - 'wrapperLoop' : ループ wrapper (毎反復で条件を再評価し、while/until で繰り返す)
 *  - 'action'      : leaf アクション (子コード列を持たず、自身が 1 ステップを実行)
 */

export type ItemCodeType =
  // 既存 (Phase 6)
  | 'IF_HP_BELOW'
  | 'IF_ENEMY_IN_RANGE'
  | 'IF_INVENTORY_FULL'
  // 新条件 wrapper (2026-05-28)
  | 'IF_ENERGY_BELOW'
  | 'IF_BASE_HP_BELOW'
  | 'IF_ALLY_DOWNED'
  | 'IF_BOSS_ALIVE'
  | 'IF_NEAREST_ENEMY_IS'
  | 'IF_PLANET_EMPTY'
  | 'IF_RANDOM'
  | 'IF_SIGNAL'
  // 新ループ wrapper
  | 'WHILE'
  | 'LOOP_UNTIL'
  // 新アクション
  | 'BROADCAST_SIGNAL';

export type ItemCodeKind = 'wrapper' | 'wrapperLoop' | 'action';

/**
 * パラメータ 1 個の仕様。固定レア度制下では値レンジは単一。
 *  - kind 'number': min / max / step / unit を使う。default は number。
 *  - kind 'enum'  : options を使う。default は string。
 */
export type ItemCodeParamSpec =
  | {
      readonly kind: 'number';
      readonly key: string;
      readonly label: string;
      readonly min: number;
      readonly max: number;
      readonly fallbackDefault: number;
      readonly step: number;
      readonly unit: string;
    }
  | {
      readonly kind: 'enum';
      readonly key: string;
      readonly label: string;
      readonly options: ReadonlyArray<{ readonly value: string; readonly labelJa: string }>;
      readonly fallbackDefault: string;
    };

export interface ItemCodeDef {
  readonly id: ItemCodeType;
  readonly nameJa: string;
  readonly descJa: string;
  readonly rarity: Rarity;
  readonly kind: ItemCodeKind;
  readonly params: ReadonlyArray<ItemCodeParamSpec>;
}

// ─── 共通 enum オプション ─────────────────────────────────

const ENEMY_TYPE_OPTIONS = [
  { value: 'basic', labelJa: '基本' },
  { value: 'fast', labelJa: '高速' },
  { value: 'tank', labelJa: '重装' },
  { value: 'sniper', labelJa: '狙撃' },
  { value: 'boss', labelJa: 'ボス' },
] as const;

const PLANET_OPTIONS = [
  { value: 'planet0', labelJa: '惑星A' },
  { value: 'planet1', labelJa: '惑星B' },
  { value: 'any', labelJa: 'どちらか' },
] as const;

const SIGNAL_OPTIONS = [
  { value: 'A', labelJa: 'シグナルA' },
  { value: 'B', labelJa: 'シグナルB' },
  { value: 'C', labelJa: 'シグナルC' },
] as const;

/**
 * WHILE / LOOP_UNTIL の判定条件タイプ。
 * threshold パラメータの意味は condType によって変わる:
 *  - enemyInRange: 索敵距離 (px)
 *  - hpBelow / energyBelow: しきい値 (%)
 *  - inventoryFull / inventoryEmpty / bossAlive: 不使用 (UI でも非表示)
 */
const LOOP_COND_OPTIONS = [
  { value: 'enemyInRange', labelJa: '敵が近い間/まで' },
  { value: 'hpBelow', labelJa: 'HP が低い間/まで' },
  { value: 'energyBelow', labelJa: 'エネが低い間/まで' },
  { value: 'inventoryFull', labelJa: '積載満タンの間/まで' },
  { value: 'inventoryEmpty', labelJa: '積載空の間/まで' },
  { value: 'bossAlive', labelJa: 'ボス出現中の間/まで' },
] as const;

// ─── ITEM_CODE_DEFS ──────────────────────────────────────

export const ITEM_CODE_DEFS: Record<ItemCodeType, ItemCodeDef> = {
  // ── 既存 (固定レア度 N) ─────────────────────────────
  IF_HP_BELOW: {
    id: 'IF_HP_BELOW',
    nameJa: 'もし HP が低ければ',
    descJa: 'HP が指定% 以下のとき、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [
      {
        kind: 'number',
        key: 'hpPercent',
        label: 'HP しきい値',
        min: 5,
        max: 50,
        fallbackDefault: 30,
        step: 5,
        unit: '%',
      },
    ],
  },
  IF_ENEMY_IN_RANGE: {
    id: 'IF_ENEMY_IN_RANGE',
    nameJa: 'もし敵が近ければ',
    descJa: '指定距離内に敵がいるとき、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [
      {
        kind: 'number',
        key: 'range',
        label: '索敵距離',
        min: 80,
        max: 300,
        fallbackDefault: 200,
        step: 20,
        unit: 'px',
      },
    ],
  },
  IF_INVENTORY_FULL: {
    id: 'IF_INVENTORY_FULL',
    nameJa: 'もし満タンなら',
    descJa: 'インベントリが満タンのとき、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [],
  },

  // ── 新条件 wrapper (2026-05-28) ────────────────────
  IF_ENERGY_BELOW: {
    id: 'IF_ENERGY_BELOW',
    nameJa: 'もしエネが低ければ',
    descJa: 'エネルギーが指定% 以下のとき、中のコードを 1 周実行する',
    rarity: 'SR',
    kind: 'wrapper',
    params: [
      {
        kind: 'number',
        key: 'energyPercent',
        label: 'エネしきい値',
        min: 5,
        max: 80,
        fallbackDefault: 30,
        step: 5,
        unit: '%',
      },
    ],
  },
  IF_BASE_HP_BELOW: {
    id: 'IF_BASE_HP_BELOW',
    nameJa: 'もし基地 HP が低ければ',
    descJa: '基地 HP が指定% 以下のとき、中のコードを 1 周実行する',
    rarity: 'L',
    kind: 'wrapper',
    params: [
      {
        kind: 'number',
        key: 'hpPercent',
        label: '基地 HP しきい値',
        min: 10,
        max: 100,
        fallbackDefault: 50,
        step: 10,
        unit: '%',
      },
    ],
  },
  IF_ALLY_DOWNED: {
    id: 'IF_ALLY_DOWNED',
    nameJa: 'もし味方ダウン中なら',
    descJa: '他の宇宙船がダウン状態のとき、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [],
  },
  IF_BOSS_ALIVE: {
    id: 'IF_BOSS_ALIVE',
    nameJa: 'もしボス出現中なら',
    descJa: '現 Phase にボスが生存しているとき、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [],
  },
  IF_NEAREST_ENEMY_IS: {
    id: 'IF_NEAREST_ENEMY_IS',
    nameJa: 'もし最寄り敵が…なら',
    descJa: '最寄りの敵が指定種別と一致するとき、中のコードを 1 周実行する',
    rarity: 'R',
    kind: 'wrapper',
    params: [
      {
        kind: 'enum',
        key: 'enemyType',
        label: '敵種別',
        options: ENEMY_TYPE_OPTIONS,
        fallbackDefault: 'sniper',
      },
    ],
  },
  IF_PLANET_EMPTY: {
    id: 'IF_PLANET_EMPTY',
    nameJa: 'もし惑星が枯渇なら',
    descJa: '指定惑星が枯渇中のとき、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [
      {
        kind: 'enum',
        key: 'target',
        label: '対象惑星',
        options: PLANET_OPTIONS,
        fallbackDefault: 'any',
      },
    ],
  },
  IF_RANDOM: {
    id: 'IF_RANDOM',
    nameJa: 'もし運が良ければ',
    descJa: '指定% の確率で、中のコードを 1 周実行する',
    rarity: 'N',
    kind: 'wrapper',
    params: [
      {
        kind: 'number',
        key: 'percent',
        label: '発動確率',
        min: 5,
        max: 95,
        fallbackDefault: 30,
        step: 5,
        unit: '%',
      },
    ],
  },
  IF_SIGNAL: {
    id: 'IF_SIGNAL',
    nameJa: 'もしシグナル受信中なら',
    descJa: '他の宇宙船から指定シグナルを受信しているとき、中のコードを 1 周実行する',
    rarity: 'R',
    kind: 'wrapper',
    params: [
      {
        kind: 'enum',
        key: 'signal',
        label: '受信シグナル',
        options: SIGNAL_OPTIONS,
        fallbackDefault: 'A',
      },
    ],
  },

  // ── 新ループ wrapper ──────────────────────────────
  WHILE: {
    id: 'WHILE',
    nameJa: '条件成立する間繰り返す',
    descJa: '条件が成立する間、中のコードを繰り返し実行する',
    rarity: 'R',
    kind: 'wrapperLoop',
    params: [
      {
        kind: 'enum',
        key: 'condType',
        label: '繰り返し条件',
        options: LOOP_COND_OPTIONS,
        fallbackDefault: 'enemyInRange',
      },
      {
        kind: 'number',
        key: 'threshold',
        label: 'しきい値 (px or %)',
        min: 5,
        max: 560,
        fallbackDefault: 200,
        step: 5,
        unit: '',
      },
    ],
  },
  LOOP_UNTIL: {
    id: 'LOOP_UNTIL',
    nameJa: '条件成立するまで繰り返す',
    descJa: '条件が成立するまで、中のコードを繰り返し実行する',
    rarity: 'R',
    kind: 'wrapperLoop',
    params: [
      {
        kind: 'enum',
        key: 'condType',
        label: '終了条件',
        options: LOOP_COND_OPTIONS,
        fallbackDefault: 'inventoryFull',
      },
      {
        kind: 'number',
        key: 'threshold',
        label: 'しきい値 (px or %)',
        min: 5,
        max: 560,
        fallbackDefault: 200,
        step: 5,
        unit: '',
      },
    ],
  },

  // ── 新アクション ──────────────────────────────────
  BROADCAST_SIGNAL: {
    id: 'BROADCAST_SIGNAL',
    nameJa: 'シグナル発信',
    descJa: '指定シグナルを他の宇宙船に向けて発信する (約 2 秒間有効)',
    rarity: 'R',
    kind: 'action',
    params: [
      {
        kind: 'enum',
        key: 'signal',
        label: '発信シグナル',
        options: SIGNAL_OPTIONS,
        fallbackDefault: 'A',
      },
    ],
  },
};

export const ALL_ITEM_CODE_TYPES: ReadonlyArray<ItemCodeType> = Object.keys(
  ITEM_CODE_DEFS
) as ItemCodeType[];

export function isItemCodeType(t: string): t is ItemCodeType {
  return t in ITEM_CODE_DEFS;
}

/** 既定パラメータ。enum は fallbackDefault 文字列、number は fallbackDefault を min/max で clamp。 */
export function defaultItemCodeParams(type: ItemCodeType): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of ITEM_CODE_DEFS[type].params) {
    if (p.kind === 'number') {
      out[p.key] = Math.min(Math.max(p.fallbackDefault, p.min), p.max);
    } else {
      out[p.key] = p.fallbackDefault;
    }
  }
  return out;
}

/** CodeItemInstance から配置用の ITEM_CODE ノードを生成する。 */
export function createItemCodeNode(inst: CodeItemInstance): Code {
  const type = inst.codeType as ItemCodeType;
  return {
    type: 'ITEM_CODE',
    itemUid: inst.uid,
    itemCodeType: type,
    rarity: inst.rarity,
    params: defaultItemCodeParams(type),
    children: [],
  };
}

/** ITEM_CODE ノードのリスト表示ラベル (例: 「もし HP が低ければ (30%)」)。 */
export function itemCodeLabel(node: Extract<Code, { type: 'ITEM_CODE' }>): string {
  const def = ITEM_CODE_DEFS[node.itemCodeType];
  if (!def) return 'アイテムコード';
  const first = def.params[0];
  if (!first) return def.nameJa;
  const v = node.params[first.key];
  if (v === undefined) return def.nameJa;
  if (first.kind === 'number') return `${def.nameJa} (${v}${first.unit})`;
  // enum: 値→labelJa
  const opt = first.options.find((o) => o.value === v);
  return opt ? `${def.nameJa} (${opt.labelJa})` : def.nameJa;
}

/** デバッグ用: 指定レア度のアイテムコードをランダムに 1 個生成する。
 *  該当 rarity の type がなければ null。 */
export function makeRandomItemCode(rarity: Rarity): CodeItemInstance | null {
  const pool = ALL_ITEM_CODE_TYPES.filter((t) => ITEM_CODE_DEFS[t].rarity === rarity);
  if (pool.length === 0) return null;
  const type = pool[Math.floor(Math.random() * pool.length)]!;
  return { uid: crypto.randomUUID(), codeType: type, rarity };
}
