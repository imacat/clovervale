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
 * @module client/item-notices Telling the person at the page of each item
 *   its player gets, for a few seconds.
 */

import type { ItemKindId } from '@clovervale/shared';

import { nameItem } from './interaction-prompt.ts';
import type { Translator } from './translator.ts';

/** The notices of the items the player of the page gets. */
export interface ItemNotices {
  /**
   * Shows a notice of an item got, below those still shown, which fades
   * out after a few seconds.
   *
   * @param {ItemKindId} kind - The kind of the item.
   */
  readonly show: (kind: ItemKindId) => void;
}

/**
 * Finds the items an inventory has gained, as the server tells it anew.
 *
 * @param {(readonly ItemKindId[]) | null} before - The items as the server
 *   last told, or `null` if it has not told them since the page joined.
 * @param {(readonly ItemKindId[]) | null} after - The items as the server
 *   tells now, or `null` while there is no player.
 * @returns {ItemKindId[]} One kind for each item there is more of than
 *   before, in the order of the slots; none while either inventory is not
 *   known.
 */
export function findGainedItems(
  before: readonly ItemKindId[] | null,
  after: readonly ItemKindId[] | null,
): ItemKindId[] {
  if (before === null || after === null) {
    return [];
  }
  const left: ItemKindId[] = [...before];
  return after.filter((kind: ItemKindId): boolean => {
    const index: number = left.indexOf(kind);
    if (index === -1) {
      return true;
    }
    left.splice(index, 1);
    return false;
  });
}

/**
 * Words the notice of an item got.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {ItemKindId} kind - The kind of the item.
 * @returns {string} The notice, in the language of the page.
 */
export function wordItemNotice(
  translator: Translator,
  kind: ItemKindId,
): string {
  return translator.translate('itemNotice.gained', {
    item: nameItem(translator, kind),
  });
}

/**
 * Creates the notices of the items the player of the page gets, above the
 * prompt at the foot of the page, one under another, each worded again in
 * each language the page comes to speak and gone once it has faded out.
 *
 * @param {HTMLElement} parent - What the notices are added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @returns {ItemNotices} The notices.
 */
export function createItemNotices(
  parent: HTMLElement,
  translator: Translator,
): ItemNotices {
  const root: HTMLDivElement = document.createElement('div');
  root.className = 'item-notices';
  root.setAttribute('role', 'status');
  parent.append(root);
  const kinds = new Map<HTMLDivElement, ItemKindId>();
  translator.addListener(() => {
    for (const [notice, kind] of kinds) {
      notice.textContent = wordItemNotice(translator, kind);
    }
  });
  return {
    show: (kind: ItemKindId): void => {
      const notice: HTMLDivElement = document.createElement('div');
      notice.className = 'item-notice';
      notice.textContent = wordItemNotice(translator, kind);
      notice.addEventListener('animationend', () => {
        kinds.delete(notice);
        notice.remove();
      });
      kinds.set(notice, kind);
      root.append(notice);
    },
  };
}
