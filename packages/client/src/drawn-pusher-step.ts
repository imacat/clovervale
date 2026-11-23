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
 * @module client/drawn-pusher-step Telling the step of the server the
 *   pushers are drawn at, alongside the player of the page.
 */

import { SIMULATION_RATE, STEP_MILLISECONDS } from '@clovervale/shared';

import type { PlayerPrediction } from './prediction.ts';
import { SlewedClock } from './slewed-clock.ts';

/**
 * How much faster or slower than the clock of the page the step the pushers
 * are drawn at may run while it catches up with where it is to be, as a
 * share.
 */
const DRAWN_STEP_SLEW = 0.1;

/**
 * How many steps off the step the pushers are drawn at may be before it
 * starts over at once instead of catching up little by little: two seconds
 * of them.
 */
const DRAWN_STEP_RESYNC: number = 2 * SIMULATION_RATE;

/**
 * The step of the server the pushers are drawn at, beside a predicted
 * player.
 */
export class DrawnPusherStep {
  readonly #prediction: PlayerPrediction;
  readonly #clock = new SlewedClock(DRAWN_STEP_SLEW, DRAWN_STEP_RESYNC);

  /**
   * Starts beside a predicted player, before the first reading.
   *
   * @param {PlayerPrediction} prediction - The prediction of the player of
   *   the page.
   */
  constructor(prediction: PlayerPrediction) {
    this.#prediction = prediction;
  }

  /**
   * Tells the step of the server, or the moment between two of its steps,
   * that the pushers are to be drawn at, at a time.
   *
   * It is the step a walking player is drawn at, on average, as the page
   * reckons from when the server takes in its inputs.  It goes on evenly
   * with the clock of the page, whether the player walks or rests.  When
   * the page reckons differently, it catches up little by little, running a
   * little faster or slower, and never backward, unless it is far off, when
   * it starts over at once.
   *
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than at the last reading.
   * @returns {number} The number of the step, which may fall between two.
   */
  read(time: number): number {
    const steps: number = time / STEP_MILLISECONDS;
    const target: number = this.#prediction.estimateArrivalOffset() - 0.5;
    return steps + this.#clock.read(target, steps);
  }
}
