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
 * @module server/martha-queue The players waiting for Martha to deal with
 *   them, and how she is to set out to each.
 */

import type { StoryNeed } from '@clovervale/shared';

/**
 * How Martha sets out to deal with a player: walking up to it to talk with
 * it before she fights it, or fighting it at once, without a word.
 */
export type MarthaApproach = 'greet' | 'fight';

/**
 * How Martha sets out to deal with a player for what it needs of her in the
 * story: to a player that has found the prisoner in her cave, or that
 * holds his message, she walks up to talk with it before she fights it.
 */
const NEED_APPROACHES: Readonly<Record<StoryNeed, MarthaApproach>> = {
  'prisoner-found': 'greet',
  'message-held': 'greet',
};

/** A player waiting for Martha, and how she is to set out to it. */
export interface Waiting {
  /** The identifier of the player. */
  readonly id: number;
  /** How she is to set out to it. */
  readonly approach: MarthaApproach;
}

/**
 * The players waiting for Martha to deal with them, in the order they
 * came, each once, with how she is to set out to it.
 */
export class MarthaQueue {
  #waiting: Waiting[] = [];

  /**
   * Whether no player waits.
   *
   * @returns {boolean} Whether none does.
   */
  get isEmpty(): boolean {
    return this.#waiting.length === 0;
  }

  /**
   * Tells whether a player waits.
   *
   * @param {number} id - The identifier of the player.
   * @returns {boolean} Whether it does.
   */
  has(id: number): boolean {
    return this.#waiting.some((waiting: Waiting) => waiting.id === id);
  }

  /**
   * Has a player wait for what it needs of Martha in the story, to be set
   * out to as she sees fit for the need: last, or, if it waits already, in
   * the place it has, with the need it is told to have now.
   *
   * @param {number} id - The identifier of the player.
   * @param {StoryNeed} need - What it needs of her.
   */
  request(id: number, need: StoryNeed): void {
    const waiting: Waiting = { id, approach: NEED_APPROACHES[need] };
    const place: number = this.#waiting.findIndex(
      (other: Waiting) => other.id === id,
    );
    if (place === -1) {
      this.#waiting.push(waiting);
    } else {
      this.#waiting[place] = waiting;
    }
  }

  /**
   * Has a player that does not wait yet wait last, to be set out to as
   * told.
   *
   * @param {number} id - The identifier of the player.
   * @param {MarthaApproach} approach - How Martha is to set out to it.
   */
  enqueue(id: number, approach: MarthaApproach): void {
    this.#waiting.push({ id, approach });
  }

  /**
   * Has a player no longer wait, if it does.
   *
   * @param {number} id - The identifier of the player.
   */
  withdraw(id: number): void {
    this.#waiting = this.#waiting.filter(
      (waiting: Waiting) => waiting.id !== id,
    );
  }

  /**
   * Has only the players that pass a test go on waiting, in their places.
   *
   * @param {(id: number) => boolean} test - Tells whether a player, by its
   *   identifier, is to go on waiting.
   */
  keep(test: (id: number) => boolean): void {
    this.#waiting = this.#waiting.filter((waiting: Waiting) =>
      test(waiting.id),
    );
  }

  /**
   * Takes the player that has waited longest out of the queue.
   *
   * @returns {Waiting | undefined} The player, with how Martha is to set
   *   out to it, or `undefined` if none waits.
   */
  takeNext(): Waiting | undefined {
    return this.#waiting.shift();
  }
}
