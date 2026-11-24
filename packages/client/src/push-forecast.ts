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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/push-forecast Drawing the player of the page pushed out of
 *   the way of a villager who pushes the players aside, before the server
 *   tells of it.
 */

import {
  SIMULATION_RATE,
  WORLD_MAPS,
  findPusher,
  isResting,
} from '@clovervale/shared';
import type {
  GroundVector,
  MapId,
  PlayerMotion,
  Pusher,
  Terrain,
} from '@clovervale/shared';

import { SMOOTHING_DURATION, SMOOTHING_LIMIT } from './correction-smoothing.ts';
import type {
  CorrectionSmoothing,
  SmoothingSettings,
} from './correction-smoothing.ts';
import type { PlayerPrediction, PredictionSettings } from './prediction.ts';

/**
 * How many times as fast as the villager who pushes it goes, as
 * {@link Pusher.speed} tells, the forecast at the fastest moves the player
 * along the places the server pushes it to: twice.  A villager pushes a
 * player square in its way aside faster than this as it first touches it,
 * and the player is drawn reaching into it a little for a few frames then.
 */
export const PUSH_SPEED_RATIO = 2;

/**
 * How long after the step the server last told of the player the forecast
 * foresees its pushes, in seconds.  Beyond that, while the server stays
 * silent, the player is held where the forecast has it then.
 */
export const FORECAST_HORIZON = 3;

/**
 * How far a player may reach into a villager who pushes it and still count
 * as touching it only, in meters, to allow for rounding.
 */
const OVERLAP_TOLERANCE = 1e-9;

/**
 * The longest time between two frames, in milliseconds, over which a
 * handover is still drawn as a glide: a few frames' worth.
 */
const PAUSE_LIMIT = 100;

/**
 * Whether the owner has the pushes of the villagers who push the players
 * aside drawn before the server tells.
 */
export interface PushForecastSettings {
  /**
   * Whether the player of the page at rest is drawn pushed out of the way of
   * a villager who pushes the players aside as the villager is drawn, rather
   * than when the server tells of the push.
   */
  isEnabled: boolean;
}

/**
 * The places a resting player is pushed to by the server at its steps, from
 * a step the server told of the player after, and how far along them the
 * player is drawn.
 */
class PushCourse {
  readonly #pusher: Pusher;
  readonly #terrain: Terrain;
  #first: number;
  #horizon: number;
  readonly #places: GroundVector[];
  #progress: number;
  #time: number | null = null;

  /**
   * Starts at the place the server told of, with the player drawn there.
   *
   * @param {number} step - The number of the step the server told of the
   *   player after.
   * @param {GroundVector} position - Where the server had the player then.
   * @param {Pusher} pusher - How the villager who pushes the player gets in
   *   its way.
   * @param {Terrain} terrain - The ground the player stands on.
   */
  constructor(
    step: number,
    position: GroundVector,
    pusher: Pusher,
    terrain: Terrain,
  ) {
    this.#pusher = pusher;
    this.#terrain = terrain;
    this.#first = step;
    this.#horizon = step + FORECAST_HORIZON * SIMULATION_RATE;
    this.#places = [position];
    this.#progress = step;
  }

  /**
   * Tells whether the server has the player resting where this course has
   * it after a step.
   *
   * @param {number} step - The number of the step, no earlier than any told
   *   before.
   * @param {GroundVector} position - Where the server had the player after
   *   the step.
   * @returns {boolean} Whether this course has it there just then.
   */
  isFollowedBy(step: number, position: GroundVector): boolean {
    const place: GroundVector = this.#findPlace(step);
    return place.x === position.x && place.z === position.z;
  }

