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
 * @module client/tests/chat-box Tests for the box the person at the page
 *   types a line in for its player to say.
 */

import { describe, expect, it } from 'vitest';

import { SAY_LENGTH_LIMIT } from '@clovervale/shared';

import { ChatBox } from '../src/chat-box.ts';
import type { ChatKey } from '../src/chat-box.ts';

/**
 * Makes a key pressed by itself, outside any input method.
 *
 * @param {string} key - The key, as `key` tells in a keyboard event.
 * @param {Partial<ChatKey>} [more] - What else to tell of the key.
 * @returns {ChatKey} The key.
 */
function press(key: string, more: Partial<ChatKey> = {}): ChatKey {
  return { key, hasModifier: false, isComposing: false, ...more };
}

/**
 * Opens a box.
 *
 * @returns {ChatBox} The box, open.
 */
function openBox(): ChatBox {
  const box = new ChatBox();
  box.open();
  return box;
}

describe('ChatBox', () => {
  it('is closed at first, and takes no key', () => {
    const box = new ChatBox();
    expect(box.isOpen).toBe(false);
    expect(box.pressKey(press('Enter'), 'hi')).toEqual({
      isHandled: false,
      line: null,
    });
    expect(box.isOpen).toBe(false);
  });

  it('sends what was typed and closes at Enter', () => {
    const box: ChatBox = openBox();
    expect(box.pressKey(press('Enter'), '  Hello there!  ')).toEqual({
      isHandled: true,
      line: 'Hello there!',
    });
    expect(box.isOpen).toBe(false);
  });

  it('closes without a line at Enter with nothing typed', () => {
    const box: ChatBox = openBox();
    expect(box.pressKey(press('Enter'), '   ')).toEqual({
      isHandled: true,
      line: null,
    });
    expect(box.isOpen).toBe(false);
  });

  it('sends no more than a line may hold', () => {
    const box: ChatBox = openBox();
    const typed: string = '葉'.repeat(SAY_LENGTH_LIMIT + 5);
    expect(box.pressKey(press('Enter'), typed).line).toBe(
      '葉'.repeat(SAY_LENGTH_LIMIT),
    );
  });

  it('closes without sending at Esc', () => {
    const box: ChatBox = openBox();
    expect(box.pressKey(press('Escape'), 'Hello there!')).toEqual({
      isHandled: true,
      line: null,
    });
    expect(box.isOpen).toBe(false);
  });

  it('leaves Enter and Esc to an input method that is composing', () => {
    const box: ChatBox = openBox();
    for (const key of ['Enter', 'Escape']) {
      expect(
        box.pressKey(press(key, { isComposing: true }), 'ㄋㄧˇ'),
      ).toEqual({ isHandled: false, line: null });
      expect(box.isOpen).toBe(true);
    }
  });

  it('leaves every key pressed with a modifier alone', () => {
    const box: ChatBox = openBox();
    for (const key of ['Enter', 'Escape', ' ', 'a']) {
      expect(box.pressKey(press(key, { hasModifier: true }), 'hi')).toEqual({
        isHandled: false,
        line: null,
      });
      expect(box.isOpen).toBe(true);
    }
  });

  it('leaves the keys of the game and every other key alone', () => {
    const box: ChatBox = openBox();
    for (const key of ['w', 'a', 's', 'd', ' ', 'i', 'h', 'ArrowLeft', 'Tab']) {
      expect(box.pressKey(press(key), 'hi')).toEqual({
        isHandled: false,
        line: null,
      });
      expect(box.isOpen).toBe(true);
    }
  });

  it('sends what a button asks it to, and closes', () => {
    const box: ChatBox = openBox();
    expect(box.send('Hello there!')).toBe('Hello there!');
    expect(box.isOpen).toBe(false);
  });

  it('closes without sending when told to', () => {
    const box: ChatBox = openBox();
    box.close();
    expect(box.isOpen).toBe(false);
  });
});
