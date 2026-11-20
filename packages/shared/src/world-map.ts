// The Clovervale project.
// Copyright 2026 imacat.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Authors:
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/world-map The maps a player can be in, each with its own
 *   ground and its own frame.
 */

import { CAVE_TERRAIN } from './cave.ts';
import type { Terrain } from './terrain.ts';
import { VILLAGE_TERRAIN } from './village-layout.ts';

/**
 * The maps a player can be in: the village, which every player shares, and
 * the cave under the burrow of the wild dog, of which every player who goes
 * down has one of its own.
 */
export const MAP_IDS = ['village', 'cave'] as const;

/** A map a player can be in. */
export type MapId = (typeof MAP_IDS)[number];

/**
 * Finds the ground of a map.
 *
 * @param {MapId} map - The map.
 * @returns {Terrain} What stands in the way of the players there.
 */
export function findMapTerrain(map: MapId): Terrain {
  return map === 'cave' ? CAVE_TERRAIN : VILLAGE_TERRAIN;
}

/**
 * Tells whether a value names a map.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} Whether it does.
 */
export function isMapId(value: unknown): value is MapId {
  return MAP_IDS.some((map: MapId) => map === value);
}
