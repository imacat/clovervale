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
import { CAVE_LANDING, CAVE_ROPE } from './cave.ts';
import { SLASH_REACH, isWithinStrike } from './combat.ts';
import { CLOVER_KIND, CLOVER_PATCHES } from './items.ts';
import type { GroundItem, ItemKindId, WorldItems } from './items.ts';
import type { GroundVector } from './movement.ts';
import type { MonsterState } from './protocol.ts';
import { PLAYER_RADIUS } from './terrain.ts';
import type { Pose } from './terrain.ts';
import {
  FOUNTAIN_RIM_RADIUS,
  WELL_STAND,
  findPlacement,
} from './village-layout.ts';
import { PLAZA_CENTRE } from './village.ts';
import { VILLAGERS, locateVillager } from './villagers.ts';
import type { Villager } from './villagers.ts';
import type { MapId } from './world-map.ts';

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

/**
 * The farthest a player can stand from a four-leaved clover in a patch, or
 * from an item on the ground, to pick it, from centre to centre, in metres.
 */
export const PICK_REACH = 1.2;

/**
 * The farthest something a player picks can lie from the centre of the
 * player to be at its feet, which the player can pick whichever way it
 * faces, in metres.
 */
export const FEET_REACH = 0.1;

/**
 * The farthest a player can stand from the middle of the burrow of the
 * wild dog, among the spawn stones, to go down into the cave, whichever
 * way it faces, from centre to centre, in metres.
 */
export const BURROW_REACH = 1.2;

/**
 * The farthest a player can stand from the rope at the bottom of the old
 * well shaft in the cave to climb up it, from centre to centre, in metres.
 */
export const ROPE_REACH = 1.2;

/** Where a player picks something from. */
export type PickSource = 'patch' | 'ground';

/** Something a player can pick. */
export interface PickTarget {
  /** Whether it grows in a patch of clover or lies on the ground. */
  readonly source: PickSource;
  /**
   * The number of the patch of clover, or the identifier of the item on the
   * ground.
   */
  readonly id: number;
  /** The kind of item the player gets. */
  readonly kind: ItemKindId;
}

/** Something in the village a player can interact with. */
interface Interactable {
  /** What a player does with it. */
  readonly interaction: Interaction;
  /**
   * Finds where its centre stands at a step of the simulation.
   *
   * @param {number} step - The number of the step.
   * @returns {GroundVector} Where its centre stands.
   */
  readonly locate: (step: number) => GroundVector;
  /**
   * The farthest a player can stand from its centre to interact with it,
   * from centre to centre, in metres.
   */
  readonly reach: number;
  /** The villager it is, if it is one to talk to. */
  readonly villager?: Villager;
}

/** A way from one map into another. */
export interface Passage {
  /** The map the way leads from. */
  readonly map: MapId;
  /** Where the middle of the way is. */
  readonly centre: GroundVector;
  /**
   * The farthest a player can stand from the middle of the way to take it,
   * from centre to centre, in metres.
   */
  readonly reach: number;
  /** Whether the player must face the middle of the way to take it. */
  readonly isFaced: boolean;
  /** The map the way leads into. */
  readonly destination: MapId;
  /**
   * Where a player who takes the way stands in the map it leads into, and
   * which way it faces.
   */
  readonly arrival: Pose;
}

/**
 * The ways between the maps: down the burrow of the wild dog, among the
 * spawn stones outside the village gate, to the foot of the slope in the
 * cave, and up the rope at the bottom of the old well shaft in the cave to
 * beside the old well in the yard of the chief's house.
 */
export const PASSAGES: readonly Passage[] = [
  {
    map: 'village',
    centre: (() => {
      const { x, z } = findPlacement('prop-spawn-stones.glb');
      return { x, z };
    })(),
    reach: BURROW_REACH,
    isFaced: false,
    destination: 'cave',
    arrival: CAVE_LANDING,
  },
  {
    map: 'cave',
    centre: CAVE_ROPE,
    reach: ROPE_REACH,
    isFaced: true,
    destination: 'village',
    arrival: WELL_STAND,
  },
];

