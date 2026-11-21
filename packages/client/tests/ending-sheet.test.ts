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
 * @module client/tests/ending-sheet Tests for the ending sheet, when it
 *   opens by itself, and how its credits roll.
 */

import { describe, expect, it } from 'vitest';

import type { ItemKindId } from '@clovervale/shared';

import {
  ENDING_DELAY,
  EndingSheet,
  EndingWatch,
  ROLL_DURATION,
  ROLL_PAUSE,
  ROLL_SPEED,
  findRollOffset,
} from '../src/ending-sheet.ts';

/** What a player carries once it has both items of the ending. */
const BOTH: readonly ItemKindId[] = [
  'sword',
  'spy-token',
  'clovervale-message',
];

describe('an ending watch', () => {
  it('opens the ending a second after both are held in the village', () => {
    const watch = new EndingWatch();
    expect(watch.notice(5000, BOTH, 'village', false)).toBe(false);
    expect(watch.notice(5000 + ENDING_DELAY - 1, BOTH, 'village', false)).toBe(
      false,
    );
    expect(watch.notice(5000 + ENDING_DELAY, BOTH, 'village', false)).toBe(
      true,
    );
  });

  it('does not open the ending with only one of the items', () => {
    for (const carried of [
      ['clovervale-message'],
      ['spy-token', 'sword'],
    ] as const) {
      const watch = new EndingWatch();
      watch.notice(0, carried, 'village', false);
      expect(watch.notice(10_000, carried, 'village', false)).toBe(false);
    }
  });

  it('waits in the cave, and opens a second after the village is back', () => {
    const watch = new EndingWatch();
    watch.notice(0, BOTH, 'cave', false);
    expect(watch.notice(10_000, BOTH, 'cave', false)).toBe(false);
    expect(watch.notice(20_000, BOTH, 'village', false)).toBe(false);
    const half: number = 20_000 + ENDING_DELAY / 2;
    expect(watch.notice(half, BOTH, 'village', false)).toBe(false);
    expect(watch.notice(20_000 + ENDING_DELAY, BOTH, 'village', false)).toBe(
      true,
    );
  });

  it('waits for a dialogue in progress to be over', () => {
    const watch = new EndingWatch();
    watch.notice(0, BOTH, 'village', true);
    expect(watch.notice(ENDING_DELAY * 5, BOTH, 'village', true)).toBe(false);
    expect(watch.notice(ENDING_DELAY * 6, BOTH, 'village', false)).toBe(true);
  });

  it('starts the second afresh once an item is let go of', () => {
    const watch = new EndingWatch();
    watch.notice(0, BOTH, 'village', false);
    watch.notice(ENDING_DELAY / 2, ['spy-token'], 'village', false);
    watch.notice(ENDING_DELAY * 2, BOTH, 'village', false);
    expect(
      watch.notice(ENDING_DELAY * 3 - 1, BOTH, 'village', false),
    ).toBe(false);
    expect(watch.notice(ENDING_DELAY * 3, BOTH, 'village', false)).toBe(true);
  });

  it('does not count while the page knows of no inventory', () => {
    const watch = new EndingWatch();
    watch.notice(0, BOTH, 'village', false);
    watch.notice(ENDING_DELAY / 2, null, 'village', false);
    expect(watch.notice(ENDING_DELAY, BOTH, 'village', false)).toBe(false);
  });

  it('opens the ending only once, however often both are held again', () => {
    const watch = new EndingWatch();
    watch.notice(0, BOTH, 'village', false);
    expect(watch.notice(ENDING_DELAY, BOTH, 'village', false)).toBe(true);
    expect(watch.notice(ENDING_DELAY * 2, BOTH, 'village', false)).toBe(false);
    watch.notice(ENDING_DELAY * 3, ['sword'], 'village', false);
    watch.notice(ENDING_DELAY * 4, BOTH, 'village', false);
    expect(watch.notice(ENDING_DELAY * 9, BOTH, 'village', false)).toBe(false);
  });
});

/** When the sheets of the tests open, in milliseconds. */
const OPENED = 10_000;

