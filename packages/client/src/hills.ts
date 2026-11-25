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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/25
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/hills Raising the low hills that close in the valley just
 *   outside the village, with pine trees on their slopes.
 */

import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { VILLAGE_TERRAIN, measureBoundaryReach } from '@clovervale/shared';
import type { Boundary } from '@clovervale/shared';

import {
  createRandom,
  createRing,
  measureLowlandOpening,
  measureTurn,
  pickInRange,
} from './mountains.ts';
import type { Range, RidgePoint } from './mountains.ts';

/**
 * A row of points of the hills around the valley: how far out it lies, as
 * a share of the way from their inner foot out to their crest, past 1 for
 * their back slope, and how high, as a share of the height of their crest,
 * or `null` for their outer foot, sunk into the ground.
 */
type HillRow = readonly [out: number, rise: number | null];

/**
 * A tier of the branches of a pine tree: its radius at the bottom and at
 * the top, and the height of its bottom and of its top, each as a share
 * of the height of the tree.
 */
type Tier = readonly [bottom: number, top: number, low: number, high: number];

/** A knoll: where around it stands, how high, and how wide it spreads. */
type Knoll = readonly [turn: number, height: number, spread: number];

/** How a part of the hills looks, and how it melts into the sky. */
interface HillLook {
  /** Its color. */
  readonly color: string;
  /**
   * How bright it is when it takes on the color of the sky, as a share of
   * the brightness of the sky.
   */
  readonly skyShade: number;
}

/**
 * The boundary the players cannot leave, which the hills ring, rising from
 * the ground right where the players stop.
 */
const BOUNDARY: Boundary = VILLAGE_TERRAIN.boundary;

/**
 * How the slopes look: darker than the nearest ridge of mountains when
 * they take on the color of the sky, being nearer.
 */
const SLOPE_LOOK: HillLook = { color: '#7ba65e', skyShade: 0.5 };
/** How the pine trees look: darker still than the slopes. */
const TREE_LOOK: HillLook = { color: '#3f7d4f', skyShade: 0.42 };
/** How the slopes and then the trees look, as the hills have them. */
const LOOKS: readonly HillLook[] = [SLOPE_LOOK, TREE_LOOK];

/**
 * How far the crest of the hills is beyond their inner foot, on the edge
 * of the boundary, in meters.
 */
const SLOPE_RUN = 27;
/** How far the crest wanders in and out, in meters. */
const CREST_WANDER = 3;
/**
 * How deep the hills sink into the ground where they are gone toward the
 * gate, and at their outer foot, in meters.
 */
const FOOT_DEPTH = 1.5;
/** How many points each row of the hills has around the valley. */
const COLUMNS = 96;
/** How far a column wanders around, as a share of the room between two. */
const COLUMN_WANDER = 0.3;

/**
 * The rows of the hills, from their inner foot on the ground up their
 * slope to their crest, and down their back slope.
 */
const ROWS: readonly HillRow[] = [
  [0, 0],
  [0.38, 0.32],
  [0.72, 0.78],
  [1, 1],
  [1.35, 0.6],
  [1.8, null],
];

/** How high the crest rises between the knolls, in meters. */
const SADDLE: Range = [8, 11.5];
/** How high the knolls rise, in meters. */
const KNOLL: Range = [12.5, 15];
/** The number of knolls. */
const KNOLL_COUNT = 7;
/** How wide a knoll spreads to either side, in radians. */
const KNOLL_SPREAD: Range = [0.15, 0.35];

/** The number of pine trees tried on the slopes. */
const TREE_TRIES = 420;
/** How tall a pine tree is, in meters. */
const TREE_HEIGHT: Range = [4, 7];
/** How much wider or narrower a pine tree is, as a share of its width. */
const TREE_GIRTH: Range = [0.85, 1.15];
/** How bright a pine tree is, as a share of the color of the trees. */
const TREE_SHADE: Range = [0.8, 1.1];
/**
 * How far up the slope the pine trees stand, as a share of the way from
 * the inner foot to the crest.
 */
