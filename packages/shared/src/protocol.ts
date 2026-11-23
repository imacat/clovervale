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
 * @module shared/protocol Messages exchanged between the server and its peers.
 */

import { ACTION_STATES, MONSTER_ACTIONS } from './actions.ts';
import type { InputProgress, InputStamp } from './authoritative-player.ts';
import { isPhraseCode, isSayText } from './chat.ts';
import type { PhraseCode } from './chat.ts';
import { MONSTER_KINDS, isMonsterKindId } from './combat.ts';
import type {
  EntityKind,
  EntityRef,
  MonsterKind,
  MonsterKindId,
  MonsterState,
} from './combat.ts';
import type { DayCycle } from './day-cycle.ts';
import { DIALOGUE_REPLY_LIMIT, isDialogueText } from './dialogue.ts';
import type { DialogueView } from './dialogue.ts';
import { INVENTORY_SIZE, isItemKindId } from './items.ts';
import type { GroundItem, ItemKindId, WorldItems } from './items.ts';
import type { GroundVector } from './movement.ts';
import {
  MalformedValueError,
  parseBoolean,
  parseCount,
  parseFinite,
  parseGuarded,
  parseInteger,
  parseList,
  parseMember,
  parseNullable,
  parseRecord,
  rejectValue,
} from './parse.ts';
import { parseQuests } from './quests.ts';
import type { Quest } from './quests.ts';
import type {
  DropInput,
  InteractInput,
  MoveInput,
  PickInput,
  PlayerMotion,
  PlayerState,
  ReplyInput,
  TravelInput,
  UseInput,
} from './player-motion.ts';
import { isVillagerId } from './villagers.ts';
import type { VillagerId } from './villagers.ts';
import { WORLD_MAPS, isMapId } from './world-map.ts';
import type { MapId, WorldMap } from './world-map.ts';

/** The version of the wire protocol.  Peers must agree on it to talk. */
export const PROTOCOL_VERSION = 34;

/**
 * The most patches of clover any map has, which a snapshot, which does not
 * name its map, can tell of.
 */
const MOST_CLOVER_PATCHES: number = Math.max(
  ...Object.values(WORLD_MAPS).map(
    (map: WorldMap) => map.cloverPatches.length,
  ),
);

/**
 * The most chests and barrels any map has, which a snapshot, which does not
 * name its map, can tell of.
 */
const MOST_CONTAINERS: number = Math.max(
  ...Object.values(WORLD_MAPS).map((map: WorldMap) => map.containers.length),
);

/** The TCP port the server listens on unless told otherwise. */
export const DEFAULT_SERVER_PORT = 8080;

/** The number of snapshots the server sends every second. */
export const SNAPSHOT_RATE = 10;

/** What can take part in a fight. */
const ENTITY_KINDS: readonly EntityKind[] = ['player', 'monster'];

/** That something took damage from something else, once. */
export interface HitEvent {
  /** The event discriminator. */
  readonly type: 'hit';
  /**
   * The number of the event among the events of the server, which goes up
   * with every event, from 1.
   */
  readonly id: number;
  /** The simulation step at which it happened. */
  readonly step: number;
  /** Who struck. */
  readonly attacker: EntityRef;
  /** Who was struck. */
  readonly target: EntityRef;
  /** How much health the target lost. */
  readonly damage: number;
}

/** That something got health back, once. */
export interface HealEvent {
  /** The event discriminator. */
  readonly type: 'heal';
  /**
   * The number of the event among the events of the server, which goes up
   * with every event, from 1.
   */
  readonly id: number;
  /** The simulation step at which it happened. */
  readonly step: number;
  /** Who got health back. */
  readonly target: EntityRef;
  /** How much health the target got back. */
  readonly amount: number;
}

/**
 * Anything that happens once, at one moment, unlike the state that the
 * snapshots tell again and again.
 */
export type GameEvent = HitEvent | HealEvent;

/** How the server judged a slash of a player. */
export interface SlashJudgment {
  /** The simulation step at which the slash started, and was judged. */
  readonly step: number;
  /**
   * How long before that step the world was as the slash was judged on, in
   * milliseconds, which is 0 for a slash judged on the world as it was at
   * the step.
   */
  readonly rewind: number;
  /** Whether the slash hit. */
  readonly isHit: boolean;
}