  /**
   * Forgets the places before a step the server has told of, which are
   * never needed again, and foresees the places up to
   * {@link FORECAST_HORIZON} after it.
   *
   * @param {number} step - The number of the step.
   */
  forgetBefore(step: number): void {
    this.#horizon = step + FORECAST_HORIZON * SIMULATION_RATE;
    const count: number =
      Math.min(step, Math.floor(this.#progress)) - this.#first;
    if (count > 0) {
      this.#places.splice(0, count);
      this.#first += count;
    }
  }

  /**
   * Moves the player drawn along the course on to a frame.
   *
   * It is drawn at the place the server has it at the step the villager
   * who pushes it is drawn at, or between that and the next, as far
   * toward the next as it takes to keep it clear of the villager, if that
   * does, but never farther back along the course than it was drawn
   * before, and no faster than {@link PUSH_SPEED_RATIO} times the speed of
   * the villager from frame to frame.
   *
   * @param {number} pusherStep - The step of the server the villager who
   *   pushes the player is drawn at, which may fall between two.
   * @param {number} time - The time of the frame on the clock of the page,
   *   in milliseconds, which is no earlier than any time told before.
   * @returns {GroundVector} Where the player is to be drawn.
   */
  advance(pusherStep: number, time: number): GroundVector {
    const span: number =
      this.#time === null ? 0 : (time - this.#time) / 1000;
    this.#time = time;
    this.#moveToward(
      this.#findTarget(pusherStep),
      PUSH_SPEED_RATIO * this.#pusher.speed * span,
    );
    return this.#findPoint(this.#progress);
  }

  /**
   * Finds how far along the course the player is to be drawn, as far as it
   * can be.
   *
   * @param {number} pusherStep - The step of the server the villager who
   *   pushes the player is drawn at.
   * @returns {number} How far along, in steps, no earlier than it is drawn
   *   already, and no later than the step after the one the villager is
   *   drawn at, nor than the last step the course foresees.
   */
  #findTarget(pusherStep: number): number {
    const last: number = Math.min(Math.floor(pusherStep) + 1, this.#horizon);
    if (this.#progress >= last) {
      return this.#progress;
    }
    const start: number = Math.min(
      Math.max(pusherStep, this.#progress),
      last,
    );
    const step: number = Math.floor(start);
    const share: number = findClearShare(
      this.#findPlace(step),
      this.#findPlace(step + 1),
      this.#pusher.locate(pusherStep),
      this.#pusher.reach,
      start - step,
    );
    return step + share;
  }

  /**
   * Moves the player drawn along the course toward a point on it, by no
   * more than a distance.
   *
   * @param {number} target - How far along the point is, in steps.
   * @param {number} budget - The distance, in meters.
   */
  #moveToward(target: number, budget: number): void {
    let left: number = budget;
    while (this.#progress < target) {
      const step: number = Math.floor(this.#progress);
      const from: GroundVector = this.#findPlace(step);
      const to: GroundVector = this.#findPlace(step + 1);
      const end: number = Math.min(target, step + 1);
      const length: number = Math.hypot(to.x - from.x, to.z - from.z);
      const need: number = (end - this.#progress) * length;
      if (need > left) {
        this.#progress += left / length;
        return;
      }
      left -= need;
      this.#progress = end;
    }
  }

  /**
   * Finds the point a way along the course.
   *
   * @param {number} progress - How far along, in steps.
   * @returns {GroundVector} The point: the place after a step itself, if it
   *   falls on one, or the point that far between two.
   */
  #findPoint(progress: number): GroundVector {
    const step: number = Math.floor(progress);
    const share: number = progress - step;
    const from: GroundVector = this.#findPlace(step);
    if (share === 0) {
      return from;
    }
    const to: GroundVector = this.#findPlace(step + 1);
    return {
      x: from.x + (to.x - from.x) * share,
      z: from.z + (to.z - from.z) * share,
    };
  }

  /**
   * Finds where the server has the player after a step, as long as it
   * rests, as far as the course foresees.
   *
   * @param {number} step - The number of the step, no earlier than the
   *   first step whose place the course still keeps.
   * @returns {GroundVector} The place after the step, or after the last
   *   step the course foresees, {@link FORECAST_HORIZON} after the step the
   *   server last told of, for a later step.
   */
  #findPlace(step: number): GroundVector {
    const index: number = Math.min(step, this.#horizon) - this.#first;
    let place: GroundVector | undefined = this.#places[index];
    while (place === undefined) {
      const last: number = this.#places.length - 1;
      const next: number = this.#first + this.#places.length;
      const from: GroundVector | undefined = this.#places[last];
      if (from === undefined) {
        throw new Error('A course keeps at least one place.');
      }
      this.#places.push(
        this.#pusher.pushAside(from, this.#pusher.locate(next), this.#terrain),
      );
      place = this.#places[index];
    }
    return place;
  }
}

/**
 * Finds the first point from a share of the way between two places onward
 * that is clear of a villager who pushes the players aside.
 *
 * @param {GroundVector} from - The place the way starts at.
 * @param {GroundVector} to - The place it ends at.
 * @param {GroundVector} at - Where the villager is.
 * @param {number} reach - The least distance between the centers of the
 *   villager and a player, in meters.
 * @param {number} share - The share of the way to look from, from 0 to 1.
 * @returns {number} The share of the way to the first point no nearer the
 *   villager than a player may be, from the given one to 1, or 1 if there
 *   is none.
 */
function findClearShare(
  from: GroundVector,
  to: GroundVector,
  at: GroundVector,
  reach: number,
  share: number,
): number {
  const wayX: number = to.x - from.x;
  const wayZ: number = to.z - from.z;
  const apartX: number = from.x + wayX * share - at.x;
  const apartZ: number = from.z + wayZ * share - at.z;
  const least: number = reach - OVERLAP_TOLERANCE;
  const a: number = wayX * wayX + wayZ * wayZ;
  if (apartX * apartX + apartZ * apartZ >= least * least || a === 0) {
    return share;
  }
  const b: number = 2 * (apartX * wayX + apartZ * wayZ);
  const c: number = apartX * apartX + apartZ * apartZ - reach * reach;
  const out: number = (-b + Math.sqrt(b * b - 4 * a * c)) / 2 / a;
  return Math.min(share + out, 1);
}

/**
 * A glide of the player of the page from where one thing drew it to where
 * another draws it, as the forecast hands over from one to the other.
 *
 * The player glides at an even pace from where it was drawn to where it is
 * to be drawn, which it reaches {@link SMOOTHING_DURATION} after the
 * handover, moving all the while as it is to be drawn as well, but never
 * beyond both: as where it is to be drawn moves toward where it was drawn,
 * it glides no farther that way than where it was drawn, and once where it
 * is to be drawn passes that, it is drawn there.  A handover that comes as
 * it glides takes it on from where it is drawn then.  It is drawn where it
 * is to be drawn at once when the handover is told to be drawn so, when it
 * moves the player {@link SMOOTHING_LIMIT} or farther, and while the owner
 * has it shown without prediction.
 */
class HandoverGlide {
  readonly #prediction: Readonly<PredictionSettings>;
  #offsetX = 0;
  #offsetZ = 0;
  #fromX = 0;
  #fromZ = 0;
  #startTime = 0;

