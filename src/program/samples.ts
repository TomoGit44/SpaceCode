import { Program } from './Program';
import type { Code } from './Code';

/**
 * 「採掘ループ」のサンプルコード列を返す。
 *
 * Program は **置いただけで自動で先頭にループバックする** ため、
 * シンプルな採掘サイクルを並べるだけでよい。REPEAT は「特定の行動を N 回繰り返したい」
 * 場面のための専用コード。
 *
 * 毎回新規オブジェクトを返す: エディタが Program を破壊的に編集するため、
 * 共有してしまうと別 Ship に副作用が漏れる。
 *
 * 注: サンプルは **初期コードのみ** で構成する (アイテムコードは個体管理のため
 * テンプレに焼けない)。
 */
export function sampleCodes(): Code[] {
  return [
    { type: 'MOVE_TO', target: 'planet0' },
    { type: 'MINE', target: 'planet0' },
    { type: 'MOVE_TO', target: 'base' },
    { type: 'DEPOSIT' },
  ];
}

/** Phase 1 互換ヘルパ。 */
export function createSampleProgram(): Program {
  return new Program(sampleCodes());
}
