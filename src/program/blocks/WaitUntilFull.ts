import type { BlockStepResult } from '../Block';
import type { Ship } from '../../entities/Ship';

/**
 * WAIT_UNTIL_FULL — Ship のインベントリが満タンになるまで running、満タンで done。
 *
 * MINE 自体も満タンで done するため、単体での出番は限定的。だが「採掘以外の状況待ち」
 * (例: 別の Ship が採掘するのを待つ未来) の対称性のため用意する。
 *
 * 副作用なし: 状態確認のみ。
 */
export function tickWaitUntilFull(ship: Ship): BlockStepResult {
  return ship.isInventoryFull() ? { status: 'done' } : { status: 'running' };
}
