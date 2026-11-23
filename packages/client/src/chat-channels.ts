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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/chat-channels The ways the page hears what a player
 *   nearby says: a line it typed, and a phrase it picked, and what the
 *   bubble of the player shows of each.
 */

import type {
  PhrasedMessage,
  SaidMessage,
  ServerMessage,
} from '@clovervale/shared';

import type { PlainMessageId } from './messages/en.ts';

/** A message that tells the page what a player nearby says. */
export type HeardMessage = SaidMessage | PhrasedMessage;

/** The type of a message that tells what a player nearby says. */
type HeardType = HeardMessage['type'];

/** The message of a type that tells what a player nearby says. */
type HeardMessageOf<T extends HeardType> = Extract<HeardMessage, { type: T }>;

/** What a player says, as its bubble is to show it. */
export interface PlayerSaying {
  /** The identifier of the player who speaks. */
  readonly player: number;
  /** What the player typed, shown as plain text, or `''` for a phrase. */
  readonly line: string;
  /**
   * The message of the phrase the player says, shown in the language of
   * the page, or `null` for a line it typed.
   */
  readonly lineId: PlainMessageId | null;
}

/** How what a player says is read from the message of each channel. */
const CHAT_CHANNELS: {
  readonly [T in HeardType]: (message: HeardMessageOf<T>) => PlayerSaying;
} = {
  said: ({ player, text }: SaidMessage): PlayerSaying => ({
    player,
    line: text,
    lineId: null,
  }),
  phrased: ({ player, code }: PhrasedMessage): PlayerSaying => ({
    player,
    line: '',
    lineId: `phrase.${code}`,
  }),
};

/**
 * Tells whether a message from the server tells what a player nearby says.
 *
 * @param {ServerMessage} message - The message.
 * @returns {boolean} Whether it does.
 */
export function isHeardMessage(
  message: ServerMessage,
): message is HeardMessage {
  return Object.hasOwn(CHAT_CHANNELS, message.type);
}

/**
 * Reads what a player nearby says from the message that tells it.
 *
 * @param {HeardMessage} message - The message.
 * @returns {PlayerSaying} What the player says, as its bubble is to show
 *   it.
 */
export function readSaying(message: HeardMessage): PlayerSaying {
  return readOnChannel(message.type, message);
}

/**
 * Reads what a player nearby says from the message of a channel.
 *
 * @param {T} type - The type of the message.
 * @param {HeardMessageOf<T>} message - The message.
 * @returns {PlayerSaying} What the player says.
 * @template T
 */
function readOnChannel<T extends HeardType>(
  type: T,
  message: HeardMessageOf<T>,
): PlayerSaying {
  return CHAT_CHANNELS[type](message);
}
