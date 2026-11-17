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

/** The version of the wire protocol.  Peers must agree on it to talk. */
export const PROTOCOL_VERSION = 1;

/** The TCP port the server listens on unless told otherwise. */
export const DEFAULT_SERVER_PORT = 8080;

/** The first message the server sends to every newly connected peer. */
export interface WelcomeMessage {
  /** The message discriminator. */
  readonly type: 'welcome';
  /** The protocol version the server speaks. */
  readonly protocolVersion: number;
}

/** Any message the server can send to a peer. */
export type ServerMessage = WelcomeMessage;

/**
 * Creates the welcome message for the current protocol version.
 *
 * @returns {WelcomeMessage} The welcome message.
 */
export function createWelcomeMessage(): WelcomeMessage {
  return { type: 'welcome', protocolVersion: PROTOCOL_VERSION };
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
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    throw new Error('The server message is not valid JSON.');
  }
  if (!isWelcomeMessage(value)) {
    throw new Error('The server message is malformed.');
  }
  return { type: value.type, protocolVersion: value.protocolVersion };
}

/**
 * Checks whether a decoded value is a welcome message.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a welcome message.
 */
function isWelcomeMessage(value: unknown): value is WelcomeMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === 'welcome' &&
    Number.isInteger(candidate.protocolVersion)
  );
}
