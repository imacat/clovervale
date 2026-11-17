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
 * @module bots/tests/bot Tests for the bot.
 */

import { describe, expect, it } from 'vitest';

import { startServer } from '@clovervale/server';
import { PROTOCOL_VERSION } from '@clovervale/shared';

import { runBot } from '../src/bot.ts';

describe('runBot', () => {
  it('returns the welcome message from a running server', async () => {
    const server = await startServer(0);
    try {
      const url = `ws://localhost:${String(server.port)}`;
      await expect(runBot(url)).resolves.toMatchObject({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
      });
    } finally {
      await server.stop();
    }
  });

  it('fails when no server is listening', async () => {
    const server = await startServer(0);
    const url = `ws://localhost:${String(server.port)}`;
    await server.stop();
    await expect(runBot(url)).rejects.toThrow();
  });
});
