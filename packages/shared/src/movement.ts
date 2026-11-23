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

/** The speed a character walks at, in metres per second. */
export const WALK_SPEED = 1.5;

/** The number of steps the simulation of the world takes every second. */
export const SIMULATION_RATE = 20;

/** How long a step of the simulation of the world lasts, in milliseconds. */
export const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** A point or a direction on the ground plane. */
export interface GroundVector {
  /** The east-west component. */
  readonly x: number;
  /** The north-south component. */
  readonly z: number;
}

/**
 * Counts the simulation steps a time lasts.
 *
 * @param {number} seconds - The time, in seconds.
 * @returns {number} The number of steps, at least one.
 */
export function countSteps(seconds: number): number {
  return Math.max(Math.round(seconds * SIMULATION_RATE), 1);
}

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in metres.
 */
export function measureDistance(a: GroundVector, b: GroundVector): number {
  const dx: number = a.x - b.x;
  const dz: number = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Moves a position in a direction for a period of time, at walking speed.
 *
 * Only the bearing of the direction counts, not its length.
 *
 * @param {GroundVector} position - The position to move from.
 * @param {GroundVector} direction - The direction to move in.
 * @param {number} seconds - How long to move for, in seconds.
 * @returns {GroundVector} The position after the move, which is the same
 *   position if the direction has no length.
 */
export function movePosition(
  position: GroundVector,
  direction: GroundVector,
  seconds: number,
): GroundVector {
  // Unlike Math.hypot, a square root is the same in every JavaScript engine,
  // to the last bit, so that a browser and the server move alike.
  const length = Math.sqrt(direction.x ** 2 + direction.z ** 2);
  if (length === 0) {
    return position;
  }
  const distance = WALK_SPEED * seconds;
  return {
    x: position.x + (direction.x / length) * distance,
    z: position.z + (direction.z / length) * distance,
  };
}

/**
 * Finds the yaw of a character that faces a direction.
 *
 * @param {GroundVector} direction - The direction to face.
 * @returns {number} The turn around the Y axis from facing +Z towards +X, in
 *   degrees, above -180 and up to 180.
 */
export function findYaw(direction: GroundVector): number {
  return (Math.atan2(direction.x, direction.z) * 180) / Math.PI;
}
