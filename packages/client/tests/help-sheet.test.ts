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
  CREDITS_PAGE,
  GAMEPAD_PAGE,
  HELP_PAGE_COUNT,
  HelpSheet,
  KEYBOARD_PAGE,
  TOUCH_PAGE,
  openHelpOnFirstVisit,
} from '../src/help-sheet.ts';
import type { LanguageStorage } from '../src/language.ts';

/**
 * Makes a storage that keeps its items in memory, as the local storage of
 * a browser does.
 *
 * @returns {LanguageStorage} The storage.
 */
function createStorage(): LanguageStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
  };
}

/** A storage the browser does not let the page read or write. */
const BROKEN_STORAGE: LanguageStorage = {
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
  sheet.open();
  return sheet;
}

describe('a help sheet', () => {
  it('is closed at first', () => {
    expect(new HelpSheet().isOpen).toBe(false);
  });

  it('opens with the H key, which it takes', () => {
    const sheet = new HelpSheet();
    expect(sheet.pressKey('KeyH')).toBe(true);
    expect(sheet.isOpen).toBe(true);
  });

  it('takes no other key while it is closed', () => {
    const sheet = new HelpSheet();
    for (const code of ['Escape', 'Enter', 'KeyW', 'Space', 'ArrowUp']) {
      expect(sheet.pressKey(code)).toBe(false);
    }
    expect(sheet.isOpen).toBe(false);
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
    sheet.open();
    sheet.open();
    expect(sheet.isOpen).toBe(true);
    sheet.close();
    expect(sheet.isOpen).toBe(false);
  });

  it('has a page of the keyboard, of the gamepad and of touch', () => {
    expect(HELP_PAGE_COUNT).toBe(3);
    expect(KEYBOARD_PAGE).toBe(0);
    expect(GAMEPAD_PAGE).toBe(1);
    expect(TOUCH_PAGE).toBe(2);
  });

  it('opens on the page of the keyboard unless told another', () => {
    const sheet = new HelpSheet();
    sheet.pressKey('KeyH');
    expect(sheet.page).toBe(KEYBOARD_PAGE);
    sheet.close();
    sheet.open(GAMEPAD_PAGE);
    expect(sheet.page).toBe(GAMEPAD_PAGE);
    sheet.close();
    sheet.open();
    expect(sheet.page).toBe(KEYBOARD_PAGE);
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
    expect(sheet.pressKey('ArrowRight')).toBe(false);
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
    sheet.turnToPage(CREDITS_PAGE);
    expect(sheet.page).toBe(TOUCH_PAGE);
  });

  it('comes last once the sheet offers the credits', () => {
    const sheet: HelpSheet = openSheet();
    sheet.hasCredits = true;
    expect(CREDITS_PAGE).toBe(HELP_PAGE_COUNT);
    expect(sheet.pageCount).toBe(HELP_PAGE_COUNT + 1);
    sheet.turnToPage(TOUCH_PAGE);
    sheet.pressKey('ArrowRight');
    expect(sheet.page).toBe(CREDITS_PAGE);
    sheet.pressKey('ArrowRight');
    expect(sheet.page).toBe(CREDITS_PAGE);
    sheet.pressKey('ArrowLeft');
    expect(sheet.page).toBe(TOUCH_PAGE);
  });

  it('is never the page the sheet opens at', () => {
    const sheet = new HelpSheet();
    sheet.hasCredits = true;
    sheet.open(CREDITS_PAGE);
    expect(sheet.page).toBe(TOUCH_PAGE);
    sheet.close();
    sheet.pressKey('KeyH');
    expect(sheet.page).toBe(KEYBOARD_PAGE);
  });
});

describe('opening the help sheet on the first visit', () => {
  it('opens it on the first visit only', () => {
    const storage: LanguageStorage = createStorage();
    const first = new HelpSheet();
    openHelpOnFirstVisit(first, storage);
    expect(first.isOpen).toBe(true);
    const later = new HelpSheet();
    openHelpOnFirstVisit(later, storage);
    expect(later.isOpen).toBe(false);
  });

  it('opens it at the page it is told', () => {
    const sheet = new HelpSheet();
    openHelpOnFirstVisit(sheet, createStorage(), TOUCH_PAGE);
    expect(sheet.isOpen).toBe(true);
    expect(sheet.page).toBe(TOUCH_PAGE);
  });

  it('opens it on every visit without a storage', () => {
    for (const storage of [null, BROKEN_STORAGE]) {
      for (let visit = 0; visit < 2; visit++) {
        const sheet = new HelpSheet();
        openHelpOnFirstVisit(sheet, storage);
        expect(sheet.isOpen).toBe(true);
      }
    }
  });
});
