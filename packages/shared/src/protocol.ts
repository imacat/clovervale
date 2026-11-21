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
import type { ActionState, MonsterAction } from './actions.ts';
import type { InputProgress, InputStamp } from './authoritative-player.ts';
import { CAVE_CONTAINERS } from './cave.ts';
import { isMonsterKindId } from './combat.ts';
import type { MonsterKindId } from './combat.ts';
import type { DayCycle } from './day-cycle.ts';
import { DIALOGUE_REPLY_LIMIT, isDialogueText } from './dialogue.ts';
import type { DialogueView } from './dialogue.ts';
import {
  CLOVER_PATCHES,
  INVENTORY_SIZE,
  NO_WORLD_ITEMS,
  isItemKindId,
} from './items.ts';
import type { GroundItem, ItemKindId, WorldItems } from './items.ts';
import type { GroundVector } from './movement.ts';
import type {
  DropInput,
  InteractInput,
  MoveInput,
  PickInput,
  PlayerMotion,
  ReplyInput,
  TravelInput,
  UseInput,
} from './player-motion.ts';
import { isVillagerId } from './villagers.ts';
import type { VillagerId } from './villagers.ts';
import { isMapId } from './world-map.ts';
import type { MapId } from './world-map.ts';

/** The version of the wire protocol.  Peers must agree on it to talk. */
export const PROTOCOL_VERSION = 26;

/** The TCP port the server listens on unless told otherwise. */
export const DEFAULT_SERVER_PORT = 8080;

/** The number of snapshots the server sends every second. */
export const SNAPSHOT_RATE = 10;

/** The number of appearances a player can have, numbered from 1. */
export const APPEARANCE_COUNT = 8;

/** A player, as the server knows it at one moment. */
export interface PlayerState {
  /** The identifier of the player, unique while the server runs. */
  readonly id: number;
  /** The number of the appearance of the player, from 1. */
  readonly appearance: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** What the player is doing. */
  readonly action: ActionState;
  /**
   * The number of actions the player has started so far.  It changes
   * whenever the player starts an action, even the same one again.
   */
  readonly actionCount: number;
  /** The health of the player, from 0 to its full health. */
  readonly health: number;
}

/** What a monster can be up to. */
export const MONSTER_MODES = [
  'idle',
  'wander',
  'chase',
  'return',
  'dead',
  'approach',
  'talk',
  'sit',
] as const;

/**
 * What a monster is up to: idling or wandering near its home, chasing a
 * player, walking back home after giving up, or lying dead.  Martha, who
 * fights as a monster, also walks up to a player, talks with it, and sits
 * on the ground once beaten, and chases only the player she fights.
 */
export type MonsterMode = (typeof MONSTER_MODES)[number];

/** A monster, as the server knows it at one moment. */
export interface MonsterState {
  /** The identifier of the monster, unique among the monsters of its world. */
  readonly id: number;
  /** The kind of the monster, which tells its full health. */
  readonly kind: MonsterKindId;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** What the monster is doing. */
  readonly action: MonsterAction;
  /**
   * The number of actions the monster has started so far.  It changes
   * whenever the monster starts an action, even the same one again.
   */
  readonly actionCount: number;
  /** The health of the monster, from 0 to its full health. */
  readonly health: number;
  /** What the monster is up to. */
  readonly mode: MonsterMode;
  /**
   * Whether Martha holds her pitchfork, rather than leaving it against the
   * wall of her house, or on the ground beside her as she sits beaten,
   * which is left out for every other monster.
   */
  readonly isArmed?: boolean;
}

/**
 * Tells whether a monster is in a fight, which a slash can hit, and which
 * a player slashes at rather than talks to a villager: a monster that is
 * alive, or Martha only while she chases the player she fights.
 *
 * @param {MonsterState} monster - The monster.
 * @returns {boolean} Whether it is.
 */
export function isFighting(monster: MonsterState): boolean {
  return monster.kind === 'martha'
    ? monster.mode === 'chase'
    : monster.mode !== 'dead';
}

/** What can take part in a fight. */
export type EntityKind = 'player' | 'monster';

