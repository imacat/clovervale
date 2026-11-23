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
 * @module client/item-words What the items are called, in the language of
 *   the page.
 */

import { findItemKind } from '@clovervale/shared';
import type { ItemKindId } from '@clovervale/shared';

import type { Translator } from './translator.ts';

/**
 * How a message names an item: plainly, as the inventory shows it; as the
 * one in question, as a prompt to pick it up does; or as one the player
 * has just gotten.
 */
export type ItemWording = 'plain' | 'specific' | 'received';

/**
 * Names a kind of item.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {ItemKindId} kind - The kind of item.
 * @param {ItemWording} wording - How the item is named.
 * @returns {string} Its name, in the language of the page, worded so.
 */
export function nameItem(
  translator: Translator,
  kind: ItemKindId,
  wording: ItemWording,
): string {
  const found: ReturnType<typeof findItemKind> = findItemKind(kind);
  switch (wording) {
    case 'plain':
      return translator.translate(found.nameKey);
    case 'specific':
      return translator.translate(found.specificNameKey);
    case 'received':
      return translator.translate(found.receivedNameKey);
  }
}
