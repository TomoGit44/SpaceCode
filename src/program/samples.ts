import { Program } from './Program';
import type { Block } from './Block';

/**
 * 「採掘ループ」のサンプルブロック列を返す。
 *
 * Phase 3 で REPEAT を実装したため、サンプルは REPEAT で囲んだループに変更。
 * times=20 は MVP の UI スピナー上限 (20) に揃えてある。
 *
 * 毎回新規オブジェクトを返す: エディタが Program を破壊的に編集するため、
 * 共有してしまうと別 Ship に副作用が漏れる。children も毎回 fresh。
 */
export function sampleBlocks(): Block[] {
  return [
    {
      type: 'REPEAT',
      times: 20,
      children: [
        { type: 'MOVE_TO', target: 'planet0' },
        { type: 'MINE', target: 'planet0' },
        { type: 'MOVE_TO', target: 'base' },
        { type: 'DEPOSIT' },
      ],
    },
  ];
}

/** Phase 1 互換ヘルパ。 */
export function createSampleProgram(): Program {
  return new Program(sampleBlocks());
}
