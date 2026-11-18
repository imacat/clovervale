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
 * @module shared/combat How much a player and the monster can take, and
 *   what a strike reaches.
 */

import type { GroundVector } from './movement.ts';
import type { Pose } from './terrain.ts';

/** The health of a player at full health. */
export const PLAYER_HEALTH = 100;

/**
 * How long a dead player lies where it fell before it comes back, in
 * seconds.
 */
export const DEATH_DURATION = 2;

/** The health of the monster at full health. */
export const MONSTER_HEALTH = 60;

/**
 * The farthest the monster can be from a player whose slash hits it, from
 * centre to centre, in metres.
 */
export const SLASH_REACH = 1.6;

/** The health a slash that hits takes from the monster. */
export const SLASH_DAMAGE = 20;

/**
 * The widest a strike reaches to either side of the way the striker faces,
 * in degrees.
 */
export const STRIKE_HALF_ANGLE = 60;

/**
 * Tells whether a strike reaches something: whether it is in front of the
 * striker and within reach.
 *
 * @param {Pose} striker - Where the striker stands, and which way it faces.
 * @param {GroundVector} target - Where the one struck at stands.
 * @param {number} reach - The farthest the strike reaches, from centre to
 *   centre, in metres.
 * @returns {boolean} Whether the target is within reach, and no more than
 *   {@link STRIKE_HALF_ANGLE} to either side of the way the striker faces.
 *   A target that stands right where the striker does is reached.
 */
export function isWithinStrike(
  striker: Pose,
  target: GroundVector,
  reach: number,
): boolean {
  const dx: number = target.x - striker.x;
  const dz: number = target.z - striker.z;
  const distance: number = Math.hypot(dx, dz);
  if (distance > reach) {
    return false;
  }
  if (distance === 0) {
    return true;
  }
  const yaw: number = (striker.yaw * Math.PI) / 180;
  const along: number = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance;
  return along >= Math.cos((STRIKE_HALF_ANGLE * Math.PI) / 180);
}
