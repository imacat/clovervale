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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/village What the server and its peers know of the village.
 */

import type { GroundVector } from './movement.ts';

/** The centre of the plaza, where the fountain stands. */
export const PLAZA_CENTRE: GroundVector = { x: 0, z: -8.5 };

/**
 * The yaw of a player who has just entered the village, facing the fountain,
 * in degrees.
 */
export const SPAWN_YAW = 180;

/** The distance between two neighbouring spawn points, in metres. */
export const SPAWN_SPACING = 1.6;

/** The number of spawn points in a row. */
const SPAWN_ROW_LENGTH = 8;

/** The distance of the first row of spawn points from the fountain. */
const SPAWN_DISTANCE = 5;

/**
 * Finds a point where a player can enter the village.
 *
 * The points lie in rows on the plaza in front of the fountain.  Each row
 * fills from its middle outwards, and the rows fill away from the fountain.
 *
 * @param {number} index - The number of the point, from zero.
 * @returns {GroundVector} The point.
 */
export function findSpawnPoint(index: number): GroundVector {
  const column: number = index % SPAWN_ROW_LENGTH;
  const row: number = Math.floor(index / SPAWN_ROW_LENGTH);
  const side: number = column % 2 === 0 ? -1 : 1;
  const offset: number = (Math.floor(column / 2) + 0.5) * SPAWN_SPACING;
  return {
    x: PLAZA_CENTRE.x + side * offset,
    z: PLAZA_CENTRE.z + SPAWN_DISTANCE + row * SPAWN_SPACING,
  };
}
