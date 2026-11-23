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
 * @module client/slewed-clock Following another clock little by little,
 *   without jumps.
 */

/**
 * How far ahead of the clock of the page another clock is to be read, as
 * it follows how far ahead the page reckons that clock is.
 *
 * A clock that finds itself a little off catches up little by little, from
 * one reading to the next, running at most a share of the time that passes
 * faster or slower, and never backward.  One that is far off, or read for
 * the first time, starts over at once.
 */
export class SlewedClock {
  readonly #slew: number;
  readonly #resync: number;
  #offset: number | null = null;
  #readTime = 0;

  /**
   * Starts a clock that has not been read.
   *
   * @param {number} slew - The most the clock may run fast or slow, as a
   *   share of the time that passes.
   * @param {number} resync - How far off the clock may be before it starts
   *   over at once instead of catching up little by little.
   */
  constructor(slew: number, resync: number) {
    this.#slew = slew;
    this.#resync = resync;
  }

  /**
   * Reads how far ahead the clock is at a time.
   *
   * @param {number} target - How far ahead the page reckons the clock is.
   * @param {number} time - The time on the clock of the page, which is no
   *   earlier than at the last reading.
   * @returns {number} How far ahead the clock is.
   */
  read(target: number, time: number): number {
    const offset: number = this.peek(target, time);
    this.#offset = offset;
    this.#readTime = time;
    return offset;
  }

  /**
   * Tells how far ahead a reading would tell the clock is, without reading
   * it, so that the next reading is as if this one had not been made.
   *
   * @param {number} target - How far ahead the page reckons the clock is.
   * @param {number} time - The time on the clock of the page, which is no
   *   earlier than at the last reading.
   * @returns {number} How far ahead the clock is.
   */
  peek(target: number, time: number): number {
    if (this.#offset === null) {
      return target;
    }
    const error: number = target - this.#offset;
    if (Math.abs(error) > this.#resync) {
      return target;
    }
    const reach: number = this.#slew * Math.max(time - this.#readTime, 0);
    return this.#offset + Math.min(Math.max(error, -reach), reach);
  }

  /** Forgets the readings, so that the next one starts over. */
  reset(): void {
    this.#offset = null;
  }
}
