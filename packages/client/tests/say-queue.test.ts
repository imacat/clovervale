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
 * @module client/tests/say-queue Tests for the lines the player of the
 *   page is yet to say.
 */

import { describe, expect, it } from 'vitest';

import { SAY_INTERVAL } from '@clovervale/shared';

import { SAY_SPACING, SayQueue } from '../src/say-queue.ts';

/** The least time the server asks between two lines, in milliseconds. */
const SERVER_INTERVAL: number = SAY_INTERVAL * 1000;

describe('SayQueue', () => {
  it('has nothing to say at first', () => {
    const queue = new SayQueue();
    expect(queue.takeDue(0)).toBeNull();
    expect(queue.length).toBe(0);
  });

  it('says the first line at once', () => {
    const queue = new SayQueue();
    queue.add('One.');
    expect(queue.takeDue(1000)).toBe('One.');
    expect(queue.takeDue(1000)).toBeNull();
  });

  it('keeps a line sent too soon, and says it once its time has come', () => {
    const queue = new SayQueue();
    queue.add('One.');
    queue.takeDue(1000);
    queue.add('Two.');
    expect(queue.takeDue(1500)).toBeNull();
    expect(queue.length).toBe(1);
    expect(queue.takeDue(1000 + SAY_SPACING - 1)).toBeNull();
    expect(queue.takeDue(1000 + SAY_SPACING)).toBe('Two.');
    expect(queue.length).toBe(0);
  });

  it('waits a little longer than the server asks', () => {
    const queue = new SayQueue();
    queue.add('One.');
    queue.takeDue(0);
    queue.add('Two.');
    expect(queue.takeDue(SERVER_INTERVAL)).toBeNull();
    expect(SAY_SPACING).toBeGreaterThan(SERVER_INTERVAL);
  });

  it('says the lines that queue up in order, each in its turn', () => {
    const queue = new SayQueue();
    for (const line of ['One.', 'Two.', 'Three.']) {
      queue.add(line);
    }
    expect(queue.takeDue(0)).toBe('One.');
    expect(queue.takeDue(SAY_SPACING)).toBe('Two.');
    expect(queue.takeDue(SAY_SPACING + 1)).toBeNull();
    expect(queue.takeDue(SAY_SPACING * 2 - 1)).toBeNull();
    expect(queue.takeDue(SAY_SPACING * 2)).toBe('Three.');
  });

  it('counts the wait from when the line before was said, not sent', () => {
    const queue = new SayQueue();
    queue.add('One.');
    queue.takeDue(0);
    queue.add('Two.');
    expect(queue.takeDue(SAY_SPACING + 700)).toBe('Two.');
    queue.add('Three.');
    expect(queue.takeDue(SAY_SPACING * 2)).toBeNull();
    expect(queue.takeDue(SAY_SPACING * 2 + 700)).toBe('Three.');
  });

  it('says a line at once long after the one before it', () => {
    const queue = new SayQueue();
    queue.add('One.');
    queue.takeDue(0);
    queue.add('Two.');
    expect(queue.takeDue(SAY_SPACING * 5)).toBe('Two.');
  });

  it('drops the lines it holds once cleared, and starts afresh', () => {
    const queue = new SayQueue();
    queue.add('One.');
    queue.takeDue(0);
    queue.add('Two.');
    queue.add('Three.');
    queue.clear();
    expect(queue.length).toBe(0);
    expect(queue.takeDue(SAY_SPACING * 2)).toBeNull();
    queue.add('Four.');
    expect(queue.takeDue(SAY_SPACING * 2 + 1)).toBe('Four.');
    queue.clear();
    queue.add('Five.');
    expect(queue.takeDue(SAY_SPACING * 2 + 2)).toBe('Five.');
  });
});
