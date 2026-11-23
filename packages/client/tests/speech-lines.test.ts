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
 * @module client/tests/speech-lines Tests for the lines the villagers say
 *   in their bubbles, and the names they go by.
 */

import { describe, expect, it } from 'vitest';

import { getVillager } from '@clovervale/shared';
import type { Villager } from '@clovervale/shared';

import { SpeechLines } from '../src/speech-lines.ts';
import { Translator } from '../src/translator.ts';

/** Nancy the villager. */
const NANCY: Villager = getVillager('nancy');

/** Martha the village chief, who has two lines. */
const MARTHA: Villager = getVillager('martha');

/** What Martha says, in English, in order. */
const MARTHA_LINES: readonly string[] = [
  "Welcome to Clovervale. I'm Martha, the village chief. If you need " +
    'anything, just come and see me.',
  'That well dried up long ago, so I boarded it up to keep the children ' +
    'from falling in.',
];

/** What Nancy says first, to welcome a player, in English. */
const NANCY_WELCOME =
  'Welcome to Clovervale! If you need anything, go and see the village ' +
  'chief. She lives in the biggest house, right at the back.';

/** What Nancy says first, to welcome a player, in Traditional Chinese. */
const NANCY_WELCOME_ZH_TW =
  '歡迎來到四葉谷！有事可以找村長，她住在後面最大的那間房子。';

/** What Nancy says of the wild dogs, in English. */
const NANCY_DOGS_LINE =
  'There are wild dogs at the village gate, and no one can go out. What ' +
  'are we going to do?';

/** Numbers in [0, 1) spread over the whole of it, in no order. */
const SPREAD: readonly number[] = [0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.9];

/**
 * Makes a source of random numbers that gives the same numbers, in turn,
 * over and over.
 *
 * @param {readonly number[]} numbers - The numbers, each in [0, 1).
 * @returns {() => number} The source.
 */
function createSequence(numbers: readonly number[]): () => number {
  let index = 0;
  return (): number => numbers[index++ % numbers.length] ?? 0;
}

/**
 * Makes the words of the bubbles in English, which pick lines by a source
 * of random numbers that gives the same numbers, in turn, over and over.
 *
 * @param {readonly number[]} numbers - The numbers, each in [0, 1).
 * @param {Translator} [translator] - The translator of the text of the
 *   page, in English by default.
 * @returns {SpeechLines} The words.
 */
function createLines(
  numbers: readonly number[],
  translator: Translator = new Translator(),
): SpeechLines {
  return new SpeechLines(translator, createSequence(numbers));
}

/**
 * Talks to a villager over and over, and notes what it says each time.
 *
 * @param {SpeechLines} lines - The words of the bubbles.
 * @param {Villager} villager - The villager.
 * @param {number} count - How many times to talk to it.
 * @returns {string[]} What it says, in order.
 */
function talkRepeatedly(
  lines: SpeechLines,
  villager: Villager,
  count: number,
): string[] {
  const said: string[] = [];
  for (let i = 0; i < count; i++) {
    const index: number = lines.pickLine(villager);
    said.push(lines.describeVillagerLine(villager, index, null).line);
  }
  return said;
}

describe('SpeechLines with a villager who has several lines', () => {
  it('says each of the lines in time', () => {
    for (const numbers of [SPREAD, [0], [0.99]]) {
      const lines: SpeechLines = createLines(numbers);
      expect(new Set(talkRepeatedly(lines, MARTHA, 10))).toEqual(
        new Set(MARTHA_LINES),
      );
    }
  });

  it('never says the same line twice running', () => {
    for (const numbers of [SPREAD, [0], [0.5], [0.99]]) {
      const said: string[] = talkRepeatedly(createLines(numbers), MARTHA, 20);
      said.slice(1).forEach((line: string, index: number) => {
        expect(line).not.toBe(said[index]);
      });
    }
  });

  it('has Nancy welcome a player the first time, whatever the chance', () => {
    for (const numbers of [SPREAD, [0], [0.5], [0.99]]) {
      expect(talkRepeatedly(createLines(numbers), NANCY, 1)).toEqual([
        NANCY_WELCOME,
      ]);
    }
  });

  it('has Nancy welcome a player first in the language of the page', async () => {
    const zhTw = new Translator();
    await zhTw.choose('zh-TW');
    const lines: SpeechLines = createLines([0.99], zhTw);
    expect(talkRepeatedly(lines, NANCY, 1)).toEqual([NANCY_WELCOME_ZH_TW]);
  });

  it('has Nancy say each of her lines in time after her welcome', () => {
    for (const numbers of [SPREAD, [0], [0.99]]) {
      const said: string[] = talkRepeatedly(createLines(numbers), NANCY, 11);
      expect(new Set(said.slice(1))).toEqual(
        new Set([NANCY_WELCOME, NANCY_DOGS_LINE]),
      );
      said.slice(1).forEach((line: string, index: number) => {
        expect(line).not.toBe(said[index]);
      });
    }
  });

  it('puts her name in the line that names her', () => {
    const lines: SpeechLines = createLines([0]);
    expect(
      lines.describeVillagerLine(MARTHA, lines.pickLine(MARTHA), null),
    ).toMatchObject({
      name: 'Chief Martha',
      line: MARTHA_LINES[0],
    });
  });
});
