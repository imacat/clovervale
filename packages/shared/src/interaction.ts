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
 * @module shared/interaction What a player does when it interacts with the
 *   world, by where it stands and which way it faces.
 */

import type { Interaction } from './actions.ts';
import type { GroundVector } from './movement.ts';
import { PLAYER_RADIUS } from './terrain.ts';
import type { Pose } from './terrain.ts';
import { FOUNTAIN_RIM_RADIUS, findPlacement } from './village-layout.ts';
import { PLAZA_CENTRE } from './village.ts';
import { VILLAGERS } from './villagers.ts';
import type { Villager } from './villagers.ts';

/**
 * The farthest a player can stand from the rim of the fountain to drink
 * from it, from the edge of the player to the rim, in metres.
 */
export const FOUNTAIN_REACH = 0.5;

/**
 * The widest something a player interacts with can be to either side of
 * the way the player faces, from its centre, in degrees.
 */
export const INTERACTION_HALF_ANGLE = 60;

/**
 * The health a drink from the fountain gives back, as much as a player
 * lacks of its full health at most.
 */
export const FOUNTAIN_HEALING = 30;

/**
 * The farthest a player can stand from a villager to talk to it, from
 * centre to centre, in metres.
 */
export const TALK_REACH = 1.6;

/** Something in the village a player can interact with. */
interface Interactable {
  /** What a player does with it. */
  readonly interaction: Interaction;
  /** Where its centre stands. */
  readonly centre: GroundVector;
  /**
   * The farthest a player can stand from its centre to interact with it,
   * from centre to centre, in metres.
   */
  readonly reach: number;
  /** The villager it is, if it is one to talk to. */
  readonly villager?: Villager;
}

/**
 * What a player can interact with in the village, before slashing, which a
 * player does when it can interact with none of it.
 */
const INTERACTABLES: readonly Interactable[] = [
  {
    interaction: 'Drink',
    centre: PLAZA_CENTRE,
    reach: FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH,
  },
  ...VILLAGERS.map(
    (villager: Villager): Interactable => ({
      interaction: 'Talk',
      centre: findPlacement(villager.file),
      reach: TALK_REACH,
      villager,
    }),
  ),
];

/**
 * Finds what a player does when it interacts with the world, standing as
 * it does.
 *
 * Something is within reach of the player if its centre is no more than
 * {@link INTERACTION_HALF_ANGLE} to either side of the way the player
 * faces: the fountain if the player stands within {@link FOUNTAIN_REACH} of
 * its rim, and a villager if the player stands within {@link TALK_REACH} of
 * it.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @returns {Interaction} A drink, if the fountain is within reach, or else
 *   a talk, if a villager is, or else a slash.
 */
export function findInteraction(pose: Pose): Interaction {
  return findInteractable(pose)?.interaction ?? 'Slash';
}

/**
 * Finds the villager a player talks to when it interacts with the world,
 * standing as it does, as {@link findInteraction} tells.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @returns {Villager | null} The villager, or `null` if the player does not
 *   talk.
 */
export function findVillager(pose: Pose): Villager | null {
  return findInteractable(pose)?.villager ?? null;
}

/**
 * Finds what a player interacts with, standing as it does.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @returns {Interactable | undefined} The first of
 *   {@link INTERACTABLES} within reach of the player, if any.
 */
function findInteractable(pose: Pose): Interactable | undefined {
  return INTERACTABLES.find((interactable: Interactable) =>
    isWithinReach(pose, interactable),
  );
}

/**
 * Tells whether a player can interact with something.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {Interactable} interactable - What it is to interact with.
 * @returns {boolean} Whether the player stands within the reach of its
 *   centre, facing it closely enough.
 */
function isWithinReach(pose: Pose, interactable: Interactable): boolean {
  const dx: number = interactable.centre.x - pose.x;
  const dz: number = interactable.centre.z - pose.z;
  const distance: number = Math.hypot(dx, dz);
  if (distance > interactable.reach) {
    return false;
  }
  if (distance === 0) {
    return true;
  }
  const yaw: number = (pose.yaw * Math.PI) / 180;
  const along: number = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance;
  return along >= Math.cos((INTERACTION_HALF_ANGLE * Math.PI) / 180);
}
