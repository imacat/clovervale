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
 * @module shared/tests/protocol Tests for the wire protocol.
 */

import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  createEventsMessage,
  createInteractMessage,
  createMoveMessage,
  createSnapshotMessage,
  createWelcomeMessage,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
} from '../src/index.ts';
import type {
  HealEvent,
  HitEvent,
  InputProgress,
  MonsterState,
  PlayerState,
  SlashJudgement,
} from '../src/index.ts';

/** A player to put in snapshots. */
const PLAYER: PlayerState = {
  id: 7,
  appearance: 3,
  x: 1.25,
  z: -3.5,
  yaw: -90,
  action: 'Walk',
  actionCount: 4,
  health: 85,
};

/** A monster to put in snapshots. */
const MONSTER: MonsterState = {
  id: 1,
  x: 10.5,
  z: 8.25,
  yaw: 135,
  action: 'Attack',
  actionCount: 9,
  health: 40,
  mode: 'chase',
};

/** A hit to put in events messages. */
const HIT: HitEvent = {
  type: 'hit',
  id: 3,
  step: 41,
  attacker: { kind: 'player', id: 7 },
  target: { kind: 'monster', id: 1 },
  damage: 20,
};

/** A heal to put in events messages. */
const HEAL: HealEvent = {
  type: 'heal',
  id: 5,
  step: 42,
  target: { kind: 'player', id: 7 },
  amount: 30,
};

/** How far the player of a peer has got, to put in snapshots. */
const OWN: InputProgress = {
  sequence: 12,
  steps: 3,
  motion: {
    x: 1.25,
    z: -3.5,
    yaw: -90,
    action: 'Walk',
    actionCount: 4,
    direction: { x: -1, z: 0 },
    isInteracting: false,
    actionSteps: 0,
  },
};

/** How a slash was judged, to put in snapshots. */
const SLASH: SlashJudgement = { step: 40, rewind: 312.5, isHit: true };

describe('the server message codec', () => {
  it('decodes the welcome message it encodes', () => {
    const message = createWelcomeMessage(7);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId: 7,
    });
  });

  it('decodes the snapshot message it encodes', () => {
    const idler: PlayerState = { ...PLAYER, id: 8, action: 'Slash' };
    const message = createSnapshotMessage(42, [PLAYER, idler], [MONSTER], OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 42,
      players: [PLAYER, idler],
      monsters: [MONSTER],
      own: OWN,
      slash: null,
    });
  });

  it('decodes a snapshot message that tells how a slash was judged', () => {
    const message = createSnapshotMessage(42, [PLAYER], [], OWN, SLASH);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 42,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: SLASH,
    });
  });

  it('decodes a snapshot message of a dead player', () => {
    const dead: PlayerState = { ...PLAYER, action: 'Die', health: 0 };
    const own: InputProgress = {
      ...OWN,
      motion: { ...OWN.motion, action: 'Die' },
    };
    const message = createSnapshotMessage(42, [dead], [], own);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 42,
      players: [dead],
      monsters: [],
      own,
      slash: null,
    });
  });

  it('decodes a snapshot message without players or monsters', () => {
    const message = createSnapshotMessage(0, [], [], OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 0,
      players: [],
      monsters: [],
      own: OWN,
      slash: null,
    });
  });

  it('decodes the events message it encodes', () => {
    const back: HitEvent = {
      ...HIT,
      id: 4,
      attacker: HIT.target,
      target: HIT.attacker,
      damage: 15,
    };
    const message = createEventsMessage([HIT, back, HEAL]);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'events',
      events: [HIT, back, HEAL],
    });
  });

  it('rejects an events message without a list of events', () => {
    const data = JSON.stringify({ type: 'events', events: HIT });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['a known type', { type: 'miss' }],
    ['a number', { id: -1 }],
    ['a step', { step: 1.5 }],
    ['an attacker', { attacker: null }],
    ['a known kind of target', { target: { kind: 'tree', id: 1 } }],
    ['an amount of damage', { damage: '20' }],
  ])('rejects an events message with a hit without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'events',
      events: [HIT, { ...HIT, ...flaw }],
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['a number', { id: -1 }],
    ['a step', { step: 1.5 }],
    ['a known kind of target', { target: { kind: 'tree', id: 1 } }],
    ['an amount of health', { amount: -30 }],
  ])('rejects an events message with a heal without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'events',
      events: [HEAL, { ...HEAL, ...flaw }],
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects data that is not JSON', () => {
    expect(() => decodeServerMessage('welcome')).toThrow();
  });

  it('rejects data that is not an object', () => {
    expect(() => decodeServerMessage('null')).toThrow();
    expect(() => decodeServerMessage('[]')).toThrow();
  });

  it('rejects a message of an unknown type', () => {
    const data = JSON.stringify({ type: 'farewell', protocolVersion: 1 });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects a welcome message without a valid protocol version', () => {
    const data = JSON.stringify({
      type: 'welcome',
      protocolVersion: '1',
      playerId: 7,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects a welcome message without a valid player', () => {
    const data = JSON.stringify({ type: 'welcome', protocolVersion: 2 });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects a snapshot message without a list of players', () => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: {},
      monsters: [],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['is missing', {}],
    ['is not a whole number', { step: 4.5 }],
    ['is not a number', { step: '4' }],
  ])('rejects a snapshot message whose step %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      players: [],
      monsters: [],
      own: OWN,
      slash: null,
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['an identifier', { id: '7' }],
    ['an appearance', { appearance: 1.5 }],
    ['a position', { x: null }],
    ['a yaw', { yaw: 'north' }],
    ['a known action', { action: 'Fly' }],
    ['an action count', { actionCount: undefined }],
    ['a valid health', { health: -5 }],
  ])('rejects a snapshot of a player without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER, { ...PLAYER, ...flaw }],
      monsters: [],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects a snapshot message without a list of monsters', () => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['an identifier', { id: 1.5 }],
    ['a position', { z: null }],
    ['a known action', { action: 'Slash' }],
    ['an action count', { actionCount: '9' }],
    ['a valid health', { health: undefined }],
    ['a known mode', { mode: 'sleep' }],
  ])('rejects a snapshot of a monster without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [{ ...MONSTER, ...flaw }],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['its progress', { own: undefined }],
    ['an input number', { own: { ...OWN, sequence: -1 } }],
    ['a number of steps', { own: { ...OWN, steps: 1.5 } }],
    ['a motion', { own: { ...OWN, motion: null } }],
    ['a position', { own: { ...OWN, motion: { ...OWN.motion, z: '0' } } }],
    [
      'a known action',
      { own: { ...OWN, motion: { ...OWN.motion, action: 'Fly' } } },
    ],
    [
      'a direction',
      { own: { ...OWN, motion: { ...OWN.motion, direction: { x: 1 } } } },
    ],
    [
      'a number of action steps',
      { own: { ...OWN, motion: { ...OWN.motion, actionSteps: null } } },
    ],
  ])('rejects a snapshot that tells the peer without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      slash: null,
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['is missing', { slash: undefined }],
    ['has no whole step', { slash: { ...SLASH, step: 1.5 } }],
    ['looks back by a negative time', { slash: { ...SLASH, rewind: -1 } }],
    ['looks back by no number', { slash: { ...SLASH, rewind: '1' } }],
    ['tells no hit or miss', { slash: { ...SLASH, isHit: 1 } }],
  ])('rejects a snapshot whose judgement of a slash %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });
});

