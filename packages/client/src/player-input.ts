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

import type { GroundVector } from '@clovervale/shared';

/** What a key tells the player of the page to do. */
export type KeyCommand = 'forward' | 'backward' | 'left' | 'right' | 'interact';

/** What each key tells the player to do, by the code of the key. */
const KEY_COMMANDS: Readonly<Record<string, KeyCommand>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'interact',
};

/** The number of decimal places a direction is rounded to. */
const DIRECTION_PRECISION = 3;

/**
 * Finds what a key tells the player to do.
 *
 * @param {string} code - The code of the key, as in a keyboard event.
 * @returns {KeyCommand | null} What the key tells the player to do, or
 *   `null` if the game does not use the key.
 */
export function findKeyCommand(code: string): KeyCommand | null {
  if (!Object.hasOwn(KEY_COMMANDS, code)) {
    return null;
  }
  return KEY_COMMANDS[code] ?? null;
}

/** The keys held down to move the player. */
export class MoveKeys {
  readonly #held = new Set<string>();

  /**
   * Notes that a key is held down.  Keys that do not move the player do not
   * count.
   *
   * @param {string} code - The code of the key.
   */
  pressKey(code: string): void {
    const command: KeyCommand | null = findKeyCommand(code);
    if (command !== null && command !== 'interact') {
      this.#held.add(code);
    }
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
    const ahead: number = count('forward') - count('backward');
    const aside: number = count('right') - count('left');
    const length: number = Math.hypot(ahead, aside);
    if (length === 0) {
      return { x: 0, z: 0 };
    }
    const turn: number = (heading * Math.PI) / 180;
    const x: number = ahead * Math.sin(turn) - aside * Math.cos(turn);
    const z: number = ahead * Math.cos(turn) + aside * Math.sin(turn);
    return { x: roundPart(x / length), z: roundPart(z / length) };
  }
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
