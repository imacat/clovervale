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
 * @module client/villager-words What the villagers are called, and what
 *   they say, in the language of the page.
 */

import type { Villager } from '@clovervale/shared';

import type { Translator } from './translator.ts';

/** What a villager is called, and what it says. */
export interface VillagerWords {
  /** The name of the villager. */
  readonly name: string;
  /** What the villager says when a player talks to it. */
  readonly line: string;
}

/**
 * Tells what a villager is called, and what it says, in the language of
 * the page.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {Villager} villager - The villager.
 * @returns {VillagerWords} Its name and its line.
 */
export function describeVillager(
  translator: Translator,
  villager: Villager,
): VillagerWords {
  return {
    name: translator.translate(`villager.${villager.id}.name`),
    line: translator.translate(`villager.${villager.id}.line`),
  };
}