/** Who takes part in something that happens: a player or a monster. */
export interface EntityRef {
  /** Whether it is a player or a monster. */
  readonly kind: EntityKind;
  /** The identifier of the player or of the monster. */
  readonly id: number;
}

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
export interface SlashJudgement {
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
 * The state of every player, and of what there is to pick in the world,
 * which the server sends every peer again and again, with what that peer
 * alone is told of its own player.
 */
export interface SnapshotMessage {
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
   * How far the player of the peer had got with the inputs of the peer
   * when the snapshot was taken.
   */
  readonly own: InputProgress;
  /**
   * The latest slash of the player of the peer, as the server judged it,
   * or `null` before its first.
   */
  readonly slash: SlashJudgement | null;
  /**
   * The numbers of the patches of clover that have their four-leaved
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
   * The number of the latest step at which Toby took the four-leaved
   * clover of a patch of clover, or `null` if he has taken none, as he
   * never has outside the village.  Every snapshot tells it again, so that
   * a peer learns of each clover he takes from any snapshot taken after,
   * until he takes the next.
   */
  readonly tobyFind: number | null;
  /**
   * The items the player of the peer carries, one for each filled slot of
   * its inventory, in the order of the slots.
   */
  readonly inventory: readonly ItemKindId[];
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
 * alone, once.
 */
export interface SpeechMessage {
  /** The message discriminator. */
  readonly type: 'speech';
  /** The villager who speaks. */
  readonly villager: VillagerId;
  /** The message of what the villager says. */
  readonly line: string;
}

/** Any message the server can send to a peer. */
export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | EventsMessage
  | MapMessage
  | SpeechMessage;

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

/** Any message a peer can send to the server. */
export type ClientMessage =
  | MoveMessage
  | InteractMessage
  | PickMessage
  | DropMessage
  | UseMessage
  | ReplyMessage
  | TravelMessage;

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
 * @param {number} step - The number of simulation steps the world has
 *   taken.
 * @param {readonly PlayerState[]} players - Every player in the world.
 * @param {readonly MonsterState[]} monsters - Every monster in the world
 *   that is to be seen.
 * @param {InputProgress} own - How far the player of the peer has got with
 *   the inputs of the peer.
 * @param {SlashJudgement | null} [slash] - The latest slash of the player
 *   of the peer, as the server judged it, or `null` before its first,
 *   which it is by default.
 * @param {WorldItems} [world] - What there is to pick in the world, which
 *   containers have been looted there, and when Toby last took a
 *   four-leaved clover there, which is nothing and never by default.
 * @param {readonly ItemKindId[]} [inventory] - The items the player of the
 *   peer carries, in the order of its slots, which are none by default.
 * @param {DialogueView | null} [dialogue] - The dialogue the player of the
 *   peer is in, or `null` while it is in none, which it is by default.
 * @param {readonly VillagerId[]} [acquaintances] - The villagers who have
 *   told the player of the peer who they are, in the order they did, which
 *   are none by default.
 * @returns {SnapshotMessage} The snapshot message.
 */
export function createSnapshotMessage(
  step: number,
  players: readonly PlayerState[],
  monsters: readonly MonsterState[],
  own: InputProgress,
  slash: SlashJudgement | null = null,
  world: WorldItems = NO_WORLD_ITEMS,
  inventory: readonly ItemKindId[] = [],
  dialogue: DialogueView | null = null,
  acquaintances: readonly VillagerId[] = [],
): SnapshotMessage {
  const { clovers, items, looted = [], tobyFind = null } = world;
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
    dialogue,
    acquaintances,
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
  const value: Record<string, unknown> = parseObject(data, 'server');
  if (
    value.type === 'welcome' &&
    Number.isInteger(value.protocolVersion) &&
    Number.isInteger(value.playerId)
  ) {
    const protocolVersion = value.protocolVersion as number;
    const playerId = value.playerId as number;
    if (protocolVersion !== PROTOCOL_VERSION) {
      return { type: 'welcome', protocolVersion, playerId, day: null };
    }
    if (isDayCycle(value.day)) {
      const { origin, length } = value.day;
      const day: DayCycle = { origin, length };
      return { type: 'welcome', protocolVersion, playerId, day };
    }
  }
  if (
    value.type === 'snapshot' &&
    Number.isInteger(value.step) &&
    Array.isArray(value.players) &&
    Array.isArray(value.monsters) &&
    isInputProgress(value.own) &&
    (value.slash === null || isSlashJudgement(value.slash)) &&
    isNumberList(value.clovers, CLOVER_PATCHES.length) &&
    Array.isArray(value.items) &&
    isNumberList(value.looted, CAVE_CONTAINERS.length) &&
    (value.tobyFind === null || Number.isInteger(value.tobyFind)) &&
    isInventory(value.inventory) &&
    (value.dialogue === null || isDialogueView(value.dialogue)) &&
    isAcquaintanceList(value.acquaintances)
  ) {
    const players: unknown[] = value.players;
    const monsters: unknown[] = value.monsters;
    const items: unknown[] = value.items;
    const { sequence, steps, motion } = value.own;
    const slash: SlashJudgement | null = value.slash;
    const dialogue: DialogueView | null = value.dialogue;
    if (
      players.every(isPlayerState) &&
      monsters.every(isMonsterState) &&
      hasUniqueIds(monsters) &&
      items.every(isGroundItem)
    ) {
      return {
        type: 'snapshot',
        step: value.step as number,
        players: players.map((player: PlayerState) => ({
          id: player.id,
          appearance: player.appearance,
          x: player.x,
          z: player.z,
          yaw: player.yaw,
          action: player.action,
          actionCount: player.actionCount,
          health: player.health,
        })),
        monsters: monsters.map((monster: MonsterState) => ({
          id: monster.id,
          kind: monster.kind,
          x: monster.x,
          z: monster.z,
          yaw: monster.yaw,
          action: monster.action,
          actionCount: monster.actionCount,
          health: monster.health,
          mode: monster.mode,
          ...(monster.isArmed === undefined
            ? {}
            : { isArmed: monster.isArmed }),
        })),
        own: {
          sequence,
          steps,
          motion: {
            x: motion.x,
            z: motion.z,
            yaw: motion.yaw,
            action: motion.action,
            actionCount: motion.actionCount,
            direction: { x: motion.direction.x, z: motion.direction.z },
            isInteracting: motion.isInteracting,
            actionSteps: motion.actionSteps,
          },
        },
        slash:
          slash === null
            ? null
            : { step: slash.step, rewind: slash.rewind, isHit: slash.isHit },
        clovers: [...value.clovers],
        items: items.map(({ id, kind, x, z }: GroundItem) => ({
          id,
          kind,
          x,
          z,
        })),
        looted: [...value.looted],
        tobyFind: value.tobyFind as number | null,
        inventory: [...value.inventory],
        dialogue:
          dialogue === null
            ? null
            : {
                villager: dialogue.villager,
                line: dialogue.line,
                replies: [...dialogue.replies],
                turn: dialogue.turn,
              },
        acquaintances: [...value.acquaintances],
      };
    }
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
  if (value.type === 'events' && Array.isArray(value.events)) {
    const events: unknown[] = value.events;
    if (events.every(isGameEvent)) {
      return { type: 'events', events: events.map(copyEvent) };
    }
  }
  throw new Error('The server message is malformed.');
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
 * The time an interact message names is left out if it is `null`.
 *
 * @param {string} data - The encoded message.
 * @returns {ClientMessage} The decoded message.
 * @throws {Error} If the data is not a well-formed client message.
 */
export function decodeClientMessage(data: string): ClientMessage {
  const value: Record<string, unknown> = parseObject(data, 'client');
  const { sequence, after } = value;
  if (isCount(sequence) && sequence > 0 && isCount(after)) {
    const { viewTime } = value;
    if (
      value.type === 'interact' &&
      (viewTime === undefined || viewTime === null)
    ) {
      return { type: 'interact', sequence, after };
    }
    if (value.type === 'interact' && Number.isFinite(viewTime)) {
      return {
        type: 'interact',
        sequence,
        after,
        viewTime: viewTime as number,
      };
    }
    if (value.type === 'move' && isGroundVector(value.direction)) {
      const { x, z } = value.direction;
      return { type: 'move', sequence, after, direction: { x, z } };
    }
    if (value.type === 'pick') {
      return { type: 'pick', sequence, after };
    }
    if (value.type === 'travel') {
      return { type: 'travel', sequence, after };
    }
    if (value.type === 'drop' && isCount(value.slot)) {
      return { type: 'drop', sequence, after, slot: value.slot };
    }
    if (value.type === 'use' && isCount(value.slot)) {
      return { type: 'use', sequence, after, slot: value.slot };
    }
    if (value.type === 'reply' && isCount(value.choice)) {
      return { type: 'reply', sequence, after, choice: value.choice };
    }
  }
  throw new Error('The client message is malformed.');
}

/**
 * Parses an encoded message into the object it holds.
 *
 * @param {string} data - The encoded message.
 * @param {string} sender - Who sends such messages, for the error messages.
 * @returns {Record<string, unknown>} The object.
 * @throws {Error} If the data is not a JSON object.
 */
function parseObject(data: string, sender: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new Error(`The ${sender} message is not valid JSON.`);
  }
  if (!isRecord(value)) {
    throw new Error(`The ${sender} message is malformed.`);
  }
  return value;
}

/**
 * Checks whether a decoded value is an object with named members.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is such an object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks whether a decoded value is a count: a whole number from 0.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a count.
 */
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Checks whether a decoded value is a point or a direction on the ground.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is one.
 */
function isGroundVector(value: unknown): value is GroundVector {
  return (
    isRecord(value) && Number.isFinite(value.x) && Number.isFinite(value.z)
  );
}

/**
 * Checks whether a decoded value describes how the time of day goes.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it does.
 */
function isDayCycle(value: unknown): value is DayCycle {
  if (!isRecord(value)) {
    return false;
  }
  const { origin, length } = value;
  return (
    Number.isFinite(origin) &&
    (origin as number) >= 0 &&
    (origin as number) < 1 &&
    (length === null ||
      (Number.isFinite(length) && (length as number) > 0))
  );
}

/**
 * Checks whether a decoded value is an action a player can be doing.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is such an action.
 */
function isActionState(value: unknown): value is ActionState {
  return ACTION_STATES.some((action: ActionState) => action === value);
}

/**
 * Checks whether a decoded value is the motion of a player.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is the motion of a player.
 */
function isPlayerMotion(value: unknown): value is PlayerMotion {
  return (
    isRecord(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.yaw) &&
    isActionState(value.action) &&
    isCount(value.actionCount) &&
    isGroundVector(value.direction) &&
    typeof value.isInteracting === 'boolean' &&
    isCount(value.actionSteps)
  );
}

/**
 * Checks whether a decoded value tells how far a player has got with the
 * inputs of its peer.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value tells that.
 */
function isInputProgress(value: unknown): value is InputProgress {
  return (
    isRecord(value) &&
    isCount(value.sequence) &&
    isCount(value.steps) &&
    isPlayerMotion(value.motion)
  );
}

/**
 * Checks whether a decoded value is the state of a player.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is the state of a player.
 */
function isPlayerState(value: unknown): value is PlayerState {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    Number.isInteger(value.appearance) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.yaw) &&
    isActionState(value.action) &&
    Number.isInteger(value.actionCount) &&
    isCount(value.health)
  );
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
 * Checks whether a decoded value is the state of a monster.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is the state of a monster.
 */
function isMonsterState(value: unknown): value is MonsterState {
  return (
    isRecord(value) &&
    Number.isInteger(value.id) &&
    isMonsterKindId(value.kind) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z) &&
    Number.isFinite(value.yaw) &&
    MONSTER_ACTIONS.some((action: MonsterAction) => action === value.action) &&
    Number.isInteger(value.actionCount) &&
    isCount(value.health) &&
    MONSTER_MODES.some((mode: MonsterMode) => mode === value.mode) &&
    (value.isArmed === undefined || typeof value.isArmed === 'boolean')
  );
}

/**
 * Checks whether a decoded value tells how a slash was judged.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value tells that.
 */
function isSlashJudgement(value: unknown): value is SlashJudgement {
  return (
    isRecord(value) &&
    isCount(value.step) &&
    Number.isFinite(value.rewind) &&
    (value.rewind as number) >= 0 &&
    typeof value.isHit === 'boolean'
  );
}

/**
 * Checks whether a decoded value lists things by their numbers, such as
 * patches of clover or containers: numbers of things there are, each once,
 * in ascending order.
 *
 * @param {unknown} value - The value to check.
 * @param {number} count - How many such things there are, numbered from 0.
 * @returns {boolean} Whether it does.
 */
function isNumberList(value: unknown, count: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (number: unknown, index: number) =>
        isCount(number) &&
        number < count &&
        (index === 0 || number > (value[index - 1] as number)),
    )
  );
}

