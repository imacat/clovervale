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
 * @module shared/interaction What a player can interact with in the world,
 *   and what it uses, by where it stands and which way it faces.
 */

import type { Interaction } from './actions.ts';
import type { CaveContainer, CaveContainerKind } from './cave.ts';
import { SLASH_REACH, isFighting, isWithinStrike } from './combat.ts';
import type { MonsterState } from './combat.ts';
import { CLOVER_KIND, NO_WORLD_ITEMS } from './items.ts';
import type { GroundItem, ItemKindId, WorldItems } from './items.ts';
import type { GroundVector } from './movement.ts';
import type { Pose } from './terrain.ts';
import { VILLAGERS, isVillagerFree, locateVillager } from './villagers.ts';
import type { Villager } from './villagers.ts';
import { WORLD_MAPS } from './world-map.ts';
import type { MapId, WorldMap } from './world-map.ts';

/**
 * The widest something a player interacts with can be to either side of
 * the way the player faces, from its center, in degrees.
 */
export const INTERACTION_HALF_ANGLE = 60;

/**
 * The health a drink from the fountain gives back, as much as a player
 * lacks of its full health at most.
 */
export const FOUNTAIN_HEALING = 30;

/**
 * The farthest a player can stand from a villager to talk to it, from
 * center to center, in meters.
 */
export const TALK_REACH = 1.6;

/**
 * The farthest a player can stand from a four-leaf clover in a patch, or
 * from an item on the ground, to pick it, from center to center, in meters.
 */
export const PICK_REACH = 1.2;

/**
 * The farthest a player can stand from a chest or a barrel in the cave to
 * loot it, from center to center, in meters.
 */
export const LOOT_REACH = 1.2;

/**
 * The farthest something a player picks can lie from the center of the
 * player to be at its feet, which the player can pick whichever way it
 * faces, in meters.
 */
export const FEET_REACH = 0.1;

/**
 * The input of a player that uses something it can interact with: an
 * interaction, which drinks from the fountain or talks to a villager, a
 * travel, which takes a way into another map, or a pick, which picks an
 * item or loots a container.
 */
export type InteractionInput = 'interact' | 'travel' | 'pick';

/** What everything a player can interact with has. */
interface Reachable {
  /** The input of the player that uses it. */
  readonly input: InteractionInput;
  /** Where its center stands at the step it is found at. */
  readonly center: GroundVector;
  /**
   * The farthest a player can stand from its center to use it, facing it
   * closely enough, from center to center, in meters.
   */
  readonly reach: number;
  /**
   * The farthest a player can stand from its center to use it whichever
   * way the player faces, from center to center, in meters, which is 0 for
   * something the player must face.
   */
  readonly nearReach: number;
  /**
   * Whether a slash at a monster in a fight that the slash would hit comes
   * before using it.
   */
  readonly yieldsToSlash: boolean;
}

/** The fountain on the plaza of the village, which a player drinks from. */
export interface Fountain extends Reachable {
  /** The discriminator. */
  readonly type: 'fountain';
  /** The input that uses it. */
  readonly input: 'interact';
  /** What a player does with it. */
  readonly interaction: 'Drink';
}

/** A villager a player talks to. */
export interface Talkable extends Reachable {
  /** The discriminator. */
  readonly type: 'villager';
  /** The input that uses it. */
  readonly input: 'interact';
  /** What a player does with it. */
  readonly interaction: 'Talk';
  /** The villager. */
  readonly villager: Villager;
}

/** A way from one map into another. */
export interface Passage extends Reachable {
  /** The discriminator. */
  readonly type: 'passage';
  /** The input that uses it. */
  readonly input: 'travel';
  /** The map the way leads into. */
  readonly destination: MapId;
  /**
   * Where a player who takes the way stands in the map it leads into, and
   * which way it faces.
   */
  readonly arrival: Pose;
}

