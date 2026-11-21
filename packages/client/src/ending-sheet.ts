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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/22
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/ending-sheet The ending sheet, a scroll that tells the
 *   end of the story and then the credits of the game: when it opens by
 *   itself, how it unrolls and rolls up, and how its credits roll inside.
 */

import type { ItemKindId, MapId } from '@clovervale/shared';

import { isGameKey } from './player-input.ts';

/** The items a player is to hold together for the ending. */
export const ENDING_ITEMS: readonly ItemKindId[] = [
  'clovervale-message',
  'spy-token',
];

/**
 * How long a player is to hold the items of the ending in the village
 * before the ending opens, in milliseconds.
 */
export const ENDING_DELAY = 1000;

/**
 * How long the credits that do not fit the sheet stand still before they
 * roll, in milliseconds.
 */
export const ROLL_PAUSE = 2500;

/** How fast the credits roll up, in pixels a second. */
export const ROLL_SPEED = 30;

/**
 * How long the scroll of the ending sheet takes to unroll, and to roll up,
 * in milliseconds.
 */
export const ROLL_DURATION = 1200;

/** The keys that advance the sheet. */
const ADVANCE_KEYS: ReadonlySet<string> = new Set([
  'Escape',
  'Space',
  'Enter',
  'NumpadEnter',
]);

/** What the ending sheet shows: the end of the story, or the credits. */
export type EndingContent = 'ending' | 'credits';

/**
 * How the scroll of the ending sheet moves: unrolling, standing unrolled,
 * or rolling up.
 */
export type EndingMotion = 'unrolling' | 'shown' | 'rolling';

/** The keys that scroll the sheet, and which way: up negative. */
const SCROLL_KEYS: Readonly<Record<string, number>> = {
  ArrowUp: -1,
  ArrowDown: 1,
};

/** What the sheet makes of a key pressed. */
export interface EndingResponse {
  /**
   * Whether the sheet took the key, which is then for nothing else on the
   * page.
   */
  readonly isHandled: boolean;
  /** Which way the key scrolls the sheet: -1 up, 1 down, or 0 not at all. */
  readonly scroll: number;
}

/** The response to a key the sheet does not take. */
const NOT_HANDLED: EndingResponse = { isHandled: false, scroll: 0 };

/**
 * What tells when the ending opens by itself: a second after the player
 * comes to hold both {@link ENDING_ITEMS} in the village, or after it comes
 * back to the village holding them, as soon as it is not in a dialogue, and
 * only once.
 */
export class EndingWatch {
  #heldSince: number | null = null;
  #isDone = false;

  /**
   * Notices how things stand at a moment, and tells whether the ending is
   * to open then.  Letting go of an item, leaving the village or the page
   * knowing of no inventory starts the second over.
   *
   * @param {number} now - The moment, in milliseconds.
   * @param {(readonly ItemKindId[]) | null} carried - What the player
   *   carries, or `null` if the page does not know.
   * @param {MapId} map - The map the player is shown in.
   * @param {boolean} isInDialogue - Whether the player is in a dialogue.
   * @returns {boolean} Whether the ending is to open now, which it is only
   *   once.
   */
  notice(
    now: number,
    carried: readonly ItemKindId[] | null,
    map: MapId,
    isInDialogue: boolean,
  ): boolean {
    const isHeld: boolean =
      carried !== null &&
      map === 'village' &&
      ENDING_ITEMS.every((kind: ItemKindId) => carried.includes(kind));
    if (!isHeld) {
      this.#heldSince = null;
      return false;
    }
    this.#heldSince ??= now;
    if (this.#isDone || isInDialogue || now - this.#heldSince < ENDING_DELAY) {
      return false;
    }
    this.#isDone = true;
    return true;
  }
}

/**
 * The ending sheet, a scroll that unrolls to show either the end of the
 * story or the credits of the game: what it shows, how it moves, and
 * whether the end of the story has been shown since the page was loaded.
 *
 * Opened with the end of the story, it unrolls; once it has, the player
 * advancing rolls it up, and it unrolls again with the credits; once they
 * have unrolled, the player advancing rolls it up for good, and it closes.
 * The player advancing
 * while it unrolls or rolls up does nothing, so that no press skips the
 * credits.  While it is open, Esc, Space and Enter advance it, unless they
 * repeat, the up and down arrows scroll it, and it takes every other key
 * of the game too, so that nothing else on the page does anything with
 * it, and leaves every other key to the browser.
 */
export class EndingSheet {
  /**
   * How long the scroll takes to unroll and to roll up, in milliseconds,
   * {@link ROLL_DURATION} by default, or 0 not to move at all.
   */
  rollDuration: number = ROLL_DURATION;
  #content: EndingContent | null = null;
  #motion: EndingMotion = 'shown';
  #since = 0;
  #hasEnded = false;

