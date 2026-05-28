import type { Code, CodeStepResult } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * BROADCAST_SIGNAL — params.signal (A/B/C) を SignalBus にブロードキャストする。
 * 即時 done (leaf action)。
 */
export function tickBroadcastSignal(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): CodeStepResult {
  void ship;
  const sig = (code.params.signal as string) ?? '';
  if (sig) world.signals.broadcast(sig);
  return { status: 'done' };
}