/** A four-leaf clover in a patch of clover, or an item on the ground. */
export interface ItemTarget extends Reachable {
  /** Whether it grows in a patch of clover or lies on the ground. */
  readonly type: 'patch' | 'ground';
  /** The input that uses it. */
  readonly input: 'pick';
  /** The number of the patch of clover, or the identifier of the item. */
  readonly id: number;
  /** The kind of item the player gets. */
  readonly kind: ItemKindId;
}

/** A chest or a barrel in the cave, which a player loots. */
export interface ContainerTarget extends Reachable {
  /** The discriminator. */
  readonly type: 'container';
  /** The input that uses it. */
  readonly input: 'pick';
  /** The number of the container. */
  readonly id: number;
  /** Whether it is a chest or a barrel. */
  readonly containerKind: CaveContainerKind;
  /**
   * The kind of item the player gets, or `null` for a container that holds
   * no item, or nothing anymore.
   */
  readonly kind: ItemKindId | null;
  /** The silver coins the player gets, which are none once looted. */
  readonly silver: number;
}

/** Something a player can pick. */
export type PickTarget = ItemTarget | ContainerTarget;

/**
 * Something a player can interact with: the fountain, a villager, a way
 * into another map, a four-leaf clover in a patch, an item on the
 * ground, or a container in the cave.
 */
export type Interactable = Fountain | Talkable | Passage | PickTarget;

/** What there is around a player to interact with. */
export interface Surroundings {
  /** The map the player is in. */
  readonly map: MapId;
  /** The monsters in the map. */
  readonly monsters: readonly MonsterState[];
  /** What there is to pick in the map, nothing by default. */
  readonly items?: WorldItems;
}

/**
 * Finds what a player uses when it interacts with the world at a step of
 * the simulation, standing as it does in a map, with the monsters and what
 * there is to pick there as they are.
 *
 * Something is within reach of the player if the player stands within its
 * near reach of its center, whichever way the player faces, or within its
 * reach of its center, with the center no more than
 * {@link INTERACTION_HALF_ANGLE} to either side of the way the player
 * faces: a fountain and a way into another map within their reaches, as
 * {@link WorldMap.fountains} and {@link WorldMap.passages} tell; a villager
 * within {@link TALK_REACH} of where the villager is at the step; a
 * four-leaf clover in a patch, or an item on the ground, within
 * {@link PICK_REACH}, or within {@link FEET_REACH} whichever way the player
 * faces; and a chest or a barrel in the cave within {@link LOOT_REACH}.
 *
 * The fountains and the ways of each map are its own, as
 * {@link WorldMap} tells, and each villager is in its own map: the
 * prisoner, the only one in the cave, is talked to through the bars of his
 * cell.  Martha, who fights as a monster, stands where she is among the
 * monsters, if she is among them, and cannot be talked to while she is not
 * free, as {@link isVillagerFree} tells.  The patches of clover are in the
 * village alone, and the chests and the barrels in the cave alone.
 *
 * Of what is within reach, the fountain comes first, then the villagers,
 * in the order {@link VILLAGERS} tells them, then the ways into the other
 * maps, and last what there is to pick: the nearest of the clovers, the
 * items and the containers that hold something, an item or silver coins,
 * a clover before an item as near and an item before a container, or else
 * the nearest of the containers that hold nothing or have been looted.  A
 * villager and a way give way to a slash at a monster in a fight, as
 * {@link isFighting} tells, that the slash would hit, as
 * {@link isWithinStrike} tells with {@link SLASH_REACH}.  Whether the
 * player has room for what it picks is not for this to tell.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {Surroundings} surroundings - The map the player is in, the
 *   monsters there, and what there is to pick there.
 * @param {InteractionInput} [input] - The input the player uses it with,
 *   if only what that input uses is to be found, which an interaction
 *   still comes before; any input by default, as the space bar uses it.
 * @returns {Interactable | null} The first of what is within reach, or
 *   `null` if there is none, or if it is used with another input than the
 *   one asked for.
 */
