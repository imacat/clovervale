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
 * @module server/tests/server Tests for the game server.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, decodeServerMessage } from '@clovervale/shared';

import { startServer } from '../src/server.ts';
import type { RunningServer } from '../src/server.ts';

/**
 * Connects to a server and waits for the first message it sends.
 *
 * @param {number} port - The TCP port the server is listening on.
 * @returns {Promise<string>} The first message from the server.
 */
function receiveFirstMessage(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${String(port)}`);
    socket.addEventListener('message', (event) => {
      resolve(String(event.data));
      socket.close();
    });
    socket.addEventListener('error', () => {
      reject(new Error('The connection failed.'));
    });
  });
}

describe('the game server', () => {
  let server: RunningServer | undefined;

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  it('welcomes a peer with its protocol version', async () => {
    server = await startServer(0);
    const data = await receiveFirstMessage(server.port);
    expect(decodeServerMessage(data)).toEqual({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
    });
  });
});
