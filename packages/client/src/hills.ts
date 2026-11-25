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
 *   outside the village and line the mountain road out of it, with pine
 *   trees on their slopes.
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

import {
  VILLAGE_TERRAIN,
  findCorridorMouth,
  measureBoundaryReach,
} from '@clovervale/shared';
import type {
  Boundary,
  BoundaryCorridor,
  GroundVector,
} from '@clovervale/shared';

import {
  createRandom,
  createRing,
  measureTurn,
  pickInRange,
} from './mountains.ts';
import type { Range, RidgePoint } from './mountains.ts';

/**
 * A row of points of the hills: how far out it lies, as a share of the way
 * from their inner foot out to their crest, past 1 for their back slope,
 * and how high, as a share of the height of their crest, or `null` for
 * their outer foot, sunk into the ground.
 */
type HillRow = readonly [out: number, rise: number | null];

/**
 * A point of the hills: how far across and along the ground it is from the
 * middle of the boundary, along X and Z, and how high it is, in meters.
 */
type HillPoint = readonly [x: number, z: number, height: number];

/**
 * A tier of the branches of a pine tree: its radius at the bottom and at
 * the top, and the height of its bottom and of its top, each as a share
 * of the height of the tree.
 */
type Tier = readonly [bottom: number, top: number, low: number, high: number];

/**
 * A knoll around the valley: where around it stands, in radians, how high,
 * and how wide it spreads, in radians.
 */
type Knoll = readonly [turn: number, height: number, spread: number];

/**
 * A knoll beside the mountain road: how far out along the road it stands,
 * how high, and how far it spreads along the road, in meters.
 */
type RoadKnoll = readonly [along: number, height: number, spread: number];

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
 * The boundary the players cannot leave, which the hills ring and line,
 * rising from the ground right where the players stop.
 */
const BOUNDARY: Boundary = VILLAGE_TERRAIN.boundary;

/** The mountain road out of the valley, which the hills line. */
const ROAD: BoundaryCorridor = findRoad(BOUNDARY);

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
 * How far the crest of the hills around the valley is beyond their inner
 * foot, on the edge of the boundary, in meters.
 */
const SLOPE_RUN = 27;
/** How far the crest around the valley wanders in and out, in meters. */
const CREST_WANDER = 3;
/**
 * How deep the hills sink into the ground at their outer foot, and where
 * they are gone far out along the mountain road, in meters.
 */
const FOOT_DEPTH = 1.5;
/**
 * How many points each row of the hills has around the valley, from one
 * side of the mountain road to the other.
 */
const COLUMNS = 96;
/** How far a column wanders, as a share of the room between two. */
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
/** The number of knolls around the valley. */
const KNOLL_COUNT = 7;
/** How wide a knoll around the valley spreads to either side, in radians. */
const KNOLL_SPREAD: Range = [0.15, 0.35];

/**
 * How far the crest of the hills beside the mountain road is from the side
 * of the road, in meters: nearer than around the valley, so that they rise
 * more steeply on either side of the road.
 */
const ROAD_SLOPE_RUN = 22;
/**
 * How far apart the points of each row of the hills beside the mountain
 * road lie along it, about, in meters.
 */
const ROAD_STEP = 4;
/**
 * How far out along the mountain road from the middle of the boundary the
 * hills beside it start to sink into the ground, in meters: well beyond the
 * palisade gate at the end of the road where the players walk, so that the
 * road seems to run on between them.
 */
const ROAD_HILLS_FADE = 115;
/**
 * How far out along the mountain road from the middle of the boundary the
 * hills beside it are gone into the ground, in meters.
 */
const ROAD_HILLS_END = 155;
/** The number of knolls on either side of the mountain road. */
const ROAD_KNOLL_COUNT = 3;
/**
 * How far a knoll beside the mountain road spreads along it to either
 * side, in meters.
 */
const ROAD_KNOLL_SPREAD: Range = [8, 16];