export function findInteractable(
  pose: Pose,
  step: number,
  { map, monsters, items = NO_WORLD_ITEMS }: Surroundings,
  input?: InteractionInput,
): Interactable | null {
  const isSlashing: boolean = isMonsterWithinSlash(pose, monsters);
  const usable: Interactable[] = listInteractables(
    step,
    map,
    monsters,
    items,
  ).filter(
    (target: Interactable) =>
      (input === undefined ||
        target.input === input ||
        target.input === 'interact') &&
      !(target.yieldsToSlash && isSlashing) &&
      isWithinReach(pose, target),
  );
  const found: Interactable | undefined =
    usable.find((target: Interactable) => target.input !== 'pick') ??
    choosePickTarget(pose, usable);
  return found !== undefined && (input === undefined || found.input === input)
    ? found
    : null;
}

/**
 * Finds what a player does when it interacts with the world at a step of
 * the simulation, standing as it does in a map, with the monsters there as
 * they are, as {@link findInteractable} tells.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {MapId} [map] - The map the player is in, the village by default.
 * @param {readonly MonsterState[]} [monsters] - The monsters in the map,
 *   none by default.
 * @returns {Interaction} A drink, if the fountain is what the player uses
 *   with an interaction, or a talk, if a villager is, or else a slash.
 */
export function findInteraction(
  pose: Pose,
  step: number,
  map: MapId = 'village',
  monsters: readonly MonsterState[] = [],
): Interaction {
  const found: Interactable | null = findInteractable(
    pose,
    step,
    { map, monsters },
    'interact',
  );
  return found?.input === 'interact' ? found.interaction : 'Slash';
}

/**
 * Finds the villager a player talks to when it interacts with the world at
 * a step of the simulation, standing as it does, with the monsters there as
 * they are, as {@link findInteractable} tells.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {number} step - The number of the step.
 * @param {MapId} map - The map the player is in.
 * @param {readonly MonsterState[]} monsters - The monsters in the map.
 * @returns {Villager | null} The villager, or `null` if the player does not
 *   talk.
 */
export function findVillager(
  pose: Pose,
  step: number,
  map: MapId,
  monsters: readonly MonsterState[],
): Villager | null {
  const found: Interactable | null = findInteractable(
    pose,
    step,
    { map, monsters },
    'interact',
  );
  return found?.type === 'villager' ? found.villager : null;
}

/**
 * Lists what a player could interact with in a map at a step.
 *
 * @param {number} step - The number of the step.
 * @param {MapId} map - The map.
 * @param {readonly MonsterState[]} monsters - The monsters in the map.
 * @param {WorldItems} items - What there is to pick in the map.
 * @returns {Interactable[]} The fountain, the villagers who are free to be
 *   talked to, the ways into the other maps, and what there is to pick, in
 *   this order.
 */
function listInteractables(
  step: number,
  map: MapId,
  monsters: readonly MonsterState[],
  items: WorldItems,
): Interactable[] {
  const { fountains, passages }: WorldMap = WORLD_MAPS[map];
  return [
    ...fountains,
    ...listTalkables(step, map, monsters),
    ...passages,
    ...listPickTargets(map, items),
  ];
}

/**
 * Lists the villagers of a map who are free to be talked to at a step.
 *
 * @param {number} step - The number of the step.
 * @param {MapId} map - The map.
 * @param {readonly MonsterState[]} monsters - The monsters in the map.
 * @returns {Talkable[]} The villagers, where they are at the step, in the
 *   order {@link VILLAGERS} tells them.
 */
function listTalkables(
  step: number,
  map: MapId,
  monsters: readonly MonsterState[],
): Talkable[] {
  return VILLAGERS.filter(
    (villager: Villager) =>
      villager.map === map && isVillagerFree(villager, monsters),
  ).map(
    (villager: Villager): Talkable => ({
      type: 'villager',
      input: 'interact',
      interaction: 'Talk',
      villager,
      center: locateVillager(villager, step, monsters),
      reach: TALK_REACH,
      nearReach: 0,
      yieldsToSlash: true,
    }),
  );
}

