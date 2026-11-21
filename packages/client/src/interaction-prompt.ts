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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/interaction-prompt Telling the person at the page what the
 *   space bar makes its player do.
 */

import {
  CAVE_CONTAINERS,
  NO_WORLD_ITEMS,
  canInteract,
  findInteraction,
  findItemKind,
  findPassage,
  findPickTarget,
  findVillager,
  hasRoom,
} from '@clovervale/shared';
import type {
  ItemKindId,
  MapId,
  MonsterState,
  Passage,
  PickTarget,
  PlayerMotion,
  Villager,
  VillagerId,
  WorldItems,
} from '@clovervale/shared';

import type { Translator } from './translator.ts';
import { describeVillager } from './villager-words.ts';

/** What stands for a value that is not known yet. */
const UNKNOWN = '–';

/** A prompt on the page. */
export interface Prompt {
  /**
   * Shows the prompt with a text, or hides it.
   *
   * @param {string | null} text - The text, or `null` to hide the prompt.
   */
  readonly show: (text: string | null) => void;
}

/**
 * How a message names an item: plainly, as the inventory shows it; as the
 * one in question, as a prompt to pick it up does; or as one the player
 * has just got.
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

/**
 * Names the container a player would loot.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PickTarget} target - What the player would pick, a container.
 * @returns {string} The name of the kind of the container, in the language
 *   of the page.
 */
function nameContainer(translator: Translator, target: PickTarget): string {
  return translator.translate(
    CAVE_CONTAINERS[target.id]?.kind === 'barrel'
      ? 'container.barrel'
      : 'container.chest',
  );
}

/**
 * Describes what the space bar makes the player of the page do now.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PlayerMotion | null} motion - The motion of the player as
 *   predicted, or `null` while there is none.
 * @param {number} step - The number of the step of the server an
 *   interaction would start at, which tells where Toby would be then.
 * @param {WorldItems} [world] - What there is to pick in the map, as the
 *   server last told, which is nothing by default.
 * @param {readonly ItemKindId[]} [inventory] - What the player carries, as
 *   the server last told, which is nothing by default.
 * @param {MapId} [map] - The map the player is in, the village by default.
 * @param {readonly MonsterState[]} [monsters] - The monsters in the map,
 *   as the server last told, none by default.
 * @param {readonly VillagerId[]} [acquaintances] - The villagers who have
 *   told the player who they are, as the server last told, none by default,
 *   which tells what a villager is called.
 * @returns {string} What the player does, that it does nothing while it
 *   cannot interact, as while it is dead, while what is within its reach to
 *   pick does not fit in its inventory, or while the container within its
 *   reach is empty, or `–` while there is no player, in the language of the
 *   page.
 */
export function describeSpaceKey(
  translator: Translator,
  motion: PlayerMotion | null,
  step: number,
  world: WorldItems = NO_WORLD_ITEMS,
  inventory: readonly ItemKindId[] = [],
  map: MapId = 'village',
  monsters: readonly MonsterState[] = [],
  acquaintances: readonly VillagerId[] = [],
): string {
  if (motion === null) {
    return UNKNOWN;
  }
  if (!canInteract(motion)) {
    return translator.translate('spaceKey.nothing');
  }
  const villager: Villager | null = findVillager(
    motion,
    step,
    map,
    monsters,
  );
  if (villager !== null) {
    const { name } = describeVillager(translator, villager, acquaintances);
    return translator.translate('spaceKey.talk', { name });
  }
  if (findInteraction(motion, step, map) === 'Drink') {
    return translator.translate('spaceKey.drink');
  }
  const passage: Passage | null = findPassage(motion, step, map, monsters);
  if (passage !== null) {
    return translator.translate(
      passage.destination === 'cave' ? 'spaceKey.enter' : 'spaceKey.climb',
    );
  }
  const target: PickTarget | null = findPickTarget(
    motion,
    step,
    world,
    map,
    monsters,
  );
  if (target === null) {
    return translator.translate('spaceKey.slash');
  }
  if (target.kind === null) {
    return translator.translate('spaceKey.empty', {
      container: nameContainer(translator, target),
    });
  }
  if (!hasRoom(inventory)) {
    return translator.translate('spaceKey.full');
  }
  return target.source === 'container'
    ? translator.translate('spaceKey.open', {
        container: nameContainer(translator, target),
      })
    : translator.translate('spaceKey.pick', {
        item: nameItem(translator, target.kind, 'specific'),
      });
}

