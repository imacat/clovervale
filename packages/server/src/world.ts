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
  AuthoritativePlayer,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  createMotion,
  findSpawnPoint,
} from '@clovervale/shared';
import type {
  GroundVector,
  InputProgress,
  PlayerState,
  StampedInput,
} from '@clovervale/shared';

/** The least distance between a new player and everyone else, in metres. */
const SPAWN_CLEARANCE = 1;

/** A player in the world. */
interface Player {
  /** The identifier of the player. */
  readonly id: number;
  /** The number of the appearance of the player, from 1. */
  readonly appearance: number;
  /** The player as the inputs of its peer move it. */
  readonly mover: AuthoritativePlayer;
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
   * place on the plaza clear of the obstacles and, while there is room, of
   * everyone else, where it idles facing the fountain.
   *
   * @returns {PlayerState} The new player.
   */
  addPlayer(): PlayerState {
    const player: Player = {
      id: ++this.#lastId,
      appearance: this.#chooseAppearance(),
      mover: new AuthoritativePlayer(
        createMotion(this.#chooseSpawnPoint(), SPAWN_YAW),
      ),
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
   * Receives an input of a player from its peer.
   *
   * A move changes the way the player wants to move, and an interaction
   * makes it slash, unless it is slashing already.  Either shows from the
   * step at which the input comes into effect: no sooner than the next
   * one, and no sooner than the player has taken as many steps since its
   * previous input came into effect as the input tells.
   *
   * @param {number} id - The identifier of the player.
   * @param {StampedInput} input - The input.
   * @returns {boolean} Whether the input was accepted.  It is not if the
   *   player is not in the world, if the number of the input is no higher
   *   than that of the input before it, or if too many inputs of the
   *   player are waiting to come into effect.
   */
  receiveInput(id: number, input: StampedInput): boolean {
    return this.#players.get(id)?.mover.receiveInput(input) ?? false;
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
      player.mover.step();
    }
  }

  /**
   * Tells how far a player has got with the inputs of its peer.
   *
   * @param {number} id - The identifier of the player.
   * @returns {InputProgress | null} The progress, or `null` if the player
   *   is not in the world.
   */
  findProgress(id: number): InputProgress | null {
    return this.#players.get(id)?.mover.progress ?? null;
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
   * @returns {GroundVector} The first spawn point clear of every player, or
   *   if there is none, a spawn point by turns, as the players do not stand
   *   in the way of each other.
   */
  #chooseSpawnPoint(): GroundVector {
    for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
      const point: GroundVector = findSpawnPoint(index);
      const isClear: boolean = [...this.#players.values()].every(
        ({ mover }: Player) =>
          Math.hypot(mover.motion.x - point.x, mover.motion.z - point.z) >=
          SPAWN_CLEARANCE,
      );
      if (isClear) {
        return point;
      }
    }
    return findSpawnPoint(this.#lastId % SPAWN_POINT_COUNT);
  }
}

/**
 * Describes a player as it is now.
 *
 * @param {Player} player - The player.
 * @returns {PlayerState} The state of the player.
 */
function describePlayer(player: Player): PlayerState {
  const { x, z, yaw, action, actionCount } = player.mover.motion;
  const { id, appearance } = player;
  return { id, appearance, x, z, yaw, action, actionCount };
}