/** The first message the server sends to every newly connected peer. */
export interface WelcomeMessage {
  /** The message discriminator. */
  readonly type: 'welcome';
  /** The protocol version the server speaks. */
  readonly protocolVersion: number;
  /** The identifier of the player of the peer. */
  readonly playerId: number;
  /**
   * How the time of day goes on the server, so that the peer can tell the
   * time of day from the steps of the snapshots, or `null` in a welcome of
   * another protocol version, which may not include it.
   */
  readonly day: DayCycle | null;
}

/**
 * What a snapshot tells the peer of a player alone, of that player: how
 * far it has gotten with the inputs of the peer, how its latest slash was
 * judged, what it carries, its silver coins, the dialogue it is in, the
 * villagers who have told it who they are, and how far it has gotten with
 * the quests.
 */
export interface PrivateView {
  /**
   * How far the player of the peer had gotten with the inputs of the peer
   * when the snapshot was taken.
   */
  readonly own: InputProgress;
  /**
   * The latest slash of the player of the peer, as the server judged it,
   * or `null` before its first.
   */
  readonly slash: SlashJudgment | null;
  /**
   * The items the player of the peer carries, one for each filled slot of
   * its inventory, in the order of the slots.
   */
  readonly inventory: readonly ItemKindId[];
  /**
   * The number of silver coins the player of the peer has, which take no
   * slot of its inventory.
   */
  readonly silver: number;
  /**
   * The dialogue the player of the peer is in, or `null` while it is in
   * none.
   */
  readonly dialogue: DialogueView | null;
  /**
   * The villagers who have told the player of the peer who they are, each
   * once, in the order they did.
   */
  readonly acquaintances: readonly VillagerId[];
  /**
   * The quests the player of the peer has opened, in the order it opened
   * them, each at the stage it has gotten to, which only the server moves
   * on.
   */
  readonly quests: readonly Quest[];
}

/**
 * The state of every player, and of what there is to pick in the world,
 * which the server sends every peer again and again, with what that peer
 * alone is told of its own player.
 */
export interface SnapshotMessage extends PrivateView {
  /** The message discriminator. */
  readonly type: 'snapshot';
  /**
   * The number of simulation steps the world had taken when the snapshot
   * was taken, which tells when that was on the clock of the server.
   */
  readonly step: number;
  /** Every player in the world. */
  readonly players: readonly PlayerState[];
  /** Every monster in the world that is to be seen. */
  readonly monsters: readonly MonsterState[];
  /**
   * The numbers of the patches of clover that have their four-leaf
   * clover, in ascending order.
   */
  readonly clovers: readonly number[];
  /** The items that lie on the ground. */
  readonly items: readonly GroundItem[];
  /**
   * The numbers of the containers of the cave that have been looted, in
   * ascending order, which are none outside the cave.
   */
  readonly looted: readonly number[];
  /**
   * The number of the latest step at which Toby took the four-leaf
   * clover of a patch of clover, or `null` if he has taken none, as he
   * never has outside the village.  Every snapshot tells it again, so that
   * a peer learns of each clover he takes from any snapshot taken after,
   * until he takes the next.
   */
  readonly tobyFind: number | null;
}

/** What a snapshot message for one peer is made from. */
export interface SnapshotContents {
  /** The number of simulation steps the world has taken. */
  readonly step: number;
  /** Every player in the world. */
  readonly players: readonly PlayerState[];
  /** Every monster in the world that is to be seen. */
  readonly monsters: readonly MonsterState[];
  /**
   * What there is to pick in the world, which containers have been looted
   * there, and when Toby last took a four-leaf clover there.
   */
  readonly world: WorldItems;
  /** What the peer alone is told of its own player. */
  readonly view: PrivateView;
}

/**
 * What has happened in the world since the events the server last sent,
 * which the server sends every peer once each.
 */
export interface EventsMessage {
  /** The message discriminator. */
  readonly type: 'events';
  /** The events, in the order they happened. */
  readonly events: readonly GameEvent[];
}

/**
 * That the player of the peer is in another map from now on, which the
 * server sends a peer once, before the first snapshot of that map.  A peer
 * that has been told nothing has its player in the village.
 */
