import type { Rarity, ItemInstance } from './itemTypes';
import { ALL_ITEM_CODE_TYPES } from './types/itemCodes';
import { ALL_MODULE_IDS } from './types/modules';

/**
 * ガチャの抽選ロジック (仕様 §6.5 / §6.6)。
 *
 * ガチャ自体に R / SR / L のレア度がある (N ガチャは存在しない)。
 * 開封すると 3 候補が提示され、プレイヤーが 1 つ選ぶ。
 */

export type GachaCategory = 'code' | 'module';

/** ガチャが取りうるレア度 (N は無し)。 */
export const GACHA_RARITIES: ReadonlyArray<Rarity> = ['R', 'SR', 'L'];

export interface GachaCandidate {
  category: GachaCategory;
  /** ItemCodeType または module typeId。 */
  typeId: string;
  rarity: Rarity;
}

const RARITY_SEQ: ReadonlyArray<Rarity> = ['N', 'R', 'SR', 'L'];
/** ガチャ枠の非保証スロット用のレア度重み (§4.3 のドロップ確率に準拠)。 */
const RARITY_WEIGHT: Record<Rarity, number> = { N: 60, R: 25, SR: 12, L: 3 };

/** max 以下のレア度一覧。 */
function raritiesUpTo(max: Rarity): Rarity[] {
  return RARITY_SEQ.slice(0, RARITY_SEQ.indexOf(max) + 1);
}

/** 重み付きでレア度を 1 つ選ぶ。 */
function weightedRarity(pool: Rarity[]): Rarity {
  const total = pool.reduce((s, r) => s + RARITY_WEIGHT[r], 0);
  let roll = Math.random() * total;
  for (const r of pool) {
    roll -= RARITY_WEIGHT[r];
    if (roll <= 0) return r;
  }
  return pool[pool.length - 1]!;
}

function shuffle<T>(arr: ReadonlyArray<T>): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * ガチャを 1 回引いて 3 候補を返す (仕様 §6.5):
 *  - すべての候補はガチャレア度以下
 *  - 同レア度を最低 1 枚保証
 *  - 3 枚は重複なし (異なる typeId)
 */
export function drawGacha(category: GachaCategory, gachaRarity: Rarity): GachaCandidate[] {
  const typePool: ReadonlyArray<string> =
    category === 'code' ? ALL_ITEM_CODE_TYPES : ALL_MODULE_IDS;
  const types = shuffle(typePool).slice(0, 3);
  const rPool = raritiesUpTo(gachaRarity);
  // スロット 0 はガチャレア度を保証、残り 2 つは重み付き抽選。最後にシャッフル。
  const rarities = shuffle([gachaRarity, weightedRarity(rPool), weightedRarity(rPool)]);
  return types.map((typeId, i) => ({ category, typeId, rarity: rarities[i]! }));
}

// ─── ガチャ「アイテム」(インベントリに入る開封前の個体) ───────────────

export function isCodeGacha(typeId: string): boolean {
  return typeId === 'codeGacha';
}
export function isModuleGacha(typeId: string): boolean {
  return typeId === 'moduleGacha';
}
export function isGacha(typeId: string): boolean {
  return isCodeGacha(typeId) || isModuleGacha(typeId);
}

/** ガチャアイテムの表示名。 */
export function gachaItemName(typeId: string): string {
  if (typeId === 'codeGacha') return 'コードガチャ';
  if (typeId === 'moduleGacha') return 'モジュールガチャ';
  return typeId;
}

/** デバッグ用: ガチャアイテムを 1 個生成する (レア度は R 以上にクランプ)。 */
export function makeGachaItem(category: GachaCategory, rarity: Rarity): ItemInstance {
  const r: Rarity = rarity === 'N' ? 'R' : rarity;
  return {
    uid: crypto.randomUUID(),
    typeId: category === 'code' ? 'codeGacha' : 'moduleGacha',
    rarity: r,
  };
}

/** typeId からガチャカテゴリへの逆引き (codeGacha/moduleGacha 以外は null)。 */
export function gachaCategoryOf(typeId: string): GachaCategory | null {
  if (typeId === 'codeGacha') return 'code';
  if (typeId === 'moduleGacha') return 'module';
  return null;
}

// ─── Run リワード経路 (Step 6) ─────────────────────────────────

/** Phase クリア報酬のレア度抽選重み。L は控えめに、R が中心 (毎クリア取れるため)。 */
const PHASE_REWARD_RARITY_WEIGHTS: ReadonlyArray<readonly [Rarity, number]> = [
  ['R', 55],
  ['SR', 30],
  ['L', 15],
];

/** Phase クリア報酬のレア度をランダムに 1 つ選ぶ。 */
export function rollPhaseRewardRarity(): Rarity {
  const total = PHASE_REWARD_RARITY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of PHASE_REWARD_RARITY_WEIGHTS) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return 'R';
}

/** Phase 番号 → カテゴリの交互振り分け (奇数=code / 偶数=module)。 */
export function phaseRewardCategory(phaseNumber: number): GachaCategory {
  return phaseNumber % 2 === 1 ? 'code' : 'module';
}
