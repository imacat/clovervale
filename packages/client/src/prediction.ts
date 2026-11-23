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
  STEP_MILLISECONDS,
  applyInput,
  interpolateYaw,
  isResting,
  stepMotion,
} from '@clovervale/shared';
import type {
  InputProgress,
  MapId,
  MonsterState,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  StampedInput,
} from '@clovervale/shared';

import { InputArrival } from './input-arrival.ts';

/** How the owner has the player of the page shown. */
export interface PredictionSettings {
  /**
   * Whether the player of the page is shown as predicted, rather than as
   * the snapshots tell it, like every other player.
   */
  isEnabled: boolean;
}

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
  /**
   * The step of the server the page reckons takes the input in, if the
   * player rested when it came, or `null` if it did not.
   */
  readonly setOff: number | null;
}

/**
 * The player of the page as the page predicts the server will have it,
 * once the server has all its inputs.
 *
 * The player moves by the rules of the server, at the rate of the server,
 * from the moment of an input, on the ground of the map it is in.  It takes
 * no steps while it rests, and so leaves it to the server to push it out of
 * the way of the villagers who push the players aside then, which shows
 * when a snapshot tells of it, as a correction.
 *
 * Each step the page takes is numbered as the step of the server at which
 * the server is to take the same step, and the villager who pushes the
 * players aside is where it is at that step of the server, to stop the
 * player or push it aside.  From one step to the
 * next, the numbers go up by one, as the server takes a step of a player
 * that does not rest at every one of its own steps, and each snapshot sets
 * them right.  A player that sets off from rest takes its first step at the
 * step of the server that takes its input in: the first step of the server
 * after the input arrives, unless the server has yet to take the steps the
 * input is to come after.  The page reckons that step from the steps at
 * which the server took in the inputs it sent before, and from the steps
 * the snapshots tell of, until a snapshot tells it.  As long as the inputs
 * take the same time to reach the server, it may be off by as many steps as
 * messages take to the server and back for every input the page sends
 * before it first learns the step at which the server took in an input that
 * did not wait for the steps before it: the first input, or one that came
 * into effect later than the steps it was to come after allowed, the page
 * having learned the step of the input before it as well.  After that, it is
 * at most a step off, and right to the step once the server has taken in
 * enough inputs for the page to tell.
 */