export interface MapMessage {
  /** The message discriminator. */
  readonly type: 'map';
  /** The map the player is in. */
  readonly map: MapId;
}

/**
 * What a villager says to the player of the peer, to be shown above its
 * head for a while, outside any dialogue, which the server sends that peer
 * alone, once, or what a villager says to every player nearby, which the
 * server sends the peers of those players alone, once each.
 */
export interface SpeechMessage {
  /** The message discriminator. */
  readonly type: 'speech';
  /** The villager who speaks. */
  readonly villager: VillagerId;
  /** The message of what the villager says. */
  readonly line: string;
}

/**
 * What a player nearby says, or the player of the peer itself, to be shown
 * above its head for a while, which the server sends every peer whose
 * player hears it, once.
 */
export interface SaidMessage {
  /** The message discriminator. */
  readonly type: 'said';
  /** The identifier of the player who speaks. */
  readonly player: number;
  /**
   * The line the player says, which {@link isSayText} takes: plain text
   * in whatever language the player typed it in.
   */
  readonly text: string;
}

/**
 * A phrase a player nearby says, or the player of the peer itself, to be
 * shown above its head for a while as what a player says is, worded in the
 * language of the peer, which the server sends every peer whose player
 * hears it, once.
 */
export interface PhrasedMessage {
  /** The message discriminator. */
  readonly type: 'phrased';
  /** The identifier of the player who speaks. */
  readonly player: number;
  /** The code of the phrase the player says. */
  readonly code: PhraseCode;
}

/** Any message the server can send to a peer. */
export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | EventsMessage
  | MapMessage
  | SpeechMessage
  | SaidMessage
  | PhrasedMessage;

/** What a peer sends whenever the way its player wants to move changes. */
export type MoveMessage = MoveInput & InputStamp;

/**
 * What a peer sends whenever its player wants to interact with the world.
 * What comes of it is for the server to decide.
 */
export type InteractMessage = InteractInput & InputStamp;

/**
 * What a peer sends whenever its player wants to pick what is within its
 * reach.  What comes of it is for the server to decide.
 */
export type PickMessage = PickInput & InputStamp;

/**
 * What a peer sends whenever its player wants to put the item of a slot of
 * its inventory down.  What comes of it is for the server to decide.
 */
export type DropMessage = DropInput & InputStamp;

/**
 * What a peer sends whenever its player wants to use the item of a slot of
 * its inventory.  What comes of it is for the server to decide.
 */
export type UseMessage = UseInput & InputStamp;

/**
 * What a peer sends whenever its player chooses a reply in the dialogue it
 * is in, or ends a dialogue that offers none.  What comes of it is for the
 * server to decide.
 */
export type ReplyMessage = ReplyInput & InputStamp;

/**
 * What a peer sends whenever its player wants to take the way into another
 * map within its reach.  What comes of it is for the server to decide.
 */
export type TravelMessage = TravelInput & InputStamp;

/**
 * What a peer sends whenever its player says a line to the players nearby.
 * It is no input of the player, and is not numbered among them.  Who hears
 * it, and what of it, is for the server to decide.
 */
export interface SayMessage {
  /** The message discriminator. */
  readonly type: 'say';
  /** The text the player typed. */
  readonly text: string;
}

/**
 * What a peer sends whenever its player says a phrase to the players
 * nearby, by its code, for each of them to read in its own language.  It
 * is no input of the player, and is not numbered among them.  Whether it
 * is a phrase a player can say, and who hears it, is for the server to
 * decide.
 */
export interface PhraseMessage {
  /** The message discriminator. */
  readonly type: 'phrase';
  /** The code the peer sent. */
  readonly code: string;
}

/** Any message a peer can send to the server. */
export type ClientMessage =
  | MoveMessage
  | InteractMessage
  | PickMessage
  | DropMessage
  | UseMessage
  | ReplyMessage
  | TravelMessage
  | SayMessage
  | PhraseMessage;

/**
 * Creates the welcome message for the current protocol version.
 *
 * @param {number} playerId - The identifier of the player of the peer.
 * @param {DayCycle} day - How the time of day goes on the server.
 * @returns {WelcomeMessage} The welcome message.
 */
