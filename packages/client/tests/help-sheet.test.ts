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
 * @module client/tests/help-sheet Tests for the help sheet that tells the
 *   person at the page the controls of the game.
 */

import { describe, expect, it } from 'vitest';

import {
  GAMEPAD_PAGE,
  HELP_PAGE_COUNT,
  HelpSheet,
  KEYBOARD_PAGE,
  TOUCH_PAGE,
  openHelpOnFirstVisit,
} from '../src/help-sheet.ts';
import type { PageStorage } from '../src/page-storage.ts';

/**
 * Makes a storage that keeps its items in memory, as the local storage of
 * a browser does.
 *
 * @returns {PageStorage} The storage.
 */
function createStorage(): PageStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
  };
}

/** A storage the browser does not let the page read or write. */
const BROKEN_STORAGE: PageStorage = {
  getItem: (): string | null => {
    throw new Error('The storage is not allowed.');
  },
  setItem: (): void => {
    throw new Error('The storage is not allowed.');
  },
};

/**
 * Opens a help sheet.
 *
 * @returns {HelpSheet} The open sheet.
 */
function openSheet(): HelpSheet {
  const sheet = new HelpSheet();
  sheet.open(KEYBOARD_PAGE);
  return sheet;
}

describe('a help sheet', () => {
  it('is closed at first', () => {
    expect(new HelpSheet().isOpen).toBe(false);
  });

  it('closes with Esc, Enter or the H key', () => {
    for (const code of ['Escape', 'Enter', 'NumpadEnter', 'KeyH']) {
      const sheet: HelpSheet = openSheet();
      expect(sheet.pressKey(code)).toBe(true);
      expect(sheet.isOpen).toBe(false);
    }
  });

  it('takes the other keys of the game while it is open, and stays open', () => {
    const sheet: HelpSheet = openSheet();
    for (const code of ['KeyW', 'KeyD', 'Space', 'ArrowLeft', 'KeyI']) {
      expect(sheet.pressKey(code)).toBe(true);
    }
    expect(sheet.isOpen).toBe(true);
  });

  it('leaves the keys the game does not use to the browser while open', () => {
    const sheet: HelpSheet = openSheet();
    for (const code of ['F5', 'F11', 'F12', 'Tab', 'KeyQ']) {
      expect(sheet.pressKey(code)).toBe(false);
    }
    expect(sheet.isOpen).toBe(true);
  });

  it('opens and closes when told', () => {
    const sheet = new HelpSheet();
    sheet.open(KEYBOARD_PAGE);
    sheet.open(KEYBOARD_PAGE);
    expect(sheet.isOpen).toBe(true);
    sheet.close();
    expect(sheet.isOpen).toBe(false);
  });

  it('opens on the page it is told', () => {
    const sheet = new HelpSheet();
    sheet.open(GAMEPAD_PAGE);
    expect(sheet.page).toBe(GAMEPAD_PAGE);
  });

  it('turns its pages with the left and right arrows, within its pages', () => {
    const sheet: HelpSheet = openSheet();
    expect(sheet.pressKey('ArrowLeft')).toBe(true);
    expect(sheet.page).toBe(KEYBOARD_PAGE);
    expect(sheet.pressKey('ArrowRight')).toBe(true);
    expect(sheet.page).toBe(GAMEPAD_PAGE);
    expect(sheet.pressKey('ArrowRight')).toBe(true);
    expect(sheet.page).toBe(TOUCH_PAGE);
    expect(sheet.pressKey('ArrowRight')).toBe(true);
    expect(sheet.page).toBe(TOUCH_PAGE);
    expect(sheet.pressKey('ArrowLeft')).toBe(true);
    expect(sheet.page).toBe(GAMEPAD_PAGE);
    expect(sheet.pressKey('ArrowLeft')).toBe(true);
    expect(sheet.page).toBe(KEYBOARD_PAGE);
    expect(sheet.isOpen).toBe(true);
  });

  it('does not turn its pages with the up and down arrows', () => {
    const sheet: HelpSheet = openSheet();
    sheet.pressKey('ArrowDown');
    expect(sheet.page).toBe(KEYBOARD_PAGE);
    sheet.turnToPage(GAMEPAD_PAGE);
    sheet.pressKey('ArrowUp');
    expect(sheet.page).toBe(GAMEPAD_PAGE);
  });

  it('turns to a page when told, keeping within its pages', () => {
    const sheet: HelpSheet = openSheet();
    sheet.turnToPage(GAMEPAD_PAGE);
    expect(sheet.page).toBe(GAMEPAD_PAGE);
    sheet.turnToPage(HELP_PAGE_COUNT);
    expect(sheet.page).toBe(TOUCH_PAGE);
    sheet.turnToPage(-1);
    expect(sheet.page).toBe(KEYBOARD_PAGE);
  });

  it('does not turn its pages while it is closed', () => {
    const sheet = new HelpSheet();
    sheet.turnToPage(GAMEPAD_PAGE);
    expect(sheet.page).toBe(KEYBOARD_PAGE);
  });
});

