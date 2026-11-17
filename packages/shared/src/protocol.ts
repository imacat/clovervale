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

import { ACTION_STATES } from './actions.ts';
import type { ActionState } from './actions.ts';
import type { InputProgress, InputStamp } from './authoritative-player.ts';
import type { GroundVector } from './movement.ts';
import type {
  InteractInput,
  MoveInput,
  PlayerMotion,
} from './player-motion.ts';

/** The version of the wire protocol.  Peers must agree on it to talk. */
export const PROTOCOL_VERSION = 4;

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
}

/** The first message the server sends to every newly connected peer. */
export interface WelcomeMessage {
  /** The message discriminator. */
  readonly type: 'welcome';
  /** The protocol version the server speaks. */
  readonly protocolVersion: number;
  /** The identifier of the player of the peer. */
  readonly playerId: number;
}

/**
 * The state of every player, which the server sends every peer again and
 * again, with what that peer alone is told of its own player.
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
  /**
   * How far the player of the peer had got with the inputs of the peer
   * when the snapshot was taken.
   */
  readonly own: InputProgress;
}

/** Any message the server can send to a peer. */
export type ServerMessage = WelcomeMessage | SnapshotMessage;

/** What a peer sends whenever the way its player wants to move changes. */
export type MoveMessage = MoveInput & InputStamp;

/**
 * What a peer sends whenever its player wants to interact with the world.
 * What comes of it is for the server to decide.
 */
export type InteractMessage = InteractInput & InputStamp;

/** Any message a peer can send to the server. */
export type ClientMessage = MoveMessage | InteractMessage;

/**
 * Creates the welcome message for the current protocol version.
 *
 * @param {number} playerId - The identifier of the player of the peer.
 * @returns {WelcomeMessage} The welcome message.
 */
export function createWelcomeMessage(playerId: number): WelcomeMessage {
  return { type: 'welcome', protocolVersion: PROTOCOL_VERSION, playerId };
}

/**
 * Creates a snapshot message for one peer.
 *
 * @param {number} step - The number of simulation steps the world has
 *   taken.
 * @param {readonly PlayerState[]} players - Every player in the world.
 * @param {InputProgress} own - How far the player of the peer has got with
 *   the inputs of the peer.
 * @returns {SnapshotMessage} The snapshot message.
 */
export function createSnapshotMessage(
  step: number,
  players: readonly PlayerState[],
  own: InputProgress,
): SnapshotMessage {
  return { type: 'snapshot', step, players, own };
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
 * @returns {InteractMessage} The interact message.
 */
export function createInteractMessage(stamp: InputStamp): InteractMessage {
  return { type: 'interact', sequence: stamp.sequence, after: stamp.after };
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
    return {
      type: 'welcome',
      protocolVersion: value.protocolVersion as number,
      playerId: value.playerId as number,
    };
  }
  if (
    value.type === 'snapshot' &&
    Number.isInteger(value.step) &&
    Array.isArray(value.players) &&
    isInputProgress(value.own)
  ) {
    const players: unknown[] = value.players;
    const { sequence, steps, motion } = value.own;
    if (players.every(isPlayerState)) {
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
            slashSteps: motion.slashSteps,
          },
        },
      };
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
 * @param {string} data - The encoded message.
 * @returns {ClientMessage} The decoded message.
 * @throws {Error} If the data is not a well-formed client message.
 */
export function decodeClientMessage(data: string): ClientMessage {
  const value: Record<string, unknown> = parseObject(data, 'client');
  const { sequence, after } = value;
  if (isCount(sequence) && sequence > 0 && isCount(after)) {
    if (value.type === 'interact') {
      return { type: 'interact', sequence, after };
    }
    if (value.type === 'move' && isGroundVector(value.direction)) {
      const { x, z } = value.direction;
      return { type: 'move', sequence, after, direction: { x, z } };
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
    isCount(value.slashSteps)
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
    Number.isInteger(value.actionCount)
  );
}