/**
 * Lists what there is to pick in a map.
 *
 * @param {MapId} map - The map.
 * @param {WorldItems} items - What there is to pick in the map.
 * @returns {PickTarget[]} The clovers of the patches that have them, the
 *   items on the ground and the containers, in this order.
 */
function listPickTargets(map: MapId, items: WorldItems): PickTarget[] {
  const { cloverPatches, containers }: WorldMap = WORLD_MAPS[map];
  const looted = new Set<number>(items.looted ?? []);
  return [
    ...items.clovers.flatMap((patch: number): ItemTarget[] => {
      const center: GroundVector | undefined = cloverPatches[patch];
      return center === undefined
        ? []
        : [
            {
              type: 'patch',
              input: 'pick',
              id: patch,
              kind: CLOVER_KIND,
              center,
              reach: PICK_REACH,
              nearReach: FEET_REACH,
              yieldsToSlash: false,
            },
          ];
    }),
    ...items.items.map(
      (item: GroundItem): ItemTarget => ({
        type: 'ground',
        input: 'pick',
        id: item.id,
        kind: item.kind,
        center: { x: item.x, z: item.z },
        reach: PICK_REACH,
        nearReach: FEET_REACH,
        yieldsToSlash: false,
      }),
    ),
    ...containers.map(
      (container: CaveContainer, id: number): ContainerTarget => {
        const isLooted: boolean = looted.has(id);
        return {
          type: 'container',
          input: 'pick',
          id,
          containerKind: container.kind,
          kind: isLooted ? null : container.item,
          silver: isLooted ? 0 : (container.silver ?? 0),
          center: { x: container.x, z: container.z },
          reach: LOOT_REACH,
          nearReach: 0,
          yieldsToSlash: false,
        };
      },
    ),
  ];
}

/**
 * Chooses what a player picks of what is within its reach.
 *
 * @param {Pose} pose - Where the player stands.
 * @param {readonly Interactable[]} usable - What is within its reach.
 * @returns {PickTarget | undefined} The nearest of what there is to pick
 *   that gives something, an item or silver coins, the first of them if
 *   several are as near, or else the nearest of the rest, or `undefined`
 *   if there is nothing to pick.
 */
function choosePickTarget(
  pose: Pose,
  usable: readonly Interactable[],
): PickTarget | undefined {
  const targets: PickTarget[] = usable.filter(
    (target: Interactable): target is PickTarget => target.input === 'pick',
  );
  const findNearest = (isFull: boolean): PickTarget | undefined => {
    let found: PickTarget | undefined;
    let nearest = Infinity;
    for (const target of targets) {
      const distance: number = Math.hypot(
        target.center.x - pose.x,
        target.center.z - pose.z,
      );
      const isHeld: boolean = target.kind !== null || target.silver > 0;
      if (isHeld === isFull && distance < nearest) {
        found = target;
        nearest = distance;
      }
    }
    return found;
  };
  return findNearest(true) ?? findNearest(false);
}

/**
 * Tells whether a player would slash at a monster in a fight.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {readonly MonsterState[]} monsters - The monsters in the map.
 * @returns {boolean} Whether a monster in a fight, as {@link isFighting}
 *   tells, is within {@link SLASH_REACH} in front of the player, as
 *   {@link isWithinStrike} tells.
 */
function isMonsterWithinSlash(
  pose: Pose,
  monsters: readonly MonsterState[],
): boolean {
  return monsters.some(
    (monster: MonsterState) =>
      isFighting(monster) && isWithinStrike(pose, monster, SLASH_REACH),
  );
}

/**
 * Tells whether a player stands within reach of something.
 *
 * @param {Pose} pose - Where the player stands, and which way it faces.
 * @param {Interactable} target - What it is to interact with.
 * @returns {boolean} Whether the player stands within the reach of its
 *   center, facing it closely enough, or within its near reach.
 */
function isWithinReach(pose: Pose, target: Interactable): boolean {
  const { center, reach, nearReach } = target;
  const dx: number = center.x - pose.x;
  const dz: number = center.z - pose.z;
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