export function createWelcomeMessage(
  playerId: number,
  day: DayCycle,
): WelcomeMessage {
  return {
    type: 'welcome',
    protocolVersion: PROTOCOL_VERSION,
    playerId,
    day: { origin: day.origin, length: day.length },
  };
}

/**
 * Creates a snapshot message for one peer.
 *
 * @param {SnapshotContents} contents - What the snapshot is made from.
 * @returns {SnapshotMessage} The snapshot message.
 */
export function createSnapshotMessage({
  step,
  players,
  monsters,
  world,
  view,
}: SnapshotContents): SnapshotMessage {
  const { clovers, items, looted = [], tobyFind = null } = world;
  const { own, slash, inventory, silver, dialogue, acquaintances, quests } =
    view;
  return {
    type: 'snapshot',
    step,
    players,
    monsters,
    own,
    slash,
    clovers,
    items,
    looted,
    tobyFind,
    inventory,
    silver,
    dialogue,
    acquaintances,
    quests,
  };
}

/**
 * Creates an events message.
 *
 * @param {readonly GameEvent[]} events - The events, in the order they
 *   happened.
 * @returns {EventsMessage} The events message.
 */
export function createEventsMessage(
  events: readonly GameEvent[],
): EventsMessage {
  return { type: 'events', events };
}

/**
 * Creates a map message.
 *
 * @param {MapId} map - The map the player of the peer is in from now on.
 * @returns {MapMessage} The map message.
 */
export function createMapMessage(map: MapId): MapMessage {
  return { type: 'map', map };
}

/**
 * Creates a speech message.
 *
 * @param {VillagerId} villager - The villager who speaks.
 * @param {string} line - The message of what the villager says.
 * @returns {SpeechMessage} The speech message.
 */
export function createSpeechMessage(
  villager: VillagerId,
  line: string,
): SpeechMessage {
  return { type: 'speech', villager, line };
}

/**
 * Creates a said message.
 *
 * @param {number} player - The identifier of the player who speaks.
 * @param {string} text - The line the player says.
 * @returns {SaidMessage} The said message.
 */
export function createSaidMessage(player: number, text: string): SaidMessage {
  return { type: 'said', player, text };
}

/**
 * Creates a say message.
 *
 * @param {string} text - The text the player typed.
 * @returns {SayMessage} The say message.
 */
export function createSayMessage(text: string): SayMessage {
  return { type: 'say', text };
}

/**
 * Creates a phrased message.
 *
 * @param {number} player - The identifier of the player who speaks.
 * @param {PhraseCode} code - The code of the phrase the player says.
 * @returns {PhrasedMessage} The phrased message.
 */
export function createPhrasedMessage(
  player: number,
  code: PhraseCode,
): PhrasedMessage {
  return { type: 'phrased', player, code };
}

/**
 * Creates a phrase message.
 *
 * @param {string} code - The code of the phrase.
 * @returns {PhraseMessage} The phrase message.
 */
export function createPhraseMessage(code: string): PhraseMessage {
  return { type: 'phrase', code };
}

/**
 * Creates a move message.
 *
 * @param {InputStamp} stamp - What places the input in time.
 * @param {GroundVector} direction - The direction the player wants to move
 *   in, or a direction without length to stop.
 * @returns {MoveMessage} The move message.
 */
export function createMoveMessage(
  stamp: InputStamp,
  direction: GroundVector,
): MoveMessage {
  return {
    type: 'move',
    sequence: stamp.sequence,
    after: stamp.after,
    direction: { x: direction.x, z: direction.z },
  };
}

/**
 * Creates an interact message.
 *
 * @param {InputStamp} stamp - What places the input in time.
 * @param {number | null} [viewTime] - The time on the clock of the server,
 *   in milliseconds, at which the world was as the peer showed it when the
 *   interaction started there, for the server to judge the interaction on,
 *   or `null` for the server to judge it on the world as it is then, which
 *   it is by default.
 * @returns {InteractMessage} The interact message.
 */
export function createInteractMessage(
  stamp: InputStamp,
  viewTime: number | null = null,
): InteractMessage {
  const { sequence, after } = stamp;
  if (viewTime === null) {
    return { type: 'interact', sequence, after };
  }
  return { type: 'interact', sequence, after, viewTime };
}