/**
 * Words the prompt that tells what the space bar makes the player of the
 * page do now, unless that is only a slash, or that tells that what is
 * within its reach to pick does not fit in its inventory, or that the
 * container within its reach is empty.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PlayerMotion | null} motion - The motion of the player as
 *   predicted, or `null` while there is none.
 * @param {number} step - The number of the step of the server an
 *   interaction would start at, which tells where Toby would be then.
 * @param {WorldItems} [world] - What there is to pick in the map, as the
 *   server last told, which is nothing by default.
 * @param {readonly ItemKindId[]} [inventory] - What the player carries, as
 *   the server last told, which is nothing by default.
 * @param {MapId} [map] - The map the player is in, the village by default.
 * @param {readonly MonsterState[]} [monsters] - The monsters in the map,
 *   as the server last told, none by default.
 * @param {readonly VillagerId[]} [acquaintances] - The villagers who have
 *   told the player who they are, as the server last told, none by default,
 *   which tells what a villager is called.
 * @param {boolean} [isTouch] - Whether the page is used by touch, so that
 *   the prompt tells of the action button rather than the space bar, which
 *   it does not by default.
 * @returns {string | null} The prompt, in the language of the page, or
 *   `null` while the space bar makes the player slash, while the player
 *   cannot start to interact with the world, or while there is no player.
 */
export function describePrompt(
  translator: Translator,
  motion: PlayerMotion | null,
  step: number,
  world: WorldItems = NO_WORLD_ITEMS,
  inventory: readonly ItemKindId[] = [],
  map: MapId = 'village',
  monsters: readonly MonsterState[] = [],
  acquaintances: readonly VillagerId[] = [],
  isTouch = false,
): string | null {
  if (motion === null || !canInteract(motion)) {
    return null;
  }
  const villager: Villager | null = findVillager(
    motion,
    step,
    map,
    monsters,
  );
  if (villager !== null) {
    const { name } = describeVillager(translator, villager, acquaintances);
    return translator.translate(
      isTouch ? 'touchPrompt.talk' : 'prompt.talk',
      { name },
    );
  }
  if (findInteraction(motion, step, map) === 'Drink') {
    return translator.translate(isTouch ? 'touchPrompt.drink' : 'prompt.drink');
  }
  const passage: Passage | null = findPassage(motion, step, map, monsters);
  if (passage !== null) {
    if (passage.destination === 'cave') {
      return translator.translate(
        isTouch ? 'touchPrompt.enter' : 'prompt.enter',
      );
    }
    return translator.translate(isTouch ? 'touchPrompt.climb' : 'prompt.climb');
  }
  const target: PickTarget | null = findPickTarget(
    motion,
    step,
    world,
    map,
    monsters,
  );
  if (target === null) {
    return null;
  }
  // Only a container gives nothing.
  if (target.kind === null) {
    return translator.translate('prompt.empty', {
      container: nameContainer(translator, target),
    });
  }
  if (target.source === 'container') {
    const container: string = nameContainer(translator, target);
    return hasRoom(inventory)
      ? translator.translate(isTouch ? 'touchPrompt.open' : 'prompt.open', {
          container,
        })
      : translator.translate('prompt.fullContainer', { container });
  }
  const item: string = nameItem(translator, target.kind, 'specific');
  return hasRoom(inventory)
    ? translator.translate(isTouch ? 'touchPrompt.pick' : 'prompt.pick', {
        item,
      })
    : translator.translate('prompt.full', { item });
}

/**
 * Creates a prompt at the foot of the page, which starts hidden.
 *
 * @param {HTMLElement} parent - What the prompt is added to.
 * @returns {Prompt} The prompt.
 */
export function createPrompt(parent: HTMLElement): Prompt {
  const element: HTMLDivElement = document.createElement('div');
  element.className = 'interaction-prompt';
  element.hidden = true;
  parent.append(element);
  return {
    show: (text: string | null): void => {
      element.hidden = text === null;
      if (text !== null && element.textContent !== text) {
        element.textContent = text;
      }
    },
  };
}
