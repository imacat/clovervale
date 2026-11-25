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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/mountains Raising the mountains around the valley.
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import type { Color, Object3D } from 'three';

/** The least and the most of something. */
export type Range = readonly [least: number, most: number];

/** A ridge of mountains that rings the valley. */
interface Ridge {
  /** The color of its slopes. */
  readonly color: string;
  /**
   * How far its foot is from the middle of the valley, where its steep
   * slopes start, in meters.
   */
  readonly foot: number;
  /**
   * Its gentle lower slope, which reaches in from its foot toward the
   * valley, or `null` if it rises straight from the ground at its foot.
   */
  readonly apron: Apron | null;
  /** How far its crest is from the middle of the valley, in meters. */
  readonly crest: number;
  /** How high its saddles rise, in meters. */
  readonly saddle: Range;
  /** How high its peaks rise, in meters. */
  readonly peak: Range;
  /** The number of its peaks. */
  readonly peakCount: number;
  /** How many points its foot, shoulder and crest each have around it. */
  readonly columns: number;
  /** The seed of its shape. */
  readonly seed: number;
  /**
   * How bright it is when it takes on the color of the sky, as a share
   * of the brightness of the sky.
   */
  readonly skyShade: number;
  /**
   * How far it sinks in the pass out of the valley beyond the village
   * gate, as a share of its height.
   */
  readonly passDepth: number;
}

/**
 * A row of the gentle lower slope of a ridge: how far it is from the
 * middle of the valley, and how high, both in meters.
 */
type ApronRow = readonly [distance: number, height: number];

/** The gentle lower slope of a ridge, which reaches in from its foot. */
interface Apron {
  /**
   * Its rows, from where it sinks into the ground under the back of the
   * hills out toward the foot of the ridge.
   */
  readonly rows: readonly ApronRow[];
  /** How high it rises at the foot of the ridge, in meters. */
  readonly rise: Range;
}

/**
 * A point on a ridge or on a ring of hills: its direction around the
 * middle, as the turn around the Y axis from +Z toward +X, in radians,
 * and its distance out from the middle and its height, in meters.
 */
export type RidgePoint = readonly [
  turn: number,
  distance: number,
  height: number,
];

/** A peak: where around it stands, how high, and how wide it spreads. */
type Peak = readonly [turn: number, height: number, spread: number];

/**
 * The way out of the valley through the village gate, as the turn around
 * the Y axis from +Z toward +X, in radians.
 */
export const GATE_TURN = 0;

/**
 * How far to either side of the way out through the village gate the low
 * land is gone, the hills and the lower slope of the nearest ridge, in
 * radians.
 */
export const LOWLAND_OPENING = 0.26;
/** How far beyond that the low land rises again to its full height. */
export const LOWLAND_OPENING_SPREAD = 0.34;

/**
 * The ridges, nearest first: each farther one paler and more blue-gray,
 * and higher, so that it shows above the nearer ones, and closer to the
 * sky in brightness when it takes on the color of the sky.  Each sinks
 * into the pass beyond the village gate, the nearer ones deeper, so that
 * the farther ones show above them there.  The nearest one reaches in
 * with a gentle lower slope from under the back of the hills, low enough
 * that the camera stays above it, and gone toward the gate as the hills
 * are.
 */
const RIDGES: readonly Ridge[] = [
  {
    color: '#6f9476',
    foot: 170,
    apron: {
      rows: [
        [50, -2],
        [70, 0],
        [128, 2],
      ],
      rise: [5, 9],
    },
    crest: 245,
    saddle: [26, 40],
    peak: [55, 90],
    peakCount: 9,
    columns: 90,
    seed: 0x5eed01,
    skyShade: 0.62,
    passDepth: 0.6,
  },
  {
    color: '#87a2ae',
    foot: 255,
    apron: null,
    crest: 330,
    saddle: [45, 70],
    peak: [85, 130],
    peakCount: 11,
    columns: 108,
    seed: 0x5eed02,
    skyShade: 0.74,
    passDepth: 0.5,
  },
  {
    color: '#a8bdcb',
    foot: 340,
    apron: null,
    crest: 415,
    saddle: [70, 100],
    peak: [115, 160],
    peakCount: 13,
    columns: 126,
    seed: 0x5eed03,
    skyShade: 0.86,
    passDepth: 0.4,
  },
];

/** How deep the foot of a ridge sinks into the ground, in meters. */
const FOOT_DEPTH = 2;
/** How far the foot and the crest wander in and out, in meters. */
const WANDER = 4;
/** How far a column wanders around, as a share of the room between two. */
const COLUMN_WANDER = 0.3;
/** How much the height of the crest varies at random, as a share of it. */
const ROUGHNESS = 0.08;
/** How wide a peak spreads to either side, at least and at most, in radians. */
const PEAK_SPREAD: Range = [0.1, 0.24];
/**
 * How far to either side of the way out through the village gate the pass
 * reaches, in radians.
 */
