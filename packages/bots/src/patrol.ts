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
 * @module bots/patrol Where a bot walks to in the village, and how.
 */

import {
  FOUNTAIN_REACH,
  FOUNTAIN_RIM_RADIUS,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  WALK_SPEED,
  findPlacement,
  movePosition,
  placePoint,
} from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';

/** A place in the village worth walking to. */
export interface PointOfInterest {
  /** What stands there. */
  readonly name: string;
  /** Where a player stands to visit it. */
  readonly position: GroundVector;
}

/**
 * What a bot visits: the name, the file name of the model, and where a
 * player stands to visit it, as the model has it before it is placed.
 */
type Visit = readonly [name: string, file: string, local: GroundVector];

/**
 * The places a bot patrols between, each where a player stands to visit
 * what stands there: in front of the door of the weapon shop, at the rim of
 * the fountain on the side of the spawn points of the players, in front of
 * the NPC, and by the stones that mark the spawn point of the monster, on
 * the side of the village.
 */
const VISITS: readonly Visit[] = [
  ['weapon shop', 'weapon-shop.glb', { x: -2.25, z: 3.4 }],
  ['fountain', 'fountain.glb', { x: 0, z: 2.6 }],
  ['NPC', 'npc.glb', { x: 0, z: 1.2 }],
  ['spawn point', 'prop-spawn-stones.glb', { x: -1.5, z: -2.1 }],
];

/**
 * The places a bot patrols between, where the models of the village stand.
 */
export const POINTS_OF_INTEREST: readonly PointOfInterest[] = VISITS.map(
  ([name, file, local]: Visit): PointOfInterest => ({
    name,
    position: placePoint(findPlacement(file), local),
  }),
);

/** How far a walking player goes in one simulation step, in metres. */
export const STEP_DISTANCE: number = WALK_SPEED / SIMULATION_RATE;

/** A walk in a straight line. */
export interface Leg {
  /** The direction to walk in, of which only the bearing counts. */
  readonly direction: GroundVector;
  /** The number of simulation steps to walk for. */
  readonly steps: number;
}

/**
 * Plans a walk in a straight line from one point to another.
 *
 * @param {GroundVector} from - Where the walk starts.
 * @param {GroundVector} to - Where the walk is to end.
 * @returns {Leg} The walk, which ends within half a step of the point, and
 *   takes no steps if the walk starts that close already.
 */
export function planLeg(from: GroundVector, to: GroundVector): Leg {
  const direction: GroundVector = { x: to.x - from.x, z: to.z - from.z };
  const distance: number = Math.sqrt(direction.x ** 2 + direction.z ** 2);
  return { direction, steps: Math.round(distance / STEP_DISTANCE) };
}

/**
 * Plans a walk through points, one straight walk after another.
 *
 * Each walk starts where the one before it ends, which is within half a
 * step of its point.
 *
 * @param {GroundVector} from - Where the walk starts.
 * @param {readonly GroundVector[]} points - The points to walk through, the
 *   last of which is where the walk is to end.
 * @returns {Leg[]} The straight walks, each of at least one step, which end
 *   within half a step of the last point.
 */
export function planRoute(
  from: GroundVector,
  points: readonly GroundVector[],
): Leg[] {
  const legs: Leg[] = [];
  let start: GroundVector = from;
  for (const point of points) {
    const leg: Leg = planLeg(start, point);
    if (leg.steps === 0) {
      continue;
    }
    legs.push(leg);
    for (let step = 0; step < leg.steps; step++) {
      start = movePosition(start, leg.direction, 1 / SIMULATION_RATE);
    }
  }
  return legs;
}

/**
 * Where a bot stands to drink from the fountain: halfway into the reach of
 * the fountain, on the side of the spawn points of the players.
 */
export const DRINKING_SPOT: GroundVector = {
  x: PLAZA_CENTRE.x,
  z: PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH / 2,
};

/**
 * The point from which a bot makes its last walk to {@link DRINKING_SPOT},
 * straight towards the fountain, so that it faces the fountain there.
 */
const DRINKING_APPROACH: GroundVector = {
  x: DRINKING_SPOT.x,
  z: DRINKING_SPOT.z + 1,
};

/**
 * Finds the way from one point to another, as points to walk to one
 * straight walk after another, or `null` if there is none.
 */
export type PathFinder = (
  from: GroundVector,
  to: GroundVector,
) => GroundVector[] | null;

/**
 * Plans a walk to the spot where a bot drinks from the fountain.
 *
 * @param {GroundVector} from - Where the walk starts.
 * @param {PathFinder} findPath - Finds the way from one point to another, as
 *   points to walk to one straight walk after another, or `null` if there is
 *   none.
 * @returns {Leg[] | null} The straight walks, which end within half a step
 *   of {@link DRINKING_SPOT}, facing the fountain, or `null` if there is no
 *   way there.
 */
export function planDrinkingWalk(
  from: GroundVector,
  findPath: PathFinder,
): Leg[] | null {
  const path: GroundVector[] | null = findPath(from, DRINKING_APPROACH);
  if (path === null) {
    return null;
  }
  return planRoute(from, [...path, DRINKING_SPOT]);
}

/** The number of simulation steps a bot walks for to get out of a fix. */
export const ESCAPE_STEPS: number = SIMULATION_RATE;

/**
 * Plans a short walk in a direction chosen at random, for a bot that has
 * no way to where it is going from where it is.
 *
 * @param {() => number} drawRandom - Gives a random number from 0 up to but
 *   not including 1.
 * @returns {Leg} The walk, of {@link ESCAPE_STEPS} steps, every direction as
 *   likely as the others.
 */
export function planEscape(drawRandom: () => number): Leg {
  const angle: number = 2 * Math.PI * drawRandom();
  return {
    direction: { x: Math.sin(angle), z: Math.cos(angle) },
    steps: ESCAPE_STEPS,
  };
}

/**
 * Chooses the next point to walk to, at random.
 *
 * @param {number} count - The number of points, from 1.
 * @param {number | null} current - The index of the point last walked to,
 *   or `null` before the first.
 * @param {() => number} drawRandom - Gives a random number from 0 up to but not
 *   including 1.
 * @returns {number} The index of the point, which is any point but the
 *   current one, each as likely as the others, or the only point if there is
 *   just one.
 */
export function chooseNextPoint(
  count: number,
  current: number | null,
  drawRandom: () => number,
): number {
  if (current === null || count < 2) {
    return Math.floor(drawRandom() * count);
  }
  const index: number = Math.floor(drawRandom() * (count - 1));
  return index < current ? index : index + 1;
}
