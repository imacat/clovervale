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
 * @module client/camera-choice Choosing the player the camera follows.
 */

import type { PlayerState } from '@clovervale/shared';

import type { Translator } from './translator.ts';

/** A player the owner can have the camera follow. */
export interface CameraChoice {
  /** What the owner reads of the choice. */
  readonly name: string;
  /**
   * The identifier of the player, or `null` for the player of the page,
   * whichever player that is.
   */
  readonly playerId: number | null;
}

/**
 * Lists the players the owner can have the camera follow.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {number | null} ownId - The identifier of the player of the page,
 *   or `null` before the server has told it.
 * @param {(readonly PlayerState[]) | null} players - The players in the
 *   latest snapshot, or `null` before the first one.
 * @returns {CameraChoice[]} The player of the page first, named in the
 *   language of the page, and then every other player in the snapshot, by
 *   their identifiers.
 */
export function listCameraChoices(
  translator: Translator,
  ownId: number | null,
  players: readonly PlayerState[] | null,
): CameraChoice[] {
  const own: CameraChoice = {
    name:
      ownId === null
        ? translator.translate('camera.own')
        : translator.translate('camera.ownWithId', {
            id: `#${String(ownId)}`,
          }),
    playerId: null,
  };
  const others: CameraChoice[] = (players ?? [])
    .filter((player: PlayerState) => player.id !== ownId)
    .map((player: PlayerState) => player.id)
    .sort((a: number, b: number) => a - b)
    .map((id: number) => ({ name: `#${String(id)}`, playerId: id }));
  return [own, ...others];
}

/**
 * Tells which player the camera follows now that a snapshot has come.
 *
 * @param {number | null} followedId - The identifier of the player the
 *   owner has the camera follow, or `null` for the player of the page.
 * @param {readonly PlayerState[]} players - The players in the snapshot.
 * @returns {number | null} The same player while it is in the snapshot, or
 *   else `null`, for the player of the page.
 */
export function keepFollowedPlayer(
  followedId: number | null,
  players: readonly PlayerState[],
): number | null {
  if (players.some((player: PlayerState) => player.id === followedId)) {
    return followedId;
  }
  return null;
}
