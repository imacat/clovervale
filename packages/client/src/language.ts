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
 * @module client/language The languages the page speaks, and choosing
 *   the one it speaks to the person at it.
 */

/** A language the page speaks, by its language tag. */
export type LanguageCode = 'en' | 'es' | 'ja' | 'zh-TW' | 'zh-CN';

/** A language the page speaks. */
export interface Language {
  /** The language tag of the language. */
  readonly code: LanguageCode;
  /** The name of the language, in the language itself. */
  readonly name: string;
  /**
   * The fonts to draw text of the language in, as a CSS font family list,
   * so that its characters take the forms the language gives them.
   */
  readonly fontFamily: string;
}

/** Where the choice of a language is remembered. */
export interface LanguageStorage {
  /**
   * Reads an item.
   *
   * @param {string} key - The key of the item.
   * @returns {string | null} The item, or `null` if there is none.
   */
  getItem(key: string): string | null;
  /**
   * Writes an item.
   *
   * @param {string} key - The key of the item.
   * @param {string} value - The item.
   */
  setItem(key: string, value: string): void;
}

/**
 * The languages the page speaks, in the code point order of their names.
 */
export const LANGUAGES: readonly Language[] = [
  { code: 'en', name: 'English', fontFamily: 'sans-serif' },
  { code: 'es', name: 'Español', fontFamily: 'sans-serif' },
  {
    code: 'ja',
    name: '日本語',
    fontFamily:
      '"Noto Sans CJK JP", "Noto Sans JP", "Source Han Sans JP", ' +
      '"Hiragino Sans", "Yu Gothic", Meiryo, sans-serif',
  },
  {
    code: 'zh-TW',
    name: '正體中文',
    fontFamily:
      '"Noto Sans CJK TC", "Noto Sans TC", "Source Han Sans TC", ' +
      '"PingFang TC", "Microsoft JhengHei", sans-serif',
  },
  {
    code: 'zh-CN',
    name: '简体中文',
    fontFamily:
      '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", ' +
      '"PingFang SC", "Microsoft YaHei", sans-serif',
  },
];

/** The language the page speaks without anything else to go by. */
export const DEFAULT_LANGUAGE = 'en' satisfies LanguageCode;

/** The key the choice of a language is remembered by. */
const STORAGE_KEY = 'clovervale.language';

/** The regions whose Chinese is written in Traditional characters. */
const TRADITIONAL_REGIONS: readonly string[] = ['tw', 'hk', 'mo'];

/** The regions whose Chinese is written in Simplified characters. */
const SIMPLIFIED_REGIONS: readonly string[] = ['cn', 'sg'];

/**
 * Finds a language the page speaks.
 *
 * @param {LanguageCode} code - The language tag of the language.
 * @returns {Language} The language.
 */
export function findLanguage(code: LanguageCode): Language {
  return (
    LANGUAGES.find((language: Language) => language.code === code) ??
    findLanguage(DEFAULT_LANGUAGE)
  );
}

/**
 * Finds the language the page speaks for a language tag.
 *
 * @param {string} tag - The language tag, as the browser tells it, in any
 *   case.
 * @returns {LanguageCode | null} Traditional Chinese for the Chinese of
 *   Taiwan, Hong Kong and Macau or in Traditional characters, Simplified
 *   Chinese for the Chinese of China and Singapore, in Simplified
 *   characters or without more said, Japanese for any Japanese, Spanish
 *   for any Spanish, English for any English, and `null` for anything
 *   else.
 */
export function matchLanguage(tag: string): LanguageCode | null {
  const [primary, ...rest] = tag.toLowerCase().split('-');
  if (primary === 'en') {
    return 'en';
  }
  if (primary === 'ja') {
    return 'ja';
  }
  if (primary === 'es') {
    return 'es';
  }
  if (primary !== 'zh') {
    return null;
  }
  if (rest.includes('hant')) {
    return 'zh-TW';
  }
  if (rest.includes('hans') || rest.length === 0) {
    return 'zh-CN';
  }
  const [region = ''] = rest;
  if (TRADITIONAL_REGIONS.includes(region)) {
    return 'zh-TW';
  }
  if (SIMPLIFIED_REGIONS.includes(region)) {
    return 'zh-CN';
  }
  return null;
}

/**
 * Chooses the language the page speaks.
 *
 * @param {LanguageCode | null} saved - The language the person chose
 *   before, if any.
 * @param {readonly string[]} preferred - The language tags the browser
 *   prefers, the most preferred first.
 * @returns {LanguageCode} The language chosen before, if any, or else the
 *   first preferred that the page speaks, as
 *   {@link matchLanguage} finds, or else English.
 */
export function chooseLanguage(
  saved: LanguageCode | null,
  preferred: readonly string[],
): LanguageCode {
  if (saved !== null) {
    return saved;
  }
  for (const tag of preferred) {
    const matched: LanguageCode | null = matchLanguage(tag);
    if (matched !== null) {
      return matched;
    }
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Finds where the browser lets the page remember the choice of a language.
 *
 * @returns {LanguageStorage | null} The local storage of the browser, or
 *   `null` if the browser does not let the page have it.
 */
export function findLanguageStorage(): LanguageStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the language the person chose before.
 *
 * @param {LanguageStorage | null} storage - Where the choice is
 *   remembered, or `null` if nowhere.
 * @returns {LanguageCode | null} The language, or `null` if none is
 *   remembered, the storage cannot be read, or the page does not speak it.
 */
export function readSavedLanguage(
  storage: LanguageStorage | null,
): LanguageCode | null {
  let saved: string | null;
  try {
    saved = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  const found: Language | undefined = LANGUAGES.find(
    (language: Language) => language.code === saved,
  );
  return found?.code ?? null;
}

/**
 * Remembers the language the person chooses, if it can.
 *
 * @param {LanguageStorage | null} storage - Where to remember it, or
 *   `null` if nowhere.
 * @param {LanguageCode} code - The language.
 */
export function saveLanguage(
  storage: LanguageStorage | null,
  code: LanguageCode,
): void {
  try {
    storage?.setItem(STORAGE_KEY, code);
  } catch {
    // The page works the same, only without remembering.
  }
}
