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
 * @module client/trailing-camera Turning the camera softly around behind the
 *   way the player it follows goes.
 */

import { WALK_SPEED, findYaw } from '@clovervale/shared';
import type { GroundVector } from '@clovervale/shared';

/** How the owner has the camera turn after the player it follows. */
export interface TrailingCameraSettings {
  /**
   * Whether the camera comes around behind the way the player goes, rather
   * than keeping its heading.
   */
  isEnabled: boolean;
  /** The fastest the camera turns, in degrees per second. */
  turnRate: number;
  /**
   * How far the way the player goes may be from the way the camera looks
   * before the camera starts to turn, in degrees.
   */
  deadZone: number;
  /**
   * How long the camera takes to get from standing to its fastest turn, and
   * back, in seconds.
   */
  easeTime: number;
  /**
   * How far the way the player goes may be from the way the camera looks
   * for the camera to turn after it at all, in degrees.  The camera turns
   * ever more weakly as the way the player goes nears this angle.
   */
  angleLimit: number;
  /**
   * How long the player has to go a way the camera may turn after, with
   * the camera left alone, before the camera starts to turn, in seconds.
   */
  delay: number;
}

/** How the panel has the camera turn at first: gently. */
export const DEFAULT_TRAILING_CAMERA: Readonly<TrailingCameraSettings> = {
  isEnabled: true,
  turnRate: 30,
  deadZone: 15,
  easeTime: 1,
  angleLimit: 90,
  delay: 1.5,
};

/** The fastest turning rate the owner can set, in degrees per second. */
export const MAX_TURN_RATE = 120;
/** The widest dead zone the owner can set, in degrees. */
export const MAX_DEAD_ZONE = 60;
/** The longest easing time the owner can set, in seconds. */
export const MAX_EASE_TIME = 3;
/**
 * The widest angle limit the owner can set, in degrees: the camera never
 * turns after a player that goes sideways or toward it.
 */
export const MAX_ANGLE_LIMIT = 90;
/** The longest delay the owner can set, in seconds. */
export const MAX_RECENTER_DELAY = 5;

/**
 * How long the speed the player goes at takes to show in the travel the
 * camera follows, in seconds, so that a player shown snapshot by snapshot
 * does not seem to stop between them.
 */
const TRAVEL_SMOOTHING = 0.2;
/** The least speed at which the player counts as going somewhere, in m/s. */
const MIN_TRAVEL_SPEED: number = WALK_SPEED / 3;
/**
 * The farthest the player may move from one frame to the next for that to
 * count as travel rather than a jump, in meters.
 */
const JUMP_DISTANCE = 1;
/**
 * The span of angles below the angle limit over which the turn of the
 * camera fades out, in degrees.
 */
const FADE_SPAN = 30;

/**
 * The heading of the camera as it trails behind the player it follows, like
 * a balloon pulled along on a string.
 *
 * Once the player has gone forward or diagonally forward, as the camera
 * sees it, for the delay, with the camera left alone, the camera turns
 * toward looking the way the player goes, if that is beyond the dead zone,
 * easing in and out of a turn no faster than the turning rate, and without
 * overshooting.  It turns ever more weakly as the way the player goes nears
 * the angle limit, and not at all from there on, so a player that goes
 * sideways or toward the camera does not turn it.  While the player stands
 * still, or the owner handles the camera, it does not start to turn, and
 * the delay starts again.
 */
export class TrailingCamera {
  #focus: GroundVector | null = null;
  #travel: GroundVector = { x: 0, z: 0 };
  #rate = 0;
  #isChasing = false;
  #waited = 0;

