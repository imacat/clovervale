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

import { CAVE_EDWIN_FILE, CAVE_PLACEMENTS } from './cave.ts';
import type { MonsterKindId } from './combat.ts';
import type { GroundVector } from './movement.ts';
import type { MonsterState } from './protocol.ts';
import { TOBY_FILE, findTobyPose } from './toby.ts';
import { findPlacement } from './village-layout.ts';
import type { Placement } from './village-layout.ts';
import type { MapId } from './world-map.ts';

/**
 * The identifier of a villager, which never changes, for the client to
 * find what the villager is called and what it says.
 */
export type VillagerId = 'nancy' | 'emma' | 'martha' | 'toby' | 'edwin';

/** A villager a player can talk to. */
export interface Villager {
  /** The identifier of the villager. */
  readonly id: VillagerId;
  /**
   * The file name of the model of the villager, which its map has a place
   * for, unless the villager goes about the village.
   */
  readonly file: string;
  /** The map the villager is in. */
  readonly map: MapId;
  /**
   * The kind of monster the villager fights as, if it ever fights, whose
   * state among the monsters of its map tells where it stands and whether
   * it is free to be talked to.
   */
  readonly fighter?: MonsterKindId;
  /**
   * Whether the server chooses which of its lines the villager says in
   * passing to a player who talks to it, and tells the peer of that
   * player, rather than the peer choosing one, as it does for any other
   * villager with lines.
   */
  readonly hasServerLines?: boolean;
  /**
   * Whether the villager, the first time the player of a page talks to it,
   * always says the first of its lines, rather than one picked at random.
   */
  readonly greetsFirst?: boolean;
}

/**
 * The villagers a player can talk to: those of the village, and the
 * prisoner in the north cell of the cave.  Martha, the village chief, is
 * the enemy spy, and fights as a monster.
 */
export const VILLAGERS: readonly Villager[] = [
  { id: 'nancy', file: 'npc-nancy.glb', map: 'village', greetsFirst: true },
  { id: 'emma', file: 'npc-emma.glb', map: 'village' },
  {
    id: 'martha',
    file: 'npc-martha.glb',
    map: 'village',
    fighter: 'martha',
  },
  { id: 'toby', file: TOBY_FILE, map: 'village', hasServerLines: true },
  { id: 'edwin', file: CAVE_EDWIN_FILE, map: 'cave' },
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
 * @param {readonly MonsterState[]} [monsters] - The monsters of its map,
 *   none by default.
 * @returns {boolean} Whether it is: always, but for a villager who fights
 *   as a monster and is among them, who is free only while she idles or
 *   walks back home, not while she walks up to a player, talks with one,
 *   fights or sits on the ground.
 */
export function isVillagerFree(
  villager: Villager,
  monsters: readonly MonsterState[] = [],
): boolean {
  const mode: string | undefined = findFighterState(villager, monsters)?.mode;
  return mode === undefined || mode === 'idle' || mode === 'return';
}

/**
 * Finds where a villager stands at a step of the simulation, in the frame
 * of its map.
 *
 * @param {Villager} villager - The villager.
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @param {readonly MonsterState[]} [monsters] - The monsters of its map,
 *   none by default.
 * @returns {GroundVector} Where Toby is at the step, as he runs his course,
 *   where a villager who fights as a monster is among the monsters, if she
 *   is among them, or where its map has a place for any other villager.
 * @throws {Error} If its map has no place for the villager.
 */
export function locateVillager(
  villager: Villager,
  step: number,
  monsters: readonly MonsterState[] = [],
): GroundVector {
  const fighter: MonsterState | undefined = findFighterState(
    villager,
    monsters,
  );
  if (fighter !== undefined) {
    return { x: fighter.x, z: fighter.z };
  }
  if (villager.file === TOBY_FILE) {
    const { x, z } = findTobyPose(step);
    return { x, z };
  }
  if (villager.map === 'cave') {
    const found: Placement | undefined = CAVE_PLACEMENTS.find(
      (placement: Placement) => placement.file === villager.file,
    );
    if (found === undefined) {
      throw new Error(`The cave has no place for ${villager.file}.`);
    }
    return { x: found.x, z: found.z };
  }
  const { x, z } = findPlacement(villager.file);
  return { x, z };
}
