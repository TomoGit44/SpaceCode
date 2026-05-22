import type { Code } from '../program/Code';
import { codeChildren } from '../program/Code';
import type { CodeItemInstance } from './itemTypes';
import type { ItemCodeType } from './types/itemCodes';

/**
 * アイテムコードの配置整合性ヘルパ (仕様 §8.4)。
 *
 * 「どこに配置されたか」の真実源は **プログラム内の ITEM_CODE ノード** (itemUid)。
 * CodeItemInstance 側に配置フラグは持たない。残数は全 Ship のプログラムを
 * 走査して算出する。
 *
 * この方式の利点: Ship 破壊・wrapper コード削除のいずれでも、ノードが消えれば
 * 走査結果から自動的に外れる → アイテムが「未使用」に戻る (明示処理が不要)。
 */

/** 与えられた全プログラムを走査し、配置済み ITEM_CODE の itemUid 集合を返す。 */
export function collectPlacedCodeUids(programs: ReadonlyArray<ReadonlyArray<Code>>): Set<string> {
  const placed = new Set<string>();
  const walk = (codes: ReadonlyArray<Code>): void => {
    for (const c of codes) {
      if (c.type === 'ITEM_CODE') placed.add(c.itemUid);
      const ch = codeChildren(c);
      if (ch) walk(ch);
    }
  };
  for (const codes of programs) walk(codes);
  return placed;
}

/** ItemCodeType 別の未配置 (= これから配置できる) インスタンス数。 */
export function availableCodeCounts(
  codes: ReadonlyArray<CodeItemInstance>,
  placed: Set<string>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of codes) {
    if (placed.has(c.uid)) continue;
    counts[c.codeType] = (counts[c.codeType] ?? 0) + 1;
  }
  return counts;
}

const RARITY_ORDER: Record<string, number> = { L: 3, SR: 2, R: 1, N: 0 };

/**
 * 指定 ItemCodeType の未配置インスタンスを 1 個返す (レア度の高い順)。
 * 配置時にどの個体を使うかを決める。無ければ null。
 */
export function pickUnplacedInstance(
  codes: ReadonlyArray<CodeItemInstance>,
  placed: Set<string>,
  type: ItemCodeType
): CodeItemInstance | null {
  const candidates = codes
    .filter((c) => c.codeType === type && !placed.has(c.uid))
    .sort((a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0));
  return candidates[0] ?? null;
}
