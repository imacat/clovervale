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

import { SIMULATION_RATE, WALK_SPEED } from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';

/** A place in the village worth walking to. */
export interface PointOfInterest {
  /** What stands there. */
  readonly name: string;
  /** Where a player stands to visit it. */
  readonly position: GroundVector;
}

/**
 * The places a bot patrols between, each where a player stands to visit
 * what stands there: in front of the door of the weapon shop, at the rim of
 * the fountain on the side of the spawn points of the players, in front of
 * the NPC, and by the stones that mark the spawn point of the monster.
 */
export const POINTS_OF_INTEREST: readonly PointOfInterest[] = [
  { name: 'weapon shop', position: { x: 8.6, z: -6.75 } },
  { name: 'fountain', position: { x: 0, z: -5.9 } },
  { name: 'NPC', position: { x: 2.69, z: -5.31 } },
  { name: 'spawn point', position: { x: 10.36, z: 7.41 } },
];

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
