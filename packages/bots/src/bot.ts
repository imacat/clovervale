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
 * @module bots/bot A headless peer of the game server.
 */

import { decodeServerMessage } from '@clovervale/shared';
import type { ServerMessage } from '@clovervale/shared';

/**
 * Runs a bot that connects to a server, waits to be welcomed and leaves.
 *
 * @param {string} url - The WebSocket URL of the server.
 * @returns {Promise<ServerMessage>} The welcome message from the server.
 */
export function runBot(url: string): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('message', (event) => {
      try {
        resolve(decodeServerMessage(String(event.data)));
      } catch (error) {
        reject(new Error(`The server at ${url} misbehaved.`, { cause: error }));
      }
      socket.close();
    });
    socket.addEventListener('error', () => {
      reject(new Error(`The connection to the server at ${url} failed.`));
    });
    socket.addEventListener('close', () => {
      reject(new Error(`The server at ${url} left without a welcome.`));
    });
  });
}
