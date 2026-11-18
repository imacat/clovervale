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

import { MONSTER_HEALTH, PLAYER_HEALTH } from '@clovervale/shared';
import type { MonsterState, PlayerState } from '@clovervale/shared';

import type { PlayersView } from '../src/interpolation.ts';
import {
  describeDisplay,
  describeMonster,
  describePrediction,
  describeSlash,
  describeSnapshot,
} from '../src/player-readout.ts';
import { Translator } from '../src/translator.ts';

/** A translator of the text into English. */
const EN = new Translator();

/** Two players of a snapshot. */
const PLAYERS: readonly PlayerState[] = [
  { id: 3, appearance: 1, x: 0.8, z: -3.5, yaw: 180, action: 'Idle',
    actionCount: 0, health: 100 },
  { id: 12, appearance: 2, x: -4.256, z: -0.001, yaw: -90, action: 'Slash',
    actionCount: 5, health: 55 },
];

/** A view that shows nobody, to show players with. */
const EMPTY: PlayersView = { players: [], monsters: [], lag: 0, time: null };

/**
 * Makes a translator of the text into a language.
 *
 * @param {'zh-TW' | 'zh-CN' | 'ja'} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(
  code: 'zh-TW' | 'zh-CN' | 'ja',
): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

describe('describeSnapshot', () => {
  it('tells nothing before the server has said anything', () => {
    expect(describeSnapshot(EN, null, null)).toEqual({
      player: '–',
      players: '–',
      position: '–',
      yaw: '–',
      action: '–',
      health: '–',
    });
  });

  it('tells the player of the page once the server has told it', () => {
    expect(describeSnapshot(EN, 12, null)).toEqual({
      player: '#12',
      players: '–',
      position: '–',
      yaw: '–',
      action: '–',
      health: '–',
    });
  });

  it('tells the snapshot values of the player of the page', () => {
    expect(describeSnapshot(EN, 12, PLAYERS)).toEqual({
      player: '#12, appearance 2',
      players: '2',
      position: '-4.26, 0.00',
      yaw: '-90.0°',
      action: 'Slash',
      health: `55 / ${String(PLAYER_HEALTH)}`,
    });
    expect(describeSnapshot(EN, 3, PLAYERS)).toEqual({
      player: '#3, appearance 1',
      players: '2',
      position: '0.80, -3.50',
      yaw: '180.0°',
      action: 'Idle',
      health: `100 / ${String(PLAYER_HEALTH)}`,
    });
  });

  it('reports the player of the page as dead while it is dying', () => {
    const dead: PlayerState = { id: 3, appearance: 1, x: 0.8, z: -3.5,
      yaw: 180, action: 'Die', actionCount: 1, health: 0 };
    expect(describeSnapshot(EN, 3, [dead])).toMatchObject({
      action: 'Die',
      health: `0 / ${String(PLAYER_HEALTH)}, dead`,
    });
  });

  it('tells it in the language of the page', async () => {
    const dead: PlayerState = { id: 3, appearance: 1, x: 0.8, z: -3.5,
      yaw: 180, action: 'Die', actionCount: 1, health: 0 };
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(describeSnapshot(zhTw, 3, [dead])).toMatchObject({
      player: '#3，外觀 1',
      action: '死亡',
      health: `0 / ${String(PLAYER_HEALTH)}，已死亡`,
    });
    const ja: Translator = await createTranslator('ja');
    expect(describeSnapshot(ja, 12, PLAYERS)).toMatchObject({
      player: '#12、外見 2',
      action: '斬撃',
    });
  });

  it('counts the players even without the player of the page', () => {
    expect(describeSnapshot(EN, 4, PLAYERS)).toEqual({
      player: '#4',
      players: '2',
      position: '–',
      yaw: '–',
      action: '–',
      health: '–',
    });
  });
});

describe('describeMonster', () => {
  it('tells nothing before the first snapshot', () => {
    expect(describeMonster(EN, null)).toEqual({
      mode: '–',
      action: '–',
      health: '–',
      position: '–',
    });
  });

  it('tells the monster as the snapshot tells it', () => {
    const monster: MonsterState = {
      id: 1,
      x: 10.256,
      z: 8.001,
      yaw: 45,
      action: 'Attack',
      actionCount: 12,
      health: 40,
      mode: 'chase',
    };
    expect(describeMonster(EN, [monster])).toEqual({
      mode: 'chase',
      action: 'Attack',
      health: `40 / ${String(MONSTER_HEALTH)}`,
      position: '10.26, 8.00',
    });
  });

  it('tells it in the language of the page', async () => {
    const monster: MonsterState = {
      id: 1,
      x: 0,
      z: 0,
      yaw: 0,
      action: 'Attack',
      actionCount: 1,
      health: 40,
      mode: 'chase',
    };
    const zhCn: Translator = await createTranslator('zh-CN');
    expect(describeMonster(zhCn, [monster])).toMatchObject({
      mode: '追击',
      action: '攻击',
    });
    expect(describeMonster(zhCn, [])).toMatchObject({ mode: '不在' });
  });

  it('reports the monster as gone when the snapshot has none', () => {
    expect(describeMonster(EN, [])).toMatchObject({ mode: 'gone' });
  });
});

describe('describeDisplay', () => {
  it('tells nothing before the first snapshot', () => {
    expect(describeDisplay(12, null, { ...EMPTY, lag: 0 })).toEqual({
      drawnAt: '–',
      behind: '–',
    });
  });

  it('tells a player shown as the latest snapshot tells is not behind', () => {
    expect(
      describeDisplay(12, PLAYERS, { ...EMPTY, players: PLAYERS, lag: 0 }),
    ).toEqual({
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
    const view = { ...EMPTY, players: drawn, lag: 149.6 };
    expect(describeDisplay(12, PLAYERS, view)).toEqual({
      drawnAt: '-4.56, 0.40',
      behind: '150 ms, 0.50 m',
    });
  });

  it('tells only the time behind while the player is not shown yet', () => {
    expect(describeDisplay(12, PLAYERS, { ...EMPTY, lag: 200 })).toEqual({
      drawnAt: '–',
      behind: '200 ms',
    });
  });

  it('tells only the time behind once the player is gone', () => {
    const view = { ...EMPTY, players: PLAYERS, lag: 80 };
    expect(describeDisplay(12, PLAYERS.slice(0, 1), view)).toEqual({
      drawnAt: '-4.26, 0.00',
      behind: '80 ms',
    });
  });
});

describe('describePrediction', () => {
  it('tells nothing while there is no prediction', () => {
    expect(describePrediction(EN, null)).toEqual({
      predicted: '–',
      corrections: '–',
    });
  });

  it('tells where the player is predicted to be', () => {
    const readout = describePrediction(EN, {
      motion: { x: -4.256, z: -0.001 },
      correctionCount: 0,
      lastCorrection: null,
    });
    expect(readout).toEqual({ predicted: '-4.26, 0.00', corrections: '0' });
  });

  it('tells the number of corrections and the size of the last', () => {
    const readout = describePrediction(EN, {
      motion: { x: 1, z: 2 },
      correctionCount: 3,
      lastCorrection: 0.0749,
    });
    expect(readout).toEqual({
      predicted: '1.00, 2.00',
      corrections: '3, last 0.07 m',
    });
  });

  it('tells the corrections in the language of the page', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    const readout = describePrediction(zhTw, {
      motion: { x: 1, z: 2 },
      correctionCount: 3,
      lastCorrection: 0.0749,
    });
    expect(readout.corrections).toBe('3 次，上次 0.07 m');
  });
});

describe('describeSlash', () => {
  it('tells nothing before the first slash', () => {
    expect(describeSlash(EN, null)).toEqual({ result: '–', judgedBack: '–' });
  });

  it('tells whether the slash hit, and how far back it was judged', () => {
    expect(
      describeSlash(EN, { step: 40, rewind: 312.5, isHit: true }),
    ).toEqual({ result: 'hit', judgedBack: '313 ms' });
    expect(describeSlash(EN, { step: 40, rewind: 0, isHit: false })).toEqual({
      result: 'missed',
      judgedBack: '0 ms',
    });
  });

  it('tells the slash in the language of the page', async () => {
    const ja: Translator = await createTranslator('ja');
    expect(describeSlash(ja, { step: 40, rewind: 0, isHit: false })).toEqual({
      result: 'ミス',
      judgedBack: '0 ms',
    });
  });
});
