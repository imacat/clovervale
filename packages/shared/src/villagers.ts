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
 * @module shared/villagers The villagers a player can talk to.
 */

import type { GroundVector } from './movement.ts';
import { TOBY_FILE, findTobyPose } from './toby.ts';
import { findPlacement } from './village-layout.ts';

/**
 * The identifier of a villager, which never changes, for the client to
 * find what the villager is called and what it says.
 */
export type VillagerId = 'nancy' | 'emma' | 'martha' | 'toby';

/** A villager a player can talk to. */
export interface Villager {
  /** The identifier of the villager. */
  readonly id: VillagerId;
  /**
   * The file name of the model of the villager, which the village has a
   * place for, unless the villager goes about the village.
   */
  readonly file: string;
}

/** The villagers a player can talk to. */
export const VILLAGERS: readonly Villager[] = [
  { id: 'nancy', file: 'npc-nancy.glb' },
  { id: 'emma', file: 'npc-emma.glb' },
  { id: 'martha', file: 'npc-martha.glb' },
  { id: 'toby', file: TOBY_FILE },
];

/**
 * Finds where a villager stands at a step of the simulation.
 *
 * @param {Villager} villager - The villager.
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @returns {GroundVector} Where Toby is at the step, as he runs his course,
 *   or where the village has a place for any other villager.
 */
export function locateVillager(
  villager: Villager,
  step: number,
): GroundVector {
  if (villager.file === TOBY_FILE) {
    const { x, z } = findTobyPose(step);
    return { x, z };
  }
  const { x, z } = findPlacement(villager.file);
  return { x, z };
}
