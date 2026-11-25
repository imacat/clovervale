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
 * @module server/resident-factories How each villager of the game is placed
 *   in a world, as it goes about its business there.
 */

import { Martha } from './martha.ts';
import { StandingVillager } from './resident.ts';
import type { Casting, Resident, ResidentFactories } from './resident.ts';
import { Toby } from './toby.ts';

/**
 * Places a villager in a world as one who stands where it stands.
 *
 * @param {Casting} casting - What the villager is placed with.
 * @returns {Resident} The villager.
 */
function createStandingVillager({ villager, world }: Casting): Resident {
  return new StandingVillager(villager, world);
}

/**
 * Places Toby in a world, running his course.
 *
 * @param {Casting} casting - What he is placed with.
 * @returns {Resident} Toby.
 */
function createToby({ villager, world }: Casting): Resident {
  return new Toby(villager, world);
}

/**
 * Places Martha in a world, numbered among its monsters, as she fights as
 * one, and dealing with the players the quests ask her to.
 *
 * @param {Casting} casting - What she is placed with.
 * @returns {Resident} Martha.
 */
function createMartha({
  world,
  allotMonsterId,
  acceptRequests,
}: Casting): Resident {
  const martha = new Martha(allotMonsterId(), world);
  acceptRequests(martha);
  return martha;
}

/**
 * How each villager of the game is placed in a world: Toby running his
 * course, as {@link Toby} tells, Martha as {@link Martha} tells, and every
 * other standing where it stands.
 */
export const RESIDENT_FACTORIES: ResidentFactories = {
  nancy: createStandingVillager,
  emma: createStandingVillager,
  martha: createMartha,
  toby: createToby,
  basil: createStandingVillager,
  guard: createStandingVillager,
  edwin: createStandingVillager,
};
