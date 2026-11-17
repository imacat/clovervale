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
 * @module client/tests/server-url Tests for finding the game server.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

import { resolveServerUrl } from '../src/server-url.ts';

describe('resolveServerUrl', () => {
  it('defaults to the default port of the host serving the page', () => {
    const pageUrl = new URL('http://play.example.com:5173/index.html');
    expect(resolveServerUrl(pageUrl)).toBe(
      `ws://play.example.com:${String(DEFAULT_SERVER_PORT)}`,
    );
  });

  it('uses a secure WebSocket for a page served over HTTPS', () => {
    const pageUrl = new URL('https://play.example.com/');
    expect(resolveServerUrl(pageUrl)).toBe(
      `wss://play.example.com:${String(DEFAULT_SERVER_PORT)}`,
    );
  });

  it('prefers the server named in the page address', () => {
    const pageUrl = new URL(
      'http://localhost:5173/?server=ws://game.example.com:9000',
    );
    expect(resolveServerUrl(pageUrl)).toBe('ws://game.example.com:9000');
  });
});
