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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/items The items a player can pick, carry and put down, and
 *   where they are to be found in the village.
 */

import { PLAYER_HEALTH } from './combat.ts';
import type { GroundVector } from './movement.ts';
import { VILLAGE_PLACEMENTS } from './village-layout.ts';
import type { Placement } from './village-layout.ts';

/** A kind of item. */
export interface ItemKind {
  /** The identifier of the kind, as the messages name it. */
  readonly id: string;
  /** The message that names the kind for the person at a page. */
  readonly nameKey: string;
  /**
   * The health an item of the kind gives back to the player who uses it,
   * once and at once, which uses the item up.  An item of a kind without it
   * cannot be used.
   */
  readonly healing?: number;
}

/** Every kind of item there is. */
export const ITEM_KINDS = [
  { id: 'clover', nameKey: 'item.clover' },
  { id: 'sword', nameKey: 'item.sword' },
  { id: 'leather-armour', nameKey: 'item.leatherArmour' },
  { id: 'healing-potion', nameKey: 'item.healingPotion', healing: 50 },
  { id: 'clovervale-message', nameKey: 'item.clovervaleMessage' },
  { id: 'spy-token', nameKey: 'item.spyToken' },
  { id: 'martha-ointment', nameKey: 'item.marthaOintment' },
] as const satisfies readonly ItemKind[];

/** The identifier of a kind of item. */
export type ItemKindId = (typeof ITEM_KINDS)[number]['id'];

/** The kind of item a patch of clover grows: a four-leaved clover. */
export const CLOVER_KIND: ItemKindId = 'clover';

/** The most items a player can carry, one in each slot of its inventory. */
export const INVENTORY_SIZE = 16;

/**
 * How long a patch of clover takes to grow a new four-leaved clover once
 * its clover has been picked, in seconds.
 */
export const CLOVER_REGROW_DURATION = 30;

/** How long an item put down on the ground lies there, in seconds. */
export const GROUND_ITEM_DURATION = 60;

/** The file name of the model of a patch of clover. */
const CLOVER_FILE = 'prop-clover.glb';

/**
 * Where the patches of clover of the village are, each numbered by its
 * place in the list, from 0.
 */
export const CLOVER_PATCHES: readonly GroundVector[] = VILLAGE_PLACEMENTS
  .filter((placement: Placement) => placement.file === CLOVER_FILE)
  .map(({ x, z }: Placement): GroundVector => ({ x, z }));

/** An item that lies on the ground. */
export interface GroundItem {
  /** The identifier of the item, unique while the server runs. */
  readonly id: number;
  /** The kind of the item. */
  readonly kind: ItemKindId;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
}

/** What there is to pick in the world, as everyone sees it. */
export interface WorldItems {
  /**
   * The numbers of the patches of clover that have their four-leaved
   * clover, in ascending order.
   */
  readonly clovers: readonly number[];
  /** The items that lie on the ground. */
  readonly items: readonly GroundItem[];
  /**
   * The numbers of the containers of the cave that have been looted, in
   * ascending order, none if left out.
   */
  readonly looted?: readonly number[];
  /**
   * The number of the latest step at which Toby took the four-leaved
   * clover of a patch of clover, or `null` if he has taken none, which he
   * has not if left out.
   */
  readonly tobyFind?: number | null;
}

/** A world with nothing to pick. */
export const NO_WORLD_ITEMS: WorldItems = { clovers: [], items: [] };

/**
 * Tells whether a decoded value is the identifier of a kind of item.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is.
 */
export function isItemKindId(value: unknown): value is ItemKindId {
  return ITEM_KINDS.some((kind: ItemKind) => kind.id === value);
}

/**
 * Finds a kind of item.
 *
 * @param {ItemKindId} id - The identifier of the kind.
 * @returns {ItemKind} The kind.
 */
export function findItemKind(id: ItemKindId): (typeof ITEM_KINDS)[number] {
  const kind: (typeof ITEM_KINDS)[number] | undefined = ITEM_KINDS.find(
    (candidate: ItemKind) => candidate.id === id,
  );
  if (kind === undefined) {
    throw new Error(`There is no kind of item "${id}".`);
  }
  return kind;
}

/**
 * Tells whether an item of a kind can be used.
 *
 * @param {ItemKindId} id - The identifier of the kind.
 * @returns {boolean} Whether it can, whatever the health of the player.
 */
export function isUsableItem(id: ItemKindId): boolean {
  const kind: ItemKind = findItemKind(id);
  return kind.healing !== undefined;
}

/**
 * Tells whether a player with some health would get anything from using
 * an item of a kind: whether the item can be used, and the player lacks
 * health for it to give back.  Whether the player is alive does not count.
 *
 * @param {ItemKindId} id - The identifier of the kind.
 * @param {number} health - The health of the player.
 * @returns {boolean} Whether the player would.
 */
export function canUseItem(id: ItemKindId, health: number): boolean {
  return isUsableItem(id) && health < PLAYER_HEALTH;
}

/**
 * Tells whether an inventory has room for one more item.
 *
 * @param {readonly ItemKindId[]} inventory - The items in it.
 * @returns {boolean} Whether it holds fewer than {@link INVENTORY_SIZE}.
 */
export function hasRoom(inventory: readonly ItemKindId[]): boolean {
  return inventory.length < INVENTORY_SIZE;
}
