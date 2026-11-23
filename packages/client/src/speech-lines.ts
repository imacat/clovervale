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
 * @module client/speech-lines What the speech bubbles show: the line a
 *   villager says and the name it goes by, and what a player says.
 */

import type { Villager, VillagerId } from '@clovervale/shared';

import type { LanguageCode } from './language.ts';
import type { PlainMessageId } from './messages/en.ts';
import type { Translator } from './translator.ts';
import { describeVillager } from './villager-words.ts';

/** What a bubble is to show. */
export interface SpeechWords {
  /**
   * The name of the villager who speaks, or nothing for a player, who goes
   * by no name.
   */
  readonly name: string;
  /** What the villager or the player says. */
  readonly line: string;
  /** The language of the words. */
  readonly language: LanguageCode;
}

/**
 * The words of the bubbles, in the language of the page: which line each
 * villager says, by what name, and what the players say.
 */
export class SpeechLines {
  readonly #translator: Translator;
  readonly #random: () => number;
  /** The position of the line each villager said last, by villager. */
  readonly #lastLines = new Map<VillagerId, number>();
  /** The villagers who have told the player of the page who they are. */
  #acquaintances: readonly VillagerId[] = [];

  /**
   * Starts with no line said yet, and no villager known by name.
   *
   * @param {Translator} translator - The translator of the text of the page.
   * @param {() => number} [random] - Gives a random number in [0, 1) each
   *   time it is called, to pick the line a villager says by, as
   *   `Math.random` does by default.
   */
  constructor(translator: Translator, random: () => number = Math.random) {
    this.#translator = translator;
    this.#random = random;
  }

  /**
   * Takes in which villagers have told the player of the page who they are,
   * for the words to come to call them by the names they then go by.
   *
   * @param {readonly VillagerId[]} acquaintances - The villagers.
   */
  noticeAcquaintances(acquaintances: readonly VillagerId[]): void {
    this.#acquaintances = [...acquaintances];
  }

  /**
   * Picks the line a villager says this time: its first line, the first
   * time a villager who greets first says one, or else at random among its
   * lines, other than the one it said last, if it has more than one.
   *
   * @param {Villager} villager - The villager.
   * @returns {number} The position of the line among its lines.
   */
  pickLine(villager: Villager): number {
    const count: number = describeVillager(this.#translator, villager).lines
      .length;
    if (count <= 1) {
      return 0;
    }
    const last: number | undefined = this.#lastLines.get(villager.id);
    if (last === undefined && villager.greetsFirst === true) {
      this.#lastLines.set(villager.id, 0);
      return 0;
    }
    const choices: number = last === undefined ? count : count - 1;
    let index: number = Math.floor(this.#random() * choices);
    if (last !== undefined && index >= last) {
      index++;
    }
    this.#lastLines.set(villager.id, index);
    return index;
  }

  /**
   * Tells what a bubble of a villager shows, in the language of the page,
   * the villager called by the name it goes by once it has told the player
   * of the page who it is, as {@link noticeAcquaintances} was last told.
   *
   * @param {Villager} villager - The villager.
   * @param {number} lineIndex - The position of the line it says among its
   *   lines.
   * @param {PlainMessageId | null} lineId - The message of the line it
   *   says, if it was given one, in place of its own lines.
   * @returns {SpeechWords} The name of the villager, what it says, and
   *   their language.
   */
  describeVillagerLine(
    villager: Villager,
    lineIndex: number,
    lineId: PlainMessageId | null,
  ): SpeechWords {
    const { name, lines } = describeVillager(
      this.#translator,
      villager,
      this.#acquaintances,
    );
    return {
      name,
      line:
        lineId === null
          ? (lines[lineIndex] ?? '')
          : this.#translator.translate(lineId),
      language: this.#translator.language,
    };
  }

  /**
   * Tells what a bubble of a player shows, under no name: a line as it
   * typed it, drawn in the language of the page, or a phrase in that
   * language.
   *
   * @param {string} line - What the player typed, or anything for a
   *   phrase.
   * @param {PlainMessageId | null} lineId - The message of the phrase it
   *   says, or `null` for a line it typed.
   * @returns {SpeechWords} What the player says, and the language of the
   *   page.
   */
  describePlayerLine(
    line: string,
    lineId: PlainMessageId | null,
  ): SpeechWords {
    return {
      name: '',
      line: lineId === null ? line : this.#translator.translate(lineId),
      language: this.#translator.language,
    };
  }
}
