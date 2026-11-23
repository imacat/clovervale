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
 * @module client/keyboard-device The keyboard, as a device to play with.
 */

import type { GroundVector } from '@clovervale/shared';

import { CameraKeys } from './camera-keys.ts';
import type { CameraTurn } from './camera-keys.ts';
import type {
  CommandOutcome,
  CommandTarget,
  InputDevice,
} from './input-device.ts';
import { MoveKeys } from './player-input.ts';

/**
 * The keyboard: each key pressed gives the command of its code, unless a
 * key that changes what it does is held with it; a walking key or an arrow
 * key that play takes walks the player or turns the camera as long as it
 * is held; and a plain Enter that nothing takes opens the box of the chat.
 * While a line is typed, every key is for the box, the browser and the
 * input method alone: the game neither acts on it nor keeps it from them.
 */
export class KeyboardDevice implements InputDevice {
  /** The arrow keys held down to turn the camera. */
  readonly #cameraKeys = new CameraKeys();
  /** The keys held down to walk the player. */
  readonly #moveKeys = new MoveKeys();

  /**
   * Tells whether the owner holds the camera with the keys now.
   *
   * @returns {boolean} Whether any arrow key is held down.
   */
  get isHeld(): boolean {
    return this.#cameraKeys.isHeld;
  }

  /**
   * Resolves how far the arrow keys held down turn the camera over some
   * time.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {CameraTurn} The turn.
   */
  resolveTurn(seconds: number): CameraTurn {
    return this.#cameraKeys.resolveTurn(seconds);
  }

  /**
   * Starts listening to the keys pressed and let go of.
   *
   * @param {Window} window - The window of the page.
   * @param {CommandTarget} target - What the commands are given to.
   */
  listen(window: Window, target: CommandTarget): void {
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      this.#pressKey(event, target);
    });
    window.addEventListener('keyup', (event: KeyboardEvent) => {
      if (target.isTyping()) {
        return;
      }
      this.#moveKeys.releaseKey(event.code);
      this.#cameraKeys.releaseKey(event.code);
      target.noticeWalk();
    });
  }

  /**
   * Reads nothing at a frame: the keys give their commands as they are
   * pressed.
   *
   * @returns {number} 1, as the keys do not zoom.
   */
  read(): number {
    return 1;
  }

  /**
   * Resolves the direction the walking keys held down walk the player in,
   * as {@link MoveKeys.resolveDirection} tells.
   *
   * @param {number} heading - The way the camera looks along the ground, in
   *   degrees.
   * @returns {GroundVector} The direction.
   */
  resolveDirection(heading: number): GroundVector {
    return this.#moveKeys.resolveDirection(heading);
  }

  /** Lets go of every key held, as something opens over play. */
  holdPlay(): void {
    this.releaseAll();
  }

  /** Lets go of every key held. */
  releaseAll(): void {
    this.#moveKeys.releaseAllKeys();
    this.#cameraKeys.releaseAllKeys();
  }

  /**
   * Carries out a key pressed: the command of its code, which the walking
   * keys and the arrow keys go on giving while they are held if play takes
   * them, or a plain Enter that nothing took, which opens the box of the
   * chat.  A key the game takes is for nothing else, the browser included.
   *
   * @param {KeyboardEvent} event - The key pressed.
   * @param {CommandTarget} target - What the commands are given to.
   */
  #pressKey(event: KeyboardEvent, target: CommandTarget): void {
    if (target.isTyping()) {
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const outcome: CommandOutcome = target.carryOut({
      code: event.code,
      isRepeat: event.repeat,
      source: 'keyboard',
    });
    if (outcome === 'play' && !this.#cameraKeys.pressKey(event.code)) {
      this.#moveKeys.pressKey(event.code);
      target.noticeWalk();
    }
    if (outcome !== 'left') {
      event.preventDefault();
      return;
    }
    const isEnter: boolean =
      event.code === 'Enter' || event.code === 'NumpadEnter';
    if (isEnter && !event.shiftKey && !event.isComposing && target.canChat()) {
      event.preventDefault();
      if (!event.repeat) {
        target.openChat();
      }
    }
  }
}
