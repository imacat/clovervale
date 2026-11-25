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
 * @module client/player-record What the server has told the page of its
 *   player and of the world the player is in.
 */

import { NO_WORLD_ITEMS } from '@clovervale/shared';
import type {
  ItemKindId,
  Quest,
  SlashJudgment,
  SnapshotMessage,
  VillagerId,
  WorldItems,
} from '@clovervale/shared';

import { findShownItems } from './toby-finds.ts';
import type { WorldNews } from './toby-finds.ts';

/**
 * What the server last told the page of its player: who it is, what it
 * carries, its silver coins, how its latest slash was judged, the villagers
 * who have told it who they are, how far it has gotten with the quests,
 * whether it has reached the end of the story, and what there is to pick
 * in the world.
 */
export class PlayerRecord {
  /** The identifier of the player of the page, once the server has told it. */
  #playerId: number | null = null;
  /** How the server judged the latest slash of the player of the page. */
  #slash: SlashJudgment | null = null;
  /**
   * What there is to pick in the world, and the step of the snapshot that
   * told it.
   */
  #worldNews: WorldNews | null = null;
  /** What the player of the page carries. */
  #inventory: readonly ItemKindId[] | null = null;
  /** The number of silver coins the player of the page has. */
  #silver: number | null = null;
  /** The villagers who have told the player of the page who they are. */
  #acquaintances: readonly VillagerId[] = [];
  /** The quests the player of the page has opened. */
  #quests: readonly Quest[] = [];
  /** Whether the player of the page has reached the end of the story. */
  #isEndingReached = false;

  /**
   * The identifier of the player of the page, or `null` while the server
   * has not told it since the page connected.
   *
   * @returns {number | null} The identifier.
   */
  get playerId(): number | null {
    return this.#playerId;
  }

  /**
   * How the server judged the latest slash of the player of the page, or
   * `null` while it has told of none.
   *
   * @returns {SlashJudgment | null} The judgment.
   */
  get slash(): SlashJudgment | null {
    return this.#slash;
  }

  /**
   * What there is to pick in the world, and the step of the snapshot that
   * told it, or `null` while no snapshot has told it.
   *
   * @returns {WorldNews | null} What there is to pick.
   */
  get worldNews(): WorldNews | null {
    return this.#worldNews;
  }

  /**
   * What the player of the page carries, or `null` while no snapshot has
   * told it.
   *
   * @returns {(readonly ItemKindId[]) | null} The items, in the order of the
   *   slots.
   */
  get inventory(): readonly ItemKindId[] | null {
    return this.#inventory;
  }

  /**
   * The number of silver coins the player of the page has, or `null` while
   * no snapshot has told it.
   *
   * @returns {number | null} The number of coins.
   */
  get silver(): number | null {
    return this.#silver;
  }

  /**
   * The villagers who have told the player of the page who they are, none
   * while no snapshot has told it.
   *
   * @returns {readonly VillagerId[]} The villagers.
   */
  get acquaintances(): readonly VillagerId[] {
    return this.#acquaintances;
  }

  /**
   * The quests the player of the page has opened, each at the stage it has
   * gotten to, none while no snapshot has told it.
   *
   * @returns {readonly Quest[]} The quests.
   */
  get quests(): readonly Quest[] {
    return this.#quests;
  }

  /**
   * Whether the player of the page has reached the end of the story, false
   * while no snapshot has told it.
   *
   * @returns {boolean} Whether it has.
   */
  get isEndingReached(): boolean {
    return this.#isEndingReached;
  }

  /**
   * Takes note of the player the server says the page has.
   *
   * @param {number} playerId - The identifier of the player.
   */
  welcome(playerId: number): void {
    this.#playerId = playerId;
  }

  /**
   * Takes note of what a snapshot tells of the player of the page and of
   * what there is to pick in the world.
   *
   * @param {SnapshotMessage} message - The snapshot.
   */
  noteSnapshot(message: SnapshotMessage): void {
    this.#slash = message.slash;
    this.#worldNews = {
      step: message.step,
      items: {
        clovers: message.clovers,
        items: message.items,
        looted: message.looted,
        tobyFind: message.tobyFind,
      },
    };
    this.#inventory = message.inventory;
    this.#silver = message.silver;
    this.#quests = message.quests;
    this.#acquaintances = message.acquaintances;
    this.#isEndingReached = message.isEndingReached;
  }

  /** Forgets everything the server has told, as the page disconnects. */
  forget(): void {
    this.#playerId = null;
    this.#slash = null;
    this.#worldNews = null;
    this.#inventory = null;
    this.#silver = null;
    this.#acquaintances = [];
    this.#quests = [];
    this.#isEndingReached = false;
  }

  /**
   * Finds what there is to pick in the world at a step, as
   * {@link findShownItems} tells from what the server last told.
   *
   * @param {number} step - The step, which may fall between two.
   * @returns {WorldItems} What there is to pick, or nothing while no
   *   snapshot has told it.
   */
  findWorldItems(step: number): WorldItems {
    return this.#worldNews === null
      ? NO_WORLD_ITEMS
      : findShownItems(this.#worldNews, step);
  }
}