  /**
   * Whether the sheet is open, as it is while it unrolls and rolls up.
   *
   * @returns {boolean} Whether it is.
   */
  get isOpen(): boolean {
    return this.#content !== null;
  }

  /**
   * What the sheet shows.
   *
   * @returns {EndingContent | null} What it shows, or `null` while it is
   *   closed.
   */
  get content(): EndingContent | null {
    return this.#content;
  }

  /**
   * How the sheet moves.
   *
   * @returns {EndingMotion | null} How it moves, or `null` while it is
   *   closed.
   */
  get motion(): EndingMotion | null {
    return this.#content === null ? null : this.#motion;
  }

  /**
   * Whether the sheet has shown the end of the story since the page was
   * loaded.
   *
   * @returns {boolean} Whether it has.
   */
  get hasEnded(): boolean {
    return this.#hasEnded;
  }

  /**
   * Opens the sheet with the end of the story, unrolling.
   *
   * @param {number} now - The moment, in milliseconds.
   */
  open(now: number): void {
    this.#content = 'ending';
    this.#motion = 'unrolling';
    this.#since = now;
    this.#hasEnded = true;
  }

  /** Closes the sheet at once, if it is open. */
  close(): void {
    this.#content = null;
  }

  /**
   * Advances the sheet, as the player does: rolls it up, if it is open and
   * has unrolled.
   *
   * @param {number} now - The moment, in milliseconds.
   * @returns {boolean} Whether it rolls up.
   */
  advance(now: number): boolean {
    if (this.#content === null || this.#motion !== 'shown') {
      return false;
    }
    this.#motion = 'rolling';
    this.#since = now;
    return true;
  }

  /**
   * Moves the sheet on to a moment: one that has unrolled for
   * {@link rollDuration} stands unrolled, and one that has rolled up for
   * as long unrolls again with the credits after the end of the story, or
   * closes after the credits.
   *
   * @param {number} now - The moment, in milliseconds.
   * @returns {boolean} Whether what it shows or how it moves has changed.
   */
  update(now: number): boolean {
    let isChanged = false;
    while (
      this.#content !== null &&
      this.#motion !== 'shown' &&
      now - this.#since >= this.rollDuration
    ) {
      this.#since += this.rollDuration;
      isChanged = true;
      if (this.#motion === 'unrolling') {
        this.#motion = 'shown';
      } else if (this.#content === 'ending') {
        this.#content = 'credits';
        this.#motion = 'unrolling';
      } else {
        this.#content = null;
      }
    }
    return isChanged;
  }

  /**
   * Tells how far the sheet has unrolled at a moment, as it unrolls and
   * rolls up over {@link rollDuration}.
   *
   * @param {number} now - The moment, in milliseconds.
   * @returns {number} How far: 0 rolled up or closed, and 1 unrolled.
   */
  findUnrolledShare(now: number): number {
    if (this.#content === null) {
      return 0;
    }
    if (this.#motion === 'shown') {
      return 1;
    }
    const moved: number =
      this.rollDuration <= 0
        ? 1
        : Math.min(Math.max((now - this.#since) / this.rollDuration, 0), 1);
    return this.#motion === 'unrolling' ? moved : 1 - moved;
  }

  /**
   * Takes a key pressed, if the sheet is open and the key is one for it.
   *
   * @param {string} code - The code of the key, as in a keyboard event.
   * @param {number} now - The moment, in milliseconds.
   * @param {boolean} [isRepeat] - Whether the key is held down and
   *   repeats, which advances nothing.
   * @returns {EndingResponse} Whether the sheet took the key, and which way
   *   the key scrolls it.
   */
  pressKey(code: string, now: number, isRepeat = false): EndingResponse {
    if (this.#content === null) {
      return NOT_HANDLED;
    }
    if (ADVANCE_KEYS.has(code)) {
      if (!isRepeat) {
        this.advance(now);
      }
      return { isHandled: true, scroll: 0 };
    }
    const scroll: number = SCROLL_KEYS[code] ?? 0;
    return isGameKey(code) || scroll !== 0
      ? { isHandled: true, scroll }
      : NOT_HANDLED;
  }
}

/**
 * Finds how far the credits have rolled up once they have not fitted the
 * sheet for some time: not at all for a moment, {@link ROLL_PAUSE}, then on
 * at {@link ROLL_SPEED}, until the end shows.
 *
 * @param {number} elapsed - How long they have not fitted, in
 *   milliseconds.
 * @param {number} overflow - How much taller the credits are than the
 *   sheet shows, in pixels, nothing or less if they fit.
 * @returns {number} How far they have rolled, in pixels.
 */
export function findRollOffset(elapsed: number, overflow: number): number {
  if (overflow <= 0) {
    return 0;
  }
  const rolled: number =
    (Math.max(elapsed - ROLL_PAUSE, 0) * ROLL_SPEED) / 1000;
  return Math.min(rolled, overflow);
}