const PASS_SPREAD = 0.5;

/**
 * Creates a source of numbers that seem random, the same every time for the
 * same seed.
 *
 * @param {number} seed - The seed.
 * @returns {() => number} A function that gives the next number, from 0 up
 *   to 1.
 */
export function createRandom(seed: number): () => number {
  let state: number = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed: number = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks a number in a range.
 *
 * @param {Range} range - The range.
 * @param {number} share - How far into the range, from 0 to 1.
 * @returns {number} The number.
 */
export function pickInRange([least, most]: Range, share: number): number {
  return least + (most - least) * share;
}

/**
 * Measures how far apart two directions around the valley are.
 *
 * @param {number} a - One direction, in radians.
 * @param {number} b - The other direction, in radians.
 * @returns {number} The smaller angle between them, in radians.
 */
export function measureTurn(a: number, b: number): number {
  const difference: number = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(difference, 2 * Math.PI - difference);
}

/**
 * Measures how open a direction around the valley is toward the way out
 * through the village gate.
 *
 * @param {number} turn - The direction, around the Y axis from +Z toward
 *   +X, in radians.
 * @param {number} open - How far to either side of the way out it is
 *   wide open, in radians.
 * @param {number} spread - How far beyond that it closes smoothly, in
 *   radians.
 * @returns {number} 1 where it is wide open, falling smoothly to 0 where
 *   it is not open at all.
 */
export function measureGateOpening(
  turn: number,
  open: number,
  spread: number,
): number {
  const away: number = measureTurn(turn, GATE_TURN);
  return 1 - MathUtils.smoothstep(away, open, open + spread);
}

/**
 * Measures how open a direction around the valley is toward the way out
 * through the village gate, where the low land is gone.
 *
 * @param {number} turn - The direction, around the Y axis from +Z toward
 *   +X, in radians.
 * @returns {number} 1 where the low land is gone, falling smoothly to 0
 *   where it rises to its full height.
 */
export function measureLowlandOpening(turn: number): number {
  return measureGateOpening(turn, LOWLAND_OPENING, LOWLAND_OPENING_SPREAD);
}

/**
 * Finds the points of the lower slope, the foot, the shoulder and the
 * crest of a ridge in each column around it.
 *
 * @param {Ridge} ridge - The ridge.
 * @returns {RidgePoint[][]} The rows of its lower slope, if any, then its
 *   foot, its shoulder and its crest, each with a point a column.
 */
function findRidgePoints(ridge: Ridge): RidgePoint[][] {
  const random: () => number = createRandom(ridge.seed);
  const waves: number[] = [random(), random()].map(
    (share: number) => share * 2 * Math.PI,
  );
  const peaks: Peak[] = Array.from(
    { length: ridge.peakCount },
    (_, index: number): Peak => [
      ((index + random() * 0.8) * 2 * Math.PI) / ridge.peakCount,
      pickInRange(ridge.peak, random()),
      pickInRange(PEAK_SPREAD, random()),
    ],
  );
  const aprons: RidgePoint[][] = (ridge.apron?.rows ?? []).map(() => []);
  const feet: RidgePoint[] = [];
  const shoulders: RidgePoint[] = [];
  const crests: RidgePoint[] = [];
  for (let column = 0; column < ridge.columns; column++) {
    const shift: number = (random() * 2 - 1) * COLUMN_WANDER;
    const turn: number = ((column + shift) * 2 * Math.PI) / ridge.columns;
    const [first = 0, second = 0] = waves;
    const swell: number =
      0.5 +
      0.3 * Math.sin(2 * turn + first) +
      0.2 * Math.sin(5 * turn + second);
    let height: number = pickInRange(ridge.saddle, swell);
    for (const [peakTurn, peakHeight, spread] of peaks) {
      const fall: number = measureTurn(turn, peakTurn) / spread;
      height = Math.max(height, peakHeight * (1 - fall));
    }
    height *= 1 + (random() - 0.5) * ROUGHNESS;
    height *= 1 - ridge.passDepth * measureGateOpening(turn, 0, PASS_SPREAD);
    const foot: number = ridge.foot + (random() * 2 - 1) * WANDER;
    const crest: number = ridge.crest + (random() * 2 - 1) * WANDER;
    const shoulder: number = pickInRange([foot, crest], 0.45 + random() * 0.2);
    shoulders.push([turn, shoulder, height * (0.4 + random() * 0.25)]);
    crests.push([turn, crest, height]);
    if (ridge.apron === null) {
      feet.push([turn, foot, -FOOT_DEPTH]);
      continue;
    }
    const standing: number = 1 - measureLowlandOpening(turn);
    ridge.apron.rows.forEach(([distance, rise]: ApronRow, row: number) => {
      aprons[row]?.push([
        turn,
        distance,
        MathUtils.lerp(-FOOT_DEPTH, rise, standing),
      ]);
    });
    const rise: number = pickInRange(ridge.apron.rise, swell);
    feet.push([turn, foot, MathUtils.lerp(-FOOT_DEPTH, rise, standing)]);
  }
  return [...aprons, feet, shoulders, crests];
}

/**
 * Puts the corners of a triangle of a ring of land into a list of
 * positions.
 *
 * @param {number[]} positions - The positions, three numbers a corner.
 * @param {readonly RidgePoint[]} corners - The corners.
 */
function addTriangle(
  positions: number[],
  corners: readonly RidgePoint[],
): void {
  for (const [turn, distance, height] of corners) {
    positions.push(
      Math.sin(turn) * distance,
      height,
      Math.cos(turn) * distance,
    );
  }
}

/**
 * Creates a low-poly ring of land around the middle, from rows of points
 * that each go once around it, the first row its inner edge, each next
 * row farther out, its top side facing up and toward the middle where it
 * rises outward.
 *
 * @param {readonly (readonly RidgePoint[])[]} rows - The rows, each with
 *   as many points, one a column, in order around the middle.
 * @param {string} color - The color of the land.
 * @returns {Mesh} The ring, with flat facets in the color, around the
 *   origin.
 */
export function createRing(
  rows: readonly (readonly RidgePoint[])[],
  color: string,
): Mesh {
  const columns: number = rows[0]?.length ?? 0;
  const positions: number[] = [];
  for (let band = 0; band + 1 < rows.length; band++) {
    const lower: readonly RidgePoint[] = rows[band] ?? [];
    const upper: readonly RidgePoint[] = rows[band + 1] ?? [];
    for (let column = 0; column < columns; column++) {
      // The last column joins the first, so that the ring closes.
      const next: number = (column + 1) % columns;
      const a: RidgePoint | undefined = lower[column];
      const b: RidgePoint | undefined = lower[next];
      const c: RidgePoint | undefined = upper[column];
      const d: RidgePoint | undefined = upper[next];
      if (
        a === undefined ||
        b === undefined ||
        c === undefined ||
        d === undefined
      ) {
        continue;
      }
      // The facets lean one way and the other in turn.
      if ((column + band) % 2 === 0) {
        addTriangle(positions, [a, c, b]);
        addTriangle(positions, [b, c, d]);
      } else {
        addTriangle(positions, [a, d, b]);
        addTriangle(positions, [a, c, d]);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color,
    roughness: 1,
    flatShading: true,
  });
  return new Mesh(geometry, material);
}

/**
 * Creates a ridge of mountains that rings the valley, its slopes facing
 * the middle.
 *
 * @param {Ridge} ridge - The ridge.
 * @returns {Mesh} The ridge.
 */
function createRidge(ridge: Ridge): Mesh {
  return createRing(findRidgePoints(ridge), ridge.color);
}

/**
 * Creates the mountains around the valley: a few ridges of low-poly peaks
 * and saddles, ringing the village with their crests far beyond where the
 * players can walk and the camera can go, each farther one paler, more
 * blue-gray and higher, and all sinking into a pass beyond the village
 * gate.  The nearest one rises gently from under the back of the hills, so
 * that the land climbs on from the hills to the mountains, always below
 * where the camera can go, and is gone toward the gate as the hills are.
 * They are the same every time.
 *
 * @returns {Group} The mountains, named `mountains`, with a ridge a child,
 *   nearest first.
 */
export function createMountains(): Group {
  const mountains = new Group();
  mountains.name = 'mountains';
  for (const ridge of RIDGES) {
    mountains.add(createRidge(ridge));
  }
  return mountains;
}

/**
 * Has the mountains take on the color of the sky instead of their own, as
 * far as told, so that they melt into a dark or a colored sky as they do
 * into a pale one.  Each ridge then glows in the color of the sky, the
 * nearer ridges a little darker than the farther ones, as its own color
 * fades.
 *
 * @param {Object3D} mountains - The mountains, as {@link createMountains}
 *   creates them.
 * @param {Color} sky - The color of the sky.
 * @param {number} share - How far they take on the color of the sky, from
 *   0 for their own colors to 1 for the color of the sky alone.
 */
export function tintMountains(
  mountains: Object3D,
  sky: Color,
  share: number,
): void {
  mountains.children.forEach((child: Object3D, index: number) => {
    const ridge: Ridge | undefined = RIDGES[index];
    if (ridge === undefined || !(child instanceof Mesh)) {
      return;
    }
    const material = child.material as MeshStandardMaterial;
    material.color.set(ridge.color).multiplyScalar(1 - share);
    material.emissive.copy(sky).multiplyScalar(ridge.skyShade * share);
  });
}
