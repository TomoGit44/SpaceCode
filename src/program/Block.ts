import type { LocationId, PlanetId } from './locations';

/**
 * Block — プログラムの 1 ステップを表すデータ。
 *
 * discriminated union として中央 (このファイル) に型を集約し、
 * 各ブロックの評価ロジックは `src/program/blocks/<Name>.ts` に分散させる。
 * 新ブロック追加時はここに 1 バリアント + Executor の switch に 1 case +
 * blocks/ に新規ファイル 1 つ、で完結する。
 *
 * Phase 2 で MOVE_TO/MINE のターゲットを名前付き地点に。
 * Phase 3 で ATTACK_NEAREST (持続時間あり) / WAIT_UNTIL_FULL / REPEAT (ネスト) を追加。
 */
export type Block =
  | { type: 'MOVE_TO'; target: LocationId }
  | { type: 'MINE'; target: PlanetId }
  | { type: 'DEPOSIT' }
  | { type: 'ATTACK_NEAREST' }
  | { type: 'WAIT_UNTIL_FULL' }
  | { type: 'REPEAT'; times: number; children: Block[] };

/** UI / ファクトリで使うブロック種別の列挙。 */
export type BlockType = 'MOVE_TO' | 'MINE' | 'DEPOSIT' | 'ATTACK_NEAREST' | 'WAIT_UNTIL_FULL' | 'REPEAT';

/**
 * 1 tick ぶんブロックを評価した結果。
 *
 * - `running`: まだ進行中。Executor は次フレームも同じブロックを評価する。
 * - `done`:    完了。Executor は次のブロックへ進む。
 * - `blocked`: 実行不能 (例: 地点 ID が解決できない / 想定外のブロック種別)。Executor は
 *              `running` と同様にそのブロックへ留まる。UI でエラー表示する余地を残す。
 */
export type BlockStepResult =
  | { status: 'running' }
  | { status: 'done' }
  | { status: 'blocked'; reason: string };

/**
 * ブロックの既定値を 1 箇所に集約。BlockPalette が「追加」を押した時に使う。
 *
 * REPEAT のデフォルト children は **空配列**。プレイヤーは REPEAT を追加 → スコープ
 * を切り替えて中身を組む流れになる。
 */
export function createBlock(type: BlockType): Block {
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