/**
 * Encodes a server message for the wire.
 *
 * @param {ServerMessage} message - The message to encode.
 * @returns {string} The encoded message.
 */
export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Decodes a server message received from the wire.
 *
 * A welcome of another protocol version is decoded without its day, so
 * that the peer can still see which version it is.
 *
 * @param {string} data - The encoded message.
 * @returns {ServerMessage} The decoded message.
 * @throws {Error} If the data is not a well-formed server message.
 */
export function decodeServerMessage(data: string): ServerMessage {
  return decodeMessage(data, 'server', parseServerMessage);
}

/**
 * Parses a decoded server message.
 *
 * @param {Record<string, unknown>} value - The decoded message.
 * @returns {ServerMessage} A copy of the message.
 * @throws {MalformedValueError} If the message is malformed.
 */
function parseServerMessage(value: Record<string, unknown>): ServerMessage {
  if (value.type === 'welcome') {
    return parseWelcomeMessage(value);
  }
  if (value.type === 'snapshot') {
    return parseSnapshotMessage(value);
  }
  if (value.type === 'map' && isMapId(value.map)) {
    return { type: 'map', map: value.map };
  }
  if (
    value.type === 'speech' &&
    isVillagerId(value.villager) &&
    isDialogueText(value.line)
  ) {
    return { type: 'speech', villager: value.villager, line: value.line };
  }
  if (
    value.type === 'said' &&
    Number.isInteger(value.player) &&
    isSayText(value.text)
  ) {
    return {
      type: 'said',
      player: value.player as number,
      text: value.text,
    };
  }
  if (
    value.type === 'phrased' &&
    Number.isInteger(value.player) &&
    isPhraseCode(value.code)
  ) {
    return {
      type: 'phrased',
      player: value.player as number,
      code: value.code,
    };
  }
  if (value.type === 'events') {
    return { type: 'events', events: parseList(value.events, parseGameEvent) };
  }
  return rejectValue();
}

/**
 * Encodes a client message for the wire.
 *
 * @param {ClientMessage} message - The message to encode.
 * @returns {string} The encoded message.
 */
export function encodeClientMessage(message: ClientMessage): string {
  return JSON.stringify(message);
}

/**
 * Decodes a client message received from the wire.
 *
 * The text of a say message is decoded as it was typed, and the code of a
 * phrase message as it was sent, whatever they hold.
 *
 * @param {string} data - The encoded message.
 * @returns {ClientMessage} The decoded message.
 * @throws {Error} If the data is not a well-formed client message.
 */
export function decodeClientMessage(data: string): ClientMessage {
  return decodeMessage(data, 'client', parseClientMessage);
}

/**
 * Parses a decoded client message.
 *
 * @param {Record<string, unknown>} value - The decoded message.
 * @returns {ClientMessage} A copy of the message.
 * @throws {MalformedValueError} If the message is malformed.
 */
function parseClientMessage(value: Record<string, unknown>): ClientMessage {
  if (value.type === 'say' && typeof value.text === 'string') {
    return { type: 'say', text: value.text };
  }
  if (value.type === 'phrase' && typeof value.code === 'string') {
    return { type: 'phrase', code: value.code };
  }
  const sequence: number = parseCount(value.sequence);
  const after: number = parseCount(value.after);
  if (sequence === 0) {
    rejectValue();
  }
  switch (value.type) {
    case 'interact':
      return value.viewTime === undefined
        ? { type: 'interact', sequence, after }
        : {
            type: 'interact',
            sequence,
            after,
            viewTime: parseFinite(value.viewTime),
          };
    case 'move':
      return {
        type: 'move',
        sequence,
        after,
        direction: parseGroundVector(value.direction),
      };
    case 'pick':
      return { type: 'pick', sequence, after };
    case 'travel':
      return { type: 'travel', sequence, after };
    case 'drop':
      return { type: 'drop', sequence, after, slot: parseCount(value.slot) };
    case 'use':
      return { type: 'use', sequence, after, slot: parseCount(value.slot) };
    case 'reply':
      return {
        type: 'reply',
        sequence,
        after,
        choice: parseCount(value.choice),
      };
    default:
      return rejectValue();
  }
}

