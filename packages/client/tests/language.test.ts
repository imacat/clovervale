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
 * @module client/tests/language Tests for choosing the language of the
 *   page.
 */

import { describe, expect, it } from 'vitest';

import {
  LANGUAGES,
  chooseLanguage,
  matchLanguage,
  readSavedLanguage,
  saveLanguage,
} from '../src/language.ts';
import type { LanguageStorage } from '../src/language.ts';

/** A storage that refuses every access, as a browser may. */
const REFUSING_STORAGE: LanguageStorage = {
  getItem: (): string | null => {
    throw new Error('The storage is not available.');
  },
  setItem: (): void => {
    throw new Error('The storage is not available.');
  },
};

/**
 * Makes a storage that keeps its items in memory.
 *
 * @returns {LanguageStorage & { items: Map<string, string> }} The storage,
 *   with its items.
 */
function createStorage(): LanguageStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string): string | null => items.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      items.set(key, value);
    },
  };
}

describe('LANGUAGES', () => {
  it('names each language in the language itself, English first', () => {
    expect(
      LANGUAGES.map(({ code, name }) => [code, name]),
    ).toEqual([
      ['en', 'English'],
      ['zh-TW', '正體中文'],
      ['zh-CN', '简体中文'],
      ['ja', '日本語'],
      ['es', 'Español'],
    ]);
  });
});

describe('matchLanguage', () => {
  it('takes the Chinese of Taiwan, Hong Kong and Macau as Traditional', () => {
    for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-SG']) {
      expect(matchLanguage(tag)).toBe('zh-TW');
    }
  });

  it('takes the Chinese of China and Singapore, or bare, as Simplified', () => {
    for (const tag of ['zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW', 'zh']) {
      expect(matchLanguage(tag)).toBe('zh-CN');
    }
  });

  it('takes any Japanese as Japanese', () => {
    expect(matchLanguage('ja')).toBe('ja');
    expect(matchLanguage('ja-JP')).toBe('ja');
  });

  it('takes any Spanish as Spanish', () => {
    for (const tag of ['es', 'es-ES', 'es-MX', 'es-AR', 'es-419']) {
      expect(matchLanguage(tag)).toBe('es');
    }
  });

  it('takes any English as English', () => {
    for (const tag of ['en', 'en-US', 'en-GB']) {
      expect(matchLanguage(tag)).toBe('en');
    }
  });

  it('ignores the case of the letters', () => {
    expect(matchLanguage('ZH-tw')).toBe('zh-TW');
    expect(matchLanguage('zh-hans')).toBe('zh-CN');
    expect(matchLanguage('JA-jp')).toBe('ja');
    expect(matchLanguage('ES-mx')).toBe('es');
  });

  it('matches nothing for another language', () => {
    for (const tag of [
      'fr',
      'de-DE',
      'eng',
      'zhx',
      'jav',
      'est',
      'ko-KR',
      '',
    ]) {
      expect(matchLanguage(tag)).toBeNull();
    }
  });
});

describe('chooseLanguage', () => {
  it('takes the saved choice first', () => {
    expect(chooseLanguage('ja', ['zh-TW', 'en'])).toBe('ja');
  });

  it('takes the first preference the page speaks', () => {
    expect(chooseLanguage(null, ['fr', 'zh-HK', 'en'])).toBe('zh-TW');
    expect(chooseLanguage(null, ['de', 'en-GB', 'ja'])).toBe('en');
    expect(chooseLanguage(null, ['ko', 'zh', 'ja'])).toBe('zh-CN');
    expect(chooseLanguage(null, ['pt-BR', 'es-CO', 'en'])).toBe('es');
  });

  it('ignores a saved choice the page does not speak', () => {
    expect(chooseLanguage('fr', ['ja-JP'])).toBe('ja');
  });

  it('takes English without anything else to go by', () => {
    expect(chooseLanguage(null, [])).toBe('en');
    expect(chooseLanguage(null, ['fr', 'ko'])).toBe('en');
  });
});

describe('the saved choice', () => {
  it('is remembered', () => {
    const storage = createStorage();
    expect(readSavedLanguage(storage)).toBeNull();
    saveLanguage(storage, 'zh-TW');
    expect(readSavedLanguage(storage)).toBe('zh-TW');
    saveLanguage(storage, 'en');
    expect(readSavedLanguage(storage)).toBe('en');
  });

  it('is not taken when it is not a language the page speaks', () => {
    const storage = createStorage();
    saveLanguage(storage, 'ja');
    const [key] = [...storage.items.keys()];
    storage.items.set(key ?? '', 'fr');
    expect(readSavedLanguage(storage)).toBeNull();
  });

  it('is not there without a storage, or with one that refuses', () => {
    expect(readSavedLanguage(null)).toBeNull();
    expect(readSavedLanguage(REFUSING_STORAGE)).toBeNull();
    expect(() => {
      saveLanguage(null, 'ja');
      saveLanguage(REFUSING_STORAGE, 'ja');
    }).not.toThrow();
  });
});
