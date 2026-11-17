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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/network-delay Tests for holding messages back.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DelayLine } from '../src/network-delay.ts';

describe('a delay line', () => {
  let delivered: string[];
  let line: DelayLine<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    delivered = [];
    line = new DelayLine<string>((message: string) => {
      delivered.push(message);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a message without a delay on at once', () => {
    line.send('a', 0);
    expect(delivered).toEqual(['a']);
  });

  it('holds a message back for its delay, and no longer', () => {
    line.send('a', 250);
    vi.advanceTimersByTime(249);
    expect(delivered).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(delivered).toEqual(['a']);
  });

  it('holds every message back for its own delay', () => {
    line.send('a', 100);
    vi.advanceTimersByTime(60);
    line.send('b', 100);
    vi.advanceTimersByTime(40);
    expect(delivered).toEqual(['a']);
    vi.advanceTimersByTime(59);
    expect(delivered).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(delivered).toEqual(['a', 'b']);
  });

  it('keeps the order of the messages when the delay gets shorter', () => {
    line.send('a', 300);
    vi.advanceTimersByTime(50);
    line.send('b', 100);
    line.send('c', 0);
    vi.advanceTimersByTime(249);
    expect(delivered).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(delivered).toEqual(['a', 'b', 'c']);
    line.send('d', 0);
    expect(delivered).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops what it holds back when it is cleared', () => {
    line.send('a', 100);
    line.send('b', 200);
    line.clear();
    vi.advanceTimersByTime(1000);
    expect(delivered).toEqual([]);
    line.send('c', 0);
    expect(delivered).toEqual(['c']);
  });
});
