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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/item-notices Tests for the notices of the items the
 *   player of the page gets.
 */

import { describe, expect, it } from 'vitest';

import { ITEM_KINDS } from '../../shared/src/items.ts';
import type { ItemKindId } from '@clovervale/shared';

import { wordItemNotice, wordSilverNotice } from '../src/item-notices.ts';
import { Translator } from '../src/translator.ts';

describe('wordItemNotice', () => {
  it('names the item received in the language of the page', async () => {
    const words: string[] = [wordItemNotice(new Translator(), 'sword')];
    for (const code of ['zh-TW', 'zh-CN', 'ja', 'es'] as const) {
      const translator = new Translator();
      await translator.choose(code);
      words.push(wordItemNotice(translator, 'sword'));
    }
    expect(words).toEqual([
      'You got a short sword',
      '取得短劍',
      '取得短剑',
      '短剣を手に入れた',
      'Obtienes una espada corta',
    ]);
  });

  it('words each item in English as it is received', () => {
    const translator: Translator = new Translator();
    expect(
      ITEM_KINDS.map(({ id }: { readonly id: ItemKindId }) =>
        wordItemNotice(translator, id),
      ),
    ).toEqual([
      'You got a four-leaf clover',
      'You got a short sword',
      'You got some leather armor',
      'You got a healing potion',
      'You got the message from Clovervale',
      'You got the token of the Clovervale spy',
      "You got a jar of Martha's ointment",
    ]);
  });

  it('words each item in Spanish as it is received', async () => {
    const translator: Translator = new Translator();
    await translator.choose('es');
    expect(
      ITEM_KINDS.map(({ id }: { readonly id: ItemKindId }) =>
        wordItemNotice(translator, id),
      ),
    ).toEqual([
      'Obtienes un trébol de cuatro hojas',
      'Obtienes una espada corta',
      'Obtienes una armadura de cuero',
      'Obtienes una poción curativa',
      'Obtienes el mensaje de Valtrébol',
      'Obtienes la insignia de la espía de Valtrébol',
      'Obtienes un frasco de ungüento de Marta',
    ]);
  });
});

describe('wordSilverNotice', () => {
  it('tells how many silver coins were received in the language of the page', async () => {
    const english: Translator = new Translator();
    const words: string[] = [
      wordSilverNotice(english, 1),
      wordSilverNotice(english, 2),
    ];
    for (const code of ['zh-TW', 'zh-CN', 'ja', 'es'] as const) {
      const translator = new Translator();
      await translator.choose(code);
      words.push(wordSilverNotice(translator, 1));
      words.push(wordSilverNotice(translator, 2));
    }
    expect(words).toEqual([
      'You got 1 silver coin',
      'You got 2 silver coins',
      '取得 1 枚銀幣',
      '取得 2 枚銀幣',
      '取得 1 枚银币',
      '取得 2 枚银币',
      '銀貨を1枚手に入れた',
      '銀貨を2枚手に入れた',
      'Obtienes 1 moneda de plata',
      'Obtienes 2 monedas de plata',
    ]);
  });
});
