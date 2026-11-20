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
import type { GroundVector } from './movement.ts';
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
}

/**
 * The villagers a player can talk to: those of the village, and the
 * prisoner in the north cell of the cave.
 */
export const VILLAGERS: readonly Villager[] = [
  { id: 'nancy', file: 'npc-nancy.glb', map: 'village' },
  { id: 'emma', file: 'npc-emma.glb', map: 'village' },
  { id: 'martha', file: 'npc-martha.glb', map: 'village' },
  { id: 'toby', file: TOBY_FILE, map: 'village' },
  { id: 'edwin', file: CAVE_EDWIN_FILE, map: 'cave' },
];

/**
 * Finds where a villager stands at a step of the simulation, in the frame
 * of its map.
 *
 * @param {Villager} villager - The villager.
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @returns {GroundVector} Where Toby is at the step, as he runs his course,
 *   or where its map has a place for any other villager.
 * @throws {Error} If its map has no place for the villager.
 */
export function locateVillager(
  villager: Villager,
  step: number,
): GroundVector {
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
