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

import type { Villager, VillagerId } from '@clovervale/shared';

import type { PlainMessageId } from './messages/en.ts';
import { isMessageId } from './translator.ts';
import type { Translator } from './translator.ts';

/** What a villager is called, and what it says. */
export interface VillagerWords {
  /**
   * The name of the villager: once it has told the player of the page who
   * it is, the name it then goes by, if it has one.
   */
  readonly name: string;
  /**
   * The name of the villager as it reads inside a sentence, which is its
   * name unless the language words it otherwise there.
   */
  readonly sentenceName: string;
  /**
   * The lines the villager says when a player talks to it, one line each
   * time, picked at random, but never the line it said the time before.
   */
  readonly lines: readonly string[];
}

/**
 * Lists the messages of the lines a villager says.
 *
 * @param {Villager} villager - The villager.
 * @returns {PlainMessageId[]} The messages of its lines, from the first on.
 */
function listLineIds(villager: Villager): PlainMessageId[] {
  const ids: PlainMessageId[] = [];
  for (let number = 1; ; number++) {
    const id = `villager.${villager.id}.line.${String(number)}`;
    if (!isMessageId(id)) {
      return ids;
    }
    ids.push(id);
  }
}

/**
 * Tells what a villager is called, and what it says, in the language of
 * the page.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {Villager} villager - The villager.
 * @param {readonly VillagerId[]} [acquaintances] - The villagers who have
 *   told the player of the page who they are, none by default.
 * @returns {VillagerWords} Its name and its lines.
 */
export function describeVillager(
  translator: Translator,
  villager: Villager,
  acquaintances: readonly VillagerId[] = [],
): VillagerWords {
  const knownName = `villager.${villager.id}.knownName`;
  let name: string = translator.translate(`villager.${villager.id}.name`);
  let sentenceName: string =
    translator.translateOptional(`villager.${villager.id}.name.inSentence`) ??
    name;
  if (acquaintances.includes(villager.id) && isMessageId(knownName)) {
    name = translator.translate(knownName);
    sentenceName = name;
  }
  return {
    name,
    sentenceName,
    lines: listLineIds(villager).map((id: PlainMessageId) =>
      translator.translate(id),
    ),
  };
}
