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
 * @module client/tests/inventory-bag Tests for the bag the person at the
 *   page looks into and uses what its player carries from.
 */

import { describe, expect, it } from 'vitest';

import { INVENTORY_SIZE, PLAYER_HEALTH } from '@clovervale/shared';
import type { ItemKindId } from '@clovervale/shared';

import {
  BAG_COLUMNS,
  InventoryBag,
  describeSlots,
} from '../src/inventory-bag.ts';
import type {
  BagResponse,
  MenuEntry,
  SlotView,
} from '../src/inventory-bag.ts';
import { Translator } from '../src/translator.ts';

/** A translator of the text into English. */
const EN = new Translator();

/**
 * Makes a list of four-leaf clovers.
 *
 * @param {number} count - How many.
 * @returns {ItemKindId[]} The clovers.
 */
function listClovers(count: number): ItemKindId[] {
  return new Array<ItemKindId>(count).fill('clover');
}

/**
 * Opens a bag that holds some clovers.
 *
 * @param {number} count - The number of clovers in it.
 * @returns {InventoryBag} The open bag.
 */
function openBag(count: number): InventoryBag {
  const bag = new InventoryBag();
  bag.noticeInventory(listClovers(count));
  bag.pressKey('KeyI');
  return bag;
}

/**
 * Presses a key on a bag several times.
 *
 * @param {InventoryBag} bag - The bag.
 * @param {string} code - The code of the key.
 * @param {number} times - How many times.
 */
function pressTimes(bag: InventoryBag, code: string, times: number): void {
  for (let count = 0; count < times; count++) {
    bag.pressKey(code);
  }
}

/**
 * Opens a bag that holds a healing potion and a clover after it.
 *
 * @param {number} health - The health of the player.
 * @returns {InventoryBag} The open bag.
 */
function openPotionBag(health: number): InventoryBag {
  const bag = new InventoryBag();
  bag.noticeInventory(['healing-potion', 'clover']);
  bag.noticeHealth(health);
  bag.pressKey('KeyI');
  return bag;
}

/**
 * Lists what the menu of a bag offers for the item under its cursor.
 *
 * @param {InventoryBag} bag - The bag.
 * @returns {[string, boolean][]} The identifier of each action, and
 *   whether it can be chosen.
 */
function listMenu(bag: InventoryBag): [string, boolean][] {
  return bag.menuEntries.map((entry: MenuEntry): [string, boolean] => [
    entry.action.id,
    entry.isEnabled,
  ]);
}

