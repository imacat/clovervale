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
 * @module bots/bot A headless peer of the game server, whose player
 *   patrols the village, and says something there now and then.
 */

import { WebSocket } from 'ws';

import {
  PLAYER_HEALTH,
  PROTOCOL_VERSION,
  decodeServerMessage,
  encodeClientMessage,
} from '@clovervale/shared';
import type {
  ClientMessage,
  PlayerState,
  ServerMessage,
} from '@clovervale/shared';

import { DEFAULT_PATROL, Patroller } from './patroller.ts';
import type { PatrolSettings } from './patroller.ts';

/** A bot connected to a game server. */
export interface RunningBot {
  /** The identifier of the player of the bot. */
  readonly playerId: number;
  /**
   * Settles once the bot has left the server: fulfilled if it was stopped,
   * or rejected if the server disconnected it or misbehaved.
   */
  readonly finished: Promise<void>;
  /** Stops the bot, which leaves the server. */
  stop(): void;
}

/**
 * Starts a bot that connects to a game server as a player, and patrols
 * forever, as a {@link Patroller} has it.
 *
 * @param {string} url - The WebSocket URL of the server, or its Unix
 *   socket file as a ws+unix: URL, as in `ws+unix:/run/game.sock`.
 * @param {PatrolSettings} [patrol] - How the bot patrols, or between the
 *   points of interest of the village by default.
 * @returns {Promise<RunningBot>} The bot, once the server has welcomed it.
 * @throws {Error} If the bot cannot connect, or the server leaves, speaks
 *   another protocol version or misbehaves before it welcomes the bot.
 */
export function startBot(
  url: string,
  patrol: PatrolSettings = DEFAULT_PATROL,
): Promise<RunningBot> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let playerId: number | null = null;
    let isStopping = false;
    const finished: PromiseWithResolvers<void> = Promise.withResolvers();
    // Whoever does not wait for the bot to finish need not hear of it.
    finished.promise.catch(() => undefined);
    const fail = (error: Error): void => {
      reject(error);
      finished.reject(error);
    };
    const patroller = new Patroller(patrol, (message: ClientMessage) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encodeClientMessage(message));
      }
    });

    socket.addEventListener('message', (event) => {
      let message: ServerMessage;
      try {
        // The server speaks in text, never in binary messages.
        if (typeof event.data !== 'string') {
          throw new TypeError('The message is not text.');
        }
        message = decodeServerMessage(event.data);
      } catch (error: unknown) {
        fail(new Error(`The server at ${url} misbehaved.`, { cause: error }));
        socket.close();
        return;
      }
      if (message.type === 'snapshot') {
        if (playerId !== null && !isStopping) {
          const own: PlayerState | undefined = message.players.find(
            (player: PlayerState) => player.id === playerId,
          );
          patroller.observe(
            message.own,
            own?.health ?? PLAYER_HEALTH,
            message.step,
            performance.now(),
          );
        }
        return;
      }
      // A bot does not fight, and learns its health from the snapshots, so
      // what happens does not concern it.  Nor does it ever go into another
      // map, so it is never told of one, nor talk to a villager, nor heed
      // what the players nearby say.
      if (
        message.type === 'events' ||
        message.type === 'map' ||
        message.type === 'speech' ||
        message.type === 'said' ||
        message.type === 'phrased'
      ) {
        return;
      }
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        const version = String(message.protocolVersion);
        fail(new Error(`The server at ${url} speaks protocol ${version}.`));
        socket.close();
        return;
      }
      playerId = message.playerId;
      resolve({
        playerId,
        finished: finished.promise,
        stop: () => {
          isStopping = true;
          socket.close();
        },
      });
    });
    socket.addEventListener('error', () => {
      if (playerId === null) {
        fail(new Error(`The connection to the server at ${url} failed.`));
      }
    });
    socket.addEventListener('close', () => {
      patroller.halt();
      if (playerId === null) {
        fail(new Error(`The server at ${url} left without a welcome.`));
      } else if (isStopping) {
        finished.resolve();
      } else {
        fail(new Error(`The server at ${url} disconnected the bot.`));
      }
    });
  });
}
