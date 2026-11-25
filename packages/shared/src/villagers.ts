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
 * @module shared/villagers The villagers a player can talk to, and the
 *   prisoner in the cave, whom a player talks to as to them.
 */

import { CAVE_EDWIN_POST } from './cave.ts';
import { MONSTER_KINDS } from './combat.ts';
import type { MonsterKindId, MonsterState } from './combat.ts';
import type { GroundVector } from './movement.ts';
import type { Pusher } from './pusher.ts';
import { findQuest } from './quests.ts';
import type { Quest, QuestId } from './quests.ts';
import type { Pose } from './terrain.ts';
import { TOBY_PUSHER, findTobyPose } from './toby.ts';
import {
  BASIL_POST,
  EMMA_POST,
  GUARD_POST,
  MARTHA_POST,
  NANCY_POST,
} from './village-layout.ts';
import type { MapId } from './world-map.ts';

/**
 * The identifier of a villager, which never changes, for the client to
 * find what the villager is called and what it says.
 */
export type VillagerId =
  | 'nancy'
  | 'emma'
  | 'martha'
  | 'toby'
  | 'basil'
  | 'guard'
  | 'edwin';

/** A villager a player can talk to. */
export interface Villager {
  /** The identifier of the villager. */
  readonly id: VillagerId;
  /** The map the villager is in. */
  readonly map: MapId;
  /**
   * Where the villager stands in its map, and which way it faces, unless
   * it moves around, as Toby does; for a villager who fights as a monster,
   * where it stands while it is not among the monsters of its map.
   */
  readonly post?: Pose;
  /**
   * For a villager who moves around, as Toby does, running his course,
   * finds where it is, and which way it faces, at a step of the simulation,
   * which may fall between two steps.
   */
  readonly course?: (step: number) => Pose;
  /**
   * For a villager who moves around and pushes the players in its way aside,
   * as Toby does, how it gets in their way.  There is no more than one such
   * villager in a map.
   */
  readonly pusher?: Pusher;
  /**
   * The kind of monster the villager fights as, if it ever fights, whose
   * state among the monsters of its map tells where it stands and whether
   * it is free to be talked to.
   */
  readonly fighter?: MonsterKindId;
  /**
   * When the server chooses what the villager says to a player who talks
   * to it, and tells the peer of that player, rather than the peer
   * choosing one of the lines of the villager: always, or while the player
   * is on the quest named, taken on and not yet done.  Never if left out.
   */
  readonly serverWords?: 'always' | QuestId;
  /**
   * Whether the villager, the first time the player of a page talks to it,
   * always says the first of its lines, rather than one picked at random.
   */
  readonly greetsFirst?: boolean;
}

/**
 * The villagers a player can talk to: those of the village, the guard at
 * the palisade gate at the end of the mountain road, who lets nobody
 * through, and the prisoner in the north cell of the cave.  Martha, the
 * village chief, is
 * the enemy spy, and fights as a monster; what she says the server chooses
 * while the player is on "Toby is hurt", in which Toby, who has fallen and
 * hurt himself, sends the player to her for her ointment.  What Toby, Basil
 * the apothecary and Edwin say the server always chooses.
 */
export const VILLAGERS: readonly Villager[] = [
  { id: 'nancy', map: 'village', post: NANCY_POST, greetsFirst: true },
  { id: 'emma', map: 'village', post: EMMA_POST },
  {
    id: 'martha',
    map: 'village',
    post: MARTHA_POST,
    fighter: 'martha',
    serverWords: 'toby-hurt',
  },
  {
    id: 'toby',
    map: 'village',
    course: findTobyPose,
    pusher: TOBY_PUSHER,
    serverWords: 'always',
  },
  { id: 'basil', map: 'village', post: BASIL_POST, serverWords: 'always' },
  { id: 'guard', map: 'village', post: GUARD_POST },
  { id: 'edwin', map: 'cave', post: CAVE_EDWIN_POST, serverWords: 'always' },
];

/**
 * Tells whether a decoded value is the identifier of a villager.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is.
 */