/**
 * Opens an ending sheet, and lets it unroll.
 *
 * @returns {EndingSheet} The open sheet, unrolled at
 *   {@link OPENED} + {@link ROLL_DURATION}.
 */
function openSheet(): EndingSheet {
  const sheet = new EndingSheet();
  sheet.open(OPENED);
  sheet.update(OPENED + ROLL_DURATION);
  return sheet;
}

describe('an ending sheet', () => {
  it('is closed at first, before any ending', () => {
    const sheet = new EndingSheet();
    expect(sheet.isOpen).toBe(false);
    expect(sheet.content).toBeNull();
    expect(sheet.motion).toBeNull();
    expect(sheet.hasEnded).toBe(false);
  });

  it('unrolls with the end of the story, which it then tells of', () => {
    const sheet = new EndingSheet();
    sheet.open(OPENED);
    expect(sheet.content).toBe('ending');
    expect(sheet.motion).toBe('unrolling');
    expect(sheet.hasEnded).toBe(true);
    expect(sheet.update(OPENED + ROLL_DURATION - 1)).toBe(false);
    expect(sheet.motion).toBe('unrolling');
    expect(sheet.update(OPENED + ROLL_DURATION)).toBe(true);
    expect(sheet.motion).toBe('shown');
  });

  it('goes on from the end of the story to the credits, and closes', () => {
    const sheet: EndingSheet = openSheet();
    const at: number = OPENED + ROLL_DURATION * 3;
    expect(sheet.advance(at)).toBe(true);
    expect(sheet.motion).toBe('rolling');
    expect(sheet.content).toBe('ending');
    sheet.update(at + ROLL_DURATION);
    expect(sheet.content).toBe('credits');
    expect(sheet.motion).toBe('unrolling');
    sheet.update(at + ROLL_DURATION * 2);
    expect(sheet.motion).toBe('shown');
    expect(sheet.advance(at + ROLL_DURATION * 5)).toBe(true);
    sheet.update(at + ROLL_DURATION * 6 - 1);
    expect(sheet.isOpen).toBe(true);
    sheet.update(at + ROLL_DURATION * 6);
    expect(sheet.isOpen).toBe(false);
    expect(sheet.motion).toBeNull();
    expect(sheet.hasEnded).toBe(true);
  });

  it('skips nothing for presses while it moves', () => {
    const sheet = new EndingSheet();
    sheet.open(OPENED);
    expect(sheet.advance(OPENED + 1)).toBe(false);
    sheet.update(OPENED + ROLL_DURATION);
    sheet.advance(OPENED + ROLL_DURATION);
    for (const at of [1, ROLL_DURATION, ROLL_DURATION * 2 - 1]) {
      sheet.update(OPENED + ROLL_DURATION + at);
      expect(sheet.advance(OPENED + ROLL_DURATION + at)).toBe(false);
      expect(sheet.isOpen).toBe(true);
    }
    sheet.update(OPENED + ROLL_DURATION * 3);
    expect(sheet.content).toBe('credits');
    expect(sheet.motion).toBe('shown');
  });

  it('changes at once without moving', () => {
    const sheet = new EndingSheet();
    sheet.rollDuration = 0;
    sheet.open(OPENED);
    sheet.update(OPENED);
    expect(sheet.motion).toBe('shown');
    sheet.advance(OPENED + 5);
    sheet.update(OPENED + 5);
    expect(sheet.content).toBe('credits');
    expect(sheet.motion).toBe('shown');
    sheet.advance(OPENED + 9);
    sheet.update(OPENED + 9);
    expect(sheet.isOpen).toBe(false);
  });

  it('advances with Esc, Space or Enter, but not as they repeat', () => {
    for (const code of ['Escape', 'Space', 'Enter', 'NumpadEnter']) {
      const repeated: EndingSheet = openSheet();
      expect(repeated.pressKey(code, OPENED * 2, true)).toEqual({
        isHandled: true,
        scroll: 0,
      });
      expect(repeated.motion).toBe('shown');
      const sheet: EndingSheet = openSheet();
      expect(sheet.pressKey(code, OPENED * 2)).toEqual({
        isHandled: true,
        scroll: 0,
      });
      expect(sheet.motion).toBe('rolling');
    }
  });

  it('scrolls with the up and down arrows', () => {
    const sheet: EndingSheet = openSheet();
    expect(sheet.pressKey('ArrowUp', OPENED * 2)).toEqual({
      isHandled: true,
      scroll: -1,
    });
    expect(sheet.pressKey('ArrowDown', OPENED * 2)).toEqual({
      isHandled: true,
      scroll: 1,
    });
    expect(sheet.motion).toBe('shown');
  });

  it('takes the other keys of the game while open, and stays so', () => {
    const sheet: EndingSheet = openSheet();
    for (const code of ['KeyW', 'KeyI', 'KeyH', 'ArrowLeft']) {
      expect(sheet.pressKey(code, OPENED * 2)).toEqual({
        isHandled: true,
        scroll: 0,
      });
    }
    expect(sheet.motion).toBe('shown');
  });

  it('leaves the keys the game does not use to the browser', () => {
    const sheet: EndingSheet = openSheet();
    for (const code of ['F5', 'F11', 'F12', 'Tab']) {
      expect(sheet.pressKey(code, OPENED * 2)).toEqual({
        isHandled: false,
        scroll: 0,
      });
    }
  });

  it('takes no key while closed', () => {
    const sheet = new EndingSheet();
    for (const code of ['Escape', 'Space', 'KeyW', 'ArrowDown']) {
      expect(sheet.pressKey(code, OPENED)).toEqual({
        isHandled: false,
        scroll: 0,
      });
    }
    expect(sheet.isOpen).toBe(false);
  });

  it('tells how far it has unrolled as it moves', () => {
    const sheet = new EndingSheet();
    expect(sheet.findUnrolledShare(OPENED)).toBe(0);
    sheet.open(OPENED);
    expect(sheet.findUnrolledShare(OPENED)).toBe(0);
    expect(sheet.findUnrolledShare(OPENED + ROLL_DURATION / 4)).toBeCloseTo(
      0.25,
    );
    sheet.update(OPENED + ROLL_DURATION);
    expect(sheet.findUnrolledShare(OPENED + ROLL_DURATION)).toBe(1);
    const at: number = OPENED + ROLL_DURATION * 2;
    sheet.advance(at);
    expect(sheet.findUnrolledShare(at + ROLL_DURATION / 4)).toBeCloseTo(0.75);
    expect(sheet.findUnrolledShare(at + ROLL_DURATION * 2)).toBe(0);
  });

  it('stands unrolled at once without moving', () => {
    const sheet = new EndingSheet();
    sheet.rollDuration = 0;
    sheet.open(OPENED);
    expect(sheet.findUnrolledShare(OPENED)).toBe(1);
  });

  it('closes at once when told', () => {
    const sheet: EndingSheet = openSheet();
    sheet.close();
    expect(sheet.isOpen).toBe(false);
  });
});

describe('the roll of the credits', () => {
  it('does not roll what fits', () => {
    expect(findRollOffset(60_000, 0)).toBe(0);
    expect(findRollOffset(60_000, -20)).toBe(0);
  });

  it('waits a moment before it rolls', () => {
    expect(findRollOffset(0, 500)).toBe(0);
    expect(findRollOffset(ROLL_PAUSE, 500)).toBe(0);
  });

  it('rolls at its speed after the moment', () => {
    expect(findRollOffset(ROLL_PAUSE + 2000, 500)).toBeCloseTo(
      ROLL_SPEED * 2,
    );
  });

  it('stops at the end', () => {
    expect(findRollOffset(ROLL_PAUSE + 600_000, 500)).toBe(500);
  });

  it('rolls slowly enough to read', () => {
    expect(ROLL_SPEED).toBeGreaterThanOrEqual(15);
    expect(ROLL_SPEED).toBeLessThanOrEqual(45);
  });
});
