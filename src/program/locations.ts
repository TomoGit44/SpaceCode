import type { ShipWorld } from '../entities/Ship';
import type { Planet } from '../entities/Planet';

/**
 * コードが参照する名前付き地点。
 *
 * Phase 1 は MOVE_TO が任意座標 / MINE が planetIndex:number だったが、
 * Phase 2 で編集 UI を導入する際にプレイヤーに「惑星A / 惑星B / 基地」を
 * 直接選ばせる方式へ変更したため、コード側のターゲットもこの記号 ID に統一する。
 *
 * MVP では惑星 2 個固定 (config.PLANETS) のため `planet0` / `planet1` のみ。
 * 追加するときは LocationId に variant を 1 つ + ALL_* 配列に 1 行 + planetIndexOf に分岐 1 つ。
 */
export type LocationId = 'base' | 'planet0' | 'planet1';
export type PlanetId = 'planet0' | 'planet1';

/** UI に表示する日本語ラベル。 */
export const LOCATION_LABELS: Record<LocationId, string> = {
  base: '基地',
  planet0: '惑星A',
  planet1: '惑星B',
};

/** UI が走査するための列挙。 */
export const ALL_LOCATION_IDS: ReadonlyArray<LocationId> = ['base', 'planet0', 'planet1'];
export const ALL_PLANET_IDS: ReadonlyArray<PlanetId> = ['planet0', 'planet1'];

export function planetIndexOf(id: PlanetId): number {
  return id === 'planet0' ? 0 : 1;
}

/**
 * MoveTo 用: 座標だけを返す (Planet 型に依存しない)。
 * 該当地点が存在しなければ null (blocked になる)。
 */
export function resolveLocation(
  id: LocationId,
  world: ShipWorld
): { x: number; y: number } | null {
  if (id === 'base') return { x: world.base.x, y: world.base.y };
  const p = world.planets[planetIndexOf(id)];
  return p ? { x: p.x, y: p.y } : null;
}

/**
 * Mine 用: Planet オブジェクト自体を返す (extract / depleted / mineRadius が必要)。
 */
export function resolvePlanet(id: PlanetId, world: ShipWorld): Planet | null {
  return world.planets[planetIndexOf(id)] ?? null;
}
