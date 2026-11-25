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
 * @module client/bare-earth Knowing where the ground of the village is
 *   bare earth instead of grass: the plaza, its paths and the monster's
 *   ground.
 */

import type { GroundVector, Shape } from '@clovervale/shared';

import { createRandom } from './mountains.ts';

/**
 * A patch of bare earth, an ellipse on the ground: its center, its radii
 * along X and Z, and its turn around the Y axis, in degrees, the way a
 * model turns.
 */
export type EarthPatch = readonly [
  x: number,
  z: number,
  radiusX: number,
  radiusZ: number,
  yaw: number,
];

/**
 * A path of bare earth: a strip of one width laid along a line on the
 * ground, rounded where the line turns and at its ends.
 */
export interface EarthPath {
  /** The points the line runs through, from its start to its end. */
  readonly points: readonly GroundVector[];
  /**
   * The width of the strip, in meters, at its widest: its edges wander in
   * from it a little, here and there.
   */
  readonly width: number;
}

/**
 * The strip of bare earth of a path: the points of its two edges, row by
 * row from the start of the path to its end, the first and the last row
 * across its rounded ends.  The left edge is on the left of someone who
 * stands up along +Y and walks along the path.
 */
export interface EarthStrip {
  /** The points of the left edge, one for each row. */
  readonly left: readonly GroundVector[];
  /** The points of the right edge, one for each row. */
  readonly right: readonly GroundVector[];
}

/**
 * The plaza, the way from the plaza up to the porch of the chief's house,
 * and the monster's ground.
 */
export const EARTH_PATCHES: readonly EarthPatch[] = [
  [0, -8, 9, 8.2, 0],
  [5.3, -14.6, 1.4, 1.8, -60],
  [10, 8, 4, 3, 0],
];

/** The path from the plaza out through the village gate. */
export const EARTH_PATHS: readonly EarthPath[] = [
  {
    width: 4.6,
    points: [
      { x: 0, z: -1 },
      { x: 0, z: 22 },
    ],
  },
];

/**
 * How far before and after each turn of a path its line starts and ends
 * rounding the turn, as a share of the width of the path.
 */
const ROUNDING = 1.1;

/** The most a line turns from one of its points to the next, in radians. */
const MOST_BEND: number = Math.PI / 9;

/**
 * How far apart the points along a straight stretch of a line lie, at
 * most, as a share of the width of the path.
 */
const STEP_SHARE = 0.4;

/** How far apart the points of a straight stretch lie, at least, in meters. */
const LEAST_STEP = 0.6;

/** How far the edges of a strip wander in, at most, as a share of its width. */
export const EDGE_WANDER = 0.1;

/** How many rows of a strip lie across each of its rounded ends. */
const END_ROWS = 2;

/** The seed of the wandering of the edges, the same every time. */
const SEED = 0xea27;

/**
 * Finds a point some way from another, in a direction.
 *
 * @param {GroundVector} from - The point.
 * @param {GroundVector} direction - The direction, one meter long.
 * @param {number} distance - How far, in meters.
 * @returns {GroundVector} The point that far away.
 */
function moveAlong(
  from: GroundVector,
  direction: GroundVector,
  distance: number,
): GroundVector {
  return {
    x: from.x + direction.x * distance,
    z: from.z + direction.z * distance,
  };
}

/**
 * Finds the direction and the distance from one point to another.
 *
 * @param {GroundVector} from - The first point.
 * @param {GroundVector} to - The second point.
 * @returns {[GroundVector, number]} The direction, one meter long, or zero
 *   for two points at one place, and the distance, in meters.
 */
function findHeading(
  from: GroundVector,
  to: GroundVector,
): [GroundVector, number] {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const length: number = Math.hypot(dx, dz);
  if (length === 0) {
    return [{ x: 0, z: 0 }, 0];
  }
  return [{ x: dx / length, z: dz / length }, length];
}

/**
 * Traces the line of a path: the points it runs through, rounded where it
 * turns, close enough together along it that it bends little from one to
 * the next.
 *
 * @param {EarthPath} path - The path.
 * @returns {GroundVector[]} The points, from the start of the path to its
 *   end, starting and ending where the path does.
 */
