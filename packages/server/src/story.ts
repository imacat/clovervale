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
 * @module server/story The events of the story of a player, which the
 *   villagers and the worlds tell their listeners of.
 */

import type { MapId, Pose, StoryEventType } from '@clovervale/shared';

/** The type of the event a world tells of a player that comes into it. */
export const MAP_ENTRY = 'map-entry';

/**
 * An event of the story of a player that a villager tells its listeners
 * of, of the type it is named after.
 */
export class StoryEvent extends Event {
  /** The identifier of the player. */
  readonly player: number;

  /**
   * Makes the event.
   *
   * @param {StoryEventType} type - What happened.
   * @param {number} player - The identifier of the player it happened to.
   */
  constructor(type: StoryEventType, player: number) {
    super(type);
    this.player = player;
  }
}

/**
 * A villager who tells its listeners of the events of the story of the
 * players, each as a {@link StoryEvent} of the type it is named after.
 */
export interface StoryTeller extends EventTarget {
  /**
   * Has the villager tell its listeners of an event of the story of a
   * player.
   *
   * @param {StoryEventType} type - What happened.
   * @param {number} player - The identifier of the player it happened to.
   */
  tell(type: StoryEventType, player: number): void;
}

/**
 * That a player has come into a world, which the world tells its listeners
 * of, as an event of type {@link MAP_ENTRY}.
 */
export class MapEntryEvent extends Event {
  /** The identifier of the player. */
  readonly player: number;
  /** The map of the world. */
  readonly map: MapId;
  /**
   * Where the player arrives somewhere in particular, as one that climbs
   * out of the well does, or `null` for where a new player would.
   */
  readonly arrival: Pose | null;

  /**
   * Makes the event.
   *
   * @param {number} player - The identifier of the player.
   * @param {MapId} map - The map of the world.
   * @param {Pose | null} arrival - Where the player arrives somewhere in
   *   particular, or `null` for where a new player would.
   */
  constructor(player: number, map: MapId, arrival: Pose | null) {
    super(MAP_ENTRY);
    this.player = player;
    this.map = map;
    this.arrival = arrival;
  }
}