/**
 * Checks whether a decoded value is an item on the ground.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is.
 */
function isGroundItem(value: unknown): value is GroundItem {
  return (
    isRecord(value) &&
    isCount(value.id) &&
    isItemKindId(value.kind) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.z)
  );
}

/**
 * Checks whether a decoded value is what a player carries: no more items
 * than an inventory has slots, each of a kind there is.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is.
 */
function isInventory(value: unknown): value is ItemKindId[] {
  return (
    Array.isArray(value) &&
    value.length <= INVENTORY_SIZE &&
    value.every(isItemKindId)
  );
}

/**
 * Checks whether a decoded value is a dialogue as it stands: a villager,
 * what it has just said, no more replies than a player is offered at
 * once, and a number of the line from 1.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is.
 */
function isDialogueView(value: unknown): value is DialogueView {
  return (
    isRecord(value) &&
    isVillagerId(value.villager) &&
    isDialogueText(value.line) &&
    Array.isArray(value.replies) &&
    value.replies.length <= DIALOGUE_REPLY_LIMIT &&
    value.replies.every(isDialogueText) &&
    isCount(value.turn) &&
    value.turn > 0
  );
}

/**
 * Checks whether a decoded value lists villagers, each once.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it does.
 */
function isAcquaintanceList(value: unknown): value is VillagerId[] {
  return (
    Array.isArray(value) &&
    value.every(isVillagerId) &&
    new Set(value).size === value.length
  );
}

