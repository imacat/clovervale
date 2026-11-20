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
  MapId,
  MonsterState,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  StampedInput,
} from '@clovervale/shared';

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/**
 * How much faster or slower than the clock of the page the step Toby is
 * drawn at may run while it catches up with where it is to be, as a share.
 */
const DRAWN_STEP_SLEW = 0.1;

/**
 * How many steps off the step Toby is drawn at may be before it starts over
 * at once instead of catching up little by little: two seconds of them.
 */
const DRAWN_STEP_RESYNC: number = 2 * SIMULATION_RATE;

/**
 * How far one bound may pass the other and still agree with it, in steps,
 * to allow for rounding.
 */
const BOUND_TOLERANCE = 1e-9;

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
 * The player of the page as the page predicts the server will have it,
 * once the server has all its inputs.
 *
 * The player moves by the rules of the server, at the rate of the server,
 * from the moment of an input, on the ground of the map it is in.  It takes
 * no steps while it rests, and so leaves it to the server to push it out of
 * the way of Toby then, which shows when a snapshot tells of it, as a
 * correction.
 *
 * Each step the page takes is numbered as the step of the server at which
 * the server is to take the same step, and Toby is where he is at that step
 * of the server, to stop the player or push it aside.  From one step to the
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
 * having learnt the step of the input before it as well.  After that, it is
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
  #inputStepTime: number | null = null;
  #sent: SentInput[] = [];
  #lastEffect: InputEffect | null = null;
  #leastOffset: number;
  #mostOffset = Infinity;
  #drawnStep: number | null = null;
  #drawnTime = 0;

  /**
   * Starts from what the server tells of the player, before any input.
   *
   * @param {PlayerMotion} motion - The motion of the player.
   * @param {number} step - The number of steps the server had taken when it
   *   told that.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds.
   * @param {MapId} [map] - The map the player is in, the village by
   *   default.
   */
  constructor(
    motion: PlayerMotion,
    step: number,
    time: number,
    map: MapId = 'village',
  ) {
    this.#map = map;
    this.#motion = motion;
    this.#previous = motion;
    this.#dueTime = time;
    this.#step = step;
    this.#toldStep = step;
    this.#leastOffset = step - time / STEP_MILLISECONDS;
  }

  /**
   * The map the player is in, as the page last learnt.
   *
   * @returns {MapId} The map.
   */
  get map(): MapId {
    return this.#map;
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
    this.#sent.push({ sequence: stamped.sequence, time, after: stamped.after });
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
   * server had not got to, and by the steps the page has taken that the
   * server had not, which are the steps of the server that follow.  If that
   * is not what was predicted, it is a correction, which shows at once.
   *
   * @param {InputProgress} progress - How far the server had got with the
   *   inputs of the page, and the motion of the player then.
   * @param {number} step - The number of steps the server had taken then.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   */
  reconcile(progress: InputProgress, step: number, time: number): void {
    this.advance(time);
    this.#learnOffset(progress, step, time);
    // The server may have got to an input before the page has.
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
   * server had not got to and by the steps the page has taken that the
   * server had not, as in {@link PlayerPrediction.reconcile}, but by the
   * rules and on the ground of that map, as it goes on moving from then on.
   * That is no correction, and the player is drawn there at once, without
   * gliding from where it was.  The inputs go on being numbered from where
   * they were.
   *
   * @param {MapId} map - The map the player is in now.
   * @param {InputProgress} progress - How far the server had got with the
   *   inputs of the page, and the motion of the player then, in that map.
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
   * Tells the step of the server, or the moment between two of its steps,
   * that Toby is to be drawn at, at a time.
   *
   * It is the step a walking player is drawn at, on average, as the page
   * reckons from when the server takes in its inputs.  It goes on evenly
   * with the clock of the page, whether the player walks or rests.  When
   * the page reckons differently, it catches up little by little, running a
   * little faster or slower, and never backwards, unless it is far off, when
   * it starts over at once.
   *
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   * @returns {number} The number of the step, which may fall between two.
   */
  readDrawnStep(time: number): number {
    const target: number =
      time / STEP_MILLISECONDS + this.#estimateOffset() - 0.5;
    if (this.#drawnStep === null) {
      this.#drawnStep = target;
    } else {
      const span: number = (time - this.#drawnTime) / STEP_MILLISECONDS;
      const even: number = this.#drawnStep + span;
      const error: number = target - even;
      const reach: number = DRAWN_STEP_SLEW * span;
      this.#drawnStep =
        Math.abs(error) > DRAWN_STEP_RESYNC
          ? target
          : even + Math.min(Math.max(error, -reach), reach);
    }
    this.#drawnTime = time;
    return this.#drawnStep;
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
      Math.ceil(time / STEP_MILLISECONDS + this.#estimateOffset()),
    );
  }

  /**
   * Estimates the offset of the steps at which the server takes in the
   * inputs of the page from the times the page sends them: the server
   * takes an input in at the first step it numbers no lower than the time
   * the page sends it at, in steps, and the offset.
   *
   * @returns {number} The offset, in steps: halfway between the least and
   *   the most it can be, as far as the page can tell.
   */
  #estimateOffset(): number {
    if (this.#mostOffset === Infinity) {
      return this.#leastOffset + 0.5;
    }
    if (this.#leastOffset === -Infinity) {
      return this.#mostOffset - 0.5;
    }
    return (this.#leastOffset + this.#mostOffset) / 2;
  }

  /**
   * Narrows down the offset of the steps at which the server takes in the
   * inputs of the page by what the server tells.
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
  #learnOffset(progress: InputProgress, step: number, time: number): void {
    this.#bindOffsetBelow(step - time / STEP_MILLISECONDS);
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
    this.#bindOffsetAbove(offset);
    const allowed: number | null =
      sequence === 1
        ? Number.NEGATIVE_INFINITY
        : previous?.sequence === sequence - 1
          ? previous.step + sent.after
          : null;
    if (allowed !== null && effect > allowed) {
      this.#bindOffsetBelow(offset - 1);
    }
  }

  /**
   * Takes note that the offset is no less than a bound.
   *
   * @param {number} bound - The bound, in steps.
   */
  #bindOffsetBelow(bound: number): void {
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
  #bindOffsetAbove(bound: number): void {
    if (bound < this.#leastOffset - BOUND_TOLERANCE) {
      this.#leastOffset = Number.NEGATIVE_INFINITY;
    }
    this.#mostOffset = Math.min(this.#mostOffset, bound);
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
