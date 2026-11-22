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
 * @module client/dialogue-words Wording what is said in a dialogue, and
 *   the counts it names, in the language of the page.
 */

import { HEALING_POTION_PRICE } from '@clovervale/shared';

import type { LanguageCode } from './language.ts';
import { EN_MESSAGES } from './messages/en.ts';
import type { MessageId, PlaceholderOf } from './messages/en.ts';
import { isMessageId } from './translator.ts';
import type { Translator } from './translator.ts';

/** A message that takes the price of a healing potion, and nothing else. */
type PricedMessageId = {
  [Id in MessageId]: [PlaceholderOf<(typeof EN_MESSAGES)[Id]>] extends [
    'price',
  ]
    ? ['price'] extends [PlaceholderOf<(typeof EN_MESSAGES)[Id]>]
      ? Id
      : never
    : never;
}[MessageId];

/** The English words for the counts from zero to twelve. */
const ENGLISH_COUNTS: readonly string[] = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/** The Spanish words for the counts from zero to twelve. */
const SPANISH_COUNTS: readonly string[] = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
];

/** The Chinese digits from zero to nine. */
const CHINESE_DIGITS: readonly string[] = [
  '零',
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
];

/** The Chinese word for ten. */
const CHINESE_TEN = '十';

/** The word for a count of two things, by the Chinese language. */
const CHINESE_TWO: Readonly<Record<'zh-TW' | 'zh-CN', string>> = {
  'zh-TW': '兩',
  'zh-CN': '两',
};

/**
 * Words a count of things in Chinese, as it is said before the measure word
 * of what is counted.
 *
 * @param {number} count - The count, a whole number from zero below 100.
 * @param {'zh-TW' | 'zh-CN'} code - The Chinese language.
 * @returns {string} The count in Chinese numerals.
 */
function wordChineseCount(count: number, code: 'zh-TW' | 'zh-CN'): string {
  if (count === 2) {
    return CHINESE_TWO[code];
  }
  if (count < 10) {
    return CHINESE_DIGITS[count] ?? String(count);
  }
  const tens: number = Math.floor(count / 10);
  const ones: number = count % 10;
  return (
    (tens === 1 ? '' : (CHINESE_DIGITS[tens] ?? '')) +
    CHINESE_TEN +
    (ones === 0 ? '' : (CHINESE_DIGITS[ones] ?? ''))
  );
}

/**
 * Words a count of things in a language, as it is said in speech: in words
 * up to twelve in English and in Spanish, in Chinese numerals below a
 * hundred in Chinese, and in digits otherwise, as Japanese has it.
 *
 * @param {number} count - The count.
 * @param {LanguageCode} code - The language.
 * @returns {string} The count, worded.
 */
export function wordCount(count: number, code: LanguageCode): string {
  if (!Number.isInteger(count) || count < 0) {
    return String(count);
  }
  switch (code) {
    case 'en':
      return ENGLISH_COUNTS[count] ?? String(count);
    case 'zh-TW':
    case 'zh-CN':
      return count < 100 ? wordChineseCount(count, code) : String(count);
    case 'ja':
      return String(count);
    case 'es':
      return SPANISH_COUNTS[count] ?? String(count);
  }
}

/**
 * Tells whether a name, as the server may give it, is that of a message of
 * the page that takes the price of a healing potion, and nothing else.
 *
 * @param {string} id - The name.
 * @returns {boolean} Whether the page has such a message.
 */
function isPricedMessageId(id: string): id is PricedMessageId {
  if (!Object.hasOwn(EN_MESSAGES, id)) {
    return false;
  }
  const names: string[] = [
    ...EN_MESSAGES[id as MessageId].matchAll(/\{(\w+)\}/gu),
  ].map((match: RegExpExecArray) => match[1] ?? '');
  return names.length > 0 && names.every((name: string) => name === 'price');
}

/**
 * Words a message of a dialogue, as the server names it, in the language of
 * the page: one that takes the price of a healing potion with
 * {@link HEALING_POTION_PRICE} worded as a count is said in that language.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {string} id - The name of the message.
 * @returns {string} The message, or nothing if the page has no such
 *   message, or it takes any other value.
 */
export function wordDialogueText(translator: Translator, id: string): string {
  if (isMessageId(id)) {
    return translator.translate(id);
  }
  if (isPricedMessageId(id)) {
    return translator.translate(id, {
      price: wordCount(HEALING_POTION_PRICE, translator.language),
    });
  }
  return '';
}
