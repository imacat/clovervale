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
 * @module scripts/test-browser/inventory Checks how the players pick, carry and
 *   drop clovers.
 */

import type { GroundItem, PlayerState } from '@clovervale/shared';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  BAG_KEYS,
  ITEM_NEARNESS,
  LEG_TIMEOUT,
  NO_SILVER_LABEL,
} from './constants.ts';
import { walkUntil } from './monster.ts';
import type { MonsterLook } from './monster.ts';
import {
  SILVER_EXPRESSION,
  evaluateInPage,
  sendKey,
  tapKey,
  waitFor,
} from './page.ts';
import type { SilverView } from './page.ts';

/** How a page shows the bag of its player. */
interface BagLook {
  /** Whether the bag is open. */
  readonly isOpen: boolean;
  /** How the bag shows the silver coins, or `null` if it shows none. */
  readonly silver: SilverView | null;
  /** The key shown on the icon of the bag, or `null` if it shows none. */
  readonly key: string | null;
  /** The slot the cursor of the bag is on, or -1 if on none. */
  readonly cursor: number;
  /** The actions the open menu of an item lists, or `null` if none is open. */
  readonly menu: readonly string[] | null;
  /** The action the cursor of the menu is on, or -1 if on none. */
  readonly menuCursor: number;
}

/** How a page shows a player, the clovers and the items, and its bag. */
interface InventoryLook {
  /** The player in the latest snapshot, if it is there. */
  readonly own: PlayerState | null;
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** How the page shows the bag of its player. */
  readonly bag: BagLook;
  /** What the panel of the page tells the space bar does. */
  readonly spaceKey: string;
  /** The number of corrections the panel of the page counts. */
  readonly corrections: string;
  /** The kind of item in each slot the page shows, or `''` if empty. */
  readonly slots: readonly string[];
  /** The patches of clover the page shows with their clover. */
  readonly clovers: readonly number[];
  /** The items the page shows on the ground. */
  readonly items: readonly Pick<GroundItem, 'id' | 'x' | 'z'>[];
}

/**
 * The least position along the X axis of the way down the east side of the
 * plaza to the patch of clover east of the fountain, clear of the fountain
 * and of Nancy, in meters.
 */
const CLOVER_WAY_X = 2.3;
/** The number of the patch of clover east of the fountain. */
const CLOVER_PATCH = 6;
/** What the panel tells the space bar does by a clover to pick. */
const PICK_KEY = 'pick up the four-leaf clover';
/** The prompt a page shows by a clover to pick, facing it. */
const PICK_PROMPT = 'Press Space to pick up the four-leaf clover';
/** The actions the menu of a four-leaf clover in the bag lists. */
const CLOVER_ACTIONS: readonly string[] = ['Drop'];

/**
 * Makes the expression that tells how a page shows a player, the clovers
 * of the patches and the items on the ground, and what is in its slots, as
 * JSON.
 *
 * @param {number} id - The identifier of the player.
 * @returns {string} The expression.
 */
function createInventoryExpression(id: number): string {
  return `(() => {
    const panel = {};
    for (const input of document.querySelectorAll('input[aria-labelledby]')) {
      const labelId = input.getAttribute('aria-labelledby');
      const label = document.getElementById(labelId)?.textContent;
      if (label) {
        panel[label] = input.value;
      }
    }
    const shown = (element) =>
      element === null || element.hidden ? null : element.textContent;
    const drawn = window.clovervale.describeItems();
    return JSON.stringify({
      own: window.clovervale.listLatestPlayers()
        .find((player) => player.id === ${String(id)}) ?? null,
      prompt: shown(document.querySelector('.interaction-prompt')),
      bag: (() => {
        const indexOf = (elements) =>
          elements.findIndex((element) => element.classList.contains('is-cursor'));
        const window = document.querySelector('.bag-window');
        const key = document.querySelector('.bag-key');
        const menu = document.querySelector('.bag-menu');
        const actions = [...document.querySelectorAll('.bag-action')];
        const isMenuOpen = menu !== null && !menu.hidden;
        return {
          isOpen: window !== null && !window.hidden,
          silver: ${SILVER_EXPRESSION},
          key: shown(key),
          cursor: indexOf([...document.querySelectorAll('.bag-slot')]),
          menu: isMenuOpen ? actions.map((action) => action.textContent) : null,
          menuCursor: isMenuOpen ? indexOf(actions) : -1,
        };
      })(),
      spaceKey: panel['Space key'] ?? '',
      corrections: panel.Corrections ?? '',
      slots: [...document.querySelectorAll('.bag-slot')]
        .map((slot) => slot.dataset.kind ?? ''),
      clovers: drawn.clovers,
      items: drawn.items.map(({ id, x, z }) => ({ id, x, z })),
    });
  })()`;
}

/**
 * Reads how a page shows a player, the clovers and the items, and what is
 * in its slots.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @returns {Promise<InventoryLook>} How the page shows them.
 */
async function readInventoryLook(
  session: BidiSession,
  context: string,
  id: number,
): Promise<InventoryLook> {
  return JSON.parse(
    await evaluateInPage(session, context, createInventoryExpression(id)),
  ) as InventoryLook;
}