  /**
   * Starts with nothing to glide over.
   *
   * @param {Readonly<PredictionSettings>} prediction - How the owner has the
   *   player of the page shown, as set at any time.
   */
  constructor(prediction: Readonly<PredictionSettings>) {
    this.#prediction = prediction;
  }

  /**
   * Takes note of a handover.
   *
   * @param {PlayerMotion} before - The player as it was to be drawn before
   *   the handover, without this glide.
   * @param {PlayerMotion} after - The player as it was to be drawn at the
   *   same time by what draws it after the handover.
   * @param {number} time - The time on the clock of the page the glide
   *   starts at, in milliseconds, which is no earlier than any time told
   *   before.
   * @param {boolean} isAtOnce - Whether the handover is to be drawn at
   *   once, however far it moves the player.
   */
  notice(
    before: PlayerMotion,
    after: PlayerMotion,
    time: number,
    isAtOnce: boolean,
  ): void {
    const left: GroundVector = this.#findLeft(before, time);
    const offsetX: number = before.x - after.x + left.x;
    const offsetZ: number = before.z - after.z + left.z;
    const isJump: boolean =
      isAtOnce || Math.hypot(offsetX, offsetZ) >= SMOOTHING_LIMIT;
    this.#offsetX = isJump ? 0 : offsetX;
    this.#offsetZ = isJump ? 0 : offsetZ;
    this.#fromX = after.x;
    this.#fromZ = after.z;
    this.#startTime = time;
  }

  /**
   * Tells the player as it is to be drawn at a time.
   *
   * @param {PlayerMotion} motion - The player as it is to be drawn then,
   *   without this glide.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   * @returns {PlayerMotion} The player as it is to be drawn: the very motion
   *   given, unless it glides then.
   */
  readDrawn(motion: PlayerMotion, time: number): PlayerMotion {
    if (!this.#prediction.isEnabled) {
      this.#offsetX = 0;
      this.#offsetZ = 0;
    }
    const left: GroundVector = this.#findLeft(motion, time);
    if (left.x === 0 && left.z === 0) {
      return motion;
    }
    return { ...motion, x: motion.x + left.x, z: motion.z + left.z };
  }

