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

import { ITEM_KINDS } from '@clovervale/shared';
import type { ItemKindId } from '@clovervale/shared';

import { findGainedItems, wordItemNotice } from '../src/item-notices.ts';
import { Translator } from '../src/translator.ts';

describe('findGainedItems', () => {
  it('finds a clover picked and an item looted', () => {
    expect(findGainedItems(['clover'], ['clover', 'clover'])).toEqual([
      'clover',
    ]);
    expect(findGainedItems(['clover'], ['clover', 'sword'])).toEqual([
      'sword',
    ]);
  });

  it('finds nothing as the inventory is first told on joining', () => {
    expect(findGainedItems(null, ['clover', 'sword'])).toEqual([]);
  });

  it('finds nothing as the same inventory comes back on another map', () => {
    expect(findGainedItems(['sword', 'clover'], ['sword', 'clover'])).toEqual(
      [],
    );
  });

  it('finds nothing as an item is dropped and the rest close up', () => {
    expect(
      findGainedItems(['clover', 'sword', 'clover'], ['sword', 'clover']),
    ).toEqual([]);
  });

  it('finds the item got in the same snapshot as another is dropped', () => {
    expect(
      findGainedItems(['clover', 'sword'], ['sword', 'leather-armour']),
    ).toEqual(['leather-armour']);
  });

  it('finds nothing once there is no player', () => {
    expect(findGainedItems(['clover'], null)).toEqual([]);
  });
});

describe('wordItemNotice', () => {
  it('names the item got in the language of the page', async () => {
    const words: string[] = [wordItemNotice(new Translator(), 'sword')];
    for (const code of ['zh-TW', 'zh-CN', 'ja'] as const) {
      const translator = new Translator();
      await translator.choose(code);
      words.push(wordItemNotice(translator, 'sword'));
    }
    expect(words).toEqual([
      'You got a short sword',
      '取得短劍',
      '取得短剑',
      '短剣を手に入れた',
    ]);
  });

  it('words each item got in English as it is received', () => {
    const translator: Translator = new Translator();
    expect(
      ITEM_KINDS.map(({ id }: { readonly id: ItemKindId }) =>
        wordItemNotice(translator, id),
      ),
    ).toEqual([
      'You got a four-leaved clover',
      'You got a short sword',
      'You got some leather armour',
      'You got a healing potion',
      'You got the message from Clovervale',
      'You got the token of the Clovervale spy',
      "You got a jar of Martha's ointment",
    ]);
  });
});
