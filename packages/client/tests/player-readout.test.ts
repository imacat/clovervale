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
 * @module client/tests/player-readout Tests for the readout of the players.
 */

import { describe, expect, it } from 'vitest';

import type { PlayerState } from '@clovervale/shared';

import { describeDisplay, describeSnapshot } from '../src/player-readout.ts';

/** Two players of a snapshot. */
const PLAYERS: readonly PlayerState[] = [
  { id: 3, appearance: 1, x: 0.8, z: -3.5, yaw: 180, action: 'Idle',
    actionCount: 0 },
  { id: 12, appearance: 2, x: -4.256, z: -0.001, yaw: -90, action: 'Slash',
    actionCount: 5 },
];

describe('describeSnapshot', () => {
  it('tells nothing before the server has said anything', () => {
    expect(describeSnapshot(null, null)).toEqual({
      player: '–',
      players: '–',
      position: '–',
      yaw: '–',
      action: '–',
    });
  });

  it('tells the player of the page once the server has told it', () => {
    expect(describeSnapshot(12, null)).toEqual({
      player: '#12',
      players: '–',
      position: '–',
      yaw: '–',
      action: '–',
    });
  });

  it('tells the snapshot values of the player of the page', () => {
    expect(describeSnapshot(12, PLAYERS)).toEqual({
      player: '#12, appearance 2',
      players: '2',
      position: '-4.26, 0.00',
      yaw: '-90.0°',
      action: 'Slash',
    });
    expect(describeSnapshot(3, PLAYERS)).toEqual({
      player: '#3, appearance 1',
      players: '2',
      position: '0.80, -3.50',
      yaw: '180.0°',
      action: 'Idle',
    });
  });

  it('counts the players even without the player of the page', () => {
    expect(describeSnapshot(4, PLAYERS)).toEqual({
      player: '#4',
      players: '2',
      position: '–',
      yaw: '–',
      action: '–',
    });
  });
});

describe('describeDisplay', () => {
  it('tells nothing before the first snapshot', () => {
    expect(describeDisplay(12, null, { players: [], lag: 0 })).toEqual({
      drawnAt: '–',
      behind: '–',
    });
  });

  it('tells a player shown as the latest snapshot tells is not behind', () => {
    expect(describeDisplay(12, PLAYERS, { players: PLAYERS, lag: 0 })).toEqual({
      drawnAt: '-4.26, 0.00',
      behind: '0 ms, 0.00 m',
    });
  });

  it('tells where the player is shown and how far behind that is', () => {
    const drawn: PlayerState[] = PLAYERS.map((player: PlayerState) => ({
      ...player,
      x: player.x - 0.3,
      z: player.z + 0.4,
    }));
    const view = { players: drawn, lag: 149.6 };
    expect(describeDisplay(12, PLAYERS, view)).toEqual({
      drawnAt: '-4.56, 0.40',
      behind: '150 ms, 0.50 m',
    });
  });

  it('tells only the time behind while the player is not shown yet', () => {
    expect(describeDisplay(12, PLAYERS, { players: [], lag: 200 })).toEqual({
      drawnAt: '–',
      behind: '200 ms',
    });
  });

  it('tells only the time behind once the player is gone', () => {
    const view = { players: PLAYERS, lag: 80 };
    expect(describeDisplay(12, PLAYERS.slice(0, 1), view)).toEqual({
      drawnAt: '-4.26, 0.00',
      behind: '80 ms',
    });
  });
});