  /**
   * Finds how far from a place the player is drawn at a time, as it glides.
   *
   * @param {GroundVector} place - Where it is to be drawn then, without this
   *   glide.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds.
   * @returns {GroundVector} How far from the place it is drawn, in meters
   *   along each axis: none once the glide is over, or when there is
   *   nothing to glide over.
   */
  #findLeft(place: GroundVector, time: number): GroundVector {
    const length: number = Math.hypot(this.#offsetX, this.#offsetZ);
    const elapsed: number = time - this.#startTime;
    const share: number = Math.max(1 - elapsed / SMOOTHING_DURATION, 0);
    if (length === 0 || share === 0) {
      return { x: 0, z: 0 };
    }
    const wayX: number = this.#offsetX / length;
    const wayZ: number = this.#offsetZ / length;
    const gained: number =
      (place.x - this.#fromX) * wayX + (place.z - this.#fromZ) * wayZ;
    const left: number = Math.min(share * length, Math.max(length - gained, 0));
    return { x: wayX * left, z: wayZ * left };
  }
}

/**
 * Tells whether two places are the very same.
 *
 * @param {GroundVector} a - One place.
 * @param {GroundVector} b - The other place.
 * @returns {boolean} Whether they are.
 */
function isSamePlace(a: GroundVector, b: GroundVector): boolean {
  return a.x === b.x && a.z === b.z;
}

/**
 * Draws the player of the page pushed out of the way of the pusher of its
 * map, the villager there who pushes the players aside, as
 * {@link findPusher} tells, as the pusher is drawn, while the player rests,
 * before the server tells of the push.
 *
 * The page leaves it to the server to push a player that rests, and learns
 * of each push only from a snapshot, while the pusher runs on as it is
 * drawn.  The forecast draws a player only while it rests, and only once a
 * snapshot has told the page so: from the place and the step the snapshot
 * tells, until the page moves the player on by a step of its own, the
 * server pushes it by the rule the page knows, with the pusher where its
 * course has it at each of its steps.  The forecast draws the player at the
 * places the server pushes it to as the pusher is drawn: between the place
 * after the step the pusher is drawn at and the place after the next, as
 * far toward the latter as it takes to keep clear of the pusher, but never
 * back along those places, and no faster than {@link PUSH_SPEED_RATIO}
 * times as fast as the pusher runs, setting out from where the snapshot has
 * it.  A snapshot that tells of a push the forecast foresaw leaves the
 * player drawn where it was.  A resting player the pusher does not push is
 * drawn just as without the forecast.
 *
 * So, while the player rests, it is drawn only at places the server has it
 * at, or between two it has it at one step after the other, at a step no
 * later than the one after the step the pusher is drawn at, and it never
 * moves back toward the run of the pusher but as the server moves it.  It
 * reaches into the pusher only for the first few frames the pusher touches
 * it, as the pusher pushes it faster than the forecast draws it, and where
 * the server itself leaves it reaching into the pusher, by a wall or the
 * fence.
 *
 * As the player sets off, starts to interact or dies, or as the owner
 * switches the forecast or the smoothing of the corrections off, the
 * forecast hands over: the player glides once from where it was drawn to
 * where it is drawn without the forecast, which it reaches
 * {@link SMOOTHING_DURATION} later, never going beyond both, and it is drawn
 * just as without the forecast from then on, until it rests again and a
 * snapshot tells so.  A snapshot that tells of the player resting elsewhere
 * than the forecast foresaw hands over likewise, from where it was drawn to
 * where the snapshot has it.  A handover is drawn as a jump when it moves
 * the player {@link SMOOTHING_LIMIT} or more, when the frame it comes at is
 * drawn more than a few frames' time after the one before, and when the
 * snapshot that tells of the player resting elsewhere shows it has done
 * something else since the frame before, such as dying and coming back to
 * life.  None is drawn while the owner has the player shown without
 * prediction, when it is drawn without the forecast.
 *
 * While the server stays silent, the forecast foresees the pushes for
 * {@link FORECAST_HORIZON} after the step it last told of, and holds the
 * player where it has it then.
 *
 * What the forecast gives up: the prediction knows nothing of the pushes
 * the forecast has drawn until a snapshot tells of them, so a player that
 * sets off drawn pushed glides back toward where the prediction has it, and
 * the push of the server then shows as a correction, as without the
 * forecast.  A player that has just stopped is drawn as without the
 * forecast, reaching into the pusher if it runs into the player, until a
 * snapshot tells the page that it rests.  The forecast cannot foresee what
 * only the server does: a player killed as it is pushed may have been drawn
 * pushed farther than the server pushed it, and glides back to where it
 * lies.  A player the owner switches the forecast off and on again for as
 * the pusher pushes it glides back to where it is drawn without the
 * forecast, and out again.  While the step the pusher is drawn at lags
 * behind that of the server, as its drawn clock catches up at a tenth of
 * its pace after the latency falls sharply, a player the snapshots already
 * tell pushed is still drawn where it was until the drawn pusher reaches
 * it: with Toby, up to about a second after a fall from 1000 ms to none,
 * 0.3 s after one from 300 ms to 20 ms, and up to 0.39 m away.  And as
 * nothing is judged from where the player is drawn, the
 * prompts for what it can interact with go by where it is not yet pushed
 * for longer than without the forecast.
 *
 * Only where the player is drawn changes: it faces the way it truly faces,
 * doing what it truly does, and nothing it does is judged from where it is
 * drawn.
 */
export class PushForecast {
  readonly #settings: Readonly<PushForecastSettings>;
  readonly #smoothing: Readonly<SmoothingSettings>;
  readonly #prediction: Readonly<PredictionSettings>;
  readonly #handover: HandoverGlide;
  #course: PushCourse | null = null;
  #isDrawing = false;
  #lastSmoothed: PlayerMotion | null = null;
  #lastForeseen: PlayerMotion | null = null;
  #lastTime: number | null = null;

