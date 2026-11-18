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
 * @module client/village-layout Arranging the models into a village.
 */

import { VILLAGE_PLACEMENTS } from '@clovervale/shared';
import type { Placement } from '@clovervale/shared';

import { classifyModel } from './model-catalogue.ts';

export type { Placement } from '@clovervale/shared';

/** A spot on the ground: its X and Z positions, and its yaw. */
type Spot = readonly [x: number, z: number, yaw: number];

/** The distance between two neighbouring unknown props, in metres. */
const SPARE_SPACING = 6;
/** The number of unknown props in a row. */
const SPARE_ROW_LENGTH = 3;
/** The spot of the first unknown prop. */
const FIRST_SPARE_SPOT: Spot = [-12, 18, 0];

/**
 * Finds the spots of a prop the village has no place for.
 *
 * @param {number} index - The position of the prop among such props, from
 *   zero.
 * @returns {Spot[]} The one spot of the prop.
 */
function findSpareSpots(index: number): Spot[] {
  const [x, z, yaw] = FIRST_SPARE_SPOT;
  const column: number = index % SPARE_ROW_LENGTH;
  const row: number = Math.floor(index / SPARE_ROW_LENGTH);
  return [[x + column * SPARE_SPACING, z + row * SPARE_SPACING, yaw]];
}

/**
 * Arranges the models into a village.
 *
 * The fountain stands in the middle of a plaza, in front of the great tree,
 * and the cottages and the weapon shop stand around the plaza, each facing
 * it.  The NPC is by the fountain, as is the healing stele, and the spawn
 * stones of the monster are a little way outside.  The characters and the
 * monster have no place of their own, as they stand wherever the server
 * has them.  A prop the village has no place for stands by itself to one
 * side, where it stands in nobody's way.
 *
 * @param {readonly string[]} files - The file names of the models to
 *   arrange.
 * @returns {Placement[]} Where each model stands.  A model can stand in
 *   several places, and a character, the monster or a file the game does
 *   not use stands nowhere.
 */
export function layoutVillage(files: readonly string[]): Placement[] {
  const placements: Placement[] = [];
  let spareCount = 0;
  for (const file of files) {
    const placed: Placement[] = VILLAGE_PLACEMENTS.filter(
      (placement: Placement) => placement.file === file,
    );
    if (placed.length === 0 && classifyModel(file) === 'prop') {
      for (const [x, z, yaw] of findSpareSpots(spareCount++)) {
        placed.push({ file, x, z, yaw });
      }
    }
    placements.push(...placed);
  }
  return placements;
}
