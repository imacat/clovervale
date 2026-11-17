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
 * @module server/world The world the server simulates, and its players.
 */

import {
  APPEARANCE_COUNT,
  SIMULATION_RATE,
  SLASH_DURATION,
  SPAWN_YAW,
  findSpawnPoint,
  findYaw,
  movePosition,
} from '@clovervale/shared';
import type {
  ActionState,
  GroundVector,
  PlayerState,
} from '@clovervale/shared';

/** How long one step of the simulation lasts, in seconds. */
const STEP_SECONDS: number = 1 / SIMULATION_RATE;

/** The number of steps a slash lasts. */
const SLASH_STEPS: number = Math.round(SLASH_DURATION * SIMULATION_RATE);

/** The least distance between a new player and everyone else, in metres. */
const SPAWN_CLEARANCE = 1;

/** A player in the world. */
interface Player {
  /** The identifier of the player. */
  readonly id: number;
  /** The number of the appearance of the player, from 1. */
  readonly appearance: number;
  /** Where the player stands. */
  position: GroundVector;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  yaw: number;
  /** What the player is doing. */
  action: ActionState;
  /** The number of actions the player has started so far. */
  actionCount: number;
  /** The direction the player wants to move in, if it has a length. */
  direction: GroundVector;
  /** Whether the player wants to interact with the world. */
  isInteracting: boolean;
  /** The number of steps the slash of the player still lasts. */
  slashSteps: number;
}

/** The world the server simulates. */
export class World {
  readonly #players = new Map<number, Player>();
  #lastId = 0;

  /**
   * Lets a new player into the world.
   *
   * The player gets an identifier no player has had before, the appearance
   * the fewest players have (the lowest-numbered one if several tie), and a
   * place on the plaza clear of everyone else, where it idles facing the
   * fountain.
   *
   * @returns {PlayerState} The new player.
   */
  addPlayer(): PlayerState {
    const player: Player = {
      id: ++this.#lastId,
      appearance: this.#chooseAppearance(),
      position: this.#chooseSpawnPoint(),
      yaw: SPAWN_YAW,
      action: 'Idle',
      actionCount: 0,
      direction: { x: 0, z: 0 },
      isInteracting: false,
      slashSteps: 0,
    };
    this.#players.set(player.id, player);
    return describePlayer(player);
  }

  /**
   * Takes a player out of the world.
   *
   * @param {number} id - The identifier of the player.
   */
  removePlayer(id: number): void {
    this.#players.delete(id);
  }

  /**
   * Sets the way a player wants to move from the next step on.
   *
   * @param {number} id - The identifier of the player.
   * @param {GroundVector} direction - The direction to move in, of which
   *   only the bearing counts, or a direction without length to stop.
   */
  steerPlayer(id: number, direction: GroundVector): void {
    const player: Player | undefined = this.#players.get(id);
    if (player !== undefined) {
      player.direction = { x: direction.x, z: direction.z };
    }
  }

  /**
   * Makes a player interact with the world at the next step, which is to
   * slash.  A player that is slashing already carries on with that slash
   * alone.
   *
   * @param {number} id - The identifier of the player.
   */
  interactPlayer(id: number): void {
    const player: Player | undefined = this.#players.get(id);
    if (player !== undefined && player.action !== 'Slash') {
      player.isInteracting = true;
    }
  }

  /**
   * Moves the world one step of the simulation forward.
   *
   * A player that slashes stands still, without turning, for as long as a
   * slash lasts.  Any other player that wants to move walks that way, facing
   * it, and idles otherwise.
   */
  step(): void {
    for (const player of this.#players.values()) {
      if (player.action === 'Slash' && --player.slashSteps > 0) {
        continue;
      }
      if (player.isInteracting) {
        player.isInteracting = false;
        player.slashSteps = SLASH_STEPS;
        startAction(player, 'Slash');
        continue;
      }
      const { direction } = player;
      if (direction.x === 0 && direction.z === 0) {
        startAction(player, 'Idle');
        continue;
      }
      player.position = movePosition(player.position, direction, STEP_SECONDS);
      player.yaw = findYaw(direction);
      startAction(player, 'Walk');
    }
  }

  /**
   * Lists every player in the world as it is now.
   *
   * @returns {PlayerState[]} The players, in the order they came in.
   */
  listPlayers(): PlayerState[] {
    return [...this.#players.values()].map(describePlayer);
  }

  /**
   * Chooses the appearance of a new player.
   *
   * @returns {number} The number of the appearance, from 1.
   */
  #chooseAppearance(): number {
    const uses: number[] = new Array<number>(APPEARANCE_COUNT).fill(0);
    for (const player of this.#players.values()) {
      uses[player.appearance - 1] = (uses[player.appearance - 1] ?? 0) + 1;
    }
    return uses.indexOf(Math.min(...uses)) + 1;
  }

  /**
   * Chooses where a new player comes into the world.
   *
   * @returns {GroundVector} The first spawn point clear of every player.
   */
  #chooseSpawnPoint(): GroundVector {
    for (let index = 0; ; index++) {
      const point: GroundVector = findSpawnPoint(index);
      const isClear: boolean = [...this.#players.values()].every(
        ({ position }: Player) =>
          Math.hypot(position.x - point.x, position.z - point.z) >=
          SPAWN_CLEARANCE,
      );
      if (isClear) {
        return point;
      }
    }
  }
}

/**
 * Makes a player do something, unless it is doing just that already.
 *
 * @param {Player} player - The player.
 * @param {ActionState} action - What the player does from now on.
 */
function startAction(player: Player, action: ActionState): void {
  if (player.action !== action) {
    player.action = action;
    player.actionCount++;
  }
}

/**
 * Describes a player as it is now.
 *
 * @param {Player} player - The player.
 * @returns {PlayerState} The state of the player.
 */
function describePlayer(player: Player): PlayerState {
  return {
    id: player.id,
    appearance: player.appearance,
    x: player.position.x,
    z: player.position.z,
    yaw: player.yaw,
    action: player.action,
    actionCount: player.actionCount,
  };
}
