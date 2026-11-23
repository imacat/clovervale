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
 * @module client/input-device What every device the person at the page
 *   plays with goes by: the commands it gives the game, the way it walks
 *   the player, and how it turns and zooms the camera.
 */

import type { GroundVector } from '@clovervale/shared';

import type { CameraHold } from './camera-keys.ts';
import type { PadScreen } from './gamepad.ts';

/** The kind of device a command comes from. */
export type InputSource = 'keyboard' | 'gamepad' | 'touch';

/** A command a device gives the game. */
export interface GameCommand {
  /**
   * The code of the key that gives the command on the keyboard, as in a
   * keyboard event, by which every device names its commands.
   */
  readonly code: string;
  /** Whether it is given again as it is held. */
  readonly isRepeat: boolean;
  /** The kind of device that gives it. */
  readonly source: InputSource;
}

/**
 * What comes of a command: `play` if nothing is open over play and the
 * command walks the player or turns the camera, for as long as the device
 * holds it; `taken` if the game took it otherwise; and `left` if the game
 * did not take it, for anything else, the browser included, to take.
 */
export type CommandOutcome = 'play' | 'taken' | 'left';

/** What the devices give their commands to, and ask of play. */
export interface CommandTarget {
  /**
   * Carries out a command: whatever is open over play takes it first, and
   * play otherwise.
   *
   * @param {GameCommand} command - The command.
   * @returns {CommandOutcome} What came of it.
   */
  readonly carryOut: (command: GameCommand) => CommandOutcome;
  /**
   * Tells what is open on the page, as it tells what the buttons of the
   * gamepads give.
   *
   * @returns {PadScreen} What is open.
   */
  readonly findScreen: () => PadScreen;
  /**
   * Tells whether play is held now: while anything is open over play, the
   * box of the chat included.
   *
   * @returns {boolean} Whether it is.
   */
  readonly isPlayHeld: () => boolean;
  /**
   * Tells whether a line is being typed in the box of the chat, while which
   * the devices give no commands at all.
   *
   * @returns {boolean} Whether it is.
   */
  readonly isTyping: () => boolean;
  /** Tells that the way a device walks the player may have changed. */
  readonly noticeWalk: () => void;
  /**
   * Tells whether the box of the chat can be opened now, as a plain Enter
   * opens it.
   *
   * @returns {boolean} Whether it can.
   */
  readonly canChat: () => boolean;
  /** Opens the box of the chat, if it can be opened. */
  readonly openChat: () => void;
}

/**
 * A device the person at the page plays with.  It is read at each frame,
 * and gives its commands to the target as they come; it walks the player,
 * and turns the camera as {@link CameraHold} tells, as it is held.
 */
export interface InputDevice extends CameraHold {
  /**
   * Starts listening to the device.
   *
   * @param {Window} window - The window of the page.
   * @param {CommandTarget} target - What the commands are given to.
   */
  listen(window: Window, target: CommandTarget): void;

  /**
   * Reads the device at a frame, giving the target the commands it gives
   * now, and holding it from play while play is held.
   *
   * @param {number} seconds - The time since it was last read, in seconds.
   * @param {CommandTarget} target - What the commands are given to.
   * @returns {number} How many times farther the camera is to be from what
   *   it looks at for the device: above 1 to zoom out, below 1 to zoom in,
   *   and 1 not to zoom.
   */
  read(seconds: number, target: CommandTarget): number;

  /**
   * Resolves the direction the device walks the player in now.
   *
   * @param {number} heading - The way the camera looks along the ground, as
   *   the turn around the Y axis from +Z toward +X, in degrees, which is
   *   forward.
   * @returns {GroundVector} The direction, one meter long, or without
   *   length if the device does not walk the player.
   */
  resolveDirection(heading: number): GroundVector;

  /**
   * Holds the device from play, as something opens over play: whatever it
   * holds walks the player and turns the camera no more.
   */
  holdPlay(): void;

  /** Lets go of everything held on the device, as the page loses focus. */
  releaseAll(): void;
}
