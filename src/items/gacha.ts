import type { Rarity, ItemInstance } from './itemTypes';
import { ALL_ITEM_CODE_TYPES, ITEM_CODE_DEFS } from './types/itemCodes';
import { ALL_MODULE_IDS, MODULE_TYPES } from './types/modules';

/**
 * ガチャの抽選ロジック (仕様 §6.5 / §6.6)。
 *
 * 2026-05-28 後: **固定レア度制**を導入。各 typeId は単一の rarity を持ち、
 * ガチャレア度 R で引けば R-tier の typeId しか出ない (混在なし)。
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

function shuffle<T>(arr: ReadonlyArray<T>): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 指定 rarity の typeId 一覧。 */
function typeIdsForRarity(category: GachaCategory, rarity: Rarity): string[] {
  if (category === 'code') {
    return ALL_ITEM_CODE_TYPES.filter((t) => ITEM_CODE_DEFS[t].rarity === rarity);
  }
  return ALL_MODULE_IDS.filter((id) => MODULE_TYPES[id]!.rarity === rarity);
}

/** 指定カテゴリで、現在排出可能なレア度 (1 種以上ある rarity) の一覧。 */
export function availableGachaRarities(category: GachaCategory): Rarity[] {
  const out: Rarity[] = [];
  for (const r of GACHA_RARITIES) {
    if (typeIdsForRarity(category, r).length > 0) out.push(r);
  }
  return out;
}

/**
 * ガチャを 1 回引いて 3 候補を返す (固定レア度制):
 *  - 候補はすべてガチャレア度と同じ rarity の typeId
 *  - 3 枚は可能なら異なる typeId、足りない場合は重複で埋める (UI 互換)
 */
export function drawGacha(category: GachaCategory, gachaRarity: Rarity): GachaCandidate[] {
  const pool = typeIdsForRarity(category, gachaRarity);
  if (pool.length === 0) return [];
  const out: GachaCandidate[] = [];
  const shuffled = shuffle(pool);
  for (let i = 0; i < 3; i++) {
    const typeId = shuffled[i % shuffled.length]!;
    out.push({ category, typeId, rarity: gachaRarity });
  }
  return out;
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

/**
 * Phase クリア報酬のレア度をランダムに 1 つ選ぶ。
 * 固定レア度制下では category によって排出可能 rarity が異なるため、
 * 引いた rarity に typeId が無ければ近傍 rarity にフォールバックする。
 */
export function rollPhaseRewardRarity(category: GachaCategory): Rarity {
  const available = availableGachaRarities(category);
  if (available.length === 0) return 'R'; // 排出 0 ならフォールバック (drawGacha が空配列を返す)
  // available に絞り込んだ上で重み抽選
  const filtered = PHASE_REWARD_RARITY_WEIGHTS.filter(([r]) => available.includes(r));
  const total = filtered.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [r, w] of filtered) {
    roll -= w;
    if (roll <= 0) return r;
  }
  return filtered[0]![0];
}

/** Phase 番号 → カテゴリの交互振り分け (奇数=code / 偶数=module)。 */
export function phaseRewardCategory(phaseNumber: number): GachaCategory {
  return phaseNumber % 2 === 1 ? 'code' : 'module';
}
