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
 * @module client/help-sheet The help sheet that tells the person at the
 *   page the controls of the game, and opening it on the first visit.
 */

import type { LanguageStorage } from './language.ts';
import { isGameKey } from './player-input.ts';

/** The key the first visit is remembered by. */
const STORAGE_KEY = 'clovervale.helpSeen';

/** The keys that close the help sheet. */
const CLOSE_KEYS: ReadonlySet<string> = new Set([
  'Escape',
  'Enter',
  'NumpadEnter',
  'KeyH',
]);

/**
 * The help sheet: whether it is open.
 *
 * The H key opens the sheet.  While it is open, Esc, Enter and the H key
 * close it, and it takes every other key of the game too, so that nothing
 * else on the page does anything with it, and leaves every other key to the
 * browser.
 */
export class HelpSheet {
  #isOpen = false;

  /**
   * Whether the sheet is open.
   *
   * @returns {boolean} Whether it is.
   */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /** Opens the sheet, if it is closed. */
  open(): void {
    this.#isOpen = true;
  }

  /** Closes the sheet, if it is open. */
  close(): void {
    this.#isOpen = false;
  }

  /**
   * Takes a key pressed, if it is one for the sheet.
   *
   * @param {string} code - The code of the key, as in a keyboard event.
   * @returns {boolean} Whether the sheet took the key, which is then for
   *   nothing else on the page; a key the game does not use is not taken.
   */
  pressKey(code: string): boolean {
    if (!this.#isOpen) {
      if (code !== 'KeyH') {
        return false;
      }
      this.#isOpen = true;
      return true;
    }
    if (CLOSE_KEYS.has(code)) {
      this.#isOpen = false;
    }
    return isGameKey(code);
  }
}

/**
 * Opens the help sheet if the browser has not been to the game before, and
 * remembers the visit, if it can.  Without a storage the page can use, every
 * visit counts as the first.
 *
 * @param {HelpSheet} sheet - The help sheet.
 * @param {LanguageStorage | null} storage - Where the visit is remembered,
 *   or `null` if nowhere.
 */
export function openHelpOnFirstVisit(
  sheet: HelpSheet,
  storage: LanguageStorage | null,
): void {
  let isSeen = false;
  try {
    isSeen = storage !== null && storage.getItem(STORAGE_KEY) !== null;
  } catch {
    // An unreadable storage remembers no visit.
  }
  if (isSeen) {
    return;
  }
  sheet.open();
  try {
    storage?.setItem(STORAGE_KEY, '1');
  } catch {
    // The page works the same, only without remembering.
  }
}