export function isVillagerId(value: unknown): value is VillagerId {
  return VILLAGERS.some((villager: Villager) => villager.id === value);
}

/**
 * Gets a villager among {@link VILLAGERS}.
 *
 * @param {VillagerId} id - The identifier of the villager.
 * @returns {Villager} The villager.
 * @throws {Error} If there is no such villager.
 */
export function getVillager(id: VillagerId): Villager {
  const found: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.id === id,
  );
  if (found === undefined) {
    throw new Error(`There is no villager ${id}.`);
  }
  return found;
}

/**
 * Finds how the villager of a map who pushes the players in its way aside
 * gets in their way, as {@link Villager.pusher} tells.
 *
 * @param {MapId} map - The map.
 * @returns {Pusher | null} How it does, or `null` if no villager of the map
 *   pushes the players aside.
 */
export function findPusher(map: MapId): Pusher | null {
  for (const villager of VILLAGERS) {
    if (villager.map === map && villager.pusher !== undefined) {
      return villager.pusher;
    }
  }
  return null;
}

/**
 * Tells whether the server chooses what a villager says to a player who
 * talks to it, rather than the peer, as {@link Villager.serverWords} tells.
 *
 * @param {Villager} villager - The villager.
 * @param {readonly Quest[]} quests - The quests the player has opened.
 * @returns {boolean} Whether it does.
 */
export function hasServerWords(
  villager: Villager,
  quests: readonly Quest[],
): boolean {
  const { serverWords } = villager;
  if (serverWords === 'always') {
    return true;
  }
  if (serverWords === undefined) {
    return false;
  }
  const quest: Quest | undefined = findQuest(quests, serverWords);
  return quest !== undefined && !quest.isDone;
}

/**
 * Finds the state of a villager who fights as a monster among the
 * monsters of its map.
 *
 * @param {Villager} villager - The villager.
 * @param {readonly MonsterState[]} monsters - The monsters.
 * @returns {MonsterState | undefined} Its state, if the villager fights
 *   and is among them.
 */
function findFighterState(
  villager: Villager,
  monsters: readonly MonsterState[],
): MonsterState | undefined {
  return villager.fighter === undefined
    ? undefined
    : monsters.find(
        (monster: MonsterState) => monster.kind === villager.fighter,
      );
}

/**
 * Tells whether a villager is free to be talked to, with the monsters of
 * its map as they are.
 *
 * @param {Villager} villager - The villager.
 * @param {readonly MonsterState[]} monsters - The monsters of its map.
 * @returns {boolean} Whether it is: always, but for a villager who fights
 *   as a monster and is among them, who is free only while up to one of
 *   the modes its kind is free in, as the free modes of its kind among
 *   {@link MONSTER_KINDS} tell.
 */
export function isVillagerFree(
  villager: Villager,
  monsters: readonly MonsterState[],
): boolean {
  const fighter: MonsterState | undefined = findFighterState(
    villager,
    monsters,
  );
  return (
    fighter === undefined ||
    MONSTER_KINDS[fighter.kind].freeModes?.includes(fighter.mode) === true
  );
}

/**
 * Finds where a villager stands at a step of the simulation, in the frame
 * of its map.
 *
 * @param {Villager} villager - The villager.
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @param {readonly MonsterState[]} monsters - The monsters of its map.
 * @returns {GroundVector} Where a villager who fights as a monster is
 *   among the monsters, if she is among them, where a villager who goes
 *   about is at the step, as {@link Villager.course} tells, or where any
 *   other villager stands.
 * @throws {Error} If the villager has nowhere it stands.
 */
export function locateVillager(
  villager: Villager,
  step: number,
  monsters: readonly MonsterState[],
): GroundVector {
  const fighter: MonsterState | undefined = findFighterState(
    villager,
    monsters,
  );
  if (fighter !== undefined) {
    return { x: fighter.x, z: fighter.z };
  }
  if (villager.course !== undefined) {
    const { x, z } = villager.course(step);
    return { x, z };
  }
  if (villager.post === undefined) {
    throw new Error(`The villager ${villager.id} stands nowhere.`);
  }
  return { x: villager.post.x, z: villager.post.z };
}
