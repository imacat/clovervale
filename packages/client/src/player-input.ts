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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/player-input Turning the keys held into what a player wants.
 */

import type { GroundVector, PlayerInput } from '@clovervale/shared';

import type { SpaceAction } from './space-action.ts';

/** What a key tells the player of the page to do. */
export type KeyCommand = 'forward' | 'backward' | 'left' | 'right' | 'interact';

/**
 * What each key tells the player to do, by the code of the key.  The arrow
 * keys turn the camera instead, and tell the player nothing.
 */
const KEY_COMMANDS: Readonly<Record<string, KeyCommand>> = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'interact',
};

/**
 * The codes of the keys the game uses anywhere: the walking keys, the space
 * bar, the arrow keys, I and H, Enter, and Esc.
 */
const GAME_KEYS: ReadonlySet<string> = new Set([
  ...Object.keys(KEY_COMMANDS),
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyI',
  'KeyH',
  'Enter',
  'NumpadEnter',
  'Escape',
]);

/** The number of decimal places a direction is rounded to. */
const DIRECTION_PRECISION = 3;

/**
 * Tells whether the game uses a key anywhere, so that whatever holds the
 * keys of play back is to take it, and leave every other key to the
 * browser.
 *
 * @param {string} code - The code of the key, as in a keyboard event.
 * @returns {boolean} Whether the game uses the key.
 */
export function isGameKey(code: string): boolean {
  return GAME_KEYS.has(code);
}

/**
 * Finds what a key tells the player to do.
 *
 * @param {string} code - The code of the key, as in a keyboard event.
 * @returns {KeyCommand | null} What the key tells the player to do, or
 *   `null` if the game does not use the key.
 */
export function findKeyCommand(code: string): KeyCommand | null {
  return KEY_COMMANDS[code] ?? null;
}

/**
 * Chooses the input the space bar gives the player of the page for what it
 * makes the player do: the input that uses what the player would use,
 * whether or not the player has room for it and whether or not a container
 * holds anything, which is a travel for a way into another map, a pick for
 * something to pick or a container, and an interaction otherwise.
 *
 * @param {SpaceAction} action - What the space bar makes the player do.
 * @returns {PlayerInput} The input.
 */
export function chooseSpaceInput(action: SpaceAction): PlayerInput {
  return { type: action.input };
}

/** The keys held down to move the player. */
export class MoveKeys {
  readonly #held = new Set<string>();

  /**
   * Notes that a key that moves the player is held down.
   *
   * @param {string} code - The code of the key.
   */
  pressKey(code: string): void {
    this.#held.add(code);
  }

  /**
   * Notes that a key is no longer held down.
   *
   * @param {string} code - The code of the key.
   */
  releaseKey(code: string): void {
    this.#held.delete(code);
  }

  /** Notes that no key is held down any more. */
  releaseAllKeys(): void {
    this.#held.clear();
  }

  /**
   * Resolves the direction the keys held down move the player in.
   *
   * Forward is the way the camera looks, and opposite keys cancel out.
   *
   * @param {number} heading - The way the camera looks along the ground, as
   *   the turn around the Y axis from +Z towards +X, in degrees.
   * @returns {GroundVector} The direction, one metre long and rounded to a
   *   few decimal places, or without length if the player is to stand
   *   still.
   */
  resolveDirection(heading: number): GroundVector {
    const commands = new Set<KeyCommand | null>(
      [...this.#held].map(findKeyCommand),
    );
    const count = (command: KeyCommand): number =>
      commands.has(command) ? 1 : 0;
    return orientWalk(
      count('forward') - count('backward'),
      count('right') - count('left'),
      heading,
    );
  }
}

/**
 * Resolves the direction a walk forwards or backwards and aside moves the
 * player in, as the walking keys do.  Forward is the way the camera looks.
 *
 * @param {number} ahead - How far forwards, negative backwards.
 * @param {number} aside - How far to the right, negative to the left.
 * @param {number} heading - The way the camera looks along the ground, as
 *   the turn around the Y axis from +Z towards +X, in degrees.
 * @returns {GroundVector} The direction, one metre long and rounded to a
 *   few decimal places, or without length if the player is to stand
 *   still.
 */
export function orientWalk(
  ahead: number,
  aside: number,
  heading: number,
): GroundVector {
  const length: number = Math.hypot(ahead, aside);
  if (length === 0) {
    return { x: 0, z: 0 };
  }
  const turn: number = (heading * Math.PI) / 180;
  const x: number = ahead * Math.sin(turn) - aside * Math.cos(turn);
  const z: number = ahead * Math.cos(turn) + aside * Math.sin(turn);
  return { x: roundPart(x / length), z: roundPart(z / length) };
}

/**
 * Rounds a part of a direction, so that it does not change with the noise
 * of the heading it comes from.
 *
 * @param {number} value - The part.
 * @returns {number} The rounded part.
 */
function roundPart(value: number): number {
  const scale: number = 10 ** DIRECTION_PRECISION;
  // Adding zero turns a negative zero into a plain one.
  return Math.round(value * scale) / scale + 0;
}