/**
 * What a player can interact with in the village, before slashing, which a
 * player does when it can interact with none of it.
 */
const VILLAGE_INTERACTABLES: readonly Interactable[] = [
  {
    interaction: 'Drink',
    locate: (): GroundVector => PLAZA_CENTRE,
    reach: FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH,
  },
  ...VILLAGERS.map(
    (villager: Villager): Interactable => ({
      interaction: 'Talk',
      locate: (step: number): GroundVector => locateVillager(villager, step),
      reach: TALK_REACH,
      villager,
    }),
  ),
];

/**
 * What a player can interact with in each map, before slashing, which a
 * player does when it can interact with none of it.
 */
const INTERACTABLES: Readonly<Record<MapId, readonly Interactable[]>> = {
  village: VILLAGE_INTERACTABLES,
  cave: [],
};

/**
 * Finds what a player does when it interacts with the world at a step of
 * the simulation, standing as it does in a map.
 *
 * Something is within reach of the player if its centre is no more than
 * {@link INTERACTION_HALF_ANGLE} to either side of the way the player
 * faces: the fountain if the player stands within {@link FOUNTAIN_REACH} of
 * its rim, and a villager if the player stands within {@link TALK_REACH} of
 * where the villager is at the step.  Both are in the village; the cave has
 * nothing to interact with.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {MapId} [map] - The map the player is in, the village by default.
 * @returns {Interaction} A drink, if the fountain is within reach, or else
 *   a talk, if a villager is, or else a slash.
 */
export function findInteraction(
  pose: Pose,
  step: number,
  map: MapId = 'village',
): Interaction {
  return findInteractable(pose, step, map)?.interaction ?? 'Slash';
}

/**
 * Finds the villager a player talks to when it interacts with the world at
 * a step of the simulation, standing as it does, as {@link findInteraction}
 * tells.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {MapId} [map] - The map the player is in, the village by default.
 * @returns {Villager | null} The villager, or `null` if the player does not
 *   talk.
 */
export function findVillager(
  pose: Pose,
  step: number,
  map: MapId = 'village',
): Villager | null {
  return findInteractable(pose, step, map)?.villager ?? null;
}

/**
 * Finds what a player interacts with at a step, standing as it does.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {MapId} map - The map the player is in.
 * @returns {Interactable | undefined} The first of the
 *   {@link INTERACTABLES} of the map within reach of the player, if any.
 */
function findInteractable(
  pose: Pose,
  step: number,
  map: MapId,
): Interactable | undefined {
  return INTERACTABLES[map].find((interactable: Interactable) =>
    isWithinReach(pose, interactable.locate(step), interactable.reach),
  );
}

/**
 * Tells whether a player can interact with something.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {GroundVector} centre - Where the centre of what it is to interact
 *   with stands.
 * @param {number} reach - The farthest the player can stand from that
 *   centre to interact with it, from centre to centre, in metres.
 * @param {number} [nearReach] - The farthest the player can stand from
 *   that centre to interact with it whichever way it faces, from centre to
 *   centre, in metres, which is none by default.
 * @returns {boolean} Whether the player stands within the reach of the
 *   centre, facing it closely enough, or within the near reach of it.
 */
function isWithinReach(
  pose: Pose,
  centre: GroundVector,
  reach: number,
  nearReach = 0,
): boolean {
  const dx: number = centre.x - pose.x;
  const dz: number = centre.z - pose.z;
  const distance: number = Math.hypot(dx, dz);
  if (distance > reach) {
    return false;
  }
  if (distance <= nearReach) {
    return true;
  }
  const yaw: number = (pose.yaw * Math.PI) / 180;
  const along: number = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance;
  return along >= Math.cos((INTERACTION_HALF_ANGLE * Math.PI) / 180);
}

