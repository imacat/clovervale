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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/touch-controls Turning the fingers on the screen of a
 *   touch device into what the person at the page wants.
 */

import type { GroundVector } from '@clovervale/shared';

import { CAMERA_ORBIT_RATE, CAMERA_TILT_RATE } from './camera-keys.ts';
import type { CameraTurn } from './camera-keys.ts';
import { resolveStickWalk, scaleStick } from './gamepad.ts';
import type { PadWalk } from './gamepad.ts';
import type { CommandTarget, InputDevice } from './input-device.ts';
import { orientWalk } from './player-input.ts';

/**
 * How far a finger is to be dragged on the scene to turn the view at its
 * fastest, as fast as the arrow keys, in CSS pixels.
 */
export const TURN_REACH = 80;
/**
 * How far a finger is to be dragged on the scene before it turns the view,
 * in CSS pixels.
 */
export const TURN_DEAD_DISTANCE = 12;
/**
 * The least distance between two fingers that pinch, in CSS pixels, below
 * which a pinch zooms no further.
 */
const LEAST_PINCH = 8;

/** Where the stick stands on the page. */
export interface StickPlace {
  /** The middle of its base, from the left of the page, in CSS pixels. */
  readonly x: number;
  /** The middle of its base, from the top of the page, in CSS pixels. */
  readonly y: number;
  /** The radius of its base, in CSS pixels. */
  readonly radius: number;
}

/** How far the knob of the stick is pushed. */
export interface StickPush {
  /** To the right positive, as a share of the radius of the base. */
  readonly x: number;
  /** Downward positive, as a share of the radius of the base. */
  readonly y: number;
}

/** A point on the page, in CSS pixels. */
interface Point {
  /** From the left of the page. */
  readonly x: number;
  /** From the top of the page. */
  readonly y: number;
}

/** A finger on the scene. */
interface ViewFinger {
  /** Where it turns the view from. */
  origin: Point;
  /** Where it is now. */
  at: Point;
}

/** No walk. */
const STANDING: PadWalk = { ahead: 0, aside: 0 };

/** No turn. */
const NO_TURN: CameraTurn = { orbit: 0, tilt: 0 };

/** No push of the stick. */
const NO_PUSH: StickPush = { x: 0, y: 0 };

/**
 * Tells whether the page is used by touch, as the latest pointer pressed
 * tells: a touch tells it is, a mouse that it is not, and a pen or
 * anything else leaves it as it was.
 *
 * @param {boolean} isTouch - Whether the page was used by touch.
 * @param {string} type - The type of the pointer, as in a pointer event.
 * @returns {boolean} Whether the page is used by touch now.
 */
export function noticePointerType(isTouch: boolean, type: string): boolean {
  if (type === 'touch') {
    return true;
  }
  return type === 'mouse' ? false : isTouch;
}

/**
 * The fingers on the screen of a touch device: one on the stick walks the
 * player in the eight directions of the walking keys, as the left stick of
 * a gamepad does; one dragged elsewhere on the scene turns the view as the
 * right stick does, toward where it is dragged from where it was pressed,
 * the faster the farther, at most as fast as the arrow keys; and two there
 * pinch to zoom, in as they spread and out as they close, without turning.
 * Once one of two lifts, the other turns the view afresh from where it is.
 * The stick and the scene each take their fingers apart, so that one
 * finger walks while another turns.  While paused, the fingers do nothing,
 * and no new one is taken.  The action button gives the command of the
 * space bar, in play alone.
 */
export class TouchControls implements InputDevice {
  /**
   * Whether the fingers are held from play, as while the bag, the help
   * sheet or a dialogue is open.
   */
  isPaused = false;
  /** The finger on the stick, where it is, and where the stick is. */
  #stick: { id: number; at: Point; place: StickPlace } | null = null;
  /** The fingers on the scene, by their pointers, at most two. */
  readonly #views = new Map<number, ViewFinger>();
  /** How many times farther the pinches since last taken zoom. */
  #zoom = 1;

  /**
   * Tells whether the owner holds the camera with the fingers now.
   *
   * @returns {boolean} Whether a finger is on the scene, while not paused.
   */
  get isHeld(): boolean {
    return !this.isPaused && this.#views.size > 0;
  }

  /**
   * Tells how far the knob of the stick is pushed, for drawing it.
   *
   * @returns {StickPush} The push, within the base.
   */
  get stickPush(): StickPush {
    const stick = this.#stick;
    if (stick === null) {
      return NO_PUSH;
    }
    const x: number = (stick.at.x - stick.place.x) / stick.place.radius;
    const y: number = (stick.at.y - stick.place.y) / stick.place.radius;
    const length: number = Math.hypot(x, y);
    const scale: number = length > 1 ? 1 / length : 1;
    // Adding zero turns a negative zero into a plain one.
    return { x: x * scale + 0, y: y * scale + 0 };
  }

  /**
   * Tells whether a pointer is a finger the controls have taken.
   *
   * @param {number} id - The identifier of the pointer.
   * @returns {boolean} Whether it is.
   */
  hasPointer(id: number): boolean {
    return this.#stick?.id === id || this.#views.has(id);
  }

  /**
   * Takes a finger pressed on the stick, unless another is on it already.
   *
   * @param {number} id - The identifier of the pointer.
   * @param {number} x - Where it is pressed, from the left of the page.
   * @param {number} y - Where it is pressed, from the top of the page.
   * @param {StickPlace} place - Where the stick stands.
   * @returns {boolean} Whether the finger was taken.
   */
  pressStick(id: number, x: number, y: number, place: StickPlace): boolean {
    if (this.isPaused || this.#stick !== null || this.hasPointer(id)) {
      return false;
    }
    this.#stick = { id, at: { x, y }, place };
    return true;
  }

