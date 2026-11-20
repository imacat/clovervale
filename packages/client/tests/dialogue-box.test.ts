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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/dialogue-box Tests for the dialogue box the person
 *   at the page answers a villager in.
 */

import { describe, expect, it } from 'vitest';

import type { DialogueView } from '@clovervale/shared';

import { DialogueBox } from '../src/dialogue-box.ts';

/** A line with three replies. */
const ASKED: DialogueView = {
  villager: 'edwin',
  line: 'dialogue.edwin.plea',
  replies: ['a', 'b', 'c'],
  turn: 4,
};

/** A line with no reply, which only ends. */
const LAST: DialogueView = {
  villager: 'edwin',
  line: 'dialogue.edwin.errand',
  replies: [],
  turn: 5,
};

/**
 * Opens a dialogue box on a line.
 *
 * @param {DialogueView} dialogue - The line.
 * @returns {DialogueBox} The box.
 */
function openBox(dialogue: DialogueView): DialogueBox {
  const box = new DialogueBox();
  box.noticeDialogue(dialogue);
  return box;
}

describe('a dialogue box', () => {
  it('is closed, and takes no key, while there is no dialogue', () => {
    const box = new DialogueBox();
    expect(box.isOpen).toBe(false);
    expect(box.pressKey('Enter')).toEqual({ isHandled: false, request: null });
    expect(box.pressKey('KeyW')).toEqual({ isHandled: false, request: null });
  });

  it('takes every key while open, so that the player does not move', () => {
    const box: DialogueBox = openBox(ASKED);
    for (const code of ['KeyW', 'ArrowLeft', 'Space', 'KeyI']) {
      expect(box.pressKey(code)).toEqual({ isHandled: true, request: null });
    }
    expect(box.cursor).toBe(0);
  });

  it('moves its cursor over the replies, stopping at the ends', () => {
    const box: DialogueBox = openBox(ASKED);
    box.pressKey('ArrowUp');
    expect(box.cursor).toBe(0);
    box.pressKey('ArrowDown');
    box.pressKey('ArrowDown');
    box.pressKey('ArrowDown');
    expect(box.cursor).toBe(2);
    box.pressKey('ArrowUp');
    expect(box.cursor).toBe(1);
  });

  it('answers with the reply the cursor is on, once', () => {
    const box: DialogueBox = openBox(ASKED);
    box.pressKey('ArrowDown');
    expect(box.pressKey('Enter').request).toEqual({ type: 'reply', choice: 1 });
    expect(box.pressKey('Enter').request).toBeNull();
    box.noticeDialogue(LAST);
    expect(box.cursor).toBe(0);
    expect(box.pressKey('Enter').request).toEqual({ type: 'reply', choice: 0 });
  });

  it('takes Esc without ending the dialogue', () => {
    const box: DialogueBox = openBox(LAST);
    expect(box.pressKey('Escape')).toEqual({ isHandled: true, request: null });
    expect(box.isOpen).toBe(true);
    expect(box.clickReply(0)).toEqual({ type: 'reply', choice: 0 });
  });

  it('answers with a reply clicked', () => {
    const box: DialogueBox = openBox(ASKED);
    expect(box.clickReply(5)).toBeNull();
    expect(box.clickReply(2)).toEqual({ type: 'reply', choice: 2 });
    expect(box.cursor).toBe(2);
  });

  it('closes once the server tells of no dialogue', () => {
    const box: DialogueBox = openBox(ASKED);
    box.pressKey('Enter');
    box.noticeDialogue(null);
    expect(box.isOpen).toBe(false);
    expect(box.pressKey('Escape')).toEqual({ isHandled: false, request: null });
  });
});
