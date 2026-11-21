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

/** The number of pages of the help sheet without the page of the credits. */
export const HELP_PAGE_COUNT = 3;
/** The page of the help sheet that tells the keyboard and the mouse. */
export const KEYBOARD_PAGE = 0;
/** The page of the help sheet that tells the gamepad. */
export const GAMEPAD_PAGE = 1;
/** The page of the help sheet that tells the touch controls. */
export const TOUCH_PAGE = 2;
/**
 * The page of the help sheet that tells the credits of the game, the last,
 * while the sheet offers them.
 */
export const CREDITS_PAGE = 3;

/** The keys that close the help sheet. */
const CLOSE_KEYS: ReadonlySet<string> = new Set([
  'Escape',
  'Enter',
  'NumpadEnter',
  'KeyH',
]);

/**
 * The help sheet: whether it is open, and the page it is open at.
 *
 * The H key opens the sheet, at the page of the keyboard.  While it is
 * open, Esc, Enter and the H key close it, the left and right arrows turn
 * to the page before and after, stopping at the first and the last, and it
 * takes every other key of the game too, so that nothing else on the page
 * does anything with it, and leaves every other key to the browser.
 */
export class HelpSheet {
  /**
   * Whether the sheet offers the credits of the game, on a page of their
   * own after the others.
   */
  hasCredits = false;
  #isOpen = false;
  #page: number = KEYBOARD_PAGE;

  /**
   * Whether the sheet is open.
   *
   * @returns {boolean} Whether it is.
   */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /**
   * The page the sheet is open at, or was last open at.
   *
   * @returns {number} The page, from 0.
   */
  get page(): number {
    return this.#page;
  }

  /**
   * The number of pages of the sheet, with the page of the credits while
   * it offers them.
   *
   * @returns {number} The number of pages.
   */
  get pageCount(): number {
    return this.hasCredits ? HELP_PAGE_COUNT + 1 : HELP_PAGE_COUNT;
  }

  /**
   * Opens the sheet, at a page, though never at the page of the credits.
   *
   * @param {number} [page] - The page, the page of the keyboard by default.
   */
  open(page: number = KEYBOARD_PAGE): void {
    this.#isOpen = true;
    this.#page = KEYBOARD_PAGE;
    this.turnToPage(Math.min(page, HELP_PAGE_COUNT - 1));
  }

  /**
   * Turns the open sheet to a page, or to the first or the last page for a
   * page before or after them.  A closed sheet stays as it is.
   *
   * @param {number} page - The page, from 0.
   */
  turnToPage(page: number): void {
    if (this.#isOpen) {
      this.#page = Math.min(Math.max(page, 0), this.pageCount - 1);
    }
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
      this.open();
      return true;
    }
    if (CLOSE_KEYS.has(code)) {
      this.#isOpen = false;
    } else if (code === 'ArrowLeft') {
      this.turnToPage(this.#page - 1);
    } else if (code === 'ArrowRight') {
      this.turnToPage(this.#page + 1);
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
 * @param {number} [page] - The page to open it at, the page of the
 *   keyboard by default.
 */
export function openHelpOnFirstVisit(
  sheet: HelpSheet,
  storage: LanguageStorage | null,
  page: number = KEYBOARD_PAGE,
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
  sheet.open(page);
  try {
    storage?.setItem(STORAGE_KEY, '1');
  } catch {
    // The page works the same, only without remembering.
  }
}