export class PlayerPrediction {
  #map: MapId;
  #monsters: readonly MonsterState[] = [];
  #motion: PlayerMotion;
  #previous: PlayerMotion;
  #stepTime: number = Number.NEGATIVE_INFINITY;
  #dueTime: number;
  #step: number;
  #toldStep: number | null;
  #setOffStep: number | null = null;
  #sequence = 0;
  #records: InputRecord[] = [
    { sequence: 0, input: null, steps: 0, setOff: null },
  ];
  #waiting: StampedInput[] = [];
  #correctionCount = 0;
  #lastCorrection: number | null = null;
  #inputStepTime: number = Number.NEGATIVE_INFINITY;
  readonly #arrival: InputArrival;

  /**
   * Starts from what the server tells of the player, before any input.
   *
   * @param {PlayerMotion} motion - The motion of the player.
   * @param {number} step - The number of steps the server had taken when it
   *   told that.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds.
   * @param {MapId} map - The map the player is in.
   */
  constructor(motion: PlayerMotion, step: number, time: number, map: MapId) {
    this.#map = map;
    this.#motion = motion;
    this.#previous = motion;
    this.#dueTime = time;
    this.#step = step;
    this.#toldStep = step;
    this.#arrival = new InputArrival(step, time);
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
   * The number of the step of the server the predicted motion of the
   * player is after, as of the last time it was brought up to a time.
   *
   * @returns {number} The number of the step.
   */
  get step(): number {
    return this.#step;
  }

  /**
   * The number of the step of the server after which the server told the
   * predicted motion of the player, just as it is, if the page has not
   * moved the player on from there by a step of its own, or `null` if it
   * has.  The motion is then just what the server had after that step, and
   * no input the page took in since has come into effect in it.
   *
   * @returns {number | null} The number of the step.
   */
  get toldStep(): number | null {
    return this.#toldStep;
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
   * How far the last correction moved the player, in meters, or `null`
   * before the first correction.
   *
   * @returns {number | null} The distance.
   */
  get lastCorrection(): number | null {
    return this.#lastCorrection;
  }

  /**
   * The time on the clock of the page of the step that takes the latest
   * input in, from which the input shows, to be read once an input has
   * been issued.  While the input waits for that step, it is the time the
   * step is due.
   *
   * @returns {number} The time, in milliseconds.
   */
  get inputStepTime(): number {
    return this.#inputStepTime;
  }

  /**
   * Takes in the monsters in the map, as the server last told, which tell
   * whether the steps the player takes from then on slash rather than talk
   * to a villager, as the server would.  There are none until told.
   *
   * @param {readonly MonsterState[]} monsters - The monsters.
   */
  noteMonsters(monsters: readonly MonsterState[]): void {
    this.#monsters = monsters;
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
      this.#setOffStep = this.#findSetOffStep(time);
    }
    const stamped: StampedInput = {
      ...input,
      sequence: ++this.#sequence,
      after: this.#waiting.length > 0 ? 0 : (this.#records.at(-1)?.steps ?? 0),
    };
    this.#arrival.noteSent(stamped.sequence, time, stamped.after);
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
      this.#toldStep = null;
      this.#step = Math.max(
        this.#step + 1,
        this.#setOffStep ?? Number.NEGATIVE_INFINITY,
      );
      let setOff: number | null = this.#setOffStep === null ? null : this.#step;
      this.#setOffStep = null;
      for (const input of this.#waiting) {
        this.#motion = applyInput(this.#motion, input);
        this.#records.push({
          sequence: input.sequence,
          input,
          steps: 0,
          setOff,
        });
        setOff = null;
      }
      this.#waiting = [];
      this.#motion = stepMotion(
        this.#motion,
        this.#step,
        this.#map,
        this.#monsters,
      );
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
   * server had not gotten to, and by the steps the page has taken that the
   * server had not, which are the steps of the server that follow.  If that
   * is not what was predicted, it is a correction, which shows at once.
   *
   * @param {InputProgress} progress - How far the server had gotten with
   *   the inputs of the page, and the motion of the player then.
   * @param {number} step - The number of steps the server had taken then.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   */
  reconcile(progress: InputProgress, step: number, time: number): void {
    this.advance(time);
    this.#arrival.learn(progress, step, time);
    // The server may have gotten to an input before the page has.
    while ((this.#waiting[0]?.sequence ?? Infinity) <= progress.sequence) {
      const input: StampedInput | undefined = this.#waiting.shift();
      if (input !== undefined) {
        this.#records.push({
          sequence: input.sequence,
          input,
          steps: 0,
          setOff: null,
        });
        this.#setOffStep = null;
      }
    }
    this.#records = this.#records.filter(
      (record: InputRecord) => record.sequence >= progress.sequence,
    );
    let motion: PlayerMotion = progress.motion;
    let stepped: number = step;
    for (const record of this.#records) {
      let steps: number = record.steps;
      if (record.input === null || record.sequence === progress.sequence) {
        steps -= progress.steps;
      } else {
        motion = applyInput(motion, record.input);
        // The server takes in an input that came at rest no earlier than
        // the page reckons.
        stepped = Math.max(
          stepped,
          (record.setOff ?? Number.NEGATIVE_INFINITY) - 1,
        );
      }
      for (; steps > 0; steps--) {
        motion = stepMotion(motion, ++stepped, this.#map, this.#monsters);
      }
    }
    this.#step = stepped;
    this.#toldStep = stepped === step ? step : null;
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
   * Starts the player afresh in another map, from what the server tells of
   * it there, once the server has told that the player is in that map.
   *
   * The player becomes what the server tells, moved on by the inputs the
   * server had not gotten to and by the steps the page has taken that the
   * server had not, as in {@link PlayerPrediction.reconcile}, but by the
   * rules and on the ground of that map, as it goes on moving from then on.
   * That is no correction, and the player is drawn there at once, without
   * gliding from where it was.  The inputs go on being numbered from where
   * they were.
   *
   * @param {MapId} map - The map the player is in now.
   * @param {InputProgress} progress - How far the server had gotten with
   *   the inputs of the page, and the motion of the player then, in that
   *   map.
   * @param {number} step - The number of steps the server had taken then.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   */
  enterMap(
    map: MapId,
    progress: InputProgress,
    step: number,
    time: number,
  ): void {
    this.advance(time);
    this.#map = map;
    const count: number = this.#correctionCount;
    const last: number | null = this.#lastCorrection;
    this.reconcile(progress, step, time);
    this.#correctionCount = count;
    this.#lastCorrection = last;
    this.#previous = this.#motion;
  }

  /**
   * Tells the step of the server the next step of the player is to be, if
   * it takes one at a time: the step after its last one while it does not
   * rest, and the step at which the server would take in an input sent then
   * while it rests.
   *
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   * @returns {number} The number of the step.
   */
  readNextStep(time: number): number {
    this.advance(time);
    if (this.#waiting.length > 0 || !isResting(this.#motion)) {
      return this.#setOffStep ?? this.#step + 1;
    }
    return this.#findSetOffStep(time);
  }

  /**
   * Estimates how far the steps at which the server takes in the inputs of
   * the page are ahead of the times the page sends them, as the page
   * reckons from what the server has told so far: the server takes an input
   * in at the first step it numbers no lower than the time the page sends
   * it at, in steps, and this.
   *
   * @returns {number} The offset, in steps.
   */
  estimateArrivalOffset(): number {
    return this.#arrival.estimateOffset();
  }

  /**
   * Tells the player as it is to be drawn at a time.
   *
   * Between two steps, the player glides from where it was before its
   * last step to where it is, turning likewise, the shorter way around.  It
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

  /**
   * Finds the step of the server that would take in an input the page sent
   * at a time to a player that rests.
   *
   * The server takes the input in at its first step after the input
   * arrives, but not before the steps the input is to come after.
   *
   * @param {number} time - When the page sends the input, on its clock, in
   *   milliseconds.
   * @returns {number} The number of the step, as the page reckons it.
   */
  #findSetOffStep(time: number): number {
    return Math.max(
      this.#step + 1,
      Math.ceil(time / STEP_MILLISECONDS + this.#arrival.estimateOffset()),
    );
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