describe('the bag', () => {
  it('lays its slots out in a square grid', () => {
    expect(BAG_COLUMNS * BAG_COLUMNS).toBe(INVENTORY_SIZE);
  });

  it('starts closed, and takes no keys but I then', () => {
    const bag = new InventoryBag();
    expect(bag.isOpen).toBe(false);
    for (const code of ['ArrowUp', 'ArrowLeft', 'Enter', 'Escape', 'KeyW']) {
      expect(bag.pressKey(code)).toEqual({ isHandled: false, request: null });
    }
    expect(bag.pressKey('KeyI')).toEqual({ isHandled: true, request: null });
    expect(bag.isOpen).toBe(true);
    expect(bag.cursor).toBe(0);
    expect(bag.menuCursor).toBeNull();
  });

  it('closes with I, or with Esc while no menu is open', () => {
    const bag: InventoryBag = openBag(1);
    bag.pressKey('KeyI');
    expect(bag.isOpen).toBe(false);
    bag.pressKey('KeyI');
    expect(bag.pressKey('Escape').isHandled).toBe(true);
    expect(bag.isOpen).toBe(false);
  });

  it('takes the arrow keys, Enter and Esc while open, and no game keys', () => {
    const bag: InventoryBag = openBag(0);
    for (const code of ['ArrowDown', 'ArrowRight', 'Enter']) {
      expect(bag.pressKey(code).isHandled).toBe(true);
    }
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
      expect(bag.pressKey(code).isHandled).toBe(false);
    }
    expect(bag.isOpen).toBe(true);
  });

  it('moves its cursor in two dimensions, stopping at the edges', () => {
    const bag: InventoryBag = openBag(0);
    bag.pressKey('ArrowLeft');
    bag.pressKey('ArrowUp');
    expect(bag.cursor).toBe(0);
    bag.pressKey('ArrowRight');
    expect(bag.cursor).toBe(1);
    bag.pressKey('ArrowDown');
    expect(bag.cursor).toBe(1 + BAG_COLUMNS);
    pressTimes(bag, 'ArrowRight', BAG_COLUMNS);
    expect(bag.cursor).toBe(2 * BAG_COLUMNS - 1);
    pressTimes(bag, 'ArrowDown', BAG_COLUMNS);
    expect(bag.cursor).toBe(INVENTORY_SIZE - 1);
    bag.pressKey('ArrowLeft');
    expect(bag.cursor).toBe(INVENTORY_SIZE - 2);
  });

  it('opens the menu of a filled slot alone', () => {
    const bag: InventoryBag = openBag(1);
    bag.pressKey('ArrowRight');
    bag.pressKey('Enter');
    expect(bag.menuCursor).toBeNull();
    bag.pressKey('ArrowLeft');
    bag.pressKey('Enter');
    expect(bag.menuCursor).toBe(0);
  });

  it('offers to use an item that can be used before dropping it', () => {
    const bag: InventoryBag = openPotionBag(50);
    bag.pressKey('Enter');
    expect(listMenu(bag)).toEqual([
      ['use', true],
      ['drop', true],
    ]);
  });

  it('offers only to drop an item that cannot be used', () => {
    const bag: InventoryBag = openPotionBag(50);
    bag.pressKey('ArrowRight');
    bag.pressKey('Enter');
    expect(listMenu(bag)).toEqual([['drop', true]]);
  });

  it('offers no actions on an empty slot', () => {
    const bag: InventoryBag = openPotionBag(50);
    pressTimes(bag, 'ArrowRight', 2);
    expect(listMenu(bag)).toEqual([]);
  });

  it('asks to use the item of the slot the menu is open on', () => {
    const bag: InventoryBag = openPotionBag(50);
    bag.pressKey('Enter');
    expect(bag.pressKey('Enter').request).toEqual({ action: 'use', slot: 0 });
    expect(bag.menuCursor).toBeNull();
  });

  it('offers using at full health, but cannot have it chosen', () => {
    const bag: InventoryBag = openPotionBag(PLAYER_HEALTH);
    bag.pressKey('Enter');
    expect(listMenu(bag)).toEqual([
      ['use', false],
      ['drop', true],
    ]);
    expect(bag.pressKey('Enter')).toEqual({ isHandled: true, request: null });
    expect(bag.menuCursor).toBe(0);
    expect(bag.clickAction(0)).toBeNull();
    expect(bag.menuCursor).toBe(0);
    bag.pressKey('ArrowDown');
    expect(bag.pressKey('Enter').request).toEqual({ action: 'drop', slot: 0 });
  });

  it('offers using while the player lies dead, but cannot have it chosen', () => {
    const bag: InventoryBag = openPotionBag(0);
    bag.pressKey('Enter');
    expect(listMenu(bag)).toEqual([
      ['use', false],
      ['drop', true],
    ]);
    expect(bag.clickAction(0)).toBeNull();
  });

  it('lets using be chosen again once health is lost', () => {
    const bag: InventoryBag = openPotionBag(PLAYER_HEALTH);
    bag.pressKey('Enter');
    bag.noticeHealth(PLAYER_HEALTH - 1);
    expect(listMenu(bag)[0]).toEqual(['use', true]);
    expect(bag.clickAction(0)).toEqual({ action: 'use', slot: 0 });
  });

  it('keeps the cursor of the menu within its actions', () => {
    const bag: InventoryBag = openBag(1);
    bag.pressKey('Enter');
    pressTimes(bag, 'ArrowDown', 3);
    expect(bag.menuCursor).toBe(0);
    bag.noticeInventory(['healing-potion']);
    pressTimes(bag, 'ArrowDown', 3);
    expect(bag.menuCursor).toBe(1);
    pressTimes(bag, 'ArrowUp', 3);
    expect(bag.menuCursor).toBe(0);
    // The arrows move the cursor of the menu, not of the bag.
    expect(bag.cursor).toBe(0);
  });

  it('asks to drop the item of the slot the menu is open on', () => {
    const bag: InventoryBag = openBag(3);
    bag.pressKey('ArrowRight');
    bag.pressKey('Enter');
    const response: BagResponse = bag.pressKey('Enter');
    expect(response).toEqual({
      isHandled: true,
      request: { action: 'drop', slot: 1 },
    });
    expect(bag.menuCursor).toBeNull();
    expect(bag.isOpen).toBe(true);
  });

  it('closes the menu alone with Esc', () => {
    const bag: InventoryBag = openBag(1);
    bag.pressKey('Enter');
    bag.pressKey('Escape');
    expect(bag.menuCursor).toBeNull();
    expect(bag.isOpen).toBe(true);
  });

  it('closes the menu with the bag when I closes it', () => {
    const bag: InventoryBag = openBag(1);
    bag.pressKey('Enter');
    bag.pressKey('KeyI');
    expect(bag.isOpen).toBe(false);
    bag.pressKey('KeyI');
    expect(bag.menuCursor).toBeNull();
  });

  it('keeps the cursor on the last filled slot once the items close up', () => {
    const bag: InventoryBag = openBag(3);
    pressTimes(bag, 'ArrowRight', 2);
    expect(bag.pressKey('Enter').isHandled).toBe(true);
    expect(bag.pressKey('Enter').request).toEqual({
      action: 'drop',
      slot: 2,
    });
    bag.noticeInventory(listClovers(2));
    expect(bag.cursor).toBe(1);
    bag.noticeInventory(listClovers(0));
    expect(bag.cursor).toBe(0);
  });

  it('keeps the cursor where it is while the items close up after it', () => {
    const bag: InventoryBag = openBag(3);
    bag.pressKey('ArrowRight');
    bag.pressKey('Enter');
    bag.pressKey('Enter');
    bag.noticeInventory(listClovers(2));
    expect(bag.cursor).toBe(1);
  });

  it('closes the menu of a slot that is emptied', () => {
    const bag: InventoryBag = openBag(1);
    bag.pressKey('Enter');
    bag.noticeInventory([]);
    expect(bag.menuCursor).toBeNull();
  });
});