/** The number of pine trees tried on the slopes around the valley. */
const TREE_TRIES = 420;
/** The number of pine trees tried on the slopes beside the mountain road. */
const ROAD_TREE_TRIES = 180;
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
/**
 * How far from the side of the mountain road a pine tree stands, at least,
 * in meters, so that its branches keep off the road.
 */
const TREE_ROAD_CLEARANCE = 4;
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
 * Finds the mountain road out of a boundary.
 *
 * @param {Boundary} boundary - The boundary.
 * @returns {BoundaryCorridor} The road.
 * @throws {Error} If the boundary has no road.
 */
function findRoad(boundary: Boundary): BoundaryCorridor {
  if (boundary.corridor === undefined) {
    throw new Error('The village has no mountain road.');
  }
  return boundary.corridor;
}

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
 * Measures the direction of a point from the middle of the boundary.
 *
 * @param {GroundVector} point - The point, from the middle of the boundary.
 * @returns {number} The direction, around the Y axis from +Z toward +X, in
 *   radians.
 */
function measureDirection(point: GroundVector): number {
  return Math.atan2(point.x, point.z);
}

/**
 * Finds the points of every row of the hills around the valley, a point a
 * column, from one side of the mountain road around the valley to the
 * other.
 *
 * @param {() => number} random - The source of numbers that seem random.
 * @param {Range} turns - The directions of the first and the last column,
 *   at the mouth of the road on its side toward +X and toward -X, around
 *   the Y axis from +Z toward +X, in radians, the last more than the first.
 * @returns {HillPoint[][]} The rows, inner foot first, around the middle
 *   of the boundary.
 */
function findRingPoints(random: () => number, turns: Range): HillPoint[][] {
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
  const rows: HillPoint[][] = ROWS.map(() => []);
  const last: number = COLUMNS - 1;
  for (let column = 0; column <= last; column++) {
    const wander: number = (random() * 2 - 1) * COLUMN_WANDER;
    const shift: number = column === 0 || column === last ? 0 : wander;
    const turn: number = pickInRange(turns, (column + shift) / last);
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
    const foot: number = measureFoot(turn);
    const crest: number =
      foot + SLOPE_RUN + (random() * 2 - 1) * CREST_WANDER;
    ROWS.forEach(([out, rise]: HillRow, index: number) => {
      const distance: number = foot + (crest - foot) * out;
      rows[index]?.push([
        Math.sin(turn) * distance,
        Math.cos(turn) * distance,
        rise === null ? -FOOT_DEPTH : height * rise,
      ]);
    });
  }
  return rows;
}

/**
 * Finds the points of every row of the hills on one side of the mountain
 * road, a point a column, from the mouth of the road out along it, sinking
 * into the ground far beyond its end.
 *
 * @param {() => number} random - The source of numbers that seem random.
 * @param {number} side - The side of the road: 1 toward +X, or -1 toward
 *   -X.
 * @param {GroundVector} mouth - Where the edge of the valley meets that
 *   side of the road, from the middle of the boundary.
 * @returns {HillPoint[][]} The rows, inner foot first, around the middle
 *   of the boundary.
 */
