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
 * @module client/tests/camera-choice Tests for choosing the player the
 *   camera follows.
 */

import { describe, expect, it } from 'vitest';

import type { PlayerState } from '@clovervale/shared';

import { keepFollowedPlayer, listCameraChoices } from '../src/camera-choice.ts';

/**
 * Makes a player of a snapshot.
 *
 * @param {number} id - The identifier of the player.
 * @returns {PlayerState} The player.
 */
function makePlayer(id: number): PlayerState {
  return {
    id,
    appearance: 1,
    x: 0,
    z: 0,
    yaw: 0,
    action: 'Idle',
    actionCount: 0,
  };
}

/** The players of a snapshot, not in the order of their identifiers. */
const PLAYERS: readonly PlayerState[] = [12, 3, 7].map(makePlayer);

describe('listCameraChoices', () => {
  it('offers only the player of the page before the server tells', () => {
    expect(listCameraChoices(null, null)).toEqual([
      { name: 'Own player', playerId: null },
    ]);
  });

  it('offers the player of the page first, and then the others', () => {
    expect(listCameraChoices(7, PLAYERS)).toEqual([
      { name: 'Own player (#7)', playerId: null },
      { name: '#3', playerId: 3 },
      { name: '#12', playerId: 12 },
    ]);
  });

  it('offers every player before the player of the page is there', () => {
    expect(listCameraChoices(20, PLAYERS)).toEqual([
      { name: 'Own player (#20)', playerId: null },
      { name: '#3', playerId: 3 },
      { name: '#7', playerId: 7 },
      { name: '#12', playerId: 12 },
    ]);
  });
});

describe('keepFollowedPlayer', () => {
  it('keeps following a player that is still there', () => {
    expect(keepFollowedPlayer(12, PLAYERS)).toBe(12);
  });

  it('follows the player of the page once the player has left', () => {
    expect(keepFollowedPlayer(5, PLAYERS)).toBeNull();
  });

  it('keeps following the player of the page', () => {
    expect(keepFollowedPlayer(null, PLAYERS)).toBeNull();
  });
});
