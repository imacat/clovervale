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
 * @module client/bag-view Showing the bag of the player of the page: its
 *   icon in a corner of the page, and, while it is open, its slots and the
 *   menu of an item.
 */

import { INVENTORY_SIZE } from '@clovervale/shared';
import type { ItemKindId } from '@clovervale/shared';

import { nameItem } from './interaction-prompt.ts';
import { BAG_COLUMNS, ITEM_ACTIONS, describeSlots } from './inventory-bag.ts';
import type {
  InventoryBag,
  ItemAction,
  ItemRequest,
  SlotView,
} from './inventory-bag.ts';
import type { Translator } from './translator.ts';

/** The bag as the page shows it. */
export interface BagView {
  /**
   * Takes in what the player carries now, or that there is no player, and
   * shows the bag so.
   *
   * @param {(readonly ItemKindId[]) | null} inventory - The items, in the
   *   order of the slots they fill, or `null` while there is no player.
   */
  readonly show: (inventory: readonly ItemKindId[] | null) => void;
  /** Shows the bag as it is now, after a key has changed it. */
  readonly render: () => void;
}

/** The namespace of the elements of SVG. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The outline of a heart-shaped leaflet of a clover, pointing up. */
const LEAFLET_PATH =
  'M32 34 C27 31 18 27 18 19 C18 11 28 8 32 18 C36 8 46 11 46 19 ' +
  'C46 27 37 31 32 34Z';

/** The outline of the body of the bag on its icon. */
const BAG_BODY_PATH =
  'M24 22 C14 30 10 44 14 52 C17 58 47 58 50 52 C54 44 50 30 40 22Z';

/** The outline of the neck of the bag on its icon, tied up. */
const BAG_NECK_PATH = 'M22 12 L42 12 L38 22 L26 22Z';

/**
 * Makes an element of SVG.
 *
 * @param {string} name - The name of the element.
 * @param {Readonly<Record<string, string>>} attributes - Its attributes.
 * @returns {SVGElement} The element.
 */