/**
 * Describes how a page shows a player, the clovers and the items, and what
 * is in its slots, for the error messages.
 *
 * @param {InventoryLook} look - How the page shows them.
 * @returns {string} The description.
 */
function describeInventoryLook(look: InventoryLook): string {
  const { own } = look;
  const player: string =
    own === null
      ? 'without the player'
      : `with the player at x ${own.x.toFixed(2)}, z ${own.z.toFixed(2)}, ` +
        `doing "${own.action}"`;
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  const { bag } = look;
  const shownBag: string =
    `the bag ${bag.isOpen ? 'open' : 'closed'}, keyed ` +
    `"${String(bag.key)}", with the silver coins ` +
    `${JSON.stringify(bag.silver)}, its cursor on slot ${String(bag.cursor)}` +
    (bag.menu === null
      ? ''
      : ` and a menu of ${JSON.stringify(bag.menu)} with its cursor on ` +
        String(bag.menuCursor));
  const items: string = look.items
    .map(
      (item: Pick<GroundItem, 'id' | 'x' | 'z'>) =>
        `${String(item.id)} at x ${item.x.toFixed(2)}, z ${item.z.toFixed(2)}`,
    )
    .join('; ');
  return (
    `${player}, the space bar to "${look.spaceKey}", ${prompt}, ` +
    `${shownBag}, the slots ${JSON.stringify(look.slots)}, the clovers ` +
    `of the patches ${JSON.stringify(look.clovers)}, the items on the ` +
    `ground [${items}], and "${look.corrections}" corrections`
  );
}

/**
 * Counts the filled slots of the bag of a page that hold a four-leaf
 * clover.
 *
 * @param {InventoryLook} look - How the page shows its slots.
 * @returns {number} The number of them, or -1 if any other slot is filled.
 */
function countClovers(look: InventoryLook): number {
  const filled: string[] = look.slots.filter((kind: string) => kind !== '');
  return filled.every((kind: string) => kind === 'clover')
    ? filled.length
    : -1;
}

/**
 * Walks the player of a page down the east side of the plaza until its
 * page tells the space bar picks a four-leaf clover, and waits for it to
 * stop there.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {number} id - The identifier of the player.
 * @param {string} name - The name of the page, for the error messages.
 * @returns {Promise<InventoryLook>} How the page shows it, once stopped.
 * @throws {Error} If the player does not get there in time.
 */
async function walkToClover(
  session: BidiSession,
  context: string,
  id: number,
  name: string,
): Promise<InventoryLook> {
  const look = (): Promise<InventoryLook> =>
    readInventoryLook(session, context, id);
  await walkUntil(
    session,
    context,
    id,
    'd',
    (seen: MonsterLook) => (seen.own?.x ?? -Infinity) >= CLOVER_WAY_X,
    'to the east side of the plaza',
  );
  await sendKey(session, context, 'keyDown', 'w');
  try {
    await waitFor(
      look,
      (seen: InventoryLook) => seen.spaceKey === PICK_KEY,
      LEG_TIMEOUT,
      (seen: InventoryLook) =>
        `With the W key held down to walk to a clover, ${name} tells ` +
        `${describeInventoryLook(seen)}.`,
    );
  } finally {
    await sendKey(session, context, 'keyUp', 'w');
  }
  return waitFor(
    look,
    (seen: InventoryLook) =>
      seen.own?.action === 'Idle' &&
      seen.spaceKey === PICK_KEY &&
      seen.prompt === PICK_PROMPT,
    ACTION_TIMEOUT,
    (seen: InventoryLook) =>
      `By a clover, ${name} tells ${describeInventoryLook(seen)}.`,
  );
}

/**
 * Checks that a player picks the four-leaf clover of a patch with the
 * space bar, and sees it in its slots, while the patch is shown without its
 * clover in both pages and the other page shows nothing in its own slots;
 * that it opens its bag with the I key, moves the cursor of the bag with
 * the arrow keys without walking, opens the menu of the clover with Enter,
 * and drops the clover at its feet with Enter again, where both pages
 * show it lying; and that the player of the other page walks to it, picks
 * it up with the space bar, and sees it in its own slots, while it is gone
 * from the ground in both pages and from the slots of the first.  Neither
 * the pick nor the put-down makes a correction in the first page.
 *
 * Each player walks right in the first view to the east side of the plaza,
 * and then down it until its page tells the space bar picks.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} actor - The browsing context of the page of the player
 *   that picks the clover of the patch.
 * @param {string} watcher - The browsing context of the other page.
 * @param {number} id - The identifier of the player of the first page.
 * @param {number} otherId - The identifier of the player of the other page.
 * @returns {Promise<void>} A promise settled once the players have passed.
 * @throws {Error} If either page does not show the items so.
 */