describe('the bag under the mouse', () => {
  it('opens and closes with a click on its icon', () => {
    const bag = new InventoryBag();
    bag.clickIcon();
    expect(bag.isOpen).toBe(true);
    bag.clickIcon();
    expect(bag.isOpen).toBe(false);
  });

  it('opens the menu of a filled slot clicked, and none of an empty one', () => {
    const bag: InventoryBag = openBag(2);
    bag.clickSlot(5);
    expect(bag.cursor).toBe(5);
    expect(bag.menuCursor).toBeNull();
    bag.clickSlot(1);
    expect(bag.cursor).toBe(1);
    expect(bag.menuCursor).toBe(0);
  });

  it('asks to drop the item of the slot with a click on the action', () => {
    const bag: InventoryBag = openBag(2);
    bag.clickSlot(1);
    expect(bag.clickAction(0)).toEqual({ action: 'drop', slot: 1 });
    expect(bag.menuCursor).toBeNull();
    expect(bag.clickAction(0)).toBeNull();
  });
});

describe('the item under the cursor of the bag', () => {
  it('follows the cursor as the arrow keys and clicks move it', () => {
    const bag = new InventoryBag();
    bag.noticeInventory(['clover', 'sword']);
    bag.pressKey('KeyI');
    expect(bag.cursorItem).toBe('clover');
    bag.pressKey('ArrowRight');
    expect(bag.cursorItem).toBe('sword');
    bag.clickSlot(0);
    expect(bag.cursorItem).toBe('clover');
  });

  it('is none on an empty slot', () => {
    const bag = openBag(1);
    bag.pressKey('ArrowDown');
    expect(bag.cursorItem).toBeNull();
  });

  it('follows the items as they close up under the cursor', () => {
    const bag = new InventoryBag();
    bag.noticeInventory(['clover', 'sword', 'leather-armor']);
    bag.pressKey('KeyI');
    bag.pressKey('ArrowRight');
    bag.noticeInventory(['clover', 'leather-armor']);
    expect(bag.cursorItem).toBe('leather-armor');
  });
});

describe('describeSlots', () => {
  it('shows every slot, the filled ones first, by the names of the items', () => {
    const slots: SlotView[] = describeSlots(EN, ['clover', 'clover']);
    expect(slots).toHaveLength(INVENTORY_SIZE);
    expect(slots.slice(0, 2)).toEqual([
      { kind: 'clover', name: 'four-leaf clover' },
      { kind: 'clover', name: 'four-leaf clover' },
    ]);
    expect(slots.slice(2).every((slot: SlotView) => slot.kind === null)).toBe(
      true,
    );
  });

  it('names the items in the language of the page', async () => {
    const names: (string | null)[] = [];
    for (const code of ['zh-TW', 'zh-CN', 'ja', 'es'] as const) {
      const translator = new Translator();
      await translator.choose(code);
      names.push(describeSlots(translator, ['clover'])[0]?.name ?? null);
    }
    expect(names).toEqual([
      '四葉幸運草',
      '四叶幸运草',
      '四つ葉のクローバー',
      'trébol de cuatro hojas',
    ]);
  });
});