describe('the client message codec', () => {
  it('decodes the move message it encodes', () => {
    const message = createMoveMessage(
      { sequence: 9, after: 2 },
      { x: 0.6, z: -0.8 },
    );
    expect(decodeClientMessage(encodeClientMessage(message))).toEqual({
      type: 'move',
      sequence: 9,
      after: 2,
      direction: { x: 0.6, z: -0.8 },
    });
  });

  it('decodes the interact message it encodes', () => {
    const message = createInteractMessage({ sequence: 1, after: 0 });
    expect(decodeClientMessage(encodeClientMessage(message))).toEqual({
      type: 'interact',
      sequence: 1,
      after: 0,
    });
  });

  it('decodes an interact message that names a time to be judged on', () => {
    const message = createInteractMessage({ sequence: 2, after: 3 }, 1234.5);
    expect(decodeClientMessage(encodeClientMessage(message))).toEqual({
      type: 'interact',
      sequence: 2,
      after: 3,
      viewTime: 1234.5,
    });
  });

  it('decodes an interact message whose time is null as naming none', () => {
    const data = '{"type":"interact","sequence":1,"after":0,"viewTime":null}';
    expect(decodeClientMessage(data)).toEqual({
      type: 'interact',
      sequence: 1,
      after: 0,
    });
  });

  it.each([
    ['a string', '100'],
    ['an object', {}],
    ['a truth value', true],
  ])('rejects an interact message whose time is %s', (_, viewTime) => {
    const data = JSON.stringify({
      type: 'interact',
      sequence: 1,
      after: 0,
      viewTime,
    });
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it('rejects data that is not JSON', () => {
    expect(() => decodeClientMessage('move')).toThrow();
  });

  it('rejects a message of an unknown type', () => {
    const data = JSON.stringify({
      type: 'jump',
      sequence: 1,
      after: 0,
      direction: { x: 0, z: 1 },
    });
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it('rejects a move message without a direction', () => {
    const data = '{"type":"move","sequence":1,"after":0}';
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it('rejects a move message whose direction is not numbers', () => {
    const data =
      '{"type":"move","sequence":1,"after":0,"direction":{"x":"1","z":null}}';
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it.each([
    ['is missing', {}],
    ['is not a whole number', { sequence: 1.5 }],
    ['is below one', { sequence: 0 }],
  ])('rejects an input whose number %s', (_, flaw) => {
    const data = JSON.stringify({ type: 'interact', after: 0, ...flaw });
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it.each([
    ['is missing', {}],
    ['is not a whole number', { after: '2' }],
    ['is below zero', { after: -1 }],
  ])('rejects an input whose number of steps %s', (_, flaw) => {
    const data = JSON.stringify({ type: 'interact', sequence: 1, ...flaw });
    expect(() => decodeClientMessage(data)).toThrow();
  });
});
