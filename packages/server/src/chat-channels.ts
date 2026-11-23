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
 * @module server/chat-channels The ways a player says something to the
 *   players nearby: a line it typed, and a phrase it picked, each with how
 *   it is heard from its peer and how the players who hear it are told.
 */

import { createPhrasedMessage, createSaidMessage } from '@clovervale/shared';
import type {
  ClientMessage,
  PhraseMessage,
  SayMessage,
  ServerMessage,
} from '@clovervale/shared';

import type { SaidLine, SaidPhrase, Saying } from './player.ts';
import type { World } from './world.ts';

/** A message a peer sends to have its player say something nearby. */
export type ChatMessage = SayMessage | PhraseMessage;

/** The name of a channel, which is that of the message a peer sends on it. */
type ChatKind = ChatMessage['type'];

/** The message a peer sends on a channel. */
type ChatMessageOf<K extends ChatKind> = Extract<ChatMessage, { type: K }>;

/** What is said on a channel. */
type SayingOf<K extends ChatKind> = Extract<Saying, { kind: K }>;

/** How something is said on a channel. */
interface ChatChannel<K extends ChatKind> {
  /**
   * Has a player say what its peer sent on the channel, in the world the
   * player is in.
   *
   * @param {World} world - The world the player is in.
   * @param {number} id - The identifier of the player.
   * @param {ChatMessageOf<K>} message - What its peer sent.
   */
  readonly hear: (world: World, id: number, message: ChatMessageOf<K>) => void;
  /**
   * Builds the message that tells a player who hears it what was said on
   * the channel.
   *
   * @param {SayingOf<K>} saying - What was said.
   * @returns {ServerMessage} The message.
   */
  readonly tell: (saying: SayingOf<K>) => ServerMessage;
}

/** How something is said on each channel. */
const CHAT_CHANNELS: { readonly [K in ChatKind]: ChatChannel<K> } = {
  say: {
    hear: (world: World, id: number, { text }: SayMessage): void => {
      world.say(id, text);
    },
    tell: ({ player, text }: SaidLine): ServerMessage =>
      createSaidMessage(player, text),
  },
  phrase: {
    hear: (world: World, id: number, { code }: PhraseMessage): void => {
      world.sayPhrase(id, code);
    },
    tell: ({ player, phrase }: SaidPhrase): ServerMessage =>
      createPhrasedMessage(player, phrase),
  },
};

/**
 * Tells whether a message from a peer has its player say something nearby.
 *
 * @param {ClientMessage} message - The message.
 * @returns {boolean} Whether it does.
 */
export function isChatMessage(message: ClientMessage): message is ChatMessage {
  return Object.hasOwn(CHAT_CHANNELS, message.type);
}

/**
 * Has a player say what its peer sent, in the world the player is in, as
 * the channel of the message has it: a line as {@link World.say} tells,
 * and a phrase as {@link World.sayPhrase} tells.
 *
 * @param {World} world - The world the player is in.
 * @param {number} id - The identifier of the player.
 * @param {ChatMessage} message - What its peer sent.
 */
export function hearChat(world: World, id: number, message: ChatMessage): void {
  hearOnChannel(message.type, world, id, message);
}

/**
 * Builds the message that tells a player who hears it what was said, as
 * the channel it was said on has it.
 *
 * @param {Saying} saying - What was said.
 * @returns {ServerMessage} The message.
 */
export function tellSaying(saying: Saying): ServerMessage {
  return tellOnChannel(saying.kind, saying);
}

/**
 * Has a player say what its peer sent on a channel.
 *
 * @param {K} kind - The channel.
 * @param {World} world - The world the player is in.
 * @param {number} id - The identifier of the player.
 * @param {ChatMessageOf<K>} message - What its peer sent.
 * @template K
 */
function hearOnChannel<K extends ChatKind>(
  kind: K,
  world: World,
  id: number,
  message: ChatMessageOf<K>,
): void {
  CHAT_CHANNELS[kind].hear(world, id, message);
}

/**
 * Builds the message that tells what was said on a channel.
 *
 * @param {K} kind - The channel.
 * @param {SayingOf<K>} saying - What was said.
 * @returns {ServerMessage} The message.
 * @template K
 */
function tellOnChannel<K extends ChatKind>(
  kind: K,
  saying: SayingOf<K>,
): ServerMessage {
  return CHAT_CHANNELS[kind].tell(saying);
}
