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
 * @module client/space-words Wording what the space bar makes the player of
 *   the page do, and the prompt that tells of it.
 */

import { assertNever } from '@clovervale/shared';
import type {
  CaveContainer,
  ContainerTarget,
  VillagerId,
} from '@clovervale/shared';

import { nameItem } from './item-words.ts';
import type { PlainMessageId } from './messages/en.ts';
import type { SpaceAction } from './space-action.ts';
import type { Translator } from './translator.ts';
import { describeVillager } from './villager-words.ts';

/** What stands for a value that is not known yet. */
const UNKNOWN = '–';

/** The message of the name of each kind of container. */
const CONTAINER_NAMES: Readonly<Record<CaveContainer['kind'], PlainMessageId>> =
  {
    chest: 'container.chest',
    barrel: 'container.barrel',
  };

/** The words that tell what the space bar makes a player do. */
interface SpaceWords {
  /** What the space bar does. */
  readonly spaceKey: string;
  /** The prompt with the space bar, or `null` for none. */
  readonly prompt: string | null;
  /** The prompt with the action button, or `null` for none. */
  readonly touchPrompt: string | null;
}

/**
 * Describes what the space bar makes the player of the page do now.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {SpaceAction | null} action - What the space bar makes the player
 *   do, or `null` while there is no player.
 * @param {readonly VillagerId[]} [acquaintances] - The villagers who have
 *   told the player who they are, as the server last told, none by default,
 *   which tells what a villager is called.
 * @returns {string} What the player does, that it does nothing while it
 *   cannot interact, as while it is dead, while the item within its reach
 *   to pick does not fit in its inventory, or while the container within
 *   its reach is empty, silver coins fitting in any inventory, or `–`
 *   while there is no player, in the language of the page.
 */
export function describeSpaceKey(
  translator: Translator,
  action: SpaceAction | null,
  acquaintances: readonly VillagerId[] = [],
): string {
  return action === null
    ? UNKNOWN
    : wordSpaceAction(translator, action, acquaintances).spaceKey;
}

/**
 * Words the prompt that tells what the space bar makes the player of the
 * page do now, unless that is only a slash, or that tells that what is
 * within its reach to pick does not fit in its inventory, or that the
 * container within its reach is empty.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {SpaceAction | null} action - What the space bar makes the player
 *   do, or `null` while there is no player.
 * @param {readonly VillagerId[]} acquaintances - The villagers who have
 *   told the player who they are, as the server last told, which tells what
 *   a villager is called.
 * @param {boolean} isTouch - Whether the page is used by touch, so that
 *   the prompt tells of the action button rather than the space bar.
 * @returns {string | null} The prompt, in the language of the page, or
 *   `null` while the space bar makes the player slash, while the player
 *   cannot start to interact with the world, or while there is no player.
 */
export function describePrompt(
  translator: Translator,
  action: SpaceAction | null,
  acquaintances: readonly VillagerId[],
  isTouch: boolean,
): string | null {
  if (action === null) {
    return null;
  }
  const words: SpaceWords = wordSpaceAction(translator, action, acquaintances);
  return isTouch ? words.touchPrompt : words.prompt;
}

/**
 * Words what the space bar makes the player of the page do.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {SpaceAction} action - What the space bar makes the player do.
 * @param {readonly VillagerId[]} acquaintances - The villagers who have
 *   told the player who they are, which tells what a villager is called.
 * @returns {SpaceWords} What the space bar does, and the prompts that tell
 *   of it, in the language of the page.
 */
function wordSpaceAction(
  translator: Translator,
  action: SpaceAction,
  acquaintances: readonly VillagerId[],
): SpaceWords {
  switch (action.type) {
    case 'nothing':
    case 'slash':
      return {
        spaceKey: translator.translate(`spaceKey.${action.type}`),
        prompt: null,
        touchPrompt: null,
      };
    case 'drink':
    case 'enter':
    case 'climb':
      return {
        spaceKey: translator.translate(`spaceKey.${action.type}`),
        prompt: translator.translate(`prompt.${action.type}`),
        touchPrompt: translator.translate(`touchPrompt.${action.type}`),
      };
    case 'talk': {
      const { sentenceName: name } = describeVillager(
        translator,
        action.villager,
        acquaintances,
      );
      return {
        spaceKey: translator.translate('spaceKey.talk', { name }),
        prompt: translator.translate('prompt.talk', { name }),
        touchPrompt: translator.translate('touchPrompt.talk', { name }),
      };
    }
    case 'open': {
      const container: string = nameContainer(translator, action.container);
      return {
        spaceKey: translator.translate('spaceKey.open', { container }),
        prompt: translator.translate('prompt.open', { container }),
        touchPrompt: translator.translate('touchPrompt.open', { container }),
      };
    }
    case 'empty': {
      const container: string = nameContainer(translator, action.container);
      const prompt: string = translator.translate('prompt.empty', {
        container,
      });
      return {
        spaceKey: translator.translate('spaceKey.empty', { container }),
        prompt,
        touchPrompt: prompt,
      };
    }
    case 'fullContainer': {
      const prompt: string = translator.translate('prompt.fullContainer', {
        container: nameContainer(translator, action.container),
      });
      return {
        spaceKey: translator.translate('spaceKey.full'),
        prompt,
        touchPrompt: prompt,
      };
    }
    case 'pick': {
      const item: string = nameItem(translator, action.item, 'specific');
      return {
        spaceKey: translator.translate('spaceKey.pick', { item }),
        prompt: translator.translate('prompt.pick', { item }),
        touchPrompt: translator.translate('touchPrompt.pick', { item }),
      };
    }
    case 'full': {
      const prompt: string = translator.translate('prompt.full', {
        item: nameItem(translator, action.item, 'specific'),
      });
      return {
        spaceKey: translator.translate('spaceKey.full'),
        prompt,
        touchPrompt: prompt,
      };
    }
    default:
      return assertNever(action);
  }
}

/**
 * Names the container a player would loot.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {ContainerTarget} container - The container.
 * @returns {string} The name of the kind of the container, in the language
 *   of the page.
 */
function nameContainer(
  translator: Translator,
  container: ContainerTarget,
): string {
  return translator.translate(CONTAINER_NAMES[container.containerKind]);
}