function createSvgElement(
  name: string,
  attributes: Readonly<Record<string, string>>,
): SVGElement {
  const element: SVGElement = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

/**
 * Draws a small picture, 64 units square.
 *
 * @param {readonly SVGElement[]} parts - What the picture is made of.
 * @returns {SVGElement} The picture.
 */
function drawPicture(parts: readonly SVGElement[]): SVGElement {
  const svg: SVGElement = createSvgElement('svg', {
    viewBox: '0 0 64 64',
    'aria-hidden': 'true',
  });
  svg.append(...parts);
  return svg;
}

/**
 * Draws a small four-leaved clover.
 *
 * @returns {SVGElement} The clover.
 */
function drawClover(): SVGElement {
  return drawPicture([
    createSvgElement('path', {
      d: 'M32 34 C33 44 36 51 42 56',
      class: 'bag-clover-stalk',
    }),
    ...[0, 1, 2, 3].map((quarter: number) =>
      createSvgElement('path', {
        d: LEAFLET_PATH,
        transform: `rotate(${String(quarter * 90)} 32 32)`,
        class: 'bag-clover-leaflet',
      }),
    ),
  ]);
}

/**
 * Draws a small sword, its point up and to the right: its blade, its
 * crossguard, its grip and its pommel.
 *
 * @returns {SVGElement} The sword.
 */
function drawSword(): SVGElement {
  const turn = 'rotate(45 32 32)';
  return drawPicture([
    createSvgElement('path', {
      d: 'M32 3 L36.5 10 L36.5 41 L27.5 41 L27.5 10Z',
      transform: turn,
      class: 'bag-sword-blade',
    }),
    createSvgElement('path', {
      d: 'M32 9 L32 39',
      transform: turn,
      class: 'bag-sword-fuller',
    }),
    createSvgElement('rect', {
      x: '30',
      y: '45',
      width: '4',
      height: '10',
      transform: turn,
      class: 'bag-sword-grip',
    }),
    createSvgElement('rect', {
      x: '21',
      y: '40',
      width: '22',
      height: '5',
      rx: '2',
      transform: turn,
      class: 'bag-sword-guard',
    }),
    createSvgElement('circle', {
      cx: '32',
      cy: '58',
      r: '3.5',
      transform: turn,
      class: 'bag-sword-guard',
    }),
  ]);
}

/**
 * Draws a small leather armour for the upper body, seen from the front:
 * its body, cut low at the neck and round at the arms, laced up its front
 * and belted at its waist.
 *
 * @returns {SVGElement} The armour.
 */
function drawLeatherArmour(): SVGElement {
  return drawPicture([
    createSvgElement('path', {
      d:
        'M21 9 L27 9 C28 16 36 16 37 9 L43 9 L53 16 L50 27 C47 27 46 29 ' +
        '46 32 L46 54 C38 58 26 58 18 54 L18 32 C18 29 17 27 14 27 ' +
        'L11 16Z',
      class: 'bag-armour-body',
    }),
    createSvgElement('path', {
      d: 'M32 16 L32 46',
      class: 'bag-armour-lacing',
    }),
    createSvgElement('path', {
      d: 'M18 46 C26 48 38 48 46 46',
      class: 'bag-armour-belt',
    }),
  ]);
}

/** What each kind of item is drawn as in a slot of the bag. */
const ITEM_PICTURES: Readonly<Record<ItemKindId, () => SVGElement>> = {
  clover: drawClover,
  sword: drawSword,
  'leather-armour': drawLeatherArmour,
};

/**
 * Draws a small bag, tied at its neck.
 *
 * @returns {SVGElement} The bag.
 */
function drawBag(): SVGElement {
  return drawPicture([
    createSvgElement('path', { d: BAG_BODY_PATH, class: 'bag-icon-body' }),
    createSvgElement('path', { d: BAG_NECK_PATH, class: 'bag-icon-neck' }),
    createSvgElement('path', { d: 'M24 22 L40 22', class: 'bag-icon-tie' }),
  ]);
}

/**
 * Makes an element that does something when it is clicked, and keeps the
 * pointer from the game underneath it and itself from taking the focus.
 *
 * @param {string} className - The class of the element.
 * @param {() => void} onClick - What it does when clicked.
 * @returns {HTMLDivElement} The element.
 */
function createClickable(
  className: string,
  onClick: () => void,
): HTMLDivElement {
  const element: HTMLDivElement = document.createElement('div');
  element.className = className;
  element.setAttribute('role', 'button');
  element.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener('click', (event: MouseEvent) => {
    event.stopPropagation();
    if (event.button === 0) {
      onClick();
    }
  });
  return element;
}

/**
 * Creates the bag of the player of the page: its icon in the bottom left
 * corner, with the key that opens it, I, on it, and
 * above it, while the bag is open, its title, its slots in a square grid,
 * each item drawn small as what it is,
 * with its cursor, the menu of the item the cursor is on while it is open,
 * a line under the slots that names the item the cursor is on, blank for
 * an empty slot, and a line that tells the keys.  A click on the icon, a slot or an action
 * of the menu does to the bag what {@link InventoryBag} tells; no click on
 * any part of the bag reaches the game underneath.  What the bag shows is
 * worded again in each language the page comes to speak.
 *
 * @param {HTMLElement} parent - What the bag is added to.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {InventoryBag} bag - The bag.
 * @param {(request: ItemRequest) => void} carryOut - Carries out an action
 *   chosen in the menu of an item.
 * @returns {BagView} The bag as shown.
 */
export function createBagView(
  parent: HTMLElement,
  translator: Translator,
  bag: InventoryBag,
  carryOut: (request: ItemRequest) => void,
): BagView {
  let shown: readonly ItemKindId[] | null = null;
  let render: () => void = () => undefined;
  const root: HTMLDivElement = document.createElement('div');
  root.className = 'bag';
  root.addEventListener('wheel', (event: WheelEvent) => {
    event.stopPropagation();
  });
  const frame: HTMLDivElement = document.createElement('div');
  frame.className = 'bag-window';
  frame.addEventListener('pointerdown', (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
  });
  frame.addEventListener('click', (event: MouseEvent) => {
    event.stopPropagation();
  });
  const title: HTMLDivElement = document.createElement('div');
  title.className = 'bag-title';
  const body: HTMLDivElement = document.createElement('div');
  body.className = 'bag-body';
  const grid: HTMLDivElement = document.createElement('div');
  grid.className = 'bag-slots';
  grid.style.gridTemplateColumns = `repeat(${String(BAG_COLUMNS)}, auto)`;
  const slots: HTMLDivElement[] = Array.from(
    { length: INVENTORY_SIZE },
    (_, index: number) => {
      const slot: HTMLDivElement = createClickable('bag-slot', () => {
        bag.clickSlot(index);
        render();
      });
      grid.append(slot);
      return slot;
    },
  );
  const menu: HTMLDivElement = document.createElement('div');
  menu.className = 'bag-menu';
  menu.setAttribute('role', 'menu');
  const entries: HTMLDivElement[] = ITEM_ACTIONS.map(
    (_, index: number): HTMLDivElement => {
      const entry: HTMLDivElement = createClickable('bag-action', () => {
        const request: ItemRequest | null = bag.clickAction(index);
        if (request !== null) {
          carryOut(request);
        }
        render();
      });
      entry.setAttribute('role', 'menuitem');
      menu.append(entry);
      return entry;
    },
  );
  body.append(grid, menu);
  const itemName: HTMLDivElement = document.createElement('div');
  itemName.className = 'bag-item-name';
  const hint: HTMLDivElement = document.createElement('div');
  hint.className = 'bag-hint';
  frame.append(title, body, itemName, hint);
  const icon: HTMLDivElement = createClickable('bag-icon', () => {
    bag.clickIcon();
    render();
  });
  const key: HTMLSpanElement = document.createElement('span');
  key.className = 'bag-key';
  key.textContent = 'I';
  icon.append(drawBag(), key);
  root.append(frame, icon);
  parent.append(root);

  render = (): void => {
    const name: string = translator.translate('inventory.title');
    const label: string = translator.translate('inventory.icon');
    icon.title = label;
    icon.setAttribute('aria-label', label);
    icon.setAttribute('aria-expanded', String(bag.isOpen));
    frame.hidden = !bag.isOpen;
    title.textContent = name;
    hint.textContent = translator.translate('inventory.hint');
    const kind: ItemKindId | null = bag.cursorItem;
    itemName.textContent = kind === null ? '' : nameItem(translator, kind);
    describeSlots(translator, shown ?? []).forEach(
      (view: SlotView, index: number) => {
        const slot: HTMLDivElement | undefined = slots[index];
        if (slot === undefined) {
          return;
        }
        slot.classList.toggle('is-cursor', index === bag.cursor);
        const isSame: boolean = slot.dataset.kind === view.kind;
        if (view.kind === null) {
          delete slot.dataset.kind;
          slot.removeAttribute('title');
          slot.removeAttribute('aria-label');
          slot.replaceChildren();
          return;
        }
        slot.dataset.kind = view.kind;
        slot.title = view.name ?? '';
        slot.setAttribute('aria-label', view.name ?? '');
        if (!isSame) {
          slot.replaceChildren(ITEM_PICTURES[view.kind]());
        }
      },
    );
    menu.hidden = bag.menuCursor === null;
    // The menu stands beside the row of the slot it is open on.
    const top: number = (slots[bag.cursor]?.offsetTop ?? 0) - grid.offsetTop;
    menu.style.marginTop = `${String(top)}px`;
    entries.forEach((entry: HTMLDivElement, index: number) => {
      const action: ItemAction | undefined = ITEM_ACTIONS[index];
      entry.textContent =
        action === undefined ? '' : translator.translate(action.labelKey);
      entry.classList.toggle('is-cursor', index === bag.menuCursor);
    });
  };
  render();
  translator.addListener(render);
  return {
    show: (inventory: readonly ItemKindId[] | null): void => {
      if (JSON.stringify(inventory) === JSON.stringify(shown)) {
        return;
      }
      shown = inventory === null ? null : [...inventory];
      bag.noticeInventory(shown ?? []);
      render();
    },
    render: () => {
      render();
    },
  };
}
