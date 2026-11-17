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
 * @module shared/movement Movement rules applied by the server and its peers.
 */

/** The fastest a character can move, in metres per second. */
export const MAX_SPEED = 4;

/** A point or a direction on the ground plane. */
export interface GroundVector {
  /** The east-west component. */
  readonly x: number;
  /** The north-south component. */
  readonly z: number;
}

/**
 * Moves a position in a direction for a period of time.
 *
 * The length of the direction is the fraction of the maximum speed to move
 * at; a direction longer than 1 still moves at the maximum speed.
 *
 * @param {GroundVector} position - The position to move from.
 * @param {GroundVector} direction - The direction to move in.
 * @param {number} seconds - How long to move for, in seconds.
 * @returns {GroundVector} The position after the move.
 */
export function movePosition(
  position: GroundVector,
  direction: GroundVector,
  seconds: number,
): GroundVector {
  const length = Math.hypot(direction.x, direction.z);
  if (length === 0) {
    return position;
  }
  const distance = Math.min(length, 1) * MAX_SPEED * seconds;
  return {
    x: position.x + (direction.x / length) * distance,
    z: position.z + (direction.z / length) * distance,
  };
}
