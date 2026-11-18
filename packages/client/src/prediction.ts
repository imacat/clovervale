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
 * @module client/prediction Moving the player of the page ahead of the
 *   server, and setting it right by what the server tells.
 */

import {
  SIMULATION_RATE,
  applyInput,
  interpolateYaw,
  isResting,
  stepMotion,
} from '@clovervale/shared';
import type {
  InputProgress,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  StampedInput,
} from '@clovervale/shared';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** An input that is in effect, or was, and what the player did with it. */
interface InputRecord {
  /** The number of the input, or 0 for the time before the first. */
  readonly sequence: number;
  /** The input, or `null` for the time before the first. */
  readonly input: PlayerInput | null;
  /**
   * The number of steps the player took with the input in effect, before
   * the next one came into effect.
   */
  steps: number;
}

/**
 * The player of the page as the page predicts the server will have it,
 * once the server has all its inputs.
 *
 * The player moves by the rules of the server, at the rate of the server,
 * from the moment of an input.  It takes no steps while it rests.
 */
export class PlayerPrediction {
  #motion: PlayerMotion;
  #previous: PlayerMotion;
  #stepTime: number = Number.NEGATIVE_INFINITY;
  #dueTime: number;
  #sequence = 0;
  #records: InputRecord[] = [{ sequence: 0, input: null, steps: 0 }];
  #waiting: StampedInput[] = [];
  #correctionCount = 0;
  #lastCorrection: number | null = null;
  #inputStepTime: number | null = null;

  /**
   * Starts from what the server tells of the player, before any input.
   *
   * @param {PlayerMotion} motion - The motion of the player.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds.
   */
  constructor(motion: PlayerMotion, time: number) {
    this.#motion = motion;
    this.#previous = motion;
    this.#dueTime = time;
  }

  /**
   * The predicted motion of the player, as of the last time it was brought
   * up to a time.
   *
   * @returns {PlayerMotion} The motion.
   */
  get motion(): PlayerMotion {
    return this.#motion;
  }

  /**
   * The number of times the server has contradicted the prediction.
   *
   * @returns {number} The number of corrections.
   */
  get correctionCount(): number {
    return this.#correctionCount;
  }

  /**
   * How far the last correction moved the player, in metres, or `null`
   * before the first correction.
   *
   * @returns {number | null} The distance.
   */
  get lastCorrection(): number | null {
    return this.#lastCorrection;
  }

  /**
   * The time on the clock of the page of the step that takes the latest
   * input in, from which the input shows, or `null` before the first input.
   * While the input waits for that step, it is the time the step is due.
   *
   * @returns {number | null} The time, in milliseconds.
   */
  get inputStepTime(): number | null {
    return this.#inputStepTime;
  }

  /**
   * Takes an input of the player in, and stamps it for the server.
   *
   * The input shows at the next step of the player, which a player that
   * rests takes at once, unless it took its last step less than a step
   * ago.
   *
   * @param {PlayerInput} input - The input.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   * @returns {StampedInput} The input to send to the server, numbered, and
   *   telling the steps the player took with the previous input in effect.
   */
  issueInput(input: PlayerInput, time: number): StampedInput {
    this.advance(time);
    const isIdle: boolean =
      this.#waiting.length === 0 && isResting(this.#motion);
    if (isIdle) {
      this.#dueTime = Math.max(this.#dueTime, time);
    }
    const stamped: StampedInput = {
      ...input,
      sequence: ++this.#sequence,
      after: this.#waiting.length > 0 ? 0 : (this.#records.at(-1)?.steps ?? 0),
    };
    this.#waiting.push(stamped);
    this.advance(time);
    this.#inputStepTime =
      this.#waiting.length > 0 ? this.#dueTime : this.#stepTime;
    return stamped;
  }

