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
 * @module shared/village-layout Where the models of the village stand, and
 *   the ground they take up.
 */

import { Terrain, findTurn, placeShape, turnVector } from './terrain.ts';
import type { Boundary, Pose, Shape } from './terrain.ts';
import { PLAZA_CENTRE } from './village.ts';

/** Where a model stands on the ground, and which way it faces. */
export interface Placement extends Pose {
  /** The file name of the model. */
  readonly file: string;
}

/** A spot on the ground: its X and Z positions, and its yaw. */
type Spot = readonly [x: number, z: number, yaw: number];

/** The spots of the models the village has a place for. */
const SPOTS: Readonly<Record<string, readonly Spot[]>> = {
  'fountain.glb': [[PLAZA_CENTRE.x, PLAZA_CENTRE.z, 0]],
  'weapon-shop.glb': [[12, -4.5, -90]],
  'npc.glb': [[3.2, -6.4, -25]],
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
 * Where the models the village has a place for stand, model by model and,
 * for a model that stands in several places, place by place.
 */
export const VILLAGE_PLACEMENTS: readonly Placement[] = Object.entries(
  SPOTS,
).flatMap(([file, spots]: [string, readonly Spot[]]) =>
  spots.map(([x, z, yaw]: Spot): Placement => ({ file, x, z, yaw })),
);

/**
 * Makes a round footprint.
 *
 * @param {number} x - The centre along the X axis of the model.
 * @param {number} z - The centre along the Z axis of the model.
 * @param {number} radius - The radius.
 * @returns {Shape} The footprint.
 */
function makeCircle(x: number, z: number, radius: number): Shape {
  return { shape: 'circle', x, z, radius };
}

/**
 * Makes a rectangular footprint, square with the model.
 *
 * @param {number} left - The least extent along the X axis of the model.
 * @param {number} right - The greatest extent along the X axis.
 * @param {number} back - The least extent along the Z axis of the model.
 * @param {number} front - The greatest extent along the Z axis.
 * @returns {Shape} The footprint.
 */
function makeBox(
  left: number,
  right: number,
  back: number,
  front: number,
): Shape {
  return {
    shape: 'box',
    x: (left + right) / 2,
    z: (back + front) / 2,
    halfWidth: (right - left) / 2,
    halfDepth: (front - back) / 2,
    yaw: 0,
  };
}

/**
 * The ground each model takes up where nobody can walk, as the model has it
 * before it is placed.  The flowers, which anyone can step over, take up
 * none.
 */
const FOOTPRINTS: Readonly<Record<string, readonly Shape[]>> = {
  // The rim of the basin, inside the low step around it.
  'fountain.glb': [makeCircle(0, 0, 1.6)],
  // The house, the forge beside it, and the stall in front.
  'weapon-shop.glb': [
    makeBox(-3.6, 1.85, -2.95, 1.9),
    makeBox(1.85, 3.85, -1.85, 1.35),
    makeBox(-1.4, 2.5, 1.9, 3.05),
  ],
  'npc.glb': [makeCircle(0, 0, 0.35)],
  // The five standing stones, and not the slab they stand round.
  'prop-spawn-stones.glb': Array.from({ length: 5 }, (_, index: number) => {
    const { x, z } = turnVector({ x: 0, z: 1.75 }, findTurn(index * 72 + 36));
    return makeCircle(x, z, 0.35);
  }),
  // The trunk, and not the roots.
  'prop-great-tree.glb': [makeCircle(-0.15, 0.41, 1.6)],
  'prop-cottage.glb': [makeBox(-2.55, 2.55, -2.35, 2.35)],
  // The trunk and the lowest branches.
  'prop-pine-tree.glb': [makeCircle(0, 0, 0.6)],
  'prop-bush.glb': [makeCircle(0, 0, 0.8)],
  'prop-rock.glb': [makeCircle(0, 0, 0.65)],
  'prop-fence.glb': [makeBox(-1, 1, -0.08, 0.08)],
};

/** The circle on the ground around the village that players cannot leave. */
export const VILLAGE_BOUNDARY: Boundary = { x: 0, z: -5, radius: 28 };

/**
 * The ground of the village: what stands where it is placed, and the
 * boundary.  Only the models the village has a place for stand in the way.
 */
export const VILLAGE_TERRAIN: Terrain = new Terrain(
  VILLAGE_PLACEMENTS.flatMap((placement: Placement) =>
    (FOOTPRINTS[placement.file] ?? []).map((shape: Shape) =>
      placeShape(placement, shape),
    ),
  ),
  VILLAGE_BOUNDARY,
);

/**
 * Finds where a model of the village stands.
 *
 * @param {string} file - The file name of the model.
 * @returns {Placement} The first place the model stands in.
 * @throws {Error} If the village has no place for the model.
 */
export function findPlacement(file: string): Placement {
  const found: Placement | undefined = VILLAGE_PLACEMENTS.find(
    (placement: Placement) => placement.file === file,
  );
  if (found === undefined) {
    throw new Error(`The village has no place for ${file}.`);
  }
  return found;
}
