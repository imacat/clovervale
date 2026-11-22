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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/quests The errands the villagers send a player on, and how
 *   far a player has got with each.
 */

import type { VillagerId } from './villagers.ts';

/** The identifiers of the quests there are. */
export const QUEST_IDS = ['toby-hurt'] as const;

/** The identifier of a quest. */
export type QuestId = (typeof QUEST_IDS)[number];

/** The stages a player gets to in a quest, in order. */
export const QUEST_STAGES = ['started', 'supplied', 'done'] as const;

/**
 * How far a player has got with a quest: it has taken it on, has been
 * given what the quest needs, or has done it.  A player that has not taken
 * a quest on has no stage of it.
 */
export type QuestStage = (typeof QUEST_STAGES)[number];

/** How far a player has got with each quest it has taken on. */
export type QuestLog = Readonly<Partial<Record<QuestId, QuestStage>>>;

/** A quest. */
interface Quest {
  /** The identifier of the quest. */
  readonly id: QuestId;
  /**
   * The villagers whose words to a player the server chooses while the
   * player is on the quest, rather than the peer.
   */
  readonly villagers: readonly VillagerId[];
}

/**
 * Every quest there is: "Toby is hurt", in which Toby, who has fallen and
 * hurt himself, sends the player to the village chief, who gives it her
 * ointment to take to him.
 */
const QUESTS: readonly Quest[] = [
  { id: 'toby-hurt', villagers: ['toby', 'martha'] },
];

/**
 * Tells whether a decoded value tells how far a player has got with the
 * quests: an object with a stage for none, some or all of the quests there
 * are, and nothing else.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it does.
 */
export function isQuestLog(value: unknown): value is QuestLog {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([id, stage]: [string, unknown]) =>
        QUEST_IDS.some((known: QuestId) => known === id) &&
        QUEST_STAGES.some((known: QuestStage) => known === stage),
    )
  );
}

/**
 * Tells whether the server chooses what a villager says to a player who
 * talks to it, as far as the quests of the player go.
 *
 * @param {VillagerId} villager - The villager.
 * @param {QuestLog} quests - How far the player has got with the quests.
 * @returns {boolean} Whether it does: while the player is on a quest the
 *   villager takes part in, taken on and not yet done.
 */
export function hasQuestWords(
  villager: VillagerId,
  quests: QuestLog,
): boolean {
  return QUESTS.some(
    (quest: Quest) =>
      quests[quest.id] !== undefined &&
      quests[quest.id] !== 'done' &&
      quest.villagers.includes(villager),
  );
}