function findRoadPoints(
  random: () => number,
  side: number,
  mouth: GroundVector,
): HillPoint[][] {
  const [first = 0, second = 0] = [random(), random()].map(
    (share: number) => share * 2 * Math.PI,
  );
  const knolls: RoadKnoll[] = Array.from(
    { length: ROAD_KNOLL_COUNT },
    (_, index: number): RoadKnoll => [
      pickInRange(
        [mouth.z, ROAD_HILLS_FADE],
        (index + random() * 0.8) / ROAD_KNOLL_COUNT,
      ),
      pickInRange(KNOLL, random()),
      pickInRange(ROAD_KNOLL_SPREAD, random()),
    ],
  );
  const rows: HillPoint[][] = ROWS.map(() => []);
  const last: number = Math.ceil((ROAD_HILLS_END - mouth.z) / ROAD_STEP);
  for (let column = 0; column <= last; column++) {
    const wander: number = (random() * 2 - 1) * COLUMN_WANDER;
    const shift: number = column === 0 || column === last ? 0 : wander;
    const along: number = pickInRange(
      [mouth.z, ROAD_HILLS_END],
      (column + shift) / last,
    );
    const swell: number =
      0.5 +
      0.3 * Math.sin(along / 9 + first) +
      0.2 * Math.sin(along / 4 + second);
    let height: number = pickInRange(SADDLE, swell);
    for (const [knollAlong, knollHeight, spread] of knolls) {
      const fall: number = (along - knollAlong) / spread;
      height = Math.max(height, knollHeight * (1 - fall * fall));
    }
    const standing: number =
      1 - MathUtils.smoothstep(along, ROAD_HILLS_FADE, ROAD_HILLS_END);
    ROWS.forEach(([out, rise]: HillRow, index: number) => {
      const up: number = rise === null ? -FOOT_DEPTH : height * rise;
      rows[index]?.push([
        side * (ROAD.halfWidth + ROAD_SLOPE_RUN * out),
        along,
        MathUtils.lerp(-FOOT_DEPTH, up, standing),
      ]);
    });
  }
  return rows;
}

/**
 * Joins a row of the hills beside the mountain road to the same row of the
 * hills around the valley, at the corner where they meet beside the mouth
 * of the road, so that neither reaches past the other: the points of
 * either row short of the corner move onto the corner.
 *
 * @param {HillPoint[]} ring - The row around the valley, starting at the
 *   mouth of the road on that side, which is changed.
 * @param {HillPoint[]} road - The row beside the road, from the mouth of
 *   the road out along it, which is changed.
 * @param {number} side - The side of the road: 1 toward +X, or -1 toward
 *   -X.
 * @param {number} across - How far the row beside the road lies from the
 *   middle of the road, in meters.
 */
function joinAtCorner(
  ring: HillPoint[],
  road: HillPoint[],
  side: number,
  across: number,
): void {
  const beyond: number = ring.findIndex(
    ([x]: HillPoint) => side * x >= across,
  );
  const after: HillPoint | undefined = ring[beyond];
  if (after === undefined) {
    return;
  }
  const before: HillPoint = ring[beyond - 1] ?? after;
  const span: number = side * (after[0] - before[0]);
  const share: number = span > 0 ? (across - side * before[0]) / span : 0;
  const corner: HillPoint = [
    side * across,
    MathUtils.lerp(before[1], after[1], share),
    MathUtils.lerp(before[2], after[2], share),
  ];
  ring.fill(corner, 0, beyond);
  road.forEach(([, along]: HillPoint, index: number) => {
    if (along < corner[1]) {
      road[index] = corner;
    }
  });
}

/**
 * Finds the points of every row of the hills, a point a column, from far
 * out along the mountain road on its side toward +X, in along that side,
 * around the valley, and out along the other side.
 *
 * @param {() => number} random - The source of numbers that seem random.
 * @returns {RidgePoint[][]} The rows, inner foot first, around the middle
 *   of the boundary.
 */