/**
 * Finds what a player picks when it interacts with the world at a step of
 * the simulation, standing as it does, before it would slash.
 *
 * A four-leaved clover in a patch, or an item on the ground, is within
 * reach of the player if it is no farther than {@link PICK_REACH} from the
 * player and no more than {@link INTERACTION_HALF_ANGLE} to either side of
 * the way the player faces, or if it is no farther than {@link FEET_REACH}
 * from the player, whichever way the player faces.  Drinking from the
 * fountain and talking to a villager come first, as
 * {@link findInteraction} tells: a player that can do either picks
 * nothing.  Whether the player has room for what it picks is not for this
 * to tell.  The patches of clover are in the village alone.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {WorldItems} world - What there is to pick in the map.
 * @param {MapId} [map] - The map the player is in, the village by default.
 * @returns {PickTarget | null} The nearest of the clovers and the items
 *   within reach, a clover before an item as near, or `null` if there is
 *   none, or if the player drinks or talks instead.
 */
export function findPickTarget(
  pose: Pose,
  step: number,
  world: WorldItems,
  map: MapId = 'village',
): PickTarget | null {
  if (findInteraction(pose, step, map) !== 'Slash') {
    return null;
  }
  const candidates: [PickTarget, GroundVector][] = [
    ...(map === 'village' ? world.clovers : []).flatMap(
      (patch: number): [PickTarget, GroundVector][] => {
        const centre: GroundVector | undefined = CLOVER_PATCHES[patch];
        return centre === undefined
          ? []
          : [[{ source: 'patch', id: patch, kind: CLOVER_KIND }, centre]];
      },
    ),
    ...world.items.map((item: GroundItem): [PickTarget, GroundVector] => [
      { source: 'ground', id: item.id, kind: item.kind },
      item,
    ]),
  ];
  let found: PickTarget | null = null;
  let nearest = Infinity;
  for (const [target, centre] of candidates) {
    const distance: number = Math.hypot(centre.x - pose.x, centre.z - pose.z);
    if (
      distance < nearest &&
      isWithinReach(pose, centre, PICK_REACH, FEET_REACH)
    ) {
      found = target;
      nearest = distance;
    }
  }
  return found;
}

/**
 * Finds the way into another map a player takes when it travels at a step
 * of the simulation, standing as it does in a map, with the monsters there
 * as they are.
 *
 * A way is within reach of the player if the player stands within its
 * reach of its middle, and, for a way the player must face, if the middle
 * is no more than {@link INTERACTION_HALF_ANGLE} to either side of the way
 * the player faces: the burrow of the wild dog within {@link BURROW_REACH},
 * whichever way the player faces, and the rope in the cave within
 * {@link ROPE_REACH}.  Drinking from the fountain and talking to a
 * villager come first, as {@link findInteraction} tells, and so does a
 * slash at a living monster the slash would hit, as
 * {@link isWithinStrike} tells with {@link SLASH_REACH}: a player that can
 * do any of these takes no way.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {MapId} map - The map the player is in.
 * @param {readonly MonsterState[]} monsters - The monsters in the map.
 * @returns {Passage | null} The way, or `null` if there is none within
 *   reach, or if the player does something else first.
 */
export function findPassage(
  pose: Pose,
  step: number,
  map: MapId,
  monsters: readonly MonsterState[],
): Passage | null {
  if (
    findInteraction(pose, step, map) !== 'Slash' ||
    monsters.some(
      (monster: MonsterState) =>
        monster.mode !== 'dead' && isWithinStrike(pose, monster, SLASH_REACH),
    )
  ) {
    return null;
  }
  return (
    PASSAGES.find(
      (passage: Passage) =>
        passage.map === map &&
        isWithinReach(
          pose,
          passage.centre,
          passage.reach,
          passage.isFaced ? 0 : passage.reach,
        ),
    ) ?? null
  );
}
