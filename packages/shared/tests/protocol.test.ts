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
  INVENTORY_SIZE,
  PROTOCOL_VERSION,
  createEventsMessage,
  createInteractMessage,
  createMapMessage,
  createMoveMessage,
  createPhraseMessage,
  createPhrasedMessage,
  createSaidMessage,
  createSayMessage,
  createSnapshotMessage,
  createSpeechMessage,
  createWelcomeMessage,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
  encodeServerMessage,
} from '../src/index.ts';
import type {
  DayCycle,
  DialogueView,
  GroundItem,
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
  kind: 'village-dog',
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

/** How the day goes on a server, to put in welcome messages. */
const DAY: DayCycle = { origin: 0.3, length: 1_200_000 };

/** What a snapshot tells when there is nothing to pick or carry. */
const NOTHING_TO_PICK = {
  clovers: [],
  items: [],
  looted: [],
  tobyFind: null,
  inventory: [],
  silver: 0,
  dialogue: null,
  acquaintances: [],
  quests: {},
} as const;

/** A dialogue, to put in snapshots. */
const DIALOGUE: DialogueView = {
  villager: 'edwin',
  line: 'dialogue.edwin.plea',
  replies: ['dialogue.edwin.askWho'],
  turn: 1,
};

/** An item on the ground, to put in snapshots. */
const ITEM: GroundItem = { id: 4, kind: 'clover', x: 2.5, z: -9.25 };

/** How a slash was judged, to put in snapshots. */
const SLASH: SlashJudgement = { step: 40, rewind: 312.5, isHit: true };

describe('the server message codec', () => {
  it('decodes the welcome message it encodes', () => {
    const message = createWelcomeMessage(7, DAY);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId: 7,
      day: DAY,
    });
  });

  it('decodes a welcome message with a held clock', () => {
    const day: DayCycle = { origin: 0.5, length: null };
    const message = createWelcomeMessage(7, day);
    expect(decodeServerMessage(encodeServerMessage(message))).toMatchObject({
      day,
    });
  });

  it('decodes a welcome of another protocol version without a day', () => {
    const data = JSON.stringify({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION - 1,
      playerId: 7,
    });
    expect(decodeServerMessage(data)).toEqual({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION - 1,
      playerId: 7,
      day: null,
    });
  });

  it('decodes the snapshot message it encodes', () => {
    const idler: PlayerState = { ...PLAYER, id: 8, action: 'Slash' };
    const message = createSnapshotMessage(42, [PLAYER, idler], [MONSTER], OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
      step: 42,
      players: [PLAYER, idler],
      monsters: [MONSTER],
      own: OWN,
      slash: null,
    });
  });

  it('decodes a snapshot message with several monsters of each kind', () => {
    const monsters: MonsterState[] = [
      { ...MONSTER, kind: 'cave-dog' },
      { ...MONSTER, id: 2, kind: 'cave-dog', mode: 'dead', health: 0 },
      { ...MONSTER, id: 3 },
    ];
    const message = createSnapshotMessage(42, [PLAYER], monsters, OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
      step: 42,
      players: [PLAYER],
      monsters,
      own: OWN,
      slash: null,
    });
  });

  it('decodes a snapshot message of Martha, sitting beaten', () => {
    const monsters: MonsterState[] = [
      MONSTER,
      {
        ...MONSTER,
        id: 2,
        kind: 'martha',
        action: 'Sit',
        mode: 'sit',
        isArmed: true,
      },
    ];
    const message = createSnapshotMessage(42, [PLAYER], monsters, OWN);
    expect(decodeServerMessage(encodeServerMessage(message))).toMatchObject({
      monsters,
    });
  });

  it.each(['approach', 'talk'] as const)(
    'decodes a snapshot message of Martha up to %s',
    (mode: MonsterState['mode']) => {
      const monsters: MonsterState[] = [
        { ...MONSTER, kind: 'martha', action: 'Walk', mode, isArmed: false },
      ];
      const message = createSnapshotMessage(42, [PLAYER], monsters, OWN);
      expect(decodeServerMessage(encodeServerMessage(message))).toMatchObject(
        { monsters },
      );
    },
  );

  it('rejects a snapshot message of Martha armed with no yes or no', () => {
    const data = JSON.stringify({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
      step: 4,
      players: [PLAYER],
      monsters: [{ ...MONSTER, kind: 'martha', isArmed: 'yes' }],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('rejects a snapshot message with two monsters of one identifier', () => {
    const data = JSON.stringify({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
      step: 4,
      players: [PLAYER],
      monsters: [MONSTER, { ...MONSTER, kind: 'cave-dog' }],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes a snapshot message that tells how a slash was judged', () => {
    const message = createSnapshotMessage(42, [PLAYER], [], OWN, SLASH);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
      step: 42,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: SLASH,
    });
  });

  it('decodes a snapshot message of a talking player', () => {
    const talker: PlayerState = { ...PLAYER, action: 'Talk' };
    const own: InputProgress = {
      ...OWN,
      motion: { ...OWN.motion, action: 'Talk', actionSteps: 5 },
    };
    const message = createSnapshotMessage(42, [talker], [], own);
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
      step: 42,
      players: [talker],
      monsters: [],
      own,
      slash: null,
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
      ...NOTHING_TO_PICK,
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
      ...NOTHING_TO_PICK,
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

  it('decodes the map message it encodes', () => {
    for (const map of ['village', 'cave'] as const) {
      const message = createMapMessage(map);
      expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
        type: 'map',
        map,
      });
    }
  });

  it('rejects a map message that names no map there is', () => {
    for (const map of ['forest', null, 3]) {
      const data = JSON.stringify({ type: 'map', map });
      expect(() => decodeServerMessage(data)).toThrow();
    }
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

  it.each([
    ['without a day', {}],
    ['with a null day', { day: null }],
    ['with a day starting a full day later', { day: { ...DAY, origin: 1 } }],
    ['with a day starting before midnight', { day: { ...DAY, origin: -0.1 } }],
    ['with a day without a length', { day: { origin: 0.5 } }],
    ['with a day lasting no time', { day: { ...DAY, length: 0 } }],
    ['with a day of a non-numeric length', { day: { ...DAY, length: 'long' } }],
  ])('rejects a welcome message %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      playerId: 7,
      ...flaw,
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
      ...NOTHING_TO_PICK,
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
      ...NOTHING_TO_PICK,
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
      ...NOTHING_TO_PICK,
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
      ...NOTHING_TO_PICK,
      step: 4,
      players: [PLAYER],
      own: OWN,
      slash: null,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['an identifier', { id: 1.5 }],
    ['a known kind', { kind: 'wolf' }],
    ['a position', { z: null }],
    ['a known action', { action: 'Slash' }],
    ['an action count', { actionCount: '9' }],
    ['a valid health', { health: undefined }],
    ['a known mode', { mode: 'sleep' }],
  ])('rejects a snapshot of a monster without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      ...NOTHING_TO_PICK,
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
      ...NOTHING_TO_PICK,
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
      ...NOTHING_TO_PICK,
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes a snapshot message that tells what there is to pick', () => {
    const second: GroundItem = { ...ITEM, id: 9, x: -1 };
    const message = createSnapshotMessage(
      42,
      [PLAYER],
      [],
      OWN,
      null,
      { clovers: [0, 3, 10], items: [ITEM, second] },
      ['clover', 'clover'],
    );
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'snapshot',
      step: 42,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      clovers: [0, 3, 10],
      items: [ITEM, second],
      looted: [],
      tobyFind: null,
      inventory: ['clover', 'clover'],
      silver: 0,
      dialogue: null,
      acquaintances: [],
      quests: {},
    });
  });

  it('decodes a snapshot message that tells how many silver coins the player has', () => {
    const message = createSnapshotMessage(
      42,
      [PLAYER],
      [],
      OWN,
      null,
      { clovers: [], items: [] },
      ['clover'],
      null,
      [],
      {},
      12,
    );
    expect(decodeServerMessage(encodeServerMessage(message))).toMatchObject({
      type: 'snapshot',
      inventory: ['clover'],
      silver: 12,
    });
  });

  it.each([
    ['is missing', { silver: undefined }],
    ['is below none', { silver: -1 }],
    ['is no whole number', { silver: 1.5 }],
    ['is not a number', { silver: '12' }],
  ])('rejects a snapshot whose number of silver coins %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      ...NOTHING_TO_PICK,
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes a snapshot message that tells which containers are looted', () => {
    const message = createSnapshotMessage(
      42,
      [PLAYER],
      [],
      OWN,
      null,
      { clovers: [], items: [], looted: [0, 4] },
      ['sword', 'leather-armour', 'clover'],
    );
    expect(decodeServerMessage(encodeServerMessage(message))).toMatchObject({
      type: 'snapshot',
      looted: [0, 4],
      inventory: ['sword', 'leather-armour', 'clover'],
    });
  });

  it('decodes a snapshot message that tells when Toby last took a clover', () => {
    const message = createSnapshotMessage(
      342,
      [PLAYER],
      [],
      OWN,
      null,
      { clovers: [0, 3], items: [], tobyFind: 197 },
    );
    expect(message.tobyFind).toBe(197);
    expect(decodeServerMessage(encodeServerMessage(message))).toMatchObject({
      type: 'snapshot',
      clovers: [0, 3],
      tobyFind: 197,
    });
  });

  it.each([
    ['is missing', { tobyFind: undefined }],
    ['is no whole number', { tobyFind: 19.5 }],
    ['is not a number', { tobyFind: '197' }],
  ])('rejects a snapshot whose step of the clover Toby took %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      ...NOTHING_TO_PICK,
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['is missing', { looted: undefined }],
    ['is not a list', { looted: 2 }],
    ['names a container the cave lacks', { looted: [0, 6] }],
    ['names a container twice', { looted: [1, 1] }],
    ['is out of order', { looted: [3, 0] }],
  ])('rejects a snapshot whose list of looted containers %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      clovers: [],
      items: [],
      inventory: [],
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['is missing', { clovers: undefined }],
    ['is not a list', { clovers: 3 }],
    ['names a patch the village lacks', { clovers: [0, 11] }],
    ['names a patch by no whole number', { clovers: [1.5] }],
    ['names a patch twice', { clovers: [2, 2] }],
    ['is out of order', { clovers: [3, 1] }],
  ])('rejects a snapshot whose list of clovers %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      items: [],
      looted: [],
      inventory: [],
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['a list of items', { items: undefined }],
    ['an identifier of an item', { items: [{ ...ITEM, id: -1 }] }],
    ['a known kind of item', { items: [{ ...ITEM, kind: 'stone' }] }],
    ['a position of an item', { items: [{ ...ITEM, x: '1' }] }],
  ])('rejects a snapshot of the ground without %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      clovers: [],
      looted: [],
      inventory: [],
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes a snapshot message that tells of a dialogue', () => {
    const message = createSnapshotMessage(
      4,
      [PLAYER],
      [],
      OWN,
      null,
      undefined,
      ['clovervale-message'],
      DIALOGUE,
      ['edwin'],
    );
    const decoded = decodeServerMessage(encodeServerMessage(message));
    expect(decoded).toEqual(message);
    expect(decoded).toMatchObject({
      dialogue: DIALOGUE,
      acquaintances: ['edwin'],
    });
  });

  it.each([
    ['is missing', { dialogue: undefined }],
    ['names no villager there is', { dialogue: { ...DIALOGUE, villager: 'x' } }],
    ['has a line that is not a name', { dialogue: { ...DIALOGUE, line: 'a b' } }],
    [
      'offers too many replies',
      { dialogue: { ...DIALOGUE, replies: ['a', 'b', 'c', 'd'] } },
    ],
    ['has no number of its line', { dialogue: { ...DIALOGUE, turn: 0 } }],
  ])('rejects a snapshot whose dialogue %s', (_, flaw) => {
    const data = JSON.stringify({
      ...createSnapshotMessage(4, [PLAYER], [], OWN),
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes a snapshot message that tells how far the quests have got', () => {
    const message = createSnapshotMessage(
      4,
      [PLAYER],
      [],
      OWN,
      null,
      undefined,
      ['martha-ointment'],
      null,
      [],
      { 'toby-hurt': 'started' },
    );
    const decoded = decodeServerMessage(encodeServerMessage(message));
    expect(decoded).toEqual(message);
    expect(decoded).toMatchObject({ quests: { 'toby-hurt': 'started' } });
  });

  it.each([
    ['are missing', { quests: undefined }],
    ['are a list', { quests: ['toby-hurt'] }],
    ['name no quest there is', { quests: { 'lost-dog': 'done' } }],
    ['tell no stage there is', { quests: { 'toby-hurt': 'given up' } }],
  ])('rejects a snapshot whose quests %s', (_, flaw) => {
    const data = JSON.stringify({
      ...createSnapshotMessage(4, [PLAYER], [], OWN),
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['are missing', { acquaintances: undefined }],
    ['name no villager there is', { acquaintances: ['stranger'] }],
    ['name a villager twice', { acquaintances: ['edwin', 'edwin'] }],
  ])('rejects a snapshot whose acquaintances %s', (_, flaw) => {
    const data = JSON.stringify({
      ...createSnapshotMessage(4, [PLAYER], [], OWN),
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes the speech message it encodes', () => {
    const message = createSpeechMessage('edwin', 'dialogue.edwin.reminder');
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'speech',
      villager: 'edwin',
      line: 'dialogue.edwin.reminder',
    });
  });

  it('rejects a speech message of no villager there is', () => {
    const data = JSON.stringify({
      type: 'speech',
      villager: 'stranger',
      line: 'dialogue.edwin.reminder',
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes the said message it encodes, in any language', () => {
    for (const text of ['Hello there!', '大家好 🍀', 'one\ntwo']) {
      const message = createSaidMessage(7, text);
      expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
        type: 'said',
        player: 7,
        text,
      });
    }
  });

  it.each([
    ['names no player', { player: 'seven' }],
    ['has no line', { text: undefined }],
    ['has an empty line', { text: '' }],
    ['has a tab in its line', { text: 'one\ttwo' }],
    ['has line breaks running in its line', { text: 'one\n\ntwo' }],
    ['has too long a line', { text: 'a'.repeat(101) }],
  ])('rejects a said message that %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'said',
      player: 7,
      text: 'Hello there!',
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it('decodes the phrased message it encodes', () => {
    const message = createPhrasedMessage(7, 'askInn');
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual({
      type: 'phrased',
      player: 7,
      code: 'askInn',
    });
  });

  it.each([
    ['names no player', { player: 'seven' }],
    ['has no code', { code: undefined }],
    ['has a code of no phrase there is', { code: 'askTheTime' }],
    ['has a line typed for its code', { code: 'Hello there!' }],
  ])('rejects a phrased message that %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'phrased',
      player: 7,
      code: 'askInn',
      ...flaw,
    });
    expect(() => decodeServerMessage(data)).toThrow();
  });

  it.each([
    ['is missing', { inventory: undefined }],
    ['is not a list', { inventory: 'clover' }],
    ['holds an unknown kind', { inventory: ['clover', 'stone'] }],
    [
      'holds more than its slots',
      { inventory: new Array<string>(INVENTORY_SIZE + 1).fill('clover') },
    ],
  ])('rejects a snapshot whose inventory %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'snapshot',
      step: 4,
      players: [PLAYER],
      monsters: [],
      own: OWN,
      slash: null,
      clovers: [],
      items: [],
      looted: [],
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

  it('decodes a pick message without anything else it carries', () => {
    const data = JSON.stringify({ type: 'pick', sequence: 4, after: 2, x: 1 });
    expect(decodeClientMessage(data)).toEqual({
      type: 'pick',
      sequence: 4,
      after: 2,
    });
  });

  it('decodes a travel message without anything else it carries', () => {
    const data = JSON.stringify({
      type: 'travel',
      sequence: 4,
      after: 2,
      map: 'cave',
    });
    expect(decodeClientMessage(data)).toEqual({
      type: 'travel',
      sequence: 4,
      after: 2,
    });
  });

  it('decodes a drop message with the slot it names', () => {
    const data = JSON.stringify({
      type: 'drop',
      sequence: 4,
      after: 2,
      slot: 3,
      x: 1,
    });
    expect(decodeClientMessage(data)).toEqual({
      type: 'drop',
      sequence: 4,
      after: 2,
      slot: 3,
    });
  });

  it.each([
    ['is missing', {}],
    ['is not a whole number', { slot: 1.5 }],
    ['is below zero', { slot: -1 }],
    ['is not a number', { slot: '1' }],
  ])('rejects a drop message whose slot %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'drop',
      sequence: 4,
      after: 2,
      ...flaw,
    });
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it('decodes a use message with the slot it names', () => {
    const data = JSON.stringify({
      type: 'use',
      sequence: 4,
      after: 2,
      slot: 3,
      x: 1,
    });
    expect(decodeClientMessage(data)).toEqual({
      type: 'use',
      sequence: 4,
      after: 2,
      slot: 3,
    });
  });

  it.each([
    ['is missing', {}],
    ['is not a whole number', { slot: 1.5 }],
    ['is below zero', { slot: -1 }],
    ['is not a number', { slot: '1' }],
  ])('rejects a use message whose slot %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'use',
      sequence: 4,
      after: 2,
      ...flaw,
    });
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it('decodes a reply message with the reply it names', () => {
    const data = JSON.stringify({
      type: 'reply',
      sequence: 4,
      after: 2,
      choice: 1,
      x: 1,
    });
    expect(decodeClientMessage(data)).toEqual({
      type: 'reply',
      sequence: 4,
      after: 2,
      choice: 1,
    });
  });

  it.each([
    ['is missing', {}],
    ['is not a whole number', { choice: 0.5 }],
    ['is below zero', { choice: -1 }],
  ])('rejects a reply message whose reply %s', (_, flaw) => {
    const data = JSON.stringify({
      type: 'reply',
      sequence: 4,
      after: 2,
      ...flaw,
    });
    expect(() => decodeClientMessage(data)).toThrow();
  });

  it('rejects a message that would leave a dialogue', () => {
    const data = JSON.stringify({ type: 'leave', sequence: 4, after: 2 });
    expect(() => decodeClientMessage(data)).toThrow();
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

  it('decodes the say message it encodes, as it was typed', () => {
    for (const text of ['Hello there!', '  大家好\n🍀 ', '']) {
      const message = createSayMessage(text);
      expect(decodeClientMessage(encodeClientMessage(message))).toEqual({
        type: 'say',
        text,
      });
    }
  });

  it('rejects a say message without a text', () => {
    expect(() => decodeClientMessage('{"type":"say"}')).toThrow();
    expect(() => decodeClientMessage('{"type":"say","text":7}')).toThrow();
  });

  it('decodes the phrase message it encodes, as it was sent', () => {
    for (const code of ['askInn', 'askTheTime', '']) {
      const message = createPhraseMessage(code);
      expect(decodeClientMessage(encodeClientMessage(message))).toEqual({
        type: 'phrase',
        code,
      });
    }
  });

  it('rejects a phrase message without a code', () => {
    expect(() => decodeClientMessage('{"type":"phrase"}')).toThrow();
    expect(() => decodeClientMessage('{"type":"phrase","code":7}')).toThrow();
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
