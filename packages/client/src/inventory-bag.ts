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
 * @module client/inventory-bag The bag the person at the page opens to look
 *   at what its player carries, slot by slot, and to choose what to do with
 *   an item.
 */

import { INVENTORY_SIZE } from '@clovervale/shared';
import type { ItemKindId } from '@clovervale/shared';

import { nameItem } from './interaction-prompt.ts';
import type { Translator } from './translator.ts';

/** The number of slots in each row of the bag, as many as its rows. */
export const BAG_COLUMNS: number = Math.round(Math.sqrt(INVENTORY_SIZE));

/** Something the person at the page can do with an item in the bag. */
export interface ItemAction {
  /** The identifier of the action. */
  readonly id: 'drop';
  /** The message that names the action. */
  readonly labelKey: 'itemAction.drop';
}

/**
 * What can be done with an item in the bag, in the order its menu lists
 * them: dropping it at the feet of the player.
 */
export const ITEM_ACTIONS: readonly ItemAction[] = [
  { id: 'drop', labelKey: 'itemAction.drop' },
];

/** An action chosen in the menu of an item, to carry out on the item. */
export interface ItemRequest {
  /** The identifier of the action. */
  readonly action: ItemAction['id'];
  /** The number of the slot that holds the item, from 0. */
  readonly slot: number;
}

/** What the bag makes of a key. */
export interface BagResponse {
  /**
   * Whether the bag took the key, which is then for nothing else on the
   * page.
   */
  readonly isHandled: boolean;
  /** The action chosen with the key, or `null` if none is. */
  readonly request: ItemRequest | null;
}

/** A slot of the inventory, as it is shown. */
export interface SlotView {
  /** The kind of the item in the slot, or `null` for an empty slot. */
  readonly kind: ItemKindId | null;
  /**
   * The name of the item in the slot, in the language of the page, or
   * `null` for an empty slot.
   */
  readonly name: string | null;
}

/** The keys that carry out what the cursor is on. */
const ENTER_KEYS: ReadonlySet<string> = new Set(['Enter', 'NumpadEnter']);

/** How each arrow key moves the cursor of the bag, as rows and columns. */
const ARROW_MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** A key the bag takes but does nothing with. */
const IGNORED: BagResponse = { isHandled: true, request: null };

/** A key the bag does not take. */
const PASSED: BagResponse = { isHandled: false, request: null };

/**
 * Describes the slots of the inventory of the player of the page.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {readonly ItemKindId[]} inventory - What the player carries, in
 *   the order of the slots it fills.
 * @returns {SlotView[]} Every slot of the inventory, the filled ones first,
 *   in their order, and then the empty ones.
 */
export function describeSlots(
  translator: Translator,
  inventory: readonly ItemKindId[],
): SlotView[] {
  return Array.from({ length: INVENTORY_SIZE }, (_, index: number) => {
    const kind: ItemKindId | undefined = inventory[index];
    return kind === undefined
      ? { kind: null, name: null }
      : { kind, name: nameItem(translator, kind) };
  });
}

/**
 * The bag of the player of the page: whether it is open, the slot its
 * cursor is on, and the menu of what to do with the item there, if open.
 *
 * The bag opens and closes with the I key or a click on its icon.  While it
 * is open, the arrow keys move its cursor over the slots, laid out in
 * {@link BAG_COLUMNS} rows of as many slots, stopping at the edges, and
 * Enter or a click on a slot that holds an item opens the menu of the item.
 * While the menu is open, the up and down arrows move its cursor over the
 * {@link ITEM_ACTIONS}, and Enter or a click on one carries it out, which
 * closes the menu and leaves the bag open.  Esc closes the menu if it is
 * open, and the bag otherwise.
 */
export class InventoryBag {
  #isOpen = false;
  #cursor = 0;
  #menuCursor: number | null = null;
  #inventory: readonly ItemKindId[] = [];

  /**
   * Whether the bag is open.
   *
   * @returns {boolean} Whether it is.
   */
  get isOpen(): boolean {
    return this.#isOpen;
  }

  /**
   * The slot the cursor of the bag is on.
   *
   * @returns {number} The number of the slot, from 0.
   */
  get cursor(): number {
    return this.#cursor;
  }

  /**
   * The kind of the item in the slot the cursor of the bag is on.
   *
   * @returns {ItemKindId | null} The kind, or `null` if the slot is empty.
   */
  get cursorItem(): ItemKindId | null {
    return this.#inventory[this.#cursor] ?? null;
  }

