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
 * @module shared/player-motion The rules that move one player, for the
 *   server and for whoever predicts what the server will do.
 */

import { SLASH_DURATION } from './actions.ts';
import type { ActionState } from './actions.ts';
import { SIMULATION_RATE, findYaw, movePosition } from './movement.ts';
import type { GroundVector } from './movement.ts';

/** How long one step of the simulation lasts, in seconds. */
const STEP_SECONDS: number = 1 / SIMULATION_RATE;

/** The number of simulation steps a slash lasts. */
export const SLASH_STEPS: number = Math.round(
  SLASH_DURATION * SIMULATION_RATE,
);

/**
 * Everything that tells how a player moves on: what everyone sees of it,
 * and what it is up to.
 */
export interface PlayerMotion {
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** What the player is doing. */
  readonly action: ActionState;
  /** The number of actions the player has started so far. */
  readonly actionCount: number;
  /** The direction the player wants to move in, if it has a length. */
  readonly direction: GroundVector;
  /** Whether the player wants to interact with the world. */
  readonly isInteracting: boolean;
  /** The number of steps the slash of the player still lasts. */
  readonly slashSteps: number;
}

/** The input that changes the way a player wants to move. */
export interface MoveInput {
  /** The input discriminator. */
  readonly type: 'move';
  /**
   * The direction the player wants to move in, of which only the bearing
   * counts, or a direction without length to stop.
   */
  readonly direction: GroundVector;
}

/**
 * The input that makes a player interact with the world.  What comes of it
 * is for the rules to decide.
 */
export interface InteractInput {
  /** The input discriminator. */
  readonly type: 'interact';
}

/** Anything a player can be told to do. */
export type PlayerInput = MoveInput | InteractInput;

/**
 * Creates the motion of a player that idles, wanting nothing.
 *
 * @param {GroundVector} position - Where the player stands.
 * @param {number} yaw - The turn around the Y axis from facing +Z towards
 *   +X, in degrees.
 * @returns {PlayerMotion} The motion.
 */
export function createMotion(
  position: GroundVector,
  yaw: number,
): PlayerMotion {
  return {
    x: position.x,
    z: position.z,
    yaw,
    action: 'Idle',
    actionCount: 0,
    direction: { x: 0, z: 0 },
    isInteracting: false,
    slashSteps: 0,
  };
}

/**
 * Takes an input of a player in, which shows from the next step on.
 *
 * A move changes the way the player wants to move.  An interaction is a
 * slash, which a player that is slashing already does not start again.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {PlayerInput} input - The input.
 * @returns {PlayerMotion} The motion with the input taken in.
 */
export function applyInput(
  motion: PlayerMotion,
  input: PlayerInput,
): PlayerMotion {
  if (input.type === 'move') {
    const { x, z } = input.direction;
    return { ...motion, direction: { x, z } };
  }
  if (motion.action === 'Slash') {
    return motion;
  }
  return { ...motion, isInteracting: true };
}

/**
 * Moves a player one step of the simulation forward.
 *
 * A player that slashes stands still, without turning, for as long as a
 * slash lasts.  Any other player that wants to move walks that way, facing
 * it, and idles otherwise.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {PlayerMotion} The motion after the step.
 */
export function stepMotion(motion: PlayerMotion): PlayerMotion {
  let { slashSteps } = motion;
  if (motion.action === 'Slash' && --slashSteps > 0) {
    return { ...motion, slashSteps };
  }
  if (motion.isInteracting) {
    return startAction(
      { ...motion, isInteracting: false, slashSteps: SLASH_STEPS },
      'Slash',
    );
  }
  const { direction } = motion;
  if (direction.x === 0 && direction.z === 0) {
    return startAction({ ...motion, slashSteps }, 'Idle');
  }
  const { x, z } = movePosition(motion, direction, STEP_SECONDS);
  const yaw: number = findYaw(direction);
  return startAction({ ...motion, x, z, yaw, slashSteps }, 'Walk');
}

/**
 * Tells whether a player stays exactly as it is, step after step, until
 * its next input.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {boolean} Whether the player idles, wanting nothing.
 */
export function isResting(motion: PlayerMotion): boolean {
  return (
    motion.action === 'Idle' &&
    motion.direction.x === 0 &&
    motion.direction.z === 0 &&
    !motion.isInteracting
  );
}

/**
 * Makes a player do something, unless it is doing just that already.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {ActionState} action - What the player does from now on.
 * @returns {PlayerMotion} The motion of the player doing that.
 */
function startAction(motion: PlayerMotion, action: ActionState): PlayerMotion {
  if (motion.action === action) {
    return motion;
  }
  return { ...motion, action, actionCount: motion.actionCount + 1 };
}
