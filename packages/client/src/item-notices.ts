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
 *   and of the silver coins its player gets, for a few seconds.
 */

import type { ItemKindId } from '@clovervale/shared';

import { nameItem } from './interaction-prompt.ts';
import type { Translator } from './translator.ts';

/** The notices of the items and the silver coins the player gets. */
export interface ItemNotices {
  /**
   * Shows a notice of an item got, below those still shown, which fades
   * out after a few seconds.
   *
   * @param {ItemKindId} kind - The kind of the item.
   */
  readonly show: (kind: ItemKindId) => void;
  /**
   * Shows a notice of silver coins got, below those still shown, which
   * fades out after a few seconds.
   *
   * @param {number} count - The number of coins, at least one.
   */
  readonly showSilver: (count: number) => void;
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
 * Finds how many silver coins the player has gained, as the server tells
 * its count anew.
 *
 * @param {number | null} before - The count as the server last told, or
 *   `null` if it has not told it since the page joined.
 * @param {number | null} after - The count as the server tells now, or
 *   `null` while there is no player.
 * @returns {number} How many more coins there are than before, which is
 *   none while there are no more, or while either count is not known.
 */
export function findGainedSilver(
  before: number | null,
  after: number | null,
): number {
  if (before === null || after === null) {
    return 0;
  }
  return Math.max(after - before, 0);
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
    item: nameItem(translator, kind, 'received'),
  });
}

/**
 * Words the notice of silver coins got.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {number} count - The number of coins.
 * @returns {string} The notice, in the language of the page.
 */
export function wordSilverNotice(
  translator: Translator,
  count: number,
): string {
  return count === 1
    ? translator.translate('silverNotice.gainedOne')
    : translator.translate('silverNotice.gained', { count: String(count) });
}

/**
 * Creates the notices of the items and the silver coins the player of the
 * page gets, above the
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
  const wordings = new Map<HTMLDivElement, () => string>();
  translator.addListener(() => {
    for (const [notice, word] of wordings) {
      notice.textContent = word();
    }
  });
  const show = (word: () => string): void => {
    const notice: HTMLDivElement = document.createElement('div');
    notice.className = 'item-notice';
    notice.textContent = word();
    notice.addEventListener('animationend', () => {
      wordings.delete(notice);
      notice.remove();
    });
    wordings.set(notice, word);
    root.append(notice);
  };
  return {
    show: (kind: ItemKindId): void => {
      show(() => wordItemNotice(translator, kind));
    },
    showSilver: (count: number): void => {
      show(() => wordSilverNotice(translator, count));
    },
  };
}