describe('the page of the credits on the help sheet', () => {
  it('is not there at first', () => {
    const sheet: HelpSheet = openSheet();
    expect(sheet.hasCredits).toBe(false);
    expect(sheet.pageCount).toBe(HELP_PAGE_COUNT);
    sheet.turnToPage(TOUCH_PAGE);
    sheet.pressKey('ArrowRight');
    expect(sheet.page).toBe(TOUCH_PAGE);
    sheet.turnToPage(HELP_PAGE_COUNT);
    expect(sheet.page).toBe(TOUCH_PAGE);
  });

  it('comes last once the sheet offers the credits', () => {
    const sheet: HelpSheet = openSheet();
    sheet.hasCredits = true;
    expect(sheet.pageCount).toBe(HELP_PAGE_COUNT + 1);
    sheet.turnToPage(TOUCH_PAGE);
    sheet.pressKey('ArrowRight');
    expect(sheet.page).toBe(HELP_PAGE_COUNT);
    sheet.pressKey('ArrowRight');
    expect(sheet.page).toBe(HELP_PAGE_COUNT);
    sheet.pressKey('ArrowLeft');
    expect(sheet.page).toBe(TOUCH_PAGE);
  });
});

describe('the welcome before the help sheet', () => {
  /**
   * Opens a help sheet with the welcome before it.
   *
   * @param {number} page - The page the sheet goes on to.
   * @returns {HelpSheet} The sheet, showing the welcome.
   */
  const welcomeSheet = (page: number): HelpSheet => {
    const sheet = new HelpSheet();
    sheet.welcome(page);
    return sheet;
  };

  it('is not shown by a sheet opened as usual', () => {
    expect(openSheet().isWelcoming).toBe(false);
    expect(new HelpSheet().isWelcoming).toBe(false);
  });

  it('shows on the open sheet until it moves on', () => {
    const sheet: HelpSheet = welcomeSheet(GAMEPAD_PAGE);
    expect(sheet.isOpen).toBe(true);
    expect(sheet.isWelcoming).toBe(true);
    sheet.moveOn();
    expect(sheet.isOpen).toBe(true);
    expect(sheet.isWelcoming).toBe(false);
    expect(sheet.page).toBe(GAMEPAD_PAGE);
  });

  it('moves on to the help with any key, the sheet staying open', () => {
    for (const code of ['Escape', 'Enter', 'KeyH', 'ArrowRight', 'KeyQ']) {
      const sheet: HelpSheet = welcomeSheet(TOUCH_PAGE);
      sheet.pressKey(code);
      expect(sheet.isOpen).toBe(true);
      expect(sheet.isWelcoming).toBe(false);
      expect(sheet.page).toBe(TOUCH_PAGE);
    }
  });

  it('takes the keys of the game, and leaves the others to the browser', () => {
    expect(welcomeSheet(KEYBOARD_PAGE).pressKey('Space')).toBe(true);
    expect(welcomeSheet(KEYBOARD_PAGE).pressKey('F5')).toBe(false);
  });

  it('does not move on with a key that repeats', () => {
    const sheet: HelpSheet = welcomeSheet(KEYBOARD_PAGE);
    expect(sheet.pressKey('Enter', true)).toBe(true);
    expect(sheet.isWelcoming).toBe(true);
  });

  it('is gone once the sheet closes or opens again', () => {
    const closed: HelpSheet = welcomeSheet(KEYBOARD_PAGE);
    closed.close();
    expect(closed.isWelcoming).toBe(false);
    const opened: HelpSheet = welcomeSheet(KEYBOARD_PAGE);
    opened.open(GAMEPAD_PAGE);
    expect(opened.isWelcoming).toBe(false);
    expect(opened.page).toBe(GAMEPAD_PAGE);
  });
});

describe('opening the help sheet on the first visit', () => {
  it('opens it on the first visit only', () => {
    const storage: PageStorage = createStorage();
    const first = new HelpSheet();
    openHelpOnFirstVisit(first, storage, KEYBOARD_PAGE);
    expect(first.isOpen).toBe(true);
    const later = new HelpSheet();
    openHelpOnFirstVisit(later, storage, KEYBOARD_PAGE);
    expect(later.isOpen).toBe(false);
  });

  it('opens it with the welcome first', () => {
    const sheet = new HelpSheet();
    openHelpOnFirstVisit(sheet, createStorage(), KEYBOARD_PAGE);
    expect(sheet.isWelcoming).toBe(true);
  });

  it('opens it at the page it is told', () => {
    const sheet = new HelpSheet();
    openHelpOnFirstVisit(sheet, createStorage(), TOUCH_PAGE);
    sheet.moveOn();
    expect(sheet.isOpen).toBe(true);
    expect(sheet.page).toBe(TOUCH_PAGE);
  });

  it('opens it on every visit without a storage', () => {
    for (const storage of [null, BROKEN_STORAGE]) {
      for (let visit = 0; visit < 2; visit++) {
        const sheet = new HelpSheet();
        openHelpOnFirstVisit(sheet, storage, KEYBOARD_PAGE);
        expect(sheet.isOpen).toBe(true);
      }
    }
  });
});