/**
 * Checks whether a decoded value tells who takes part in something.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value tells that.
 */
function isEntityRef(value: unknown): value is EntityRef {
  return (
    isRecord(value) &&
    (value.kind === 'player' || value.kind === 'monster') &&
    Number.isInteger(value.id)
  );
}

/**
 * Checks whether a decoded value is a hit.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a hit.
 */
function isHitEvent(value: unknown): value is HitEvent {
  return (
    isRecord(value) &&
    value.type === 'hit' &&
    isCount(value.id) &&
    isCount(value.step) &&
    isEntityRef(value.attacker) &&
    isEntityRef(value.target) &&
    isCount(value.damage)
  );
}

/**
 * Checks whether a decoded value is a heal.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a heal.
 */
function isHealEvent(value: unknown): value is HealEvent {
  return (
    isRecord(value) &&
    value.type === 'heal' &&
    isCount(value.id) &&
    isCount(value.step) &&
    isEntityRef(value.target) &&
    isCount(value.amount)
  );
}

/**
 * Checks whether a decoded value is an event.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a hit or a heal.
 */
function isGameEvent(value: unknown): value is GameEvent {
  return isHitEvent(value) || isHealEvent(value);
}

/**
 * Copies a decoded event, without anything else it may carry.
 *
 * @param {GameEvent} event - The event.
 * @returns {GameEvent} The copy.
 */
function copyEvent(event: GameEvent): GameEvent {
  const { id, step } = event;
  const target: EntityRef = { kind: event.target.kind, id: event.target.id };
  if (event.type === 'heal') {
    return { type: 'heal', id, step, target, amount: event.amount };
  }
  const { kind, id: attackerId } = event.attacker;
  return {
    type: 'hit',
    id,
    step,
    attacker: { kind, id: attackerId },
    target,
    damage: event.damage,
  };
}