  /**
   * The action the cursor of the menu is on, while the menu is open.
   *
   * @returns {number | null} The place of the action among the
   *   {@link ITEM_ACTIONS}, from 0, or `null` while the menu is closed.
   */
  get menuCursor(): number | null {
    return this.#menuCursor;
  }

  /**
   * Takes in what the player carries now.
   *
   * Once the items close up after an item is gone, the cursor moves back
   * to the last filled slot if it was past it.  The menu of a slot that is
   * emptied closes.
   *
   * @param {readonly ItemKindId[]} inventory - The items, in the order of
   *   the slots they fill.
   */
  noticeInventory(inventory: readonly ItemKindId[]): void {
    if (
      inventory.length < this.#inventory.length &&
      this.#cursor >= inventory.length
    ) {
      this.#cursor = Math.max(inventory.length - 1, 0);
    }
    this.#inventory = [...inventory];
    if (!this.#isFilled(this.#cursor)) {
      this.#menuCursor = null;
    }
  }

  /**
   * Takes a key pressed, if it is one for the bag.
   *
   * @param {string} code - The code of the key, as in a keyboard event.
   * @returns {BagResponse} Whether the bag took the key, and the action it
   *   chose, if any.
   */
  pressKey(code: string): BagResponse {
    if (code === 'KeyI') {
      this.clickIcon();
      return IGNORED;
    }
    if (!this.#isOpen) {
      return PASSED;
    }
    if (code === 'Escape') {
      if (this.#menuCursor === null) {
        this.#isOpen = false;
      } else {
        this.#menuCursor = null;
      }
      return IGNORED;
    }
    if (ENTER_KEYS.has(code)) {
      if (this.#menuCursor !== null) {
        return {
          isHandled: true,
          request: this.clickAction(this.#menuCursor),
        };
      }
      this.clickSlot(this.#cursor);
      return IGNORED;
    }
    const move: readonly [number, number] | undefined = Object.hasOwn(
      ARROW_MOVES,
      code,
    )
      ? ARROW_MOVES[code]
      : undefined;
    if (move === undefined) {
      return PASSED;
    }
    const [rows, columns] = move;
    if (this.#menuCursor !== null) {
      this.#menuCursor = clamp(
        this.#menuCursor + rows,
        ITEM_ACTIONS.length - 1,
      );
      return IGNORED;
    }
    const row: number = clamp(
      Math.floor(this.#cursor / BAG_COLUMNS) + rows,
      BAG_COLUMNS - 1,
    );
    const column: number = clamp(
      (this.#cursor % BAG_COLUMNS) + columns,
      BAG_COLUMNS - 1,
    );
    this.#cursor = row * BAG_COLUMNS + column;
    return IGNORED;
  }

  /** Opens the bag if it is closed, and closes it with its menu if open. */
  clickIcon(): void {
    this.#isOpen = !this.#isOpen;
    this.#menuCursor = null;
  }

  /**
   * Puts the cursor on a slot, and opens the menu of its item if it holds
   * one, or closes the menu if it does not.  A slot the bag does not have
   * is left alone.
   *
   * @param {number} slot - The number of the slot, from 0.
   */
  clickSlot(slot: number): void {
    if (!this.#isOpen || !Number.isInteger(slot) || slot < 0) {
      return;
    }
    if (slot >= INVENTORY_SIZE) {
      return;
    }
    this.#cursor = slot;
    this.#menuCursor = this.#isFilled(slot) ? 0 : null;
  }

  /**
   * Carries out an action of the open menu on the item of the slot it is
   * open on, and closes the menu.
   *
   * @param {number} index - The place of the action among the
   *   {@link ITEM_ACTIONS}, from 0.
   * @returns {ItemRequest | null} The action, and the slot whose item it
   *   is for, or `null` if the menu is not open or there is no such action.
   */
  clickAction(index: number): ItemRequest | null {
    const action: ItemAction | undefined = ITEM_ACTIONS[index];
    if (this.#menuCursor === null || action === undefined) {
      return null;
    }
    this.#menuCursor = null;
    return { action: action.id, slot: this.#cursor };
  }

  /**
   * Tells whether a slot holds an item.
   *
   * @param {number} slot - The number of the slot, from 0.
   * @returns {boolean} Whether it does.
   */
  #isFilled(slot: number): boolean {
    return slot < this.#inventory.length;
  }
}

/**
 * Keeps a place within a range from 0.
 *
 * @param {number} value - The place.
 * @param {number} most - The last place of the range.
 * @returns {number} The nearest place within the range.
 */
function clamp(value: number, most: number): number {
  return Math.min(Math.max(value, 0), most);
}