function findHillPoints(random: () => number): RidgePoint[][] {
  const right: GroundVector = findCorridorMouth(BOUNDARY, 1);
  const left: GroundVector = findCorridorMouth(BOUNDARY, -1);
  const ring: HillPoint[][] = findRingPoints(random, [
    measureDirection(right),
    measureDirection(left) + 2 * Math.PI,
  ]);
  const rightRoad: HillPoint[][] = findRoadPoints(random, 1, right);
  const leftRoad: HillPoint[][] = findRoadPoints(random, -1, left);
  return ring.map((row: HillPoint[], index: number) => {
    const [out = 0] = ROWS[index] ?? [];
    const across: number = ROAD.halfWidth + ROAD_SLOPE_RUN * out;
    const rightRow: HillPoint[] = rightRoad[index] ?? [];
    const leftRow: HillPoint[] = leftRoad[index] ?? [];
    joinAtCorner(row, rightRow, 1, across);
    row.reverse();
    joinAtCorner(row, leftRow, -1, across);
    row.reverse();
    return [...rightRow.reverse(), ...row, ...leftRow].map(
      ([x, z, height]: HillPoint): RidgePoint => [
        measureDirection({ x, z }),
        Math.hypot(x, z),
        height,
      ],
    );
  });
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
 * Finds where the pine trees stand on the slopes, around the valley and
 * beside the mountain road, keeping them off the road, and low enough on
 * the sky as seen from the middle of the valley.
 *
 * @param {Mesh} slopes - The slopes of the hills, around the origin.
 * @param {() => number} random - The source of numbers that seem random.
 * @returns {Matrix4[]} How each tree stands, from one meter tall on the
 *   origin.
 */
function placeTrees(slopes: Mesh, random: () => number): Matrix4[] {
  const right: GroundVector = findCorridorMouth(BOUNDARY, 1);
  const left: GroundVector = findCorridorMouth(BOUNDARY, -1);
  const turns: Range = [
    measureDirection(right),
    measureDirection(left) + 2 * Math.PI,
  ];
  const mouth: number = Math.min(right.z, left.z);
  const raycaster = new Raycaster();
  const down = new Vector3(0, -1, 0);
  const trees: Matrix4[] = [];
  const tryTree = (x: number, z: number): void => {
    const height: number = pickInRange(TREE_HEIGHT, random());
    const girth: number = pickInRange(TREE_GIRTH, random());
    const yaw: number = random() * 2 * Math.PI;
    if (
      Math.abs(x) < ROAD.halfWidth + TREE_ROAD_CLEARANCE &&
      z > mouth - TREE_ROAD_CLEARANCE
    ) {
      return;
    }
    raycaster.set(new Vector3(x, KNOLL[1] * 4, z), down);
    const [ground] = raycaster.intersectObject(slopes);
    if (ground === undefined || ground.point.y < TREE_LEAST_FOOTING) {
      return;
    }
    const top: number = ground.point.y - TREE_SINK + height;
    if (Math.atan2(top - EYE_HEIGHT, Math.hypot(x, z)) > TREE_HIGHEST_RISE) {
      return;
    }
    trees.push(
      new Matrix4().compose(
        new Vector3(x, ground.point.y - TREE_SINK, z),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw),
        new Vector3(height * girth, height, height * girth),
      ),
    );
  };
  for (let index = 0; index < TREE_TRIES; index++) {
    const turn: number = pickInRange(turns, random());
    const distance: number =
      measureFoot(turn) + pickInRange(TREE_REACH, random()) * SLOPE_RUN;
    tryTree(Math.sin(turn) * distance, Math.cos(turn) * distance);
  }
  for (let index = 0; index < ROAD_TREE_TRIES; index++) {
    const side: number = random() < 0.5 ? -1 : 1;
    const along: number = pickInRange([mouth, ROAD_HILLS_END], random());
    const out: number = pickInRange(TREE_REACH, random()) * ROAD_SLOPE_RUN;
    tryTree(side * (ROAD.halfWidth + out), along);
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
 * Creates the hills that ring the valley and line the mountain road out of
 * it, rising from the ground right at the boundary that the players cannot
 * leave, so that the players stop at their foot: low, rolling hills of 8
 * to 15 meters, with pine trees on the slopes that face the village and
 * the road, closing in the valley but for the mouth of the road in front
 * of the village gate, and rising on either side of the road out to well
 * beyond its end, where they sink into the ground and leave the road to
 * run on toward the pass.  They are the same every time.
 *
 * @returns {Group} The hills, named `hills`, standing around the middle of
 *   the boundary, with their slopes as the first child and their trees as
 *   the second.
 */
export function createHills(): Group {
  const random: () => number = createRandom(0x4111);
  const slopes: Mesh = createRing(
    findHillPoints(random),
    SLOPE_LOOK.color,
    false,
  );
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
