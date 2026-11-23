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
 * @module client/gamepad-device The gamepads, as a device to play with.
 */

import type { GroundVector } from '@clovervale/shared';

import type { CameraTurn } from './camera-keys.ts';
import { Gamepads, findPadKey } from './gamepad.ts';
import type { PadState } from './gamepad.ts';
import type { CommandTarget, InputDevice } from './input-device.ts';
import { orientWalk } from './player-input.ts';

/**
 * The gamepads connected to the browser, as {@link Gamepads} tells: each
 * button pressed gives the command of the key it acts as, as
 * {@link findPadKey} tells, unless a line is being typed, which no gamepad
 * types in.  The gamepads walk, turn and zoom only while nothing is open
 * on the page.  Nothing is read until the browser tells of a gamepad
 * connected.
 */
export class GamepadDevice implements InputDevice {
  /** The gamepads connected, as last read. */
  readonly #pads = new Gamepads();
  /** Lets the music play, as a press of a gamepad lets the page. */
  readonly #allowMusic: () => void;
  /**
   * Whether the browser has told of a gamepad connected, before which the
   * gamepads are not read at all.
   */
  #isConnected = false;

  /**
   * Starts before any gamepad is connected.
   *
   * @param {() => void} allowMusic - Lets the music play, as a press of a
   *   gamepad lets the page.
   */
  constructor(allowMusic: () => void) {
    this.#allowMusic = allowMusic;
  }

  /**
   * Tells whether the owner holds the camera with a gamepad now, as
   * {@link Gamepads.isHeld} tells.
   *
   * @returns {boolean} Whether it does.
   */
  get isHeld(): boolean {
    return this.#pads.isHeld;
  }

  /**
   * Resolves how far the right sticks turn the camera over some time, as
   * {@link Gamepads.resolveTurn} tells.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {CameraTurn} The turn.
   */
  resolveTurn(seconds: number): CameraTurn {
    return this.#pads.resolveTurn(seconds);
  }

  /**
   * Starts listening for a gamepad connected.
   *
   * @param {Window} window - The window of the page.
   */
  listen(window: Window): void {
    window.addEventListener('gamepadconnected', () => {
      this.#isConnected = true;
    });
  }

  /**
   * Reads the gamepads connected, and gives the target the commands of the
   * buttons pressed on them.  A browser may let the page make sound after a
   * gamepad is pressed, as after a key, which the music is then let to.
   *
   * @param {number} seconds - The time since they were last read, in
   *   seconds.
   * @param {CommandTarget} target - What the commands are given to.
   * @returns {number} How far the shoulder buttons zoom, as
   *   {@link Gamepads.resolveZoom} tells, or 1 before a gamepad is
   *   connected.
   */
  read(seconds: number, target: CommandTarget): number {
    if (!this.#isConnected) {
      return 1;
    }
    const states: readonly (PadState | null)[] = navigator.getGamepads();
    for (const button of this.#pads.readPads(states, seconds)) {
      const code: string | null = findPadKey(button, target.findScreen());
      if (code !== null && !target.isTyping()) {
        target.carryOut({ code, isRepeat: false, source: 'gamepad' });
      }
    }
    // A browser that does not let the page make sound refuses it harmlessly.
    if (this.#pads.isNudged) {
      this.#allowMusic();
    }
    this.#pads.isPaused = target.isPlayHeld();
    return this.#pads.resolveZoom(seconds);
  }

  /**
   * Resolves the direction the left sticks walk the player in.
   *
   * @param {number} heading - The way the camera looks along the ground, in
   *   degrees.
   * @returns {GroundVector} The direction.
   */
  resolveDirection(heading: number): GroundVector {
    const { ahead, aside } = this.#pads.resolveWalk();
    return orientWalk(ahead, aside, heading);
  }

  /**
   * Holds the sticks and the shoulder buttons from play, as something opens
   * over play; a left stick pushed then chooses nothing until it has come
   * back to the centre.
   */
  holdPlay(): void {
    this.#pads.isPaused = true;
    this.#pads.holdStickChoice();
  }

  /** Lets go of nothing: the gamepads are read afresh at every frame. */
  releaseAll(): void {
    // The gamepads hold nothing between their reads.
  }
}
