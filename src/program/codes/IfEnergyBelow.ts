import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_ENERGY_BELOW — Ship のエネルギーが params.energyPercent% 以下なら true。
 */
export function conditionIfEnergyBelow(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void world;
  if (ship.maxEnergy <= 0) return false;
  const threshold = (code.params.energyPercent as number) ?? 100;
  return (ship.energy / ship.maxEnergy) * 100 <= threshold;
}