  /**
   * Starts with nothing foreseen.
   *
   * @param {Readonly<PushForecastSettings>} settings - Whether the owner has
   *   the pushes foreseen, as set at any time.
   * @param {Readonly<SmoothingSettings>} smoothing - How the owner has the
   *   corrections of the player of the page drawn, as set at any time.
   * @param {Readonly<PredictionSettings>} prediction - How the owner has the
   *   player of the page shown, as set at any time.
   */
  constructor(
    settings: Readonly<PushForecastSettings>,
    smoothing: Readonly<SmoothingSettings>,
    prediction: Readonly<PredictionSettings>,
  ) {
    this.#settings = settings;
    this.#smoothing = smoothing;
    this.#prediction = prediction;
    this.#handover = new HandoverGlide(prediction);
  }

  /**
   * Moves the forecast on to a frame, and tells the player as it is to be
   * drawn in it.  It is to be told of every frame, and only once.
   *
   * @param {PlayerPrediction} prediction - The prediction of the player,
   *   brought up to the time of the frame.
   * @param {CorrectionSmoothing} smoothing - The smoothing of its
   *   corrections, which this tells of the frame as well.
   * @param {number} time - The time of the frame on the clock of the page,
   *   in milliseconds, which is no earlier than any time told before.
   * @param {MapId} map - The map the player is drawn in, which tells the
   *   villager who pushes the players aside there, if any, as
   *   {@link findPusher} tells.
   * @param {number | null} shownStep - The step of the server the villagers
   *   are drawn at in the frame, which may fall between two, or `null` if
   *   they are not drawn.
   * @returns {PlayerMotion} The player as it is to be drawn: as the
   *   smoothing draws it, unless the forecast draws it elsewhere.
   */
  advance(
    prediction: PlayerPrediction,
    smoothing: CorrectionSmoothing,
    time: number,
    map: MapId,
    shownStep: number | null,
  ): PlayerMotion {
    const truth: PlayerMotion = prediction.readDrawn(time);
    const smoothed: PlayerMotion = smoothing.readDrawn(truth, time);
    const isNewCourse: boolean = this.#followCourse(
      prediction,
      map,
      shownStep,
    );
    const foreseen: PlayerMotion | null = this.#foresee(
      prediction,
      truth,
      time,
      shownStep,
    );
    const lastSmoothed: PlayerMotion | null = this.#lastSmoothed;
    const lastForeseen: PlayerMotion | null = this.#lastForeseen;
    const isDrawing: boolean = this.#decideDrawing(foreseen, smoothed, truth);
    // A change of what draws the player is measured at the frame before,
    // where both were drawn, and glided over from this one on, unless the
    // frame comes long after that one.
    const isPause: boolean =
      this.#lastTime !== null && time - this.#lastTime > PAUSE_LIMIT;
    if (lastSmoothed !== null) {
      if (isDrawing && !this.#isDrawing && foreseen !== null) {
        const after: PlayerMotion =
          isNewCourse || lastForeseen === null ? foreseen : lastForeseen;
        this.#handover.notice(lastSmoothed, after, time, isPause);
      } else if (!isDrawing && this.#isDrawing) {
        const before: PlayerMotion = lastForeseen ?? lastSmoothed;
        this.#handover.notice(before, lastSmoothed, time, isPause);
      } else if (isDrawing && isNewCourse && foreseen !== null) {
        const before: PlayerMotion = lastForeseen ?? lastSmoothed;
        // Resting at both frames, it did something else in between unseen,
        // such as dying and coming back to life, if its action changed.
        const isUnseen: boolean = before.actionCount !== foreseen.actionCount;
        this.#handover.notice(before, foreseen, time, isPause || isUnseen);
      }
    }
    this.#lastTime = time;
    this.#isDrawing = isDrawing;
    this.#lastSmoothed = smoothed;
    this.#lastForeseen = foreseen;
    const target: PlayerMotion =
      isDrawing && foreseen !== null ? foreseen : smoothed;
    return this.#handover.readDrawn(target, time);
  }

