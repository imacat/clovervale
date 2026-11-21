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
 * @module client/tests/dialogue-words Tests for wording what is said in a
 *   dialogue, and the counts it names.
 */

import { describe, expect, it } from 'vitest';

import { HEALING_POTION_PRICE } from '@clovervale/shared';

import { wordCount, wordDialogueText } from '../src/dialogue-words.ts';
import type { LanguageCode } from '../src/language.ts';
import { Translator } from '../src/translator.ts';

/**
 * Makes a translator that speaks a language.
 *
 * @param {LanguageCode} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(code: LanguageCode): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

describe('wordCount', () => {
  it.each([
    [1, 'en', 'one'],
    [3, 'en', 'three'],
    [12, 'en', 'twelve'],
    [13, 'en', '13'],
    [3, 'zh-TW', '三'],
    [2, 'zh-TW', '兩'],
    [2, 'zh-CN', '两'],
    [10, 'zh-TW', '十'],
    [12, 'zh-CN', '十二'],
    [20, 'zh-TW', '二十'],
    [35, 'zh-CN', '三十五'],
    [100, 'zh-TW', '100'],
    [3, 'ja', '3'],
  ] as const)(
    'words %i in %s as "%s"',
    (count: number, code: LanguageCode, words: string) => {
      expect(wordCount(count, code)).toBe(words);
    },
  );
});

describe('wordDialogueText', () => {
  it('words the price of a potion into the offer of Basil', async () => {
    expect(HEALING_POTION_PRICE).toBe(3);
    expect(
      wordDialogueText(await createTranslator('zh-TW'), 'dialogue.basil.offer'),
    ).toBe('你好你好！要買治療藥水嗎？一瓶三枚銀幣！');
    expect(
      wordDialogueText(await createTranslator('en'), 'dialogue.basil.offer'),
    ).toContain('three silver coins');
    expect(
      wordDialogueText(await createTranslator('ja'), 'dialogue.basil.offer'),
    ).toContain('銀貨3枚');
    expect(
      wordDialogueText(await createTranslator('zh-CN'), 'dialogue.basil.offer'),
    ).toContain('三枚银币');
  });

  it('words a line that takes no value', async () => {
    expect(
      wordDialogueText(await createTranslator('zh-TW'), 'dialogue.basil.buy'),
    ).toBe('買一瓶。');
  });

  it('words nothing for a message the page does not have', async () => {
    expect(
      wordDialogueText(await createTranslator('en'), 'dialogue.basil.haggle'),
    ).toBe('');
  });

  it('words nothing for a message that takes another value', async () => {
    expect(
      wordDialogueText(await createTranslator('en'), 'inventory.silver'),
    ).toBe('');
  });
});
