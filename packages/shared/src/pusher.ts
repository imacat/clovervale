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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/pusher A villager who goes about on a fixed course and
 *   pushes the players in its way aside, as the server and its peers alike
 *   work it out.
 */

import type { GroundVector } from './movement.ts';
import type { Terrain } from './terrain.ts';

/**
 * How a villager who goes about on a fixed course gets in the way of the
 * players: where it is at each step, and how it pushes a player aside and
 * stops one that walks into it.
 */
export interface Pusher {
  /** The least distance between the centres of it and a player, in metres. */
  readonly reach: number;
  /** The fastest it goes, in metres per second. */
  readonly speed: number;

  /**
   * Finds where the villager is at a step of the simulation.
   *
   * @param {number} step - The number of the step, which may fall between
   *   two steps.
   * @returns {GroundVector} Where it is, the same for the same step
   *   everywhere.
   */
  locate(step: number): GroundVector;

  /**
   * Pushes a player out of the way of the villager, if it is in its way.
   *
   * @param {GroundVector} position - Where the player stands, clear of the
   *   obstacles.
   * @param {GroundVector} at - Where the villager is.
   * @param {Terrain} terrain - The ground the player stands on.
   * @returns {GroundVector} Where the player ends up, clear of the obstacles
   *   and within the boundary: where it was, if the villager does not reach
   *   into it.
   */
  pushAside(
    position: GroundVector,
    at: GroundVector,
    terrain: Terrain,
  ): GroundVector;

  /**
   * Finds where a player that walks from one point towards another ends up,
   * with the obstacles and the villager in its way.
   *
   * @param {GroundVector} from - Where the player stands, clear of the
   *   obstacles.
   * @param {GroundVector} to - Where the player would be with nothing in its
   *   way.
   * @param {GroundVector} at - Where the villager is.
   * @param {Terrain} terrain - The ground the player walks on.
   * @returns {GroundVector} Where the player ends up, clear of the obstacles
   *   and within the boundary.
   */
  resolveWalk(
    from: GroundVector,
    to: GroundVector,
    at: GroundVector,
    terrain: Terrain,
  ): GroundVector;
}
