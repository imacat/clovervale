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

import { canInteract, findInteraction, findVillager } from '@clovervale/shared';
import type { PlayerMotion, Villager } from '@clovervale/shared';

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
 * Describes what the space bar makes the player of the page do now.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PlayerMotion | null} motion - The motion of the player as
 *   predicted, or `null` while there is none.
 * @returns {string} What the player does, that it does nothing while it
 *   cannot interact, as while it is dead, or `–` while there is no player,
 *   in the language of the page.
 */
export function describeSpaceKey(
  translator: Translator,
  motion: PlayerMotion | null,
): string {
  if (motion === null) {
    return UNKNOWN;
  }
  if (!canInteract(motion)) {
    return translator.translate('spaceKey.nothing');
  }
  const villager: Villager | null = findVillager(motion);
  if (villager !== null) {
    const { name } = describeVillager(translator, villager);
    return translator.translate('spaceKey.talk', { name });
  }
  return findInteraction(motion) === 'Drink'
    ? translator.translate('spaceKey.drink')
    : translator.translate('spaceKey.slash');
}

/**
 * Words the prompt that tells what the space bar makes the player of the
 * page do now, unless that is only a slash.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PlayerMotion | null} motion - The motion of the player as
 *   predicted, or `null` while there is none.
 * @returns {string | null} The prompt, in the language of the page, or
 *   `null` while the space bar makes the player slash or do nothing, or
 *   there is no player.
 */
export function describePrompt(
  translator: Translator,
  motion: PlayerMotion | null,
): string | null {
  if (motion === null || !canInteract(motion)) {
    return null;
  }
  const villager: Villager | null = findVillager(motion);
  if (villager !== null) {
    const { name } = describeVillager(translator, villager);
    return translator.translate('prompt.talk', { name });
  }
  if (findInteraction(motion) === 'Drink') {
    return translator.translate('prompt.drink');
  }
  return null;
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