  /**
   * Brings the player up to a time, with the steps that are due by then.
   *
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   */
  advance(time: number): void {
    while (
      this.#dueTime <= time &&
      (this.#waiting.length > 0 || !isResting(this.#motion))
    ) {
      this.#previous = this.#motion;
      for (const input of this.#waiting) {
        this.#motion = applyInput(this.#motion, input);
        this.#records.push({ sequence: input.sequence, input, steps: 0 });
      }
      this.#waiting = [];
      this.#motion = stepMotion(this.#motion);
      const record: InputRecord | undefined = this.#records.at(-1);
      if (record !== undefined) {
        record.steps++;
      }
      this.#stepTime = this.#dueTime;
      this.#dueTime += STEP_MILLISECONDS;
    }
  }

  /**
   * Sets the player right by what the server tells of it.
   *
   * The player becomes what the server tells, moved on by the inputs the
   * server had not got to, and by the steps the page has taken that the
   * server had not.  If that is not what was predicted, it is a correction,
   * which shows at once.
   *
   * @param {InputProgress} progress - How far the server had got with the
   *   inputs of the page, and the motion of the player then.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   */
  reconcile(progress: InputProgress, time: number): void {
    this.advance(time);
    // The server may have got to an input before the page has.
    while ((this.#waiting[0]?.sequence ?? Infinity) <= progress.sequence) {
      const input: StampedInput | undefined = this.#waiting.shift();
      if (input !== undefined) {
        this.#records.push({ sequence: input.sequence, input, steps: 0 });
      }
    }
    this.#records = this.#records.filter(
      (record: InputRecord) => record.sequence >= progress.sequence,
    );
    let motion: PlayerMotion = progress.motion;
    for (const record of this.#records) {
      let steps: number = record.steps;
      if (record.input === null || record.sequence === progress.sequence) {
        steps -= progress.steps;
      } else {
        motion = applyInput(motion, record.input);
      }
      for (; steps > 0; steps--) {
        motion = stepMotion(motion);
      }
    }
    const last: InputRecord | undefined = this.#records.at(-1);
    if (last?.sequence === progress.sequence) {
      // The page never takes fewer steps with an input than the server.
      last.steps = Math.max(last.steps, progress.steps);
    }
    if (!isSameMotion(motion, this.#motion)) {
      this.#correctionCount++;
      this.#lastCorrection = Math.hypot(
        motion.x - this.#motion.x,
        motion.z - this.#motion.z,
      );
      this.#motion = motion;
      this.#previous = motion;
    }
  }

  /**
   * Tells the player as it is to be drawn at a time.
   *
   * Between two steps, the player glides from where it was before its
   * last step to where it is, turning likewise, the shorter way round.  It
   * does what it does after the step.
   *
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   * @returns {PlayerMotion} The motion of the player as drawn.
   */
  readDrawn(time: number): PlayerMotion {
    this.advance(time);
    const from: PlayerMotion = this.#previous;
    const to: PlayerMotion = this.#motion;
    const fraction: number = Math.min(
      (time - this.#stepTime) / STEP_MILLISECONDS,
      1,
    );
    if (fraction >= 1) {
      return to;
    }
    return {
      ...to,
      x: from.x + (to.x - from.x) * fraction,
      z: from.z + (to.z - from.z) * fraction,
      yaw: interpolateYaw(from.yaw, to.yaw, fraction),
    };
  }
}

/**
 * Shows the player of the page as predicted among the players.
 *
 * @param {readonly PlayerState[]} players - The players as they would be
 *   shown without prediction.
 * @param {PlayerState} own - The player of the page, as any snapshot tells
 *   it.
 * @param {PlayerMotion} motion - The motion to show the player of the page
 *   with.
 * @returns {PlayerState[]} The other players as they are, and the player of
 *   the page with that motion, in the place it had, or last if it had none.
 */
export function placeOwnPlayer(
  players: readonly PlayerState[],
  own: PlayerState,
  motion: PlayerMotion,
): PlayerState[] {
  const { x, z, yaw, action, actionCount } = motion;
  const placed: PlayerState = { ...own, x, z, yaw, action, actionCount };
  const isOwn = (player: PlayerState): boolean => player.id === own.id;
  if (!players.some(isOwn)) {
    return [...players, placed];
  }
  return players.map((player: PlayerState) =>
    isOwn(player) ? placed : player,
  );
}

/**
 * Tells whether two motions are exactly the same.
 *
 * @param {PlayerMotion} a - One motion.
 * @param {PlayerMotion} b - The other motion.
 * @returns {boolean} Whether they are the same.
 */
function isSameMotion(a: PlayerMotion, b: PlayerMotion): boolean {
  return (
    a.x === b.x &&
    a.z === b.z &&
    a.yaw === b.yaw &&
    a.action === b.action &&
    a.actionCount === b.actionCount &&
    a.direction.x === b.direction.x &&
    a.direction.z === b.direction.z &&
    a.isInteracting === b.isInteracting &&
    a.actionSteps === b.actionSteps
  );
}
