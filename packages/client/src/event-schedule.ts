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
 * @module client/event-schedule Holding the events from the server back until
 *   the moment they happened is shown, and handing each out once.
 */

import { SIMULATION_RATE } from '@clovervale/shared';
import type { GameEvent } from '@clovervale/shared';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** The events from the server that are yet to be shown. */
export class EventSchedule {
  #lastId = 0;
  #waiting: GameEvent[] = [];

  /**
   * The number of events waiting for their moment.
   *
   * @returns {number} The number of events.
   */
  get size(): number {
    return this.#waiting.length;
  }

  /**
   * Takes in events that have arrived, to wait for their moment.
   *
   * An event whose number is no higher than that of an event taken in
   * before is ignored, so that no event is shown twice.
   *
   * @param {readonly GameEvent[]} events - The events, in the order they
   *   happened.
   */
  receive(events: readonly GameEvent[]): void {
    for (const event of events) {
      if (event.id > this.#lastId) {
        this.#lastId = event.id;
        this.#waiting.push(event);
      }
    }
  }

  /**
   * Hands out the events whose moment has come, which it does once only.
   *
   * @param {number | null} time - The time on the clock of the server that
   *   is shown, in milliseconds, or `null` while nothing is shown.
   * @returns {GameEvent[]} The events that happened by then, in the order
   *   they happened, or none while nothing is shown.
   */
  takeDue(time: number | null): GameEvent[] {
    if (time === null) {
      return [];
    }
    const count: number = this.#waiting.findIndex(
      (event: GameEvent) => event.step * STEP_MILLISECONDS > time,
    );
    return this.#waiting.splice(0, count === -1 ? this.#waiting.length : count);
  }

  /**
   * Forgets every event, and every number of the events taken in, as for a
   * server that starts counting over.
   */
  clear(): void {
    this.#lastId = 0;
    this.#waiting = [];
  }
}