export async function checkInventory(
  session: BidiSession,
  actor: string,
  watcher: string,
  id: number,
  otherId: number,
): Promise<void> {
  const readBoth = (): Promise<[InventoryLook, InventoryLook]> =>
    Promise.all([
      readInventoryLook(session, actor, id),
      readInventoryLook(session, watcher, otherId),
    ]);
  const describeBoth = ([own, other]: [InventoryLook, InventoryLook]): string =>
    `the first page tells ${describeInventoryLook(own)}, and the second ` +
    `page ${describeInventoryLook(other)}`;
  const byClover: InventoryLook = await walkToClover(
    session,
    actor,
    id,
    'the first page',
  );
  const [ownBefore, otherBefore] = await readBoth();
  if (
    countClovers(ownBefore) !== 0 ||
    countClovers(otherBefore) !== 0 ||
    ownBefore.bag.isOpen ||
    ownBefore.bag.key !== 'I' ||
    !otherBefore.clovers.includes(CLOVER_PATCH)
  ) {
    throw new Error(`By a clover, ${describeBoth([ownBefore, otherBefore])}.`);
  }

  await tapKey(session, actor, ' ');
  await waitFor(
    readBoth,
    ([own, other]: [InventoryLook, InventoryLook]) =>
      countClovers(own) === 1 &&
      own.bag.key === 'I' &&
      !own.clovers.includes(CLOVER_PATCH) &&
      !other.clovers.includes(CLOVER_PATCH) &&
      countClovers(other) === 0,
    ACTION_TIMEOUT,
    (looks: [InventoryLook, InventoryLook]) =>
      `With the space bar pressed by a clover in the first page, ` +
      `${describeBoth(looks)}.`,
  );

  const press = (context: string, key: string): Promise<void> =>
    tapKey(session, context, key);
  const look = (): Promise<InventoryLook> =>
    readInventoryLook(session, actor, id);
  await press(actor, 'i');
  await press(actor, BAG_KEYS.right);
  await press(actor, BAG_KEYS.left);
  await press(actor, BAG_KEYS.enter);
  const choosing: InventoryLook = await waitFor(
    look,
    (seen: InventoryLook) =>
      seen.bag.isOpen &&
      seen.bag.silver?.count === '0' &&
      seen.bag.silver.label === NO_SILVER_LABEL &&
      seen.bag.silver.isCoinDrawn &&
      seen.bag.silver.isInWindow &&
      seen.bag.cursor === 0 &&
      JSON.stringify(seen.bag.menu) === JSON.stringify(CLOVER_ACTIONS) &&
      seen.bag.menuCursor === 0,
    ACTION_TIMEOUT,
    (seen: InventoryLook) =>
      'With I, the right and left arrows and Enter pressed in the first ' +
      `page, it tells ${describeInventoryLook(seen)}.`,
  );
  if (
    choosing.own?.x !== byClover.own?.x ||
    choosing.own?.z !== byClover.own?.z
  ) {
    throw new Error(
      'With the arrow keys pressed in its open bag, the first page tells ' +
        `${describeInventoryLook(choosing)}, after the player stood at x ` +
        `${String(byClover.own?.x)}, z ${String(byClover.own?.z)}.`,
    );
  }
  await press(actor, BAG_KEYS.enter);
  const isLyingThere = (look: InventoryLook): boolean =>
    look.items.length === 1 &&
    look.items.every(
      (item: Pick<GroundItem, 'id' | 'x' | 'z'>) =>
        Math.abs(item.x - (byClover.own?.x ?? NaN)) <= ITEM_NEARNESS &&
        Math.abs(item.z - (byClover.own?.z ?? NaN)) <= ITEM_NEARNESS,
    );
  const dropped: [InventoryLook, InventoryLook] = await waitFor(
    readBoth,
    ([own, other]: [InventoryLook, InventoryLook]) =>
      countClovers(own) === 0 &&
      own.bag.isOpen &&
      own.bag.menu === null &&
      own.bag.key === 'I' &&
      isLyingThere(own) &&
      isLyingThere(other),
    ACTION_TIMEOUT,
    (looks: [InventoryLook, InventoryLook]) =>
      `With Drop chosen in the menu of the first page, ` +
      `${describeBoth(looks)}.`,
  );
  if (dropped[0].corrections !== byClover.corrections) {
    throw new Error(
      `After its player picked a clover and put it down, ` +
        `${describeBoth(dropped)}, after "${byClover.corrections}" ` +
        'corrections before.',
    );
  }

  await press(actor, BAG_KEYS.escape);
  await waitFor(
    look,
    (seen: InventoryLook) => !seen.bag.isOpen,
    ACTION_TIMEOUT,
    (seen: InventoryLook) =>
      `With Esc pressed in the open bag of the first page, it tells ` +
      `${describeInventoryLook(seen)}.`,
  );

  await walkToClover(session, watcher, otherId, 'the second page');
  await tapKey(session, watcher, ' ');
  await waitFor(
    readBoth,
    ([own, other]: [InventoryLook, InventoryLook]) =>
      countClovers(other) === 1 &&
      other.bag.key === 'I' &&
      countClovers(own) === 0 &&
      own.items.length === 0 &&
      other.items.length === 0,
    ACTION_TIMEOUT,
    (looks: [InventoryLook, InventoryLook]) =>
      `With the space bar pressed by the clover on the ground in the ` +
      `second page, ${describeBoth(looks)}.`,
  );
}
