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
 * @module server/roster The players of a world: who they are, how they
 *   look, where they come in, and who is within hearing of whom.
 */

import {
  APPEARANCE_COUNT,
  AuthoritativePlayer,
  SAY_INTERVAL,
  SAY_RANGE,
  SPAWN_POINT_COUNT,
  SPAWN_YAW,
  countSteps,
  createMotion,
  findSpawnPoint,
} from '@clovervale/shared';
import type { GroundVector, Pose } from '@clovervale/shared';

import { Player } from './player.ts';
import type { Saying } from './player.ts';

/** The least distance between a new player and everyone else, in metres. */
const SPAWN_CLEARANCE = 1;

/** The least number of simulation steps between two lines of a player. */
const SAY_INTERVAL_STEPS: number = countSteps(SAY_INTERVAL);

/** The players of a world, in the order they came in. */
export class Roster {
  readonly #players = new Map<number, Player>();
  #lastId = 0;
  /** Gives the number of the current step of the world. */
  readonly #getStep: () => number;

  /**
   * Starts without players.
   *
   * @param {() => number} getStep - Gives the number of the current step
   *   of the world.
   */
  constructor(getStep: () => number) {
    this.#getStep = getStep;
  }

  /**
   * Lets a new player in.
   *
   * The player gets an identifier no player of the world has had before,
   * the appearance the fewest players have, here and elsewhere (the
   * lowest-numbered one if several tie), and a place at a spawn point, as
   * {@link Roster.chooseSpawnPoint} tells, where it idles facing the
   * fountain, at full health, carrying nothing and with no silver coins,
   * in no dialogue, told by no villager who it is, on no quest, and not
   * hunted by Martha.
   *
   * @param {readonly number[]} elsewhere - The appearances of the players
   *   in other worlds.
   * @returns {Player} The new player.
   */
  create(elsewhere: readonly number[]): Player {
    const player = new Player({
      id: ++this.#lastId,
      appearance: this.#chooseAppearance(elsewhere),
      mover: new AuthoritativePlayer(
        createMotion(this.chooseSpawnPoint(), SPAWN_YAW),
      ),
    });
    this.#players.set(player.id, player);
    return player;
  }

  /**
   * Brings in a player from another world, where it is to arrive, told
   * nothing more of what was said within its hearing in the world it left.
   *
   * @param {Player} player - The player, as it left the other world.
   * @param {Pose | null} arrival - Where it is to stand, and which way it
   *   is to face, or `null` for a spawn point, facing the fountain.
   */
  admit(player: Player, arrival: Pose | null): void {
    if (arrival === null) {
      player.mover.relocate(this.chooseSpawnPoint(), SPAWN_YAW);
    } else {
      player.mover.relocate(arrival, arrival.yaw);
    }
    player.takeSayings();
    this.#players.set(player.id, player);
  }

  /**
   * Takes a player out.
   *
   * @param {number} id - The identifier of the player.
   */
  remove(id: number): void {
    this.#players.delete(id);
  }

  /**
   * Finds a player.
   *
   * @param {number} id - The identifier of the player.
   * @returns {Player | undefined} The player, or `undefined` if it is not
   *   in the world.
   */
  find(id: number): Player | undefined {
    return this.#players.get(id);
  }

  /**
   * Lists every player.
   *
   * @returns {Player[]} The players, in the order they came in.
   */
  list(): Player[] {
    return [...this.#players.values()];
  }

  /**
   * Lists the players within hearing of a point: within {@link SAY_RANGE}
   * metres of it.
   *
   * @param {GroundVector} point - The point.
   * @returns {Player[]} The players, in the order they came in.
   */
  listHearers({ x, z }: GroundVector): Player[] {
    return this.list().filter((player: Player) => {
      const { motion } = player.mover;
      return Math.hypot(motion.x - x, motion.z - z) <= SAY_RANGE;
    });
  }

  /**
   * Has a player say something to the players nearby, at once, unless it
   * is not in the world or said its last line or phrase less than
   * {@link SAY_INTERVAL} seconds ago.  What it says is heard by every
   * player within {@link SAY_RANGE} metres of it, itself among them, and by
   * nobody else.
   *
   * @param {number} id - The identifier of the player.
   * @param {Saying} saying - What it says.
   */
  tellNearby(id: number, saying: Saying): void {
    const speaker: Player | undefined = this.#players.get(id);
    if (speaker === undefined) {
      return;
    }
    const step: number = this.#getStep();
    const { saidStep } = speaker;
    if (saidStep !== null && step - saidStep < SAY_INTERVAL_STEPS) {
      return;
    }
    speaker.saidStep = step;
    for (const player of this.listHearers(speaker.mover.motion)) {
      player.overhear(saying);
    }
  }

  /**
   * Chooses where a player comes into the world at a spawn point.
   *
   * @returns {GroundVector} The first spawn point clear of every player, or
   *   if there is none, a spawn point by turns, as the players do not stand
   *   in the way of each other.
   */
  chooseSpawnPoint(): GroundVector {
    for (let index = 0; index < SPAWN_POINT_COUNT; index++) {
      const point: GroundVector = findSpawnPoint(index);
      const isClear: boolean = this.list().every(
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

  /**
   * Chooses the appearance of a new player.
   *
   * @param {readonly number[]} elsewhere - The appearances of the players
   *   in other worlds.
   * @returns {number} The number of the appearance, from 1.
   */
  #chooseAppearance(elsewhere: readonly number[]): number {
    const uses: number[] = new Array<number>(APPEARANCE_COUNT).fill(0);
    const appearances: number[] = [
      ...this.list().map((player: Player) => player.appearance),
      ...elsewhere,
    ];
    for (const appearance of appearances) {
      uses[appearance - 1] = (uses[appearance - 1] ?? 0) + 1;
    }
    return uses.indexOf(Math.min(...uses)) + 1;
  }
}