  /**
   * Turns the camera after the player it follows, for one frame.
   *
   * @param {number} heading - The way the camera looks along the ground
   *   now, as the turn around the Y axis from +Z toward +X, in degrees.
   * @param {GroundVector} focus - Where the player the camera follows is
   *   shown in this frame.
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {Readonly<TrailingCameraSettings>} settings - How the owner has
   *   the camera turn.
   * @param {boolean} isTouched - Whether the owner has handled the camera
   *   in or since the last frame, which eases any turn out at once.
   * @returns {number} The way the camera is to look after the frame, in
   *   degrees, above -180 and up to 180, or exactly the heading told if the
   *   camera does not turn, as always when the trailing camera is switched
   *   off.
   */
  steer(
    heading: number,
    focus: GroundVector,
    seconds: number,
    settings: Readonly<TrailingCameraSettings>,
    isTouched: boolean,
  ): number {
    if (!settings.isEnabled) {
      this.stop();
      return heading;
    }
    const last: GroundVector | null = this.#focus;
    this.#focus = focus;
    if (last === null || !(seconds > 0)) {
      return heading;
    }
    this.#trackTravel(last, focus, seconds);
    const speed: number = Math.hypot(this.#travel.x, this.#travel.z);
    const isMoving: boolean = speed >= MIN_TRAVEL_SPEED;
    const offset: number = isMoving
      ? wrapAngle(findYaw(this.#travel) - heading)
      : 0;
    const distance: number = Math.abs(offset);
    const isQualified: boolean =
      isMoving && !isTouched && distance < settings.angleLimit;
    if (!isQualified) {
      this.#waited = 0;
      this.#isChasing = false;
    } else {
      this.#waited += seconds;
      if (this.#waited >= settings.delay && distance > settings.deadZone) {
        this.#isChasing = true;
      }
    }
    const fastest: number = settings.turnRate;
    const acceleration: number =
      settings.easeTime > 0 ? fastest / settings.easeTime : Infinity;
    // The fastest turn that can still stop where the player goes.
    const stopping: number = Math.sqrt(2 * acceleration * distance);
    const isChasing: boolean = this.#isChasing && distance > 0;
    const wanted: number = isChasing
      ? Math.sign(offset) *
        Math.min(fastest * findTurnScale(distance, settings), stopping)
      : 0;
    const change: number = acceleration * seconds;
    let rate: number = Math.min(
      Math.max(wanted, this.#rate - change),
      this.#rate + change,
    );
    if (isChasing && Math.sign(rate) === Math.sign(offset)) {
      rate = Math.sign(rate) * Math.min(Math.abs(rate), stopping);
    }
    rate = Math.min(Math.max(rate, -fastest), fastest);
    let turn: number = rate * seconds;
    if (
      isChasing &&
      Math.sign(turn) === Math.sign(offset) &&
      Math.abs(turn) >= distance
    ) {
      turn = offset;
      rate = 0;
      this.#isChasing = false;
    }
    this.#rate = rate;
    return turn === 0 ? heading : wrapAngle(heading + turn);
  }

  /**
   * Forgets the travel of the player and any turn, so that the camera
   * starts afresh from the next frame it is steered.
   */
  stop(): void {
    this.#focus = null;
    this.#travel = { x: 0, z: 0 };
    this.#rate = 0;
    this.#isChasing = false;
    this.#waited = 0;
  }

  /**
   * Notes how the player the camera follows moved over one frame.
   *
   * @param {GroundVector} last - Where it was shown in the last frame.
   * @param {GroundVector} focus - Where it is shown in this frame.
   * @param {number} seconds - The time between the two frames, in seconds.
   */
  #trackTravel(last: GroundVector, focus: GroundVector, seconds: number): void {
    const dx: number = focus.x - last.x;
    const dz: number = focus.z - last.z;
    if (Math.hypot(dx, dz) > JUMP_DISTANCE) {
      this.#travel = { x: 0, z: 0 };
      return;
    }
    const weight: number = 1 - Math.exp(-seconds / TRAVEL_SMOOTHING);
    this.#travel = {
      x: this.#travel.x + (dx / seconds - this.#travel.x) * weight,
      z: this.#travel.z + (dz / seconds - this.#travel.z) * weight,
    };
  }
}

/**
 * Finds the share of the fastest turn the camera may turn at, by how far
 * the way the player goes is from the way the camera looks.
 *
 * @param {number} distance - How far the way the player goes is from the
 *   way the camera looks, from 0 degrees up to the angle limit.
 * @param {Readonly<TrailingCameraSettings>} settings - How the owner has
 *   the camera turn.
 * @returns {number} The share: 1 up to {@link FADE_SPAN} degrees below the
 *   angle limit, easing down to 0 at the angle limit.
 */
function findTurnScale(
  distance: number,
  settings: Readonly<TrailingCameraSettings>,
): number {
  const limit: number = settings.angleLimit;
  const fade: number = Math.max(limit - FADE_SPAN, 0);
  if (distance <= fade) {
    return 1;
  }
  const share: number = (limit - distance) / (limit - fade);
  return share * share * (3 - 2 * share);
}

/**
 * Wraps an angle into a single turn.
 *
 * @param {number} angle - The angle, in degrees.
 * @returns {number} The same angle, above -180 and up to 180 degrees.
 */
function wrapAngle(angle: number): number {
  const wrapped: number = ((angle % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}
