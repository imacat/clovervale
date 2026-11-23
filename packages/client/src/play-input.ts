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
 * @module client/play-input Taking what the devices the person at the page
 *   plays with give to the sheets and the boxes over play, and to play.
 */

import type { GroundVector, PlayerInput } from '@clovervale/shared';

import { isCameraKey } from './camera-keys.ts';
import type { PadScreen } from './gamepad.ts';
import type {
  CommandOutcome,
  CommandTarget,
  GameCommand,
  InputDevice,
} from './input-device.ts';
import type { OverlayStack } from './overlay-stack.ts';
import { findKeyCommand } from './player-input.ts';
import type { KeyCommand } from './player-input.ts';

/** What the input of play acts on outside itself. */
export interface PlayInputHooks {
  /**
   * Gives the player of the page an input.
   *
   * @param {PlayerInput} input - The input.
   * @returns {boolean} Whether the player was given the input.
   */
  readonly sendInput: (input: PlayerInput) => boolean;
  /**
   * Finds what the space bar has the player of the page do now, as the
   * prompt tells it.
   *
   * @returns {PlayerInput | null} The input, or `null` while there is no
   *   prediction or the player is dead.
   */
  readonly findSpaceInput: () => PlayerInput | null;
  /**
   * Tells the way the camera looks.
   *
   * @returns {number} The heading, in degrees.
   */
  readonly readHeading: () => number;
  /**
   * Zooms the camera.
   *
   * @param {number} factor - How much farther the camera is to be.
   */
  readonly zoom: (factor: number) => void;
  /**
   * Tells whether a line is being typed in the box of the chat.
   *
   * @returns {boolean} Whether it is.
   */
  readonly isTyping: () => boolean;
  /**
   * Tells whether the box of the chat can be opened now.
   *
   * @returns {boolean} Whether it can.
   */
  readonly canChat: () => boolean;
  /** Opens the box of the chat, if it can be opened. */
  readonly openChat: () => void;
}

/**
 * The input of play: what the devices give, each as {@link InputDevice}
 * tells, goes to the sheets and the boxes over play first, as
 * {@link OverlayStack.pressKey} tells, and to play otherwise; and the
 * server is told which way the devices walk the player, the first of them
 * that walks it.
 */
export class PlayInput implements CommandTarget {
  /**
   * The devices the person at the page plays with, the first first in
   * walking the player.
   */
  readonly devices: readonly InputDevice[];
  /** The sheets and the boxes over play. */
  readonly #overlays: OverlayStack;
  /** What the input acts on outside itself. */
  readonly #hooks: PlayInputHooks;
  /** The direction the server was last told the player wants to move in. */
  #sentDirection: GroundVector = { x: 0, z: 0 };

  /**
   * Takes the devices to play with.
   *
   * @param {readonly InputDevice[]} devices - The devices, the first first
   *   in walking the player.
   * @param {OverlayStack} overlays - The sheets and the boxes over play.
   * @param {PlayInputHooks} hooks - What the input acts on outside itself.
   */
  constructor(
    devices: readonly InputDevice[],
    overlays: OverlayStack,
    hooks: PlayInputHooks,
  ) {
    this.devices = devices;
    this.#overlays = overlays;
    this.#hooks = hooks;
  }

  /**
   * Starts listening to the devices, and lets go of everything held on
   * them as the window loses the focus.
   *
   * @param {Window} window - The window of the page.
   */
  listen(window: Window): void {
    for (const device of this.devices) {
      device.listen(window, this);
    }
    window.addEventListener('blur', () => {
      for (const device of this.devices) {
        device.releaseAll();
      }
      this.sendMove();
    });
  }

  /**
   * Reads the devices at a frame, carrying out the commands they give, and
   * zooms the camera as each zooms it.
   *
   * @param {number} seconds - The time since they were last read, in
   *   seconds.
   */
  update(seconds: number): void {
    for (const device of this.devices) {
      this.#hooks.zoom(device.read(seconds, this));
    }
  }

  /**
   * Tells the server which way the first device that walks the player walks
   * it, if that has changed since the server was last told.
   */
  sendMove(): void {
    const heading: number = this.#hooks.readHeading();
    let direction: GroundVector = { x: 0, z: 0 };
    for (const device of this.devices) {
      direction = device.resolveDirection(heading);
      if (direction.x !== 0 || direction.z !== 0) {
        break;
      }
    }
    const isSame: boolean =
      direction.x === this.#sentDirection.x &&
      direction.z === this.#sentDirection.z;
    if (!isSame && this.#hooks.sendInput({ type: 'move', direction })) {
      this.#sentDirection = direction;
    }
  }

  /**
   * Holds every device from play, as something opens over play, as
   * {@link InputDevice.holdPlay} tells, and tells the server so.
   */
  holdPlay(): void {
    for (const device of this.devices) {
      device.holdPlay();
    }
    this.sendMove();
  }

  /**
   * Carries out a command: whatever is open over play takes it first, as
   * {@link OverlayStack.pressKey} tells, and play otherwise: the arrow keys
   * turn the camera, the walking keys walk the player, and the space bar
   * has it do what the prompt tells.
   *
   * @param {GameCommand} command - The command.
   * @returns {CommandOutcome} What came of it.
   */
  carryOut(command: GameCommand): CommandOutcome {
    const isTaken: boolean | null = this.#overlays.pressKey(command);
    if (isTaken !== null) {
      return isTaken ? 'taken' : 'left';
    }
    if (isCameraKey(command.code)) {
      return 'play';
    }
    const keyCommand: KeyCommand | null = findKeyCommand(command.code);
    if (keyCommand === null) {
      return 'left';
    }
    if (keyCommand !== 'interact') {
      return 'play';
    }
    // A dead player cannot interact, and is not to once it is back for a key
    // pressed while it was dead.
    if (command.isRepeat) {
      return 'taken';
    }
    // The space bar picks what the prompt tells it picks, as the page knows
    // it now; whether anything comes of it is for the server to decide.
    const input: PlayerInput | null = this.#hooks.findSpaceInput();
    if (input !== null) {
      this.#hooks.sendInput(input);
    }
    return 'taken';
  }

  /**
   * Tells what is open on the page, as {@link OverlayStack.findScreen}
   * tells.
   *
   * @returns {PadScreen} What is open.
   */
  findScreen(): PadScreen {
    return this.#overlays.findScreen();
  }

  /**
   * Tells whether play is held now: while anything is open over play, the
   * box of the chat included.
   *
   * @returns {boolean} Whether it is.
   */
  isPlayHeld(): boolean {
    return this.#overlays.isAnyOpen();
  }

  /**
   * Tells whether a line is being typed in the box of the chat.
   *
   * @returns {boolean} Whether it is.
   */
  isTyping(): boolean {
    return this.#hooks.isTyping();
  }

  /** Tells the server which way the devices walk the player, if changed. */
  noticeWalk(): void {
    this.sendMove();
  }

  /**
   * Tells whether the box of the chat can be opened now.
   *
   * @returns {boolean} Whether it can.
   */
  canChat(): boolean {
    return this.#hooks.canChat();
  }

  /** Opens the box of the chat, if it can be opened. */
  openChat(): void {
    this.#hooks.openChat();
  }
}
