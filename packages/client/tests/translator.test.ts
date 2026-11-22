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
 * @module client/tests/translator Tests for wording the text of the page
 *   in its language.
 */

import { describe, expect, it, vi } from 'vitest';

import { LANGUAGES } from '../src/language.ts';
import type { LanguageCode } from '../src/language.ts';
import { EN_MESSAGES } from '../src/messages/en.ts';
import type { MessageId, MessageTable } from '../src/messages/en.ts';
import { Translator, loadMessages } from '../src/translator.ts';

/**
 * Lists the values a message takes, by their names.
 *
 * @param {string} message - The message.
 * @returns {string[]} The names, in order of the alphabet.
 */
function listValues(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)]
    .map((match: RegExpExecArray) => match[1] ?? '')
    .sort();
}

/**
 * Makes a loader that gives tables only when told to.
 *
 * @returns {{ load: (code: LanguageCode) => Promise<MessageTable>,
 *   settle: Map<LanguageCode, (table: MessageTable | null) => void>
 *   }} The loader, and what settles each load it was asked for, by the
 *   language.
 */
function createLoader(): {
  load: (code: LanguageCode) => Promise<MessageTable>;
  settle: Map<LanguageCode, (table: MessageTable | null) => void>;
} {
  const settle = new Map<LanguageCode, (table: MessageTable | null) => void>();
  const load = (code: LanguageCode): Promise<MessageTable> =>
    new Promise((resolve, reject) => {
      settle.set(code, (table: MessageTable | null) => {
        if (table === null) {
          reject(new Error('The table cannot be loaded.'));
        } else {
          resolve(table);
        }
      });
    });
  return { load, settle };
}

describe('Translator', () => {
  it('speaks English at first', () => {
    const translator = new Translator();
    expect(translator.language).toBe('en');
    expect(translator.translate('panel.server')).toBe('Server');
  });

  it('fills the values into a message', () => {
    const translator = new Translator();
    expect(translator.translate('prompt.talk', { name: 'Nancy' })).toBe(
      'Press Space to talk to Nancy',
    );
    expect(
      translator.translate('readout.player', { id: '#3', appearance: '5' }),
    ).toBe('#3, appearance 5');
  });

  it('speaks the language chosen, in its own word order', async () => {
    const translator = new Translator();
    expect(await translator.choose('ja')).toBe(true);
    expect(translator.language).toBe('ja');
    expect(translator.translate('prompt.talk', { name: 'ナンシー' })).toBe(
      'スペースキーでナンシーと話す',
    );
    expect(await translator.choose('zh-TW')).toBe(true);
    expect(translator.translate('prompt.talk', { name: '南茜' })).toBe(
      '按空白鍵與南茜交談',
    );
    expect(await translator.choose('es')).toBe(true);
    expect(translator.translate('prompt.talk', { name: 'Nancy' })).toBe(
      'Presiona Espacio para hablar con Nancy',
    );
    expect(await translator.choose('en')).toBe(true);
    expect(translator.translate('panel.server')).toBe('Server');
  });

  it('words a message a language may leave out only where it has it', async () => {
    const translator = new Translator();
    expect(translator.translateOptional('villager.edwin.name.inSentence')).toBe(
      'the prisoner',
    );
    expect(
      translator.translateOptional('villager.martha.name.inSentence'),
    ).toBeNull();
    await translator.choose('es');
    expect(
      translator.translateOptional('villager.martha.name.inSentence'),
    ).toBe('la alcaldesa Marta');
    await translator.choose('ja');
    expect(
      translator.translateOptional('villager.edwin.name.inSentence'),
    ).toBeNull();
  });

  it('tells its listeners once it speaks another language', async () => {
    const translator = new Translator();
    const heard: LanguageCode[] = [];
    translator.addListener(() => {
      heard.push(translator.language);
    });
    await translator.choose('zh-CN');
    await translator.choose('zh-CN');
    await translator.choose('en');
    expect(heard).toEqual(['zh-CN', 'en']);
  });

  it('keeps to the latest choice when an earlier one loads later', async () => {
    const { load, settle } = createLoader();
    const translator = new Translator(load);
    const heard: LanguageCode[] = [];
    translator.addListener(() => {
      heard.push(translator.language);
    });
    const first: Promise<boolean> = translator.choose('ja');
    const second: Promise<boolean> = translator.choose('zh-TW');
    settle.get('zh-TW')?.({ ...EN_MESSAGES, title: '四葉谷' });
    expect(await second).toBe(true);
    settle.get('ja')?.({ ...EN_MESSAGES, title: 'クローバーヴェイル' });
    expect(await first).toBe(false);
    expect(translator.language).toBe('zh-TW');
    expect(translator.translate('title')).toBe('四葉谷');
    expect(heard).toEqual(['zh-TW']);
  });

  it('keeps to English when chosen while another language loads', async () => {
    const { load, settle } = createLoader();
    const translator = new Translator(load);
    const chosen: Promise<boolean> = translator.choose('ja');
    expect(await translator.choose('en')).toBe(true);
    settle.get('ja')?.({ ...EN_MESSAGES, title: 'クローバーヴェイル' });
    expect(await chosen).toBe(false);
    expect(translator.language).toBe('en');
    expect(translator.translate('title')).toBe('Clovervale');
  });

  it('keeps its language when another cannot be loaded', async () => {
    const { load, settle } = createLoader();
    const translator = new Translator(load);
    let heard = 0;
    translator.addListener(() => {
      heard += 1;
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {
      // The failure is expected.
    });
    const chosen: Promise<boolean> = translator.choose('ja');
    settle.get('ja')?.(null);
    expect(await chosen).toBe(false);
    logged.mockRestore();
    expect(translator.language).toBe('en');
    expect(heard).toBe(0);
  });
});

describe('loadMessages', () => {
  it('loads the messages of each language', async () => {
    const titles: string[] = [];
    for (const { code } of LANGUAGES) {
      if (code !== 'en') {
        titles.push((await loadMessages(code)).title);
      }
    }
    expect(titles).toEqual([
      'Valtrébol',
      'クローバーヴェイル',
      '四葉谷',
      '四叶谷',
    ]);
  });

  it('gives every message the same values in every language', async () => {
    const ids = Object.keys(EN_MESSAGES) as MessageId[];
    for (const { code } of LANGUAGES) {
      if (code === 'en') {
        continue;
      }
      const table: MessageTable = await loadMessages(code);
      for (const id of ids) {
        expect([code, id, listValues(table[id])]).toEqual([
          code,
          id,
          listValues(EN_MESSAGES[id]),
        ]);
      }
    }
  });
});