  /**
   * Tells where the course of the pushes has the player at a frame.
   *
   * @param {PlayerPrediction} prediction - The prediction of the player.
   * @param {PlayerMotion} truth - The player as the prediction draws it in
   *   the frame.
   * @param {number} time - The time of the frame on the clock of the page,
   *   in milliseconds.
   * @param {number | null} shownStep - The step of the server the villagers
   *   are drawn at in the frame, or `null` if they are not drawn.
   * @returns {PlayerMotion | null} The player as the course has it, which is
   *   the truth itself where the course puts it where the prediction does,
   *   or `null` if there is no course to follow or no villager drawn.
   */
  #foresee(
    prediction: PlayerPrediction,
    truth: PlayerMotion,
    time: number,
    shownStep: number | null,
  ): PlayerMotion | null {
    if (this.#course === null || shownStep === null) {
      return null;
    }
    const place: GroundVector = this.#course.advance(shownStep, time);
    const { motion } = prediction;
    return isSamePlace(place, motion)
      ? truth
      : {
          ...truth,
          x: place.x + (truth.x - motion.x),
          z: place.z + (truth.z - motion.z),
        };
  }

  /**
   * Tells whether the forecast, rather than the smoothing, draws the player
   * in a frame.  Once drawing, it keeps drawing until both draw the player
   * at the same place at the frame before and this one; until then, it
   * draws only where the course has the player elsewhere than the truth.
   *
   * @param {PlayerMotion | null} foreseen - The player as the course has it
   *   in the frame, or `null` if there is none.
   * @param {PlayerMotion} smoothed - The player as the smoothing draws it in
   *   the frame.
   * @param {PlayerMotion} truth - The player as the prediction draws it in
   *   the frame.
   * @returns {boolean} Whether the forecast draws the player.
   */
  #decideDrawing(
    foreseen: PlayerMotion | null,
    smoothed: PlayerMotion,
    truth: PlayerMotion,
  ): boolean {
    if (foreseen === null) {
      return false;
    }
    if (!this.#isDrawing) {
      return foreseen !== truth;
    }
    return (
      this.#lastForeseen === null ||
      this.#lastSmoothed === null ||
      !isSamePlace(this.#lastForeseen, this.#lastSmoothed) ||
      !isSamePlace(foreseen, smoothed)
    );
  }

  /**
   * Keeps the course of the pushes on the player as the server last told of
   * it, if it rests in a map with a villager who pushes the players aside,
   * and the owner has the pushes foreseen.
   *
   * @param {PlayerPrediction} prediction - The prediction of the player.
   * @param {MapId} map - The map the player is drawn in.
   * @param {number | null} shownStep - The step of the server the villagers
   *   are drawn at, or `null` if they are not drawn.
   * @returns {boolean} Whether the course starts afresh at this frame.
   */
  #followCourse(
    prediction: PlayerPrediction,
    map: MapId,
    shownStep: number | null,
  ): boolean {
    const step: number | null = prediction.toldStep;
    const { motion } = prediction;
    const pusher: Pusher | null = findPusher(map);
    if (
      !this.#settings.isEnabled ||
      !this.#smoothing.isEnabled ||
      !this.#prediction.isEnabled ||
      pusher === null ||
      shownStep === null ||
      step === null ||
      !isResting(motion)
    ) {
      this.#course = null;
      return false;
    }
    if (this.#course?.isFollowedBy(step, motion) === true) {
      this.#course.forgetBefore(step);
      return false;
    }
    this.#course = new PushCourse(
      step,
      motion,
      pusher,
      WORLD_MAPS[map].terrain,
    );
    return true;
  }
}
