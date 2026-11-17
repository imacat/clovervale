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

import { PLAZA_CENTRE } from '@clovervale/shared';

import { classifyModel } from './model-catalogue.ts';

/** Where a model stands on the ground, and which way it faces. */
export interface Placement {
  /** The file name of the model. */
  readonly file: string;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
}

/** A spot on the ground: its X and Z positions, and its yaw. */
type Spot = readonly [x: number, z: number, yaw: number];

/** The distance between two neighbouring unknown props, in metres. */
const SPARE_SPACING = 6;
/** The number of unknown props in a row. */
const SPARE_ROW_LENGTH = 3;
/** The spot of the first unknown prop. */
const FIRST_SPARE_SPOT: Spot = [-12, 18, 0];

/** The spots of the models the village has a place for. */
const SPOTS: Readonly<Record<string, readonly Spot[]>> = {
  'fountain.glb': [[PLAZA_CENTRE.x, PLAZA_CENTRE.z, 0]],
  'weapon-shop.glb': [[12, -4.5, -90]],
  'npc.glb': [[3.2, -6.4, -25]],
  'monster.glb': [[8.4, 6.8, -60]],
  'prop-spawn-stones.glb': [[11.4, 9, -30]],
  'prop-great-tree.glb': [[0, -14.5, 20]],
  'prop-cottage.glb': [
    [-11, -4.5, 90],
    [-10.5, -16.5, 55],
    [10.5, -16.5, -55],
  ],
  'prop-pine-tree.glb': [
    [-16.5, 0.5, 0],
    [-18.5, -6, 40],
    [-18, -13.5, 80],
    [-14.5, -21.5, 120],
    [-10, -24.5, 160],
    [0, -26, 200],
    [10, -24.5, 240],
    [14.5, -21.5, 280],
    [18, -14, 320],
    [18.5, -7, 0],
    [17.5, 0, 40],
    [-11, 7, 80],
    [-15, 4, 120],
    [17, 12, 160],
    [6, 16.5, 200],
    [-24, -18, 240],
    [24, -22, 280],
    [-3, -33, 320],
    [23, 5, 0],
    [-22, 9, 40],
  ],
  'prop-bush.glb': [
    [-3.3, -11.2, 0],
    [3.4, -11.4, 70],
    [-4.7, -12.5, 140],
    [4.6, -12.7, 210],
    [-5, 4.6, 280],
    [-6.8, 6.2, 350],
    [-4.6, 7.6, 60],
    [-8.6, 4.6, 130],
    [-7, 9, 200],
    [4.4, 5, 270],
    [4.6, 13.6, 340],
    [4.3, 7.4, 50],
    [15.2, 1.4, 120],
    [-15, -10.5, 190],
    [15, -10.5, 260],
  ],
  'prop-flowers.glb': [
    [-3.6, 3.4, 0],
    [-3.4, 6.4, 50],
    [-5.6, 9.2, 100],
    [3.4, 3.4, 150],
    [-3.6, 10.5, 200],
    [-2.6, -10.2, 250],
    [2.6, -10.3, 300],
    [-8, -0.2, 350],
    [7.4, 0.4, 40],
    [-13.5, -9.5, 90],
    [13.5, -10, 140],
  ],
  'prop-rock.glb': [
    [6.6, 10.4, 30],
    [14.6, 6.4, 120],
    [-9.5, 8, 250],
    [-16, -11.5, 80],
  ],
  'prop-fence.glb': [
    [-6, 3, 0],
    [-8, 3, 0],
    [-10, 3, 0],
    [6, 3, 0],
    [8, 3, 0],
    [10, 3, 0],
    [12, 3, 0],
    [14, 3, 0],
    [-16.5, -8.5, 90],
    [-16.5, -10.5, 90],
    [-16.5, -12.5, 90],
    [16.5, -8.5, 90],
    [16.5, -10.5, 90],
    [16.5, -12.5, 90],
    [-2, -23, 0],
    [0, -23, 0],
    [2, -23, 0],
  ],
};

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
 * it.  The NPC is by the fountain, and the monster is a little way outside.
 * The characters have no place of their own, as they stand wherever their
 * players are.  A prop the village has no place for stands by itself to one
 * side.
 *
 * @param {readonly string[]} files - The file names of the models to
 *   arrange.
 * @returns {Placement[]} Where each model stands.  A model can stand in
 *   several places, and a character or a file the game does not use stands
 *   nowhere.
 */
export function layoutVillage(files: readonly string[]): Placement[] {
  const placements: Placement[] = [];
  let spareCount = 0;
  for (const file of files) {
    let spots: readonly Spot[] = SPOTS[file] ?? [];
    if (spots.length === 0 && classifyModel(file) === 'prop') {
      spots = findSpareSpots(spareCount++);
    }
    for (const [x, z, yaw] of spots) {
      placements.push({ file, x, z, yaw });
    }
  }
  return placements;
}
