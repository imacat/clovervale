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
 * @module client/snapshot-intake Taking a snapshot from the server in, into
 *   what the page knows of its player and of the world.
 */

import type { ItemKindId, MapId, SnapshotMessage } from '@clovervale/shared';

import type { DayClock } from './day-clock.ts';
import type { MapStage } from './map-stage.ts';
import type { OwnPlayer } from './own-player.ts';
import type { PlayerRecord } from './player-record.ts';

/** What a snapshot is taken into. */
export interface SnapshotParts {
  /** What the server has told of the player of the page. */
  readonly record: PlayerRecord;
  /** The player of the page as the page draws it. */
  readonly ownPlayer: OwnPlayer;
  /** What stands wherever the player of the page is. */
  readonly stage: MapStage;
  /** The time of day of the world, as the page reckons it. */
  readonly dayClock: DayClock;
}

/** What the player of the page has gained since the snapshot before. */
export interface SnapshotGains {
  /** The items it has gained. */
  readonly items: readonly ItemKindId[];
  /** The silver coins it has gained. */
  readonly silver: number;
}

/**
 * Takes a snapshot from the server in, if the page has a player: the stage
 * takes it, as {@link MapStage.receiveSnapshot} tells, and it sets the
 * clock of the day, the prediction, and what the server has told of the
 * player.
 *
 * @param {SnapshotMessage} message - The snapshot.
 * @param {number} now - The time of the page the snapshot came at, in
 *   milliseconds.
 * @param {SnapshotParts} parts - What the snapshot is taken into.
 * @returns {SnapshotGains | null} What the player has gained since the
 *   snapshot before, or `null` if the page has no player, when the
 *   snapshot is not taken in.
 */
export function applySnapshot(
  message: SnapshotMessage,
  now: number,
  parts: SnapshotParts,
): SnapshotGains | null {
  const { record, stage } = parts;
  if (record.playerId === null) {
    return null;
  }
  const shownMap: MapId = stage.map;
  const map: MapId | null = stage.receiveSnapshot(message, now);
  parts.dayClock.observe(message.step, now);
  parts.ownPlayer.noteSnapshot(message, map, shownMap, now);
  const gains: SnapshotGains = {
    items: findGainedItems(record.inventory, message.inventory),
    silver: findGainedSilver(record.silver, message.silver),
  };
  record.noteSnapshot(message);
  return gains;
}

/**
 * Finds the items an inventory has gained, as the server tells it anew.
 *
 * @param {(readonly ItemKindId[]) | null} before - The items as the server
 *   last told, or `null` if it has not told them since the page joined.
 * @param {(readonly ItemKindId[]) | null} after - The items as the server
 *   tells now, or `null` while there is no player.
 * @returns {ItemKindId[]} One kind for each item there is more of than
 *   before, in the order of the slots; none while either inventory is not
 *   known.
 */
export function findGainedItems(
  before: readonly ItemKindId[] | null,
  after: readonly ItemKindId[] | null,
): ItemKindId[] {
  if (before === null || after === null) {
    return [];
  }
  const left: ItemKindId[] = [...before];
  return after.filter((kind: ItemKindId): boolean => {
    const index: number = left.indexOf(kind);
    if (index === -1) {
      return true;
    }
    left.splice(index, 1);
    return false;
  });
}

/**
 * Finds how many silver coins the player has gained, as the server tells
 * its count anew.
 *
 * @param {number | null} before - The count as the server last told, or
 *   `null` if it has not told it since the page joined.
 * @param {number | null} after - The count as the server tells now, or
 *   `null` while there is no player.
 * @returns {number} How many more coins there are than before, which is
 *   none while there are no more, or while either count is not known.
 */
export function findGainedSilver(
  before: number | null,
  after: number | null,
): number {
  if (before === null || after === null) {
    return 0;
  }
  return Math.max(after - before, 0);
}
