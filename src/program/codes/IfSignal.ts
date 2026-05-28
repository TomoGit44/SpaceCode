import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_SIGNAL — params.signal (A/B/C) のシグナルが現在アクティブなら true。
 * 自分が直前に発信したシグナルでも true になる (簡略実装)。
 */
export function conditionIfSignal(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void ship;
  const sig = (code.params.signal as string) ?? '';
  if (!sig) return false;
  return world.signals.isActive(sig);
}
