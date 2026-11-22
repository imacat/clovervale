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
 * @module shared/tests/chat Tests for what a player says to the players
 *   nearby.
 */

import { describe, expect, it } from 'vitest';

import {
  SAY_BREAK_LIMIT,
  SAY_LENGTH_LIMIT,
  cleanSayText,
  isSayText,
} from '../src/chat.ts';

/** A family of four, which the browser counts as eleven characters. */
const FAMILY = '👨‍👩‍👧‍👦';

describe('cleanSayText', () => {
  it('keeps a plain line as it was typed, in any language', () => {
    expect(cleanSayText('Hello there!')).toBe('Hello there!');
    expect(cleanSayText('大家好，我在噴泉這邊')).toBe('大家好，我在噴泉這邊');
    expect(cleanSayText('こんにちは 🍀')).toBe('こんにちは 🍀');
  });

  it('trims the spaces at the ends of a line', () => {
    expect(cleanSayText('  hi  there \u3000')).toBe('hi  there');
  });

  it('turns the control characters of a line into spaces', () => {
    expect(cleanSayText('three\tfour')).toBe('three four');
    expect(cleanSayText('bell\u0007and\u001Bmore\u0000')).toBe(
      'bell and more',
    );
  });

  it('keeps a line break, of whatever kind, as one line feed', () => {
    const breaks: string[] = [
      '\n',
      '\r',
      '\r\n',
      '\v',
      '\f',
      String.fromCodePoint(0x85),
      String.fromCodePoint(0x2028),
      String.fromCodePoint(0x2029),
    ];
    for (const lineBreak of breaks) {
      expect(cleanSayText(`one${lineBreak}two`)).toBe('one\ntwo');
    }
  });

  it('makes one line break of a run of them and the spaces among them', () => {
    expect(cleanSayText('one\n\n\ntwo')).toBe('one\ntwo');
    expect(cleanSayText('one \r\n \t \n\u0007\n  two')).toBe('one\ntwo');
  });

  it('starts and ends a line with no line break', () => {
    expect(cleanSayText('\n\n one\ntwo \n \n')).toBe('one\ntwo');
  });

  it('keeps three line breaks at most, and makes spaces of the rest', () => {
    expect(SAY_BREAK_LIMIT).toBe(3);
    expect(cleanSayText('1\n2\n3\n4')).toBe('1\n2\n3\n4');
    expect(cleanSayText('1\n2\n3\n4\n5\n\n6')).toBe('1\n2\n3\n4 5 6');
  });

  it('counts a line break as a character of the line', () => {
    const row: string = 'a'.repeat(SAY_LENGTH_LIMIT / 2);
    expect(cleanSayText(`${row}\n${row}`)).toBe(`${row}\n${row.slice(1)}`);
    const full: string = 'a'.repeat(SAY_LENGTH_LIMIT);
    expect(cleanSayText(`${full}\nmore`)).toBe(full);
  });

  it('has nothing to say of an empty line or of spaces alone', () => {
    expect(cleanSayText('')).toBeNull();
    expect(cleanSayText('   ')).toBeNull();
    expect(cleanSayText(' \n\t ')).toBeNull();
  });

  it('keeps a line of exactly as many characters as a line may have', () => {
    const line: string = '字'.repeat(SAY_LENGTH_LIMIT);
    expect(cleanSayText(line)).toBe(line);
  });

  it('cuts a longer line to as many characters as a line may have', () => {
    expect(cleanSayText('a'.repeat(SAY_LENGTH_LIMIT + 20))).toBe(
      'a'.repeat(SAY_LENGTH_LIMIT),
    );
    expect(cleanSayText('字'.repeat(SAY_LENGTH_LIMIT + 1))).toBe(
      '字'.repeat(SAY_LENGTH_LIMIT),
    );
  });

  it('counts as the browser does, an emoji as two or more', () => {
    expect('🍀').toHaveLength(2);
    const line: string = '🍀'.repeat(SAY_LENGTH_LIMIT / 2);
    expect(cleanSayText(line)).toBe(line);
    expect(cleanSayText(`${line}!`)).toBe(line);
    expect(cleanSayText(FAMILY.repeat(20))).toHaveLength(SAY_LENGTH_LIMIT - 1);
  });

  it('never leaves half an emoji where it cuts a line', () => {
    const line = `a${'🍀'.repeat(SAY_LENGTH_LIMIT / 2)}`;
    expect(line).toHaveLength(SAY_LENGTH_LIMIT + 1);
    expect(cleanSayText(line)).toBe(
      `a${'🍀'.repeat(SAY_LENGTH_LIMIT / 2 - 1)}`,
    );
  });

  it('leaves no space at the end of a line it cuts', () => {
    const line = `${'a'.repeat(SAY_LENGTH_LIMIT - 1)} b`;
    expect(cleanSayText(line)).toBe('a'.repeat(SAY_LENGTH_LIMIT - 1));
  });
});

describe('isSayText', () => {
  it('takes a line a player can say', () => {
    expect(isSayText('Hello there!')).toBe(true);
    expect(isSayText('one\ntwo\nthree\nfour')).toBe(true);
  });

  it.each([
    ['is no text', 7],
    ['is empty', ''],
    ['has spaces at its ends', ' hi '],
    ['has a tab', 'one\ttwo'],
    ['has two line breaks running', 'one\n\ntwo'],
    ['ends with a line break', 'one\n'],
    ['has a carriage return', 'one\rtwo'],
    ['has more line breaks than a line may', '1\n2\n3\n4\n5'],
    ['is too long', 'a'.repeat(SAY_LENGTH_LIMIT + 1)],
  ])('refuses what %s', (_, value) => {
    expect(isSayText(value)).toBe(false);
  });
});
