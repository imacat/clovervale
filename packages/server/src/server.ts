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
 * @module server/server The WebSocket game server.
 */

import { WebSocketServer } from 'ws';

import { createWelcomeMessage, encodeServerMessage } from '@clovervale/shared';

/** A running game server. */
export interface RunningServer {
  /** The TCP port the server is listening on. */
  readonly port: number;
  /**
   * Stops the server and disconnects every peer.
   *
   * @returns {Promise<void>} A promise settled once the server has stopped.
   */
  stop(): Promise<void>;
}

/**
 * Starts a game server that welcomes every peer that connects.
 *
 * @param {number} port - The TCP port to listen on, or 0 for any free port.
 * @returns {Promise<RunningServer>} The running server.
 */
export function startServer(port: number): Promise<RunningServer> {
  return new Promise((resolve, reject) => {
    const sockets = new WebSocketServer({ port });
    sockets.on('connection', (socket) => {
      socket.send(encodeServerMessage(createWelcomeMessage()));
    });
    sockets.once('error', reject);
    sockets.once('listening', () => {
      const address = sockets.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The server is not listening on a TCP port.'));
        return;
      }
      resolve({
        port: address.port,
        stop: () => stopServer(sockets),
      });
    });
  });
}

/**
 * Stops a WebSocket server and disconnects every peer.
 *
 * @param {WebSocketServer} sockets - The WebSocket server to stop.
 * @returns {Promise<void>} A promise settled once the server has stopped.
 */
function stopServer(sockets: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    for (const socket of sockets.clients) {
      socket.terminate();
    }
    sockets.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