const TREE_REACH: Range = [0.1, 0.9];
/** How open toward the gate a pine tree may stand, at most. */
const TREE_MOST_OPENING = 0.15;
/** How low on the hills a pine tree may stand, at least, in meters. */
const TREE_LEAST_FOOTING = 0.6;
/** How deep a pine tree sinks into the slope, in meters. */
const TREE_SINK = 0.4;
/**
 * How high above the ground the eye looks out from the middle of the
 * valley, in meters.
 */
const EYE_HEIGHT = 1.7;
/**
 * How high above the horizon the top of a pine tree may rise, at most,
 * seen from the middle of the valley, in radians: about as high as the
 * highest knolls, so that the trees hide little more of the sky.
 */
const TREE_HIGHEST_RISE: number = MathUtils.degToRad(13);
/** The number of sides of a tier of a pine tree. */
const TREE_SIDES = 6;
/** The tiers of a pine tree, as a share of its height, bottom first. */
const TIERS: readonly Tier[] = [
  [0.3, 0.085, 0, 0.5],
  [0.23, 0.056, 0.42, 0.75],
  [0.16, 0, 0.66, 1],
];

/**
 * Measures how far out from the middle of the boundary the inner foot of
 * the hills lies in a direction: on the edge of the boundary, where the
 * players stop.
 *
 * @param {number} turn - The direction, around the Y axis from +Z toward
 *   +X, in radians.
 * @returns {number} The distance, in meters.
 */
function measureFoot(turn: number): number {
  return measureBoundaryReach(BOUNDARY, {
    x: Math.sin(turn),
    z: Math.cos(turn),
  });
}

/**
 * Finds the points of every row of the hills, a point a column.
 *
 * @param {() => number} random - The source of numbers that seem random.
 * @returns {RidgePoint[][]} The rows, inner foot first, around the middle
 *   of the boundary.
 */
function findHillPoints(random: () => number): RidgePoint[][] {
  const waves: number[] = [random(), random()].map(
    (share: number) => share * 2 * Math.PI,
  );
  const knolls: Knoll[] = Array.from(
    { length: KNOLL_COUNT },
    (_, index: number): Knoll => [
      ((index + random() * 0.8) * 2 * Math.PI) / KNOLL_COUNT,
      pickInRange(KNOLL, random()),
      pickInRange(KNOLL_SPREAD, random()),
    ],
  );
  const rows: RidgePoint[][] = ROWS.map(() => []);
  for (let column = 0; column < COLUMNS; column++) {
    const shift: number = (random() * 2 - 1) * COLUMN_WANDER;
    const turn: number = ((column + shift) * 2 * Math.PI) / COLUMNS;
    const [first = 0, second = 0] = waves;
    const swell: number =
      0.5 +
      0.3 * Math.sin(3 * turn + first) +
      0.2 * Math.sin(7 * turn + second);
    let height: number = pickInRange(SADDLE, swell);
    for (const [knollTurn, knollHeight, spread] of knolls) {
      const fall: number = measureTurn(turn, knollTurn) / spread;
      height = Math.max(height, knollHeight * (1 - fall * fall));
    }
    const standing: number = 1 - measureLowlandOpening(turn);
    const foot: number = measureFoot(turn);
    const crest: number =
      foot + SLOPE_RUN + (random() * 2 - 1) * CREST_WANDER;
    ROWS.forEach(([out, rise]: HillRow, index: number) => {
      const up: number = rise === null ? -FOOT_DEPTH : height * rise;
      rows[index]?.push([
        turn,
        foot + (crest - foot) * out,
        MathUtils.lerp(-FOOT_DEPTH, up, standing),
      ]);
    });
  }
  return rows;
}

/**
 * Creates the shape of a pine tree.
 *
 * @returns {BufferGeometry} The tree, one meter tall, standing on the
 *   origin.
 */
function createTreeShape(): BufferGeometry {
  const tiers: BufferGeometry[] = TIERS.map(
    ([bottom, top, low, high]: Tier) => {
      const tier = new CylinderGeometry(top, bottom, high - low, TREE_SIDES);
      tier.translate(0, (low + high) / 2, 0);
      return tier;
    },
  );
  return mergeGeometries(tiers);
}

/**
 * Finds where the pine trees stand on the slopes, keeping them off the
 * opening toward the gate, and low enough on the sky as seen from the
 * middle of the valley.
 *
 * @param {Mesh} slopes - The slopes of the hills, around the origin.
 * @param {() => number} random - The source of numbers that seem random.
 * @returns {Matrix4[]} How each tree stands, from one meter tall on the
 *   origin.
 */
