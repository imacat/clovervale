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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/speech-text Tests for how the text of a speech
 *   bubble is broken into lines, and how long it takes to read.
 */

import { describe, expect, it } from 'vitest';

import {
  CHARACTER_READING_SPEED,
  measureSpeechDuration,
  wrapText,
} from '../src/speech-text.ts';

/** What Nancy says of the wild dogs, in English. */
const NANCY_DOGS_LINE =
  'There are wild dogs at the village gate, and no one can go out. What ' +
  'are we going to do?';

/** What Nancy says of the wild dogs, in Traditional Chinese. */
const NANCY_DOGS_LINE_ZH_TW = '村口有野狗，大家都沒辦法出門，怎麼辦？';

describe('wrapText', () => {
  /**
   * Measures a text by its number of characters.
   *
   * @param {string} text - The text.
   * @returns {number} The width.
   */
  const measure = (text: string): number => text.length;

  it('breaks a text between words into lines no wider than told', () => {
    expect(wrapText('a bb ccc dddd', 6, measure)).toEqual([
      'a bb',
      'ccc',
      'dddd',
    ]);
  });

  it('starts a new line at a line break, and wraps each row', () => {
    expect(wrapText('one two\nthree', 20, measure)).toEqual([
      'one two',
      'three',
    ]);
    expect(wrapText('one two three\nfour five six', 9, measure)).toEqual([
      'one two',
      'three',
      'four five',
      'six',
    ]);
  });

  it('leaves a word wider than told on a line of its own', () => {
    expect(wrapText('abcdefgh ij', 4, measure)).toEqual(['abcdefgh', 'ij']);
  });

  it('breaks Chinese between characters, not before punctuation', () => {
    expect(wrapText(NANCY_DOGS_LINE_ZH_TW, 6, measure)).toEqual([
      '村口有野狗，',
      '大家都沒辦法',
      '出門，怎麼',
      '辦？',
    ]);
  });

  it('breaks Japanese, not before small kana or punctuation', () => {
    expect(wrapText('なっちゃったの。どうしよう……', 4, measure)).toEqual([
      'なっ',
      'ちゃった',
      'の。どう',
      'しよ',
      'う……',
    ]);
  });

  it('does not break after an opening bracket', () => {
    expect(wrapText('她說「快走」了', 3, measure)).toEqual([
      '她說',
      '「快',
      '走」了',
    ]);
  });

  it('keeps words of letters whole among Chinese characters', () => {
    expect(wrapText('按Space鍵', 3, measure)).toEqual(['按', 'Space', '鍵']);
  });
});

describe('measureSpeechDuration', () => {
  it('leaves time to read a line at three words a second', () => {
    const words: number = NANCY_DOGS_LINE.split(' ').length;
    expect(measureSpeechDuration(NANCY_DOGS_LINE)).toBeGreaterThanOrEqual(
      words / 3,
    );
  });

  it('shows a longer line for longer', () => {
    expect(measureSpeechDuration('Hello there, and welcome.')).toBeGreaterThan(
      measureSpeechDuration('Hello.'),
    );
  });

  it('leaves time to read Chinese and Japanese by their characters', () => {
    expect(measureSpeechDuration(NANCY_DOGS_LINE_ZH_TW)).toBeGreaterThanOrEqual(
      20 / CHARACTER_READING_SPEED,
    );
    expect(measureSpeechDuration(NANCY_DOGS_LINE_ZH_TW)).toBeGreaterThan(
      measureSpeechDuration('怎麼辦？'),
    );
    expect(measureSpeechDuration('どうしようかな。')).toBeGreaterThan(
      measureSpeechDuration('どうも。'),
    );
  });
});
