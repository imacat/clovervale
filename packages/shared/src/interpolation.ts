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
 * @module shared/interpolation Placing everything between two snapshots,
 *   as a page shows it and as the server judges what a page showed.
 */

import { WALK_SPEED } from './movement.ts';

/**
 * How many times farther than it can walk anything must have moved between
 * two snapshots to have jumped.
 */
const JUMP_FACTOR = 1.5;

/** Anything whose position and facing a snapshot gives. */
export interface Placed {
  /** The identifier, unique among its kind. */
  readonly id: number;
  /** The position along the X axis, in meters. */
  readonly x: number;
  /** The position along the Z axis, in meters. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z toward +X, in degrees. */
  readonly yaw: number;
}

/**
 * Finds the yaw part of the way from one yaw to another, the shorter way
 * around.
 *
 * @param {number} from - The yaw to turn from, in degrees.
 * @param {number} to - The yaw to turn to, in degrees.
 * @param {number} fraction - How much of the turn is made, from 0 to 1.
 * @returns {number} The yaw, in degrees, above -180 and up to 180.
 */
export function interpolateYaw(
  from: number,
  to: number,
  fraction: number,
): number {
  const turn: number = ((((to - from) % 360) + 540) % 360) - 180;
  const yaw: number = from + turn * fraction;
  return 180 - ((((180 - yaw) % 360) + 360) % 360);
}

/**
 * Places everything part of the way from where one snapshot tells to where
 * the next tells, turned likewise, the shorter way around.  Anything that
 * has moved farther than it can walk in the time between them, and than it
 * can have been moved otherwise, stays where the earlier one tells.
 *
 * @param {readonly T[]} before - Everything as the earlier snapshot tells.
 * @param {readonly T[]} after - Everything as the later snapshot tells.
 * @param {number} fraction - How much of the time between them has passed,
 *   from 0 to 1.
 * @param {number} span - The time between them, in milliseconds.
 * @param {(item: T) => number} [findLeeway] - How far beyond its walk each
 *   thing can have been moved in that time, in meters, by where the later
 *   snapshot tells it is.  Nothing is by default.
 * @returns {T[]} Everything the earlier snapshot tells, in its order, and
 *   otherwise as it tells.
 * @template T
 */
export function interpolatePlaced<T extends Placed>(
  before: readonly T[],
  after: readonly T[],
  fraction: number,
  span: number,
  findLeeway: (item: T) => number = () => 0,
): T[] {
  const reach: number = (WALK_SPEED * JUMP_FACTOR * span) / 1000;
  return before.map((item: T) => {
    const next: T | undefined = after.find(
      (other: T) => other.id === item.id,
    );
    if (
      next === undefined ||
      Math.hypot(next.x - item.x, next.z - item.z) > reach + findLeeway(next)
    ) {
      return item;
    }
    return {
      ...item,
      x: item.x + (next.x - item.x) * fraction,
      z: item.z + (next.z - item.z) * fraction,
      yaw: interpolateYaw(item.yaw, next.yaw, fraction),
    };
  });
}