function placeTrees(slopes: Mesh, random: () => number): Matrix4[] {
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const trees: Matrix4[] = [];
  for (let index = 0; index < TREE_TRIES; index++) {
    const turn: number = random() * 2 * Math.PI;
    const reach: number = pickInRange(TREE_REACH, random());
    const height: number = pickInRange(TREE_HEIGHT, random());
    const girth: number = pickInRange(TREE_GIRTH, random());
    const yaw: number = random() * 2 * Math.PI;
    if (measureLowlandOpening(turn) > TREE_MOST_OPENING) {
      continue;
    }
    const distance: number = measureFoot(turn) + reach * SLOPE_RUN;
    const x: number = Math.sin(turn) * distance;
    const z: number = Math.cos(turn) * distance;
    raycaster.set(new Vector3(x, KNOLL[1] * 4, z), down);
    const [ground] = raycaster.intersectObject(slopes);
    if (ground === undefined || ground.point.y < TREE_LEAST_FOOTING) {
      continue;
    }
    const top: number = ground.point.y - TREE_SINK + height;
    if (Math.atan2(top - EYE_HEIGHT, distance) > TREE_HIGHEST_RISE) {
      continue;
    }
    trees.push(
      new Matrix4().compose(
        new Vector3(x, ground.point.y - TREE_SINK, z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
        new Vector3(height * girth, height, height * girth),
      ),
    );
  }
  return trees;
}

/**
 * Creates the pine trees on the slopes of the hills, drawn all at once.
 *
 * @param {Mesh} slopes - The slopes of the hills, around the origin.
 * @param {() => number} random - The source of numbers that seem random.
 * @returns {InstancedMesh} The trees.
 */
function createTrees(slopes: Mesh, random: () => number): InstancedMesh {
  const places: Matrix4[] = placeTrees(slopes, random);
  const material = new MeshStandardMaterial({
    color: TREE_LOOK.color,
    roughness: 1,
    flatShading: true,
  });
  const trees = new InstancedMesh(createTreeShape(), material, places.length);
  places.forEach((place: Matrix4, index: number) => {
    trees.setMatrixAt(index, place);
    trees.setColorAt(
      index,
      new Color().setScalar(pickInRange(TREE_SHADE, random())),
    );
  });
  trees.computeBoundingSphere();
  return trees;
}

/**
 * Creates the hills that ring the valley, rising from the ground right at
 * the boundary that the players cannot leave, so that the players stop at
 * their foot: low, rolling hills of 8 to 15 meters, with
 * pine trees on the slopes that face the village, broken open toward the
 * way out through the village gate.  They are the same every time.
 *
 * @returns {Group} The hills, named `hills`, standing around the middle of
 *   the boundary, with their slopes as the first child and their trees as
 *   the second.
 */
export function createHills(): Group {
  const random: () => number = createRandom(0x4111);
  const slopes: Mesh = createRing(findHillPoints(random), SLOPE_LOOK.color);
  const hills = new Group();
  hills.name = 'hills';
  hills.add(slopes, createTrees(slopes, random));
  hills.position.set(BOUNDARY.x, 0, BOUNDARY.z);
  return hills;
}

/**
 * Has the hills take on the color of the sky instead of their own, as far
 * as told, as the mountains do, each part glowing in the color of the sky
 * a little darker than the mountains as its own color fades, the trees
 * darker than the slopes.
 *
 * @param {Object3D} hills - The hills, as {@link createHills} creates them.
 * @param {Color} sky - The color of the sky.
 * @param {number} share - How far they take on the color of the sky, from
 *   0 for their own colors to 1 for the color of the sky alone.
 */
export function tintHills(hills: Object3D, sky: Color, share: number): void {
  hills.children.forEach((child: Object3D, index: number) => {
    const look: HillLook | undefined = LOOKS[index];
    if (look === undefined || !(child instanceof Mesh)) {
      return;
    }
    const material = child.material as MeshStandardMaterial;
    material.color.set(look.color).multiplyScalar(1 - share);
    material.emissive.copy(sky).multiplyScalar(look.skyShade * share);
  });
}
