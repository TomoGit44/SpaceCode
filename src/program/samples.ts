import { Program } from './Program';
import type { Block } from './Block';

/**
 * 「採掘ループ」のサンプルブロック列を返す。
 *
 * Program は **置いただけで自動で先頭にループバックする** ため、
 * シンプルな採掘サイクルを並べるだけでよい。REPEAT は「特定の行動を N 回繰り返したい」
 * 場面のための専用ブロック。
 *
 * 毎回新規オブジェクトを返す: エディタが Program を破壊的に編集するため、
 * 共有してしまうと別 Ship に副作用が漏れる。
 */
export function sampleBlocks(): Block[] {
  return [
    { type: 'MOVE_TO', target: 'planet0' },
    { type: 'MINE', target: 'planet0' },
    { type: 'MOVE_TO', target: 'base' },
    { type: 'DEPOSIT' },
  ];
}

/** Phase 1 互換ヘルパ。 */
export function createSampleProgram(): Program {
  return new Program(sampleBlocks());
}
