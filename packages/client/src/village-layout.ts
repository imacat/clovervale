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

import { CHARACTER_FILES, classifyModel } from './model-catalogue.ts';

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

/** The distance between two neighbouring characters, in metres. */
const CHARACTER_SPACING = 1.5;
/** The position along the Z axis of the row of characters, in metres. */
const CHARACTER_ROW_Z = -2;

/** The distance between two neighbouring unknown props, in metres. */
const SPARE_SPACING = 6;
/** The number of unknown props in a row. */
const SPARE_ROW_LENGTH = 3;
/** The spot of the first unknown prop. */
const FIRST_SPARE_SPOT: Spot = [-12, 10, 0];

/** The spots of the models the village has a place for. */
const SPOTS: Readonly<Record<string, readonly Spot[]>> = {
  'fountain.glb': [[0, -8.5, 0]],
  'weapon-shop.glb': [[10.5, -6.5, -35]],
  'npc.glb': [[-3.2, -6.3, 20]],
  'monster.glb': [[8.6, 5.2, -65]],
  'prop-spawn-stones.glb': [[12, 7.5, -30]],
  'prop-great-tree.glb': [[0, -17, 20]],
  'prop-cottage.glb': [
    [-10.5, -4, 40],
    [-7.5, -13, 20],
    [8, -16.5, -20],
  ],
  'prop-pine-tree.glb': [
    [-15, -9, 0],
    [-13, -12, 40],
    [-16, -4, 80],
    [14, -13, 120],
    [16.5, -9, 160],
    [16, -1, 200],
    [-14.5, 4, 240],
    [16, 4.5, 280],
    [-4, -24, 320],
    [5, -25, 0],
    [-18, -16, 40],
    [18, -17, 80],
    [15.5, 10, 120],
  ],
  'prop-bush.glb': [
    [-6, 1.5, 0],
    [-8, 3.2, 70],
    [-5, 4, 140],
    [4.6, 6.2, 210],
    [-3.2, -11, 280],
    [3.3, -11.2, 350],
    [-8.5, -8.5, 60],
    [6, -11.5, 130],
    [14.5, 3, 200],
  ],
  'prop-flowers.glb': [
    [-3.5, 1.6, 0],
    [-2.8, 4, 50],
    [3.2, 2.8, 100],
    [2.6, 0.8, 150],
    [-6.6, -5.6, 200],
    [5.2, -9.6, 250],
    [-2.4, -9.6, 300],
  ],
  'prop-rock.glb': [
    [6.2, 8.2, 30],
    [-9.2, 2.4, 120],
    [13.2, 5, 250],
  ],
  'prop-fence.glb': [
    [-15, 1, 0],
    [-13, 1, 0],
    [-11, 1, 0],
    [5.5, 1.6, 0],
    [7.5, 1.6, 0],
    [9.5, 1.6, 0],
    [11.5, 1.6, 0],
    [13.5, 1.6, 0],
  ],
};

/**
 * Finds the spots of a character in the row where they can be compared.
 *
 * @param {number} index - The position of the character among them all,
 *   from zero.
 * @returns {Spot[]} The one spot of the character.
 */
function findCharacterSpots(index: number): Spot[] {
  const middle: number = (CHARACTER_FILES.length - 1) / 2;
  return [[(index - middle) * CHARACTER_SPACING, CHARACTER_ROW_Z, 0]];
}

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
 * The fountain, the weapon shop and the NPC are in the village, the
 * characters stand in a row in front of it, each always in its own place,
 * and the monster is a little way outside.  A prop the village has no place
 * for stands by itself to one side.
 *
 * @param {readonly string[]} files - The file names of the models to
 *   arrange.
 * @returns {Placement[]} Where each model stands.  A model can stand in
 *   several places, and a file the game does not use stands nowhere.
 */
export function layoutVillage(files: readonly string[]): Placement[] {
  const placements: Placement[] = [];
  let spareCount = 0;
  for (const file of files) {
    let spots: readonly Spot[] = SPOTS[file] ?? [];
    if (classifyModel(file) === 'character') {
      spots = findCharacterSpots(CHARACTER_FILES.indexOf(file));
    } else if (spots.length === 0 && classifyModel(file) === 'prop') {
      spots = findSpareSpots(spareCount++);
    }
    for (const [x, z, yaw] of spots) {
      placements.push({ file, x, z, yaw });
    }
  }
  return placements;
}
