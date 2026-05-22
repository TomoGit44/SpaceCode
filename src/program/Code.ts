import type { LocationId, PlanetId } from './locations';
import type { Rarity } from '../items/itemTypes';
import type { ItemCodeType } from '../items/types/itemCodes';

/**
 * Code — プログラムの 1 ステップを表すデータ。
 *
 * discriminated union として中央 (このファイル) に型を集約し、
 * 各コードの評価ロジックは `src/program/codes/<Name>.ts` に分散させる。
 *
 * Phase 2 で MOVE_TO/MINE のターゲットを名前付き地点に。
 * Phase 3 で ATTACK_NEAREST / WAIT_UNTIL_FULL / REPEAT (ネスト) を追加。
 * Phase 6 で ITEM_CODE (アイテムコード) を追加。初期コード 6 種は無制限、
 * ITEM_CODE は所持アイテム個体 (CodeItemInstance) に 1:1 対応する。
 */
export type Code =
  | { type: 'MOVE_TO'; target: LocationId }
  | { type: 'MINE'; target: PlanetId }
  | { type: 'DEPOSIT' }
  | { type: 'ATTACK_NEAREST' }
  | { type: 'WAIT_UNTIL_FULL' }
  | { type: 'REPEAT'; times: number; children: Code[] }
  | {
      // Phase 6: アイテムコード。条件 wrapper として子コード列を持つ (§2.5)。
      type: 'ITEM_CODE';
      itemUid: string; // 対応する CodeItemInstance.uid (配置の真実源, §8.4)
      itemCodeType: ItemCodeType;
      rarity: Rarity;
      params: Record<string, number>;
      children: Code[];
    };

/** UI / ファクトリで使う **初期コード** 種別の列挙 (ITEM_CODE は含まない)。 */
export type CodeType = 'MOVE_TO' | 'MINE' | 'DEPOSIT' | 'ATTACK_NEAREST' | 'WAIT_UNTIL_FULL' | 'REPEAT';

/**
 * 1 tick ぶんコードを評価した結果。
 *
 * - `running`: まだ進行中。Executor は次フレームも同じコードを評価する。
 * - `done`:    完了。Executor は次のコードへ進む。
 * - `blocked`: 実行不能。Executor は `running` と同様にそのコードへ留まる。
 */
export type CodeStepResult =
  | { status: 'running' }
  | { status: 'done' }
  | { status: 'blocked'; reason: string };

/**
 * wrapper コード (子コード列を持つ: REPEAT / ITEM_CODE) の子配列を返す。
 * leaf コードなら null。Program のパス操作 / ProgramList の階層描画で使う。
 */
export function codeChildren(code: Code): Code[] | null {
  if (code.type === 'REPEAT') return code.children;
  if (code.type === 'ITEM_CODE') return code.children;
  return null;
}

/**
 * コードの既定値を 1 箇所に集約。CodePalette が初期コード「追加」を押した時に使う。
 * ITEM_CODE は所持アイテムから生成するため別経路 (`createItemCodeNode`)。
 */
export function createCode(type: CodeType): Code {
  switch (type) {
    case 'MOVE_TO':
      return { type: 'MOVE_TO', target: 'base' };
    case 'MINE':
      return { type: 'MINE', target: 'planet0' };
    case 'DEPOSIT':
      return { type: 'DEPOSIT' };
    case 'ATTACK_NEAREST':
      return { type: 'ATTACK_NEAREST' };
    case 'WAIT_UNTIL_FULL':
      return { type: 'WAIT_UNTIL_FULL' };
    case 'REPEAT':
      return { type: 'REPEAT', times: 3, children: [] };
  }
}
