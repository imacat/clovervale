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
 * @module client/input-arrival Reckoning the steps at which the server
 *   takes in the inputs of the page.
 */

import { STEP_MILLISECONDS } from '@clovervale/shared';
import type { InputProgress } from '@clovervale/shared';

/**
 * How far one bound may pass the other and still agree with it, in steps,
 * to allow for rounding.
 */
const BOUND_TOLERANCE = 1e-9;

/** An input the page has sent, and when. */
interface SentInput {
  /** The number of the input. */
  readonly sequence: number;
  /** When the page sent it, on its clock, in milliseconds. */
  readonly time: number;
  /**
   * The number of steps it told the server to take with the input before
   * it in effect.
   */
  readonly after: number;
}

/** The step of the server at which an input came into effect. */
interface InputEffect {
  /** The number of the input. */
  readonly sequence: number;
  /** The number of the step. */
  readonly step: number;
}

/**
 * The offset of the steps at which the server takes in the inputs of the
 * page from the times the page sends them, as the page can tell it from
 * what the server tells: the server takes an input in at the first step it
 * numbers no lower than the time the page sends it at, in steps, and the
 * offset.
 */
export class InputArrival {
  #sent: SentInput[] = [];
  #lastEffect: InputEffect | null = null;
  #leastOffset: number;
  #mostOffset = Infinity;

  /**
   * Starts from a step the server told of, before any input.
   *
   * @param {number} step - The number of steps the server had taken.
   * @param {number} time - When the page heard of it, on its clock, in
   *   milliseconds.
   */
  constructor(step: number, time: number) {
    this.#leastOffset = step - time / STEP_MILLISECONDS;
  }

  /**
   * Takes note of an input the page sends.
   *
   * @param {number} sequence - The number of the input.
   * @param {number} time - When the page sends it, on its clock, in
   *   milliseconds.
   * @param {number} after - The number of steps it tells the server to take
   *   with the input before it in effect.
   */
  noteSent(sequence: number, time: number, after: number): void {
    this.#sent.push({ sequence, time, after });
  }

  /**
   * Estimates the offset.
   *
   * @returns {number} The offset, in steps: halfway between the least and
   *   the most it can be, as far as the page can tell.
   */
  estimateOffset(): number {
    if (this.#mostOffset === Infinity) {
      return this.#leastOffset + 0.5;
    }
    if (this.#leastOffset === -Infinity) {
      return this.#mostOffset - 0.5;
    }
    return (this.#leastOffset + this.#mostOffset) / 2;
  }

  /**
   * Narrows down the offset by what the server tells.
   *
   * No input the page sends after it hears of a step comes into effect
   * before the next step.  No input comes into effect before the step that
   * would take it in on its arrival.  An input that comes into effect at a
   * step after the one the steps before it allow for, does so at that very
   * step.  What the server tells that cannot be, as the time an input takes
   * to reach the server changes, takes the place of what came before.
   *
   * @param {InputProgress} progress - How far the server had got with the
   *   inputs of the page.
   * @param {number} step - The number of steps the server had taken then.
   * @param {number} time - When the page heard of it, on its clock, in
   *   milliseconds.
   */
  learn(progress: InputProgress, step: number, time: number): void {
    this.#bindBelow(step - time / STEP_MILLISECONDS);
    const { sequence } = progress;
    if (sequence === 0 || sequence === this.#lastEffect?.sequence) {
      return;
    }
    const effect: number = step - progress.steps + 1;
    const previous: InputEffect | null = this.#lastEffect;
    this.#lastEffect = { sequence, step: effect };
    const sent: SentInput | undefined = this.#sent.find(
      (input: SentInput) => input.sequence === sequence,
    );
    this.#sent = this.#sent.filter(
      (input: SentInput) => input.sequence > sequence,
    );
    if (sent === undefined) {
      return;
    }
    const offset: number = effect - sent.time / STEP_MILLISECONDS;
    this.#bindAbove(offset);
    const allowed: number | null =
      sequence === 1
        ? Number.NEGATIVE_INFINITY
        : previous?.sequence === sequence - 1
          ? previous.step + sent.after
          : null;
    if (allowed !== null && effect > allowed) {
      this.#bindBelow(offset - 1);
    }
  }

  /**
   * Takes note that the offset is no less than a bound.
   *
   * @param {number} bound - The bound, in steps.
   */
  #bindBelow(bound: number): void {
    if (bound > this.#mostOffset + BOUND_TOLERANCE) {
      this.#mostOffset = Infinity;
    }
    this.#leastOffset = Math.max(this.#leastOffset, bound);
  }

  /**
   * Takes note that the offset is no more than a bound.
   *
   * @param {number} bound - The bound, in steps.
   */
  #bindAbove(bound: number): void {
    if (bound < this.#leastOffset - BOUND_TOLERANCE) {
      this.#leastOffset = Number.NEGATIVE_INFINITY;
    }
    this.#mostOffset = Math.min(this.#mostOffset, bound);
  }
}
