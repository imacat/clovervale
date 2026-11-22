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
 * @module shared/authoritative-player A player as the server moves it, by
 *   the inputs of its peer.
 */

import { SIMULATION_RATE } from './movement.ts';
import type { GroundVector } from './movement.ts';
import {
  applyInput,
  killMotion,
  relocateMotion,
  stepMotion,
} from './player-motion.ts';
import type { PlayerInput, PlayerMotion } from './player-motion.ts';
import type { MonsterState } from './protocol.ts';
import type { MapId } from './world-map.ts';

/**
 * The most steps an input waits for its turn before it comes into effect
 * anyway.
 */
export const INPUT_WAIT_LIMIT: number = SIMULATION_RATE;

/** The most inputs of one player that can wait for their turn at once. */
export const WAITING_INPUT_LIMIT = 256;

/** What a peer tells of every input, for the server to place it in time. */
export interface InputStamp {
  /**
   * The number of the input among the inputs of the peer, which goes up
   * with every input, from 1.
   */
  readonly sequence: number;
  /**
   * The number of simulation steps the peer let its player take with the
   * previous input in effect, before this one came into effect.
   */
  readonly after: number;
}

/** An input of a player, placed in time by its peer. */
export type StampedInput = PlayerInput & InputStamp;

/** How far a player has got with the inputs of its peer. */
export interface InputProgress {
  /**
   * The number of the last input that has come into effect, or 0 before
   * the first.
   */
  readonly sequence: number;
  /**
   * The number of simulation steps the player has taken since that input
   * came into effect, or since it started before the first input.
   */
  readonly steps: number;
  /** The motion of the player after those steps. */
  readonly motion: PlayerMotion;
}

/** An input that waits for its turn. */
interface WaitingInput {
  /** The input. */
  readonly input: StampedInput;
  /** The number of steps the input has waited for. */
  waited: number;
}

/**
 * A player as the server moves it.
 *
 * The inputs of its peer come into effect in the order they were received,
 * each no sooner than the next step, and no sooner than the player has
 * taken as many steps with the previous input in effect as the input tells.
 * So the player takes as many steps between two inputs as its peer did,
 * whenever the inputs arrive in time for that.
 */
export class AuthoritativePlayer {
  #motion: PlayerMotion;
  #sequence = 0;
  #steps = 0;
  #receivedSequence = 0;
  readonly #waiting: WaitingInput[] = [];

  /**
   * Starts with a player that has not had any input.
   *
   * @param {PlayerMotion} motion - The motion of the player.
   */
  constructor(motion: PlayerMotion) {
    this.#motion = motion;
  }

  /**
   * The motion of the player as it is now.
   *
   * @returns {PlayerMotion} The motion.
   */
  get motion(): PlayerMotion {
    return this.#motion;
  }

  /**
   * How far the player has got with the inputs of its peer by now.
   *
   * @returns {InputProgress} The progress.
   */
  get progress(): InputProgress {
    return {
      sequence: this.#sequence,
      steps: this.#steps,
      motion: this.#motion,
    };
  }

  /**
   * Receives an input from the peer of the player, to come into effect
   * when its turn comes.
   *
   * @param {StampedInput} input - The input.
   * @returns {boolean} Whether the input was accepted.  It is not if its
   *   number is no higher than that of the input before it, or if too many
   *   inputs are waiting for their turn already.
   */
  receiveInput(input: StampedInput): boolean {
    if (
      input.sequence <= this.#receivedSequence ||
      this.#waiting.length >= WAITING_INPUT_LIMIT
    ) {
      return false;
    }
    this.#receivedSequence = input.sequence;
    this.#waiting.push({ input, waited: 0 });
    return true;
  }

  /**
   * Makes the player die where it is, which its peer learns of only from
   * the motion of the player as the server tells it.
   *
   * The player stops whatever it is doing and lies there, neither moving,
   * turning nor interacting, until it is moved somewhere else.  The inputs
   * that are waiting for their turn still come into effect when it comes,
   * but only to change the way the player wants to move.
   */
  kill(): void {
    this.#motion = killMotion(this.#motion);
  }

  /**
   * Moves the player somewhere else at once, which its peer learns of only
   * from the motion of the player as the server tells it.
   *
   * The player stops whatever it is doing and idles there, facing the way it
   * is told, but still wants to move the way it did.  The inputs that are
   * waiting for their turn still come into effect when it comes.
   *
   * @param {GroundVector} position - Where the player is to stand.
   * @param {number} yaw - The turn around the Y axis from facing +Z towards
   *   +X, in degrees.
   */
  relocate(position: GroundVector, yaw: number): void {
    this.#motion = relocateMotion(this.#motion, position, yaw);
  }

  /**
   * Moves the player one step of the simulation forward, in a map, with
   * the inputs whose turn has come in effect.
   *
   * An input that has waited for {@link INPUT_WAIT_LIMIT} steps comes into
   * effect whether its turn has come or not.  A player held in place takes
   * the inputs in as well, but from the step on it wants neither to move
   * nor to interact, whatever they tell, as if it had been told so.
   *
   * @param {number} step - The number of the step, as the server counts
   *   them, which tells where Toby is.
   * @param {MapId} map - The map the player is in.
   * @param {boolean} isHeld - Whether the player is held in place at the
   *   step.
   * @param {readonly MonsterState[]} monsters - The monsters in the map,
   *   which tell whether the player slashes rather than talks to a
   *   villager.
   * @returns {StampedInput[]} The inputs that came into effect at the step,
   *   in the order they did.
   */
  step(
    step: number,
    map: MapId,
    isHeld: boolean,
    monsters: readonly MonsterState[],
  ): StampedInput[] {
    const applied: StampedInput[] = [];
    for (
      let next: WaitingInput | undefined = this.#waiting[0];
      next !== undefined &&
      (this.#steps >= next.input.after || next.waited >= INPUT_WAIT_LIMIT);
      next = this.#waiting[0]
    ) {
      this.#waiting.shift();
      this.#motion = applyInput(this.#motion, next.input);
      this.#sequence = next.input.sequence;
      this.#steps = 0;
      applied.push(next.input);
    }
    for (const waiting of this.#waiting) {
      waiting.waited++;
    }
    if (isHeld) {
      this.#motion = {
        ...this.#motion,
        direction: { x: 0, z: 0 },
        isInteracting: false,
      };
    }
    this.#motion = stepMotion(this.#motion, step, map, monsters);
    this.#steps++;
    return applied;
  }
}
