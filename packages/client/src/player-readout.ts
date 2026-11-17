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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/player-readout Telling the owner what is synchronised.
 */

import type { PlayerState } from '@clovervale/shared';

/** What the owner reads about the player of the page and the snapshots. */
export interface PlayerReadout {
  /** The identifier and the appearance of the player of the page. */
  readonly player: string;
  /** The number of players in the latest snapshot. */
  readonly players: string;
  /** The position of the player of the page in the latest snapshot. */
  readonly position: string;
  /** The yaw of the player of the page in the latest snapshot. */
  readonly yaw: string;
  /** What the player of the page is doing in the latest snapshot. */
  readonly action: string;
}

/** What stands for a value that is not known yet. */
const UNKNOWN = '–';

/**
 * Describes the player of the page and the latest snapshot.
 *
 * @param {number | null} ownId - The identifier of the player of the page,
 *   or `null` before the server has told it.
 * @param {(readonly PlayerState[]) | null} players - The players in the latest
 *   snapshot, or `null` before the first one.
 * @returns {PlayerReadout} What the owner reads.
 */
export function describeSnapshot(
  ownId: number | null,
  players: readonly PlayerState[] | null,
): PlayerReadout {
  const own: PlayerState | undefined = players?.find(
    (player: PlayerState) => player.id === ownId,
  );
  const id: string = ownId === null ? UNKNOWN : `#${String(ownId)}`;
  const count: string = players === null ? UNKNOWN : String(players.length);
  if (own === undefined) {
    return {
      player: id,
      players: count,
      position: UNKNOWN,
      yaw: UNKNOWN,
      action: UNKNOWN,
    };
  }
  return {
    player: `${id}, appearance ${String(own.appearance)}`,
    players: count,
    position: `${formatNumber(own.x, 2)}, ${formatNumber(own.z, 2)}`,
    yaw: `${formatNumber(own.yaw, 1)}°`,
    action: own.action,
  };
}

/**
 * Formats a number with a fixed number of decimal places.
 *
 * @param {number} value - The number.
 * @param {number} places - The number of decimal places.
 * @returns {string} The number, without a sign if it rounds to zero.
 */
function formatNumber(value: number, places: number): string {
  const scale: number = 10 ** places;
  return (Math.round(value * scale) / scale + 0).toFixed(places);
}
