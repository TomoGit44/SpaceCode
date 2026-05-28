import type { Code } from '../Code';
import type { Ship, ShipWorld } from '../../entities/Ship';

/**
 * IF_PLANET_EMPTY — 指定惑星 (planet0 / planet1 / any) が枯渇中なら true。
 *  - 'any': どちらか一方でも枯渇なら true
 *  - 'planet0' / 'planet1': その惑星のみ判定
 */
export function conditionIfPlanetEmpty(
  code: Extract<Code, { type: 'ITEM_CODE' }>,
  ship: Ship,
  world: ShipWorld
): boolean {
  void ship;
  const target = (code.params.target as string) ?? 'any';
  if (target === 'any') {
    return world.planets.some((p) => p.depleted);
  }
  const idx = target === 'planet0' ? 0 : target === 'planet1' ? 1 : -1;
  if (idx < 0) return false;
  const p = world.planets[idx];
  return p ? p.depleted : false;
}