/**
 * Decodes a message received from the wire with a parse function.
 *
 * @template T - What the parse function returns.
 * @param {string} data - The encoded message.
 * @param {string} sender - Who sends such messages, for the error messages.
 * @param {(value: Record<string, unknown>) => T} parse - The parse function
 *   of the decoded message.
 * @returns {T} What the parse function returns.
 * @throws {Error} If the data is not a JSON object, or the parse function
 *   does not take it.
 */
function decodeMessage<T>(
  data: string,
  sender: string,
  parse: (value: Record<string, unknown>) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new Error(`The ${sender} message is not valid JSON.`);
  }
  try {
    return parse(parseRecord(value));
  } catch (error: unknown) {
    if (error instanceof MalformedValueError) {
      throw new Error(`The ${sender} message is malformed.`, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Parses a welcome message.
 *
 * @param {Record<string, unknown>} value - The decoded message.
 * @returns {WelcomeMessage} A copy of the message, without its day if it is
 *   of another protocol version.
 * @throws {Error} If the message is malformed.
 */
function parseWelcomeMessage(value: Record<string, unknown>): WelcomeMessage {
  const protocolVersion: number = parseInteger(value.protocolVersion);
  const playerId: number = parseInteger(value.playerId);
  if (protocolVersion !== PROTOCOL_VERSION) {
    return { type: 'welcome', protocolVersion, playerId, day: null };
  }
  const day: DayCycle = parseDayCycle(value.day);
  return { type: 'welcome', protocolVersion, playerId, day };
}

/**
 * Parses a snapshot message.
 *
 * @param {Record<string, unknown>} value - The decoded message.
 * @returns {SnapshotMessage} A copy of the message, without anything else
 *   it may carry.
 * @throws {Error} If the message is malformed.
 */
function parseSnapshotMessage(
  value: Record<string, unknown>,
): SnapshotMessage {
  const monsters: MonsterState[] = parseList(value.monsters, parseMonsterState);
  if (!hasUniqueIds(monsters)) {
    rejectValue();
  }
  return {
    type: 'snapshot',
    step: parseInteger(value.step),
    players: parseList(value.players, parsePlayerState),
    monsters,
    own: parseInputProgress(value.own),
    slash: parseNullable(value.slash, parseSlashJudgment),
    clovers: parseNumberList(value.clovers, MOST_CLOVER_PATCHES),
    items: parseList(value.items, parseGroundItem),
    looted: parseNumberList(value.looted, MOST_CONTAINERS),
    tobyFind: parseNullable(value.tobyFind, parseInteger),
    inventory: parseInventory(value.inventory),
    silver: parseCount(value.silver),
    dialogue: parseNullable(value.dialogue, parseDialogueView),
    acquaintances: parseAcquaintanceList(value.acquaintances),
    quests: parseQuests(value.quests),
  };
}

/**
 * Parses a decoded value that is a point or a direction on the ground.
 *
 * @param {unknown} value - The value to parse.
 * @returns {GroundVector} A copy of the point or the direction.
 * @throws {Error} If the value is neither.
 */
function parseGroundVector(value: unknown): GroundVector {
  const record: Record<string, unknown> = parseRecord(value);
  return { x: parseFinite(record.x), z: parseFinite(record.z) };
}

/**
 * Parses a decoded value that describes how the time of day goes.
 *
 * @param {unknown} value - The value to parse.
 * @returns {DayCycle} A copy of what it describes.
 * @throws {Error} If the value does not describe that.
 */
function parseDayCycle(value: unknown): DayCycle {
  const record: Record<string, unknown> = parseRecord(value);
  const origin: number = parseFinite(record.origin);
  const length: number | null = parseNullable(record.length, parseFinite);
  if (origin < 0 || origin >= 1 || (length !== null && length <= 0)) {
    rejectValue();
  }
  return { origin, length };
}

/**
 * Parses a decoded value that is the motion of a player.
 *
 * @param {unknown} value - The value to parse.
 * @returns {PlayerMotion} A copy of the motion.
 * @throws {Error} If the value is not the motion of a player.
 */
function parsePlayerMotion(value: unknown): PlayerMotion {
  const record: Record<string, unknown> = parseRecord(value);
  return {
    x: parseFinite(record.x),
    z: parseFinite(record.z),
    yaw: parseFinite(record.yaw),
    action: parseMember(record.action, ACTION_STATES),
    actionCount: parseCount(record.actionCount),
    direction: parseGroundVector(record.direction),
    isInteracting: parseBoolean(record.isInteracting),
    actionSteps: parseCount(record.actionSteps),
  };
}

/**
 * Parses a decoded value that tells how far a player has gotten with the
 * inputs of its peer.
 *
 * @param {unknown} value - The value to parse.
 * @returns {InputProgress} A copy of what it tells.
 * @throws {Error} If the value does not tell that.
 */
function parseInputProgress(value: unknown): InputProgress {
  const record: Record<string, unknown> = parseRecord(value);
  return {
    sequence: parseCount(record.sequence),
    steps: parseCount(record.steps),
    motion: parsePlayerMotion(record.motion),
  };
}

/**
 * Parses a decoded value that is the state of a player.
 *
 * @param {unknown} value - The value to parse.
 * @returns {PlayerState} A copy of the state.
 * @throws {Error} If the value is not the state of a player.
 */
function parsePlayerState(value: unknown): PlayerState {
  const record: Record<string, unknown> = parseRecord(value);
  return {
    id: parseInteger(record.id),
    appearance: parseInteger(record.appearance),
    x: parseFinite(record.x),
    z: parseFinite(record.z),
    yaw: parseFinite(record.yaw),
    action: parseMember(record.action, ACTION_STATES),
    actionCount: parseInteger(record.actionCount),
    health: parseCount(record.health),
  };
}

/**
 * Checks whether no two of the monsters of a snapshot share an identifier.
 *
 * @param {readonly MonsterState[]} monsters - The monsters.
 * @returns {boolean} Whether each has an identifier of its own.
 */
function hasUniqueIds(monsters: readonly MonsterState[]): boolean {
  return (
    new Set(monsters.map((monster: MonsterState) => monster.id)).size ===
    monsters.length
  );
}

/**
 * Parses a decoded value that is the state of a monster, up to one of the
 * modes of its kind.
 *
 * @param {unknown} value - The value to parse.
 * @returns {MonsterState} A copy of the state, telling whether the monster
 *   holds its weapon only for a kind that holds one now and then.
 * @throws {Error} If the value is not the state of a monster.
 */
function parseMonsterState(value: unknown): MonsterState {
  const record: Record<string, unknown> = parseRecord(value);
  const kind: MonsterKindId = parseGuarded(record.kind, isMonsterKindId);
  const { modes, hasWeapon }: MonsterKind = MONSTER_KINDS[kind];
  return {
    id: parseInteger(record.id),
    kind,
    x: parseFinite(record.x),
    z: parseFinite(record.z),
    yaw: parseFinite(record.yaw),
    action: parseMember(record.action, MONSTER_ACTIONS),
    actionCount: parseInteger(record.actionCount),
    health: parseCount(record.health),
    mode: parseMember(record.mode, modes),
    ...(!hasWeapon || record.isArmed === undefined
      ? {}
      : { isArmed: parseBoolean(record.isArmed) }),
  };
}

/**
 * Parses a decoded value that tells how a slash was judged.
 *
 * @param {unknown} value - The value to parse.
 * @returns {SlashJudgment} A copy of what it tells.
 * @throws {Error} If the value does not tell that.
 */
function parseSlashJudgment(value: unknown): SlashJudgment {
  const record: Record<string, unknown> = parseRecord(value);
  const rewind: number = parseFinite(record.rewind);
  if (rewind < 0) {
    rejectValue();
  }
  return {
    step: parseCount(record.step),
    rewind,
    isHit: parseBoolean(record.isHit),
  };
}

/**
 * Parses a decoded value that lists things by their numbers, such as
 * patches of clover or containers: numbers of things there are, each once,
 * in ascending order.
 *
 * @param {unknown} value - The value to parse.
 * @param {number} count - How many such things there are, numbered from 0.
 * @returns {number[]} A copy of the list.
 * @throws {Error} If the value lists no such things.
 */
function parseNumberList(value: unknown, count: number): number[] {
  const numbers: number[] = parseList(value, parseCount);
  let previous = -1;
  for (const number of numbers) {
    if (number >= count || number <= previous) {
      rejectValue();
    }
    previous = number;
  }
  return numbers;
}

/**
 * Parses a decoded value that is an item on the ground.
 *
 * @param {unknown} value - The value to parse.
 * @returns {GroundItem} A copy of the item.
 * @throws {Error} If the value is no item on the ground.
 */
function parseGroundItem(value: unknown): GroundItem {
  const record: Record<string, unknown> = parseRecord(value);
  return {
    id: parseCount(record.id),
    kind: parseGuarded(record.kind, isItemKindId),
    x: parseFinite(record.x),
    z: parseFinite(record.z),
  };
}

/**
 * Parses a decoded value that is what a player carries: no more items
 * than an inventory has slots, each of a kind there is.
 *
 * @param {unknown} value - The value to parse.
 * @returns {ItemKindId[]} A copy of what the player carries.
 * @throws {Error} If the value is not what a player can carry.
 */
function parseInventory(value: unknown): ItemKindId[] {
  const inventory: ItemKindId[] = parseList(value, (item: unknown) =>
    parseGuarded(item, isItemKindId),
  );
  if (inventory.length > INVENTORY_SIZE) {
    rejectValue();
  }
  return inventory;
}

/**
 * Parses a decoded value that is a dialogue as it stands: a villager, what
 * it has just said, no more replies than a player is offered at once, and
 * a number of the line from 1.
 *
 * @param {unknown} value - The value to parse.
 * @returns {DialogueView} A copy of the dialogue.
 * @throws {Error} If the value is no such dialogue.
 */
function parseDialogueView(value: unknown): DialogueView {
  const record: Record<string, unknown> = parseRecord(value);
  const replies: string[] = parseList(record.replies, (reply: unknown) =>
    parseGuarded(reply, isDialogueText),
  );
  const turn: number = parseCount(record.turn);
  if (replies.length > DIALOGUE_REPLY_LIMIT || turn === 0) {
    rejectValue();
  }
  return {
    villager: parseGuarded(record.villager, isVillagerId),
    line: parseGuarded(record.line, isDialogueText),
    replies,
    turn,
  };
}

/**
 * Parses a decoded value that lists villagers, each once.
 *
 * @param {unknown} value - The value to parse.
 * @returns {VillagerId[]} A copy of the list.
 * @throws {Error} If the value lists no villagers each once.
 */
function parseAcquaintanceList(value: unknown): VillagerId[] {
  const villagers: VillagerId[] = parseList(value, (item: unknown) =>
    parseGuarded(item, isVillagerId),
  );
  if (new Set(villagers).size !== villagers.length) {
    rejectValue();
  }
  return villagers;
}

/**
 * Parses a decoded value that tells who takes part in something.
 *
 * @param {unknown} value - The value to parse.
 * @returns {EntityRef} A copy of what it tells.
 * @throws {Error} If the value does not tell that.
 */
function parseEntityRef(value: unknown): EntityRef {
  const record: Record<string, unknown> = parseRecord(value);
  return {
    kind: parseMember(record.kind, ENTITY_KINDS),
    id: parseInteger(record.id),
  };
}

/**
 * Parses a decoded value that is an event: a hit or a heal.
 *
 * @param {unknown} value - The value to parse.
 * @returns {GameEvent} A copy of the event, without anything else it may
 *   carry.
 * @throws {Error} If the value is no event.
 */
function parseGameEvent(value: unknown): GameEvent {
  const record: Record<string, unknown> = parseRecord(value);
  const id: number = parseCount(record.id);
  const step: number = parseCount(record.step);
  const target: EntityRef = parseEntityRef(record.target);
  if (record.type === 'heal') {
    return { type: 'heal', id, step, target, amount: parseCount(record.amount) };
  }
  if (record.type === 'hit') {
    return {
      type: 'hit',
      id,
      step,
      attacker: parseEntityRef(record.attacker),
      target,
      damage: parseCount(record.damage),
    };
  }
  return rejectValue();
}
