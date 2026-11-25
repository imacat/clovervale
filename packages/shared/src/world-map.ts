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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/world-map The maps a player can be in, each with its own
 *   ground, its own frame and its own rules.
 */

import {
  CAVE_CONTAINERS,
  CAVE_LANDING,
  CAVE_ROPE,
  CAVE_TERRAIN,
} from './cave.ts';
import type { CaveContainer } from './cave.ts';
import type { Fountain, Passage } from './interaction.ts';
import { CLOVER_PATCHES } from './items.ts';
import type { GroundVector } from './movement.ts';
import { PLAYER_RADIUS } from './terrain.ts';
import type { Checkpoint, Terrain } from './terrain.ts';
import {
  FOUNTAIN_RIM_RADIUS,
  SPAWN_STONES_POSE,
  VALLEY_EXIT,
  VILLAGE_TERRAIN,
  WELL_STAND,
} from './village-layout.ts';
import { PLAZA_CENTER } from './village.ts';

/**
 * The maps a player can be in: the village, which every player shares, and
 * the cave under the burrow of the wild dog, of which every player who goes
 * down has one of its own.
 */
export const MAP_IDS = ['village', 'cave'] as const;

/** A map a player can be in. */
export type MapId = (typeof MAP_IDS)[number];

/**
 * The map a player first comes into, which a page shows before it
 * connects.
 */
export const HOME_MAP: MapId = 'village';

/**
 * The farthest a player can stand from the rim of the fountain to drink
 * from it, from the edge of the player to the rim, in meters.
 */
export const FOUNTAIN_REACH = 0.5;

/**
 * The farthest a player can stand from the middle of the burrow of the
 * wild dog, among the spawn stones, to go down into the cave, whichever
 * way it faces, from center to center, in meters.
 */
export const BURROW_REACH = 1.2;

/**
 * The farthest a player can stand from the rope at the bottom of the old
 * well shaft in the cave to climb up it, from center to center, in meters.
 */
export const ROPE_REACH = 1.2;

/** What a map is, and how things go there. */
export interface WorldMap {
  /** The identifier of the map. */
  readonly id: MapId;
  /** What stands in the way of the players there. */
  readonly terrain: Terrain;
  /**
   * Whether every player shares the map, rather than every player who
   * goes there having one of its own.
   */
  readonly isShared: boolean;
  /**
   * The map a player who has died there comes back to life in: the map
   * itself, at a spawn point, or another map it leaves for.
   */
  readonly revivalMap: MapId;
  /** The fountains there, which a player drinks from. */
  readonly fountains: readonly Fountain[];
  /** The ways from there into the other maps. */
  readonly passages: readonly Passage[];
  /**
   * Where the patches of clover there are, each numbered by its place in
   * the list, from 0.
   */
  readonly cloverPatches: readonly GroundVector[];
  /**
   * The chests and the barrels there, each numbered by its place in the
   * list, from 0.
   */
  readonly containers: readonly CaveContainer[];
  /**
   * Whether the monsters there stand still while a player there is in a
   * dialogue.
   */
  readonly pausesInDialogue: boolean;
  /**
   * The line a player who is done with the main plot crosses outward
   * there to reach the end of the story, or `null` if the story does not
   * end there.
   */
  readonly endingCheckpoint: Checkpoint | null;
}

/**
 * The village, which every player shares, with the fountain on its plaza,
 * the way down the burrow of the wild dog, among the spawn stones outside
 * the village gate, whichever way the player faces, to the foot of the
 * slope in the cave, and its patches of clover, in which a player who dies
 * there comes back to life, and in which the story ends as the player
 * leaves the valley along the mountain road.
 */
const VILLAGE: WorldMap = {
  id: 'village',
  terrain: VILLAGE_TERRAIN,
  isShared: true,
  revivalMap: 'village',
  fountains: [
    {
      type: 'fountain',
      input: 'interact',
      interaction: 'Drink',
      center: PLAZA_CENTER,
      reach: FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH,
      nearReach: 0,
      yieldsToSlash: false,
    },
  ],
  passages: [
    {
      type: 'passage',
      input: 'travel',
      center: { x: SPAWN_STONES_POSE.x, z: SPAWN_STONES_POSE.z },
      reach: BURROW_REACH,
      nearReach: BURROW_REACH,
      yieldsToSlash: true,
      destination: 'cave',
      arrival: CAVE_LANDING,
    },
  ],
  cloverPatches: CLOVER_PATCHES,
  containers: [],
  pausesInDialogue: false,
  endingCheckpoint: VALLEY_EXIT,
};

/**
 * The cave, of which every player who goes down has one of its own, with
 * the way up the rope at the bottom of the old well shaft, facing it, to
 * beside the old well in the yard of the chief's house, and its chests and
 * barrels, whose monsters stand still while its player is in a dialogue,
 * and from which a player who dies there leaves for the village.
 */
const CAVE: WorldMap = {
  id: 'cave',
  terrain: CAVE_TERRAIN,
  isShared: false,
  revivalMap: 'village',
  fountains: [],
  passages: [
    {
      type: 'passage',
      input: 'travel',
      center: CAVE_ROPE,
      reach: ROPE_REACH,
      nearReach: 0,
      yieldsToSlash: true,
      destination: 'village',
      arrival: WELL_STAND,
    },
  ],
  cloverPatches: [],
  containers: CAVE_CONTAINERS,
  pausesInDialogue: true,
  endingCheckpoint: null,
};

/** Every map, by its identifier. */
export const WORLD_MAPS: Readonly<Record<MapId, WorldMap>> = {
  village: VILLAGE,
  cave: CAVE,
};

/**
 * Tells whether the monsters of a world stand still, as they do while a
 * player is in a dialogue in a map whose monsters do: the cave, and
 * nowhere else.
 *
 * @param {MapId} map - The map of the world.
 * @param {boolean} isInDialogue - Whether a player of the world is in a
 *   dialogue.
 * @returns {boolean} Whether they do.
 */
export function areMonstersPaused(map: MapId, isInDialogue: boolean): boolean {
  return WORLD_MAPS[map].pausesInDialogue && isInDialogue;
}

/**
 * Tells whether a value names a map.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} Whether it does.
 */
export function isMapId(value: unknown): value is MapId {
  const ids: readonly unknown[] = MAP_IDS;
  return ids.includes(value);
}
