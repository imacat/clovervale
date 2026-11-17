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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module bots/tests/options Tests for the command-line options of the bots
 *   program.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

import { DEFAULT_BOT_COUNT, parseBotsOptions } from '../src/options.ts';

describe('parseBotsOptions', () => {
  it('runs the default number of bots on the local server by default', () => {
    expect(parseBotsOptions([])).toEqual({
      count: DEFAULT_BOT_COUNT,
      serverUrl: `ws://localhost:${String(DEFAULT_SERVER_PORT)}`,
    });
  });

  it('runs as many bots as --count tells', () => {
    expect(parseBotsOptions(['--count', '12']).count).toBe(12);
    expect(parseBotsOptions(['--count=1']).count).toBe(1);
  });

  it('connects to the server of --server', () => {
    expect(
      parseBotsOptions(['--server', 'wss://game.example.com/play']).serverUrl,
    ).toBe('wss://game.example.com/play');
    expect(parseBotsOptions(['--server=ws://[::1]:9001']).serverUrl).toBe(
      'ws://[::1]:9001',
    );
  });

  it('takes both options together', () => {
    expect(
      parseBotsOptions(['--server', 'ws://127.0.0.1:9001', '--count', '2']),
    ).toEqual({ count: 2, serverUrl: 'ws://127.0.0.1:9001' });
  });

  it.each([
    [['--bots', '2']],
    [['-c', '2']],
    [['2']],
    [['--count']],
    [['--count=']],
    [['--count', '0']],
    [['--count', '-1']],
    [['--count', '2.5']],
    [['--count', 'many']],
    [['--count', '0x10']],
    [['--count', '99999999999999999999']],
    [['--server']],
    [['--server=']],
    [['--server', 'localhost:8080']],
    [['--server', 'http://localhost:8080']],
    [['--server', 'game.sock']],
  ])('refuses %j', (args: string[]) => {
    expect(() => parseBotsOptions(args)).toThrow();
  });
});
