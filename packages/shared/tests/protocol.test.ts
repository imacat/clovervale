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
  createInteractMessage,
  createMoveMessage,
  createSnapshotMessage,
  createWelcomeMessage,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
} from '../src/index.ts';
import type { InputProgress, PlayerState } from '../src/index.ts';

/** A player to put in snapshots. */
const PLAYER: PlayerState = {
  id: 7,
  appearance: 3,
  x: 1.25,
  z: -3.5,
  yaw: -90,
  action: 'Walk',
  actionCount: 4,
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
    slashSteps: 0,
  },
};

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
    const message = createSnapshotMessage(42, [PLAYER, idler], OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 42,
      players: [PLAYER, idler],
      own: OWN,
    });
  });

  it('decodes a snapshot message without players', () => {
    const message = createSnapshotMessage(0, [], OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 0,
      players: [],
      own: OWN,
    });
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
      own: OWN,
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
      own: OWN,
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
  ])('rejects a snapshot of a player without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER, { ...PLAYER, ...flaw }],
      own: OWN,
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
      'a number of slash steps',
      { own: { ...OWN, motion: { ...OWN.motion, slashSteps: null } } },
    ],
  ])('rejects a snapshot that tells the peer without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
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