export function traceEarthPath(path: EarthPath): GroundVector[] {
  const { points, width } = path;
  const step: number = Math.max(LEAST_STEP, width * STEP_SHARE);
  const [first] = points;
  if (first === undefined) {
    return [];
  }
  const line: GroundVector[] = [first];
  let from: GroundVector = first;
  points.slice(1).forEach((corner: GroundVector, index: number) => {
    const next: GroundVector | undefined = points[index + 2];
    const [inward, inLength] = findHeading(from, corner);
    const [outward, outLength] =
      next === undefined ? [inward, 0] : findHeading(corner, next);
    const reach: number =
      next === undefined
        ? 0
        : Math.min(width * ROUNDING, inLength, outLength / 2);
    const end: GroundVector = moveAlong(corner, inward, -reach);
    const pieces: number = Math.ceil((inLength - reach) / step);
    for (let piece = 1; piece <= pieces; piece++) {
      line.push(moveAlong(from, inward, ((inLength - reach) * piece) / pieces));
    }
    if (next === undefined) {
      return;
    }
    const bend: number = Math.acos(
      Math.min(1, inward.x * outward.x + inward.z * outward.z),
    );
    from = moveAlong(corner, outward, reach);
    if (bend < 1e-9) {
      line.push(from);
      return;
    }
    // Round the turn along an arc that meets both stretches.
    const radius: number = reach / Math.tan(bend / 2);
    const turn: number = inward.x * outward.z - inward.z * outward.x;
    const toCenter: GroundVector =
      turn > 0
        ? { x: -inward.z, z: inward.x }
        : { x: inward.z, z: -inward.x };
    const center: GroundVector = moveAlong(end, toCenter, radius);
    const bends: number = Math.max(2, Math.ceil(bend / MOST_BEND));
    for (let at = 1; at < bends; at++) {
      const angle: number = (bend * at) / bends;
      line.push({
        x:
          center.x +
          radius * (inward.x * Math.sin(angle) - toCenter.x * Math.cos(angle)),
        z:
          center.z +
          radius * (inward.z * Math.sin(angle) - toCenter.z * Math.cos(angle)),
      });
    }
    line.push(from);
  });
  return line;
}

/**
 * Lays out the strip of bare earth of a path, with its edges wandering in
 * a little from its full width, the same every time.
 *
 * @param {EarthPath} path - The path.
 * @returns {EarthStrip} The strip, no farther than half its width from
 *   the line of the path as {@link traceEarthPath} traces it, and no
 *   nearer than that less {@link EDGE_WANDER} of its width.
 */
export function outlineEarthPath(path: EarthPath): EarthStrip {
  const line: GroundVector[] = traceEarthPath(path);
  const random: () => number = createRandom(SEED);
  const half: number = path.width / 2;
  const reach = (): number => half - path.width * EDGE_WANDER * random();
  const left: GroundVector[] = [];
  const right: GroundVector[] = [];
  const addRow = (
    center: GroundVector,
    side: GroundVector,
    ahead: GroundVector,
    angle: number,
  ): void => {
    const across: number = Math.cos(angle);
    const along: number = Math.sin(angle);
    const leftReach: number = reach();
    // Both edges meet at the tip of a rounded end.
    const rightReach: number =
      angle < Math.PI / 2 - 1e-9 ? reach() : leftReach;
    left.push({
      x: center.x + (-side.x * across + ahead.x * along) * leftReach,
      z: center.z + (-side.z * across + ahead.z * along) * leftReach,
    });
    right.push({
      x: center.x + (side.x * across + ahead.x * along) * rightReach,
      z: center.z + (side.z * across + ahead.z * along) * rightReach,
    });
  };
  line.forEach((center: GroundVector, index: number) => {
    const [heading] = findHeading(
      line[index - 1] ?? center,
      line[index + 1] ?? center,
    );
    // On the right of someone walking along the heading.
    const side: GroundVector = { x: -heading.z, z: heading.x };
    const back: GroundVector = { x: -heading.x, z: -heading.z };
    if (index === 0) {
      for (let row = END_ROWS; row > 0; row--) {
        addRow(center, side, back, (Math.PI / 2) * (row / END_ROWS));
      }
    }
    addRow(center, side, heading, 0);
    if (index === line.length - 1) {
      for (let row = 1; row <= END_ROWS; row++) {
        addRow(center, side, heading, (Math.PI / 2) * (row / END_ROWS));
      }
    }
  });
  return { left, right };
}

/**
 * Finds the ground of a patch of bare earth.
 *
 * @param {EarthPatch} patch - The patch.
 * @returns {Shape} A box around the patch.
 */
function findPatchGround([x, z, radiusX, radiusZ, yaw]: EarthPatch): Shape {
  return { shape: 'box', x, z, halfWidth: radiusX, halfDepth: radiusZ, yaw };
}

/**
 * Finds the ground of a path of bare earth.
 *
 * @param {EarthPath} path - The path.
 * @returns {Shape[]} Boxes and circles that together cover its strip.
 */
function findPathGround(path: EarthPath): Shape[] {
  const half: number = path.width / 2;
  const line: GroundVector[] = traceEarthPath(path);
  const shapes: Shape[] = line.map(
    ({ x, z }: GroundVector): Shape => ({
      shape: 'circle',
      x,
      z,
      radius: half,
    }),
  );
  line.slice(1).forEach((to: GroundVector, index: number) => {
    const from: GroundVector = line[index] ?? to;
    const [heading, length] = findHeading(from, to);
    shapes.push({
      shape: 'box',
      x: (from.x + to.x) / 2,
      z: (from.z + to.z) / 2,
      halfWidth: half,
      halfDepth: length / 2,
      yaw: (Math.atan2(heading.x, heading.z) * 180) / Math.PI,
    });
  });
  return shapes;
}

/**
 * Lists the ground the bare earth covers: its patches and its paths.
 *
 * @returns {Shape[]} Shapes that together cover all the bare earth.
 */
export function listEarthGround(): Shape[] {
  return [
    ...EARTH_PATCHES.map(findPatchGround),
    ...EARTH_PATHS.flatMap(findPathGround),
  ];
}