  /**
   * Takes a finger pressed on the scene, unless two are on it already.
   *
   * @param {number} id - The identifier of the pointer.
   * @param {number} x - Where it is pressed, from the left of the page.
   * @param {number} y - Where it is pressed, from the top of the page.
   * @returns {boolean} Whether the finger was taken.
   */
  pressView(id: number, x: number, y: number): boolean {
    if (this.isPaused || this.#views.size >= 2 || this.hasPointer(id)) {
      return false;
    }
    this.#views.set(id, { origin: { x, y }, at: { x, y } });
    return true;
  }

  /**
   * Notes that a finger has moved; one not taken is left alone.
   *
   * @param {number} id - The identifier of the pointer.
   * @param {number} x - Where it is now, from the left of the page.
   * @param {number} y - Where it is now, from the top of the page.
   */
  movePointer(id: number, x: number, y: number): void {
    if (this.#stick?.id === id) {
      this.#stick.at = { x, y };
      return;
    }
    const finger: ViewFinger | undefined = this.#views.get(id);
    if (finger === undefined) {
      return;
    }
    const before: number | null = this.#measurePinch();
    finger.at = { x, y };
    const after: number | null = this.#measurePinch();
    if (before !== null && after !== null && !this.isPaused) {
      this.#zoom *= before / after;
    }
  }

  /**
   * Notes that a finger has been lifted.
   *
   * @param {number} id - The identifier of the pointer.
   */
  releasePointer(id: number): void {
    if (this.#stick?.id === id) {
      this.#stick = null;
      return;
    }
    if (!this.#views.delete(id)) {
      return;
    }
    for (const finger of this.#views.values()) {
      finger.origin = finger.at;
    }
  }

  /** Listens to nothing: what shows the controls passes the fingers on. */
  listen(): void {
    // The view of the touch controls passes the fingers on.
  }

  /**
   * Reads the fingers at a frame: they walk, turn and zoom only while play
   * is not held, as the gamepads do.
   *
   * @param {number} seconds - The time since they were last read, in
   *   seconds.
   * @param {CommandTarget} target - What is asked whether play is held.
   * @returns {number} How far the pinches since the last frame zoom, as
   *   {@link takeZoom} tells.
   */
  read(seconds: number, target: CommandTarget): number {
    this.isPaused = target.isPlayHeld();
    return this.takeZoom();
  }

  /**
   * Gives the command of the space bar, as the action button is pressed,
   * unless play is held.
   *
   * @param {CommandTarget} target - What the command is given to.
   */
  pressAction(target: CommandTarget): void {
    if (!target.isPlayHeld()) {
      target.carryOut({ code: 'Space', isRepeat: false, source: 'touch' });
    }
  }

  /**
   * Resolves the direction the stick walks the player in, as
   * {@link resolveWalk} tells.
   *
   * @param {number} heading - The way the camera looks along the ground, in
   *   degrees.
   * @returns {GroundVector} The direction.
   */
  resolveDirection(heading: number): GroundVector {
    const { ahead, aside } = this.resolveWalk();
    return orientWalk(ahead, aside, heading);
  }

  /** Lets go of every finger, as something opens over play. */
  holdPlay(): void {
    this.releaseAll();
  }

  /** Lets go of every finger, as if all were lifted. */
  releaseAll(): void {
    this.#stick = null;
    this.#views.clear();
    this.#zoom = 1;
  }

  /**
   * Resolves which way the stick walks the player.
   *
   * @returns {PadWalk} The walk, which is none while paused.
   */
  resolveWalk(): PadWalk {
    if (this.isPaused || this.#stick === null) {
      return STANDING;
    }
    const { x, y } = this.stickPush;
    return resolveStickWalk(x, y);
  }

  /**
   * Resolves how far the finger on the scene turns the camera over some
   * time.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {CameraTurn} The turn, which is none while paused or while
   *   two fingers pinch.
   */
  resolveTurn(seconds: number): CameraTurn {
    if (this.isPaused || this.#views.size !== 1) {
      return NO_TURN;
    }
    const [finger] = [...this.#views.values()];
    if (finger === undefined) {
      return NO_TURN;
    }
    const [x, y] = scaleStick(
      (finger.at.x - finger.origin.x) / TURN_REACH,
      (finger.at.y - finger.origin.y) / TURN_REACH,
      TURN_DEAD_DISTANCE / TURN_REACH,
    );
    // Adding zero turns a negative zero into a plain one.
    return {
      orbit: x * CAMERA_ORBIT_RATE * seconds + 0,
      tilt: y * CAMERA_TILT_RATE * seconds + 0,
    };
  }

  /**
   * Takes how far the pinches since this was last asked zoom.
   *
   * @returns {number} How many times farther the camera is to be from
   *   what it looks at: above 1 to zoom out, below 1 to zoom in, and 1
   *   while paused.
   */
  takeZoom(): number {
    const zoom: number = this.isPaused ? 1 : this.#zoom;
    this.#zoom = 1;
    return zoom;
  }

  /**
   * Measures how far apart two fingers on the scene are.
   *
   * @returns {number | null} The distance, at least {@link LEAST_PINCH},
   *   or `null` unless two fingers are on the scene.
   */
  #measurePinch(): number | null {
    const [first, second] = [...this.#views.values()];
    if (first === undefined || second === undefined) {
      return null;
    }
    const distance: number = Math.hypot(
      first.at.x - second.at.x,
      first.at.y - second.at.y,
    );
    return Math.max(distance, LEAST_PINCH);
  }
}
