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

import { DRINK_DURATION, SLASH_DURATION } from './actions.ts';
import type { ActionState, Interaction } from './actions.ts';
import { findInteraction } from './interaction.ts';
import { SIMULATION_RATE, findYaw, movePosition } from './movement.ts';
import type { GroundVector } from './movement.ts';
import { VILLAGE_TERRAIN } from './village-layout.ts';

/** How long one step of the simulation lasts, in seconds. */
const STEP_SECONDS: number = 1 / SIMULATION_RATE;

/** The number of simulation steps a slash lasts. */
export const SLASH_STEPS: number = Math.round(
  SLASH_DURATION * SIMULATION_RATE,
);

/** The number of simulation steps a drink from the fountain lasts. */
export const DRINK_STEPS: number = Math.round(
  DRINK_DURATION * SIMULATION_RATE,
);

/** The number of simulation steps each interaction lasts. */
const INTERACTION_STEPS: Readonly<Record<Interaction, number>> = {
  Slash: SLASH_STEPS,
  Drink: DRINK_STEPS,
};

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
  /**
   * The number of steps the interaction of the player still lasts, or 0
   * while it is not interacting.
   */
  readonly actionSteps: number;
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
  /**
   * The time on the clock of the server, in milliseconds, at which the
   * world was as the peer showed it when the interaction started there,
   * for the server to judge the interaction on, if the peer asks for that.
   */
  readonly viewTime?: number;
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
    actionSteps: 0,
  };
}

/**
 * Takes an input of a player in, which shows from the next step on.
 *
 * A move changes the way the player wants to move.  An interaction makes
 * the player slash or drink from the fountain, as {@link findInteraction}
 * tells from where it stands and which way it faces at the step it starts,
 * unless the player cannot interact then, as {@link canInteract} tells, in
 * which case it does neither, then or later.
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
  if (!canInteract(motion)) {
    return motion;
  }
  return { ...motion, isInteracting: true };
}

/**
 * Moves a player one step of the simulation forward.
 *
 * A player that slashes or drinks from the fountain stands still, without
 * turning, for as long as that lasts, whichever way it wants to move.  Any
 * other player that wants to move walks that way, facing it, and idles
 * otherwise.  A walking player does not go through the obstacles of the
 * village, nor out of it: it slides along what it walks into at an angle,
 * and walks on the spot against what it walks straight into.  A dead player
 * stays exactly as it is.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {PlayerMotion} The motion after the step.
 */
export function stepMotion(motion: PlayerMotion): PlayerMotion {
  if (motion.action === 'Die') {
    return motion;
  }
  let { actionSteps } = motion;
  if (isInteraction(motion.action) && --actionSteps > 0) {
    return { ...motion, actionSteps };
  }
  if (motion.isInteracting) {
    const interaction: Interaction = findInteraction(motion);
    return startAction(
      {
        ...motion,
        isInteracting: false,
        actionSteps: INTERACTION_STEPS[interaction],
      },
      interaction,
    );
  }
  const { direction } = motion;
  if (direction.x === 0 && direction.z === 0) {
    return startAction({ ...motion, actionSteps }, 'Idle');
  }
  const { x, z } = VILLAGE_TERRAIN.resolveMove(
    motion,
    movePosition(motion, direction, STEP_SECONDS),
  );
  const yaw: number = findYaw(direction);
  return startAction({ ...motion, x, z, yaw, actionSteps }, 'Walk');
}

/**
 * Makes a player die where it is, as only the server does.
 *
 * The player stops whatever it is doing and falls there, facing the way it
 * did.  It stays so until it is moved somewhere else, neither moving,
 * turning nor interacting, but still takes in the way it wants to move, so
 * that it walks that way once it is moved.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {PlayerMotion} The motion of the dead player.
 */
export function killMotion(motion: PlayerMotion): PlayerMotion {
  return {
    ...motion,
    action: 'Die',
    actionCount: motion.actionCount + 1,
    isInteracting: false,
    actionSteps: 0,
  };
}

/**
 * Moves a player somewhere else at once, as only the server does.
 *
 * The player stops whatever it is doing and idles there, facing the way it
 * is told, but still wants to move the way it did, so that it walks on
 * from there at the next step if it wants to.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {GroundVector} position - Where the player is to stand.
 * @param {number} yaw - The turn around the Y axis from facing +Z towards
 *   +X, in degrees.
 * @returns {PlayerMotion} The motion of the player standing there.
 */
export function relocateMotion(
  motion: PlayerMotion,
  position: GroundVector,
  yaw: number,
): PlayerMotion {
  return {
    ...motion,
    x: position.x,
    z: position.z,
    yaw,
    action: 'Idle',
    actionCount: motion.actionCount + 1,
    isInteracting: false,
    actionSteps: 0,
  };
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
 * Tells whether a player can start to interact with the world now.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @returns {boolean} Whether the player is alive, and neither slashing nor
 *   drinking from the fountain.
 */
export function canInteract(motion: PlayerMotion): boolean {
  return !isInteraction(motion.action) && motion.action !== 'Die';
}

/**
 * Tells whether an action is one a player starts by interacting.
 *
 * @param {ActionState} action - The action.
 * @returns {boolean} Whether it is a slash or a drink from the fountain.
 */
function isInteraction(action: ActionState): action is Interaction {
  return Object.hasOwn(INTERACTION_STEPS, action);
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
