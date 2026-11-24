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
 * @module bots/tests/options Tests for the command-line options and the
 *   settings of the bots program.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

import {
  DEFAULT_BOT_COUNT,
  parseBotsOptions,
  readBotsSettings,
} from '../src/options.ts';

describe('parseBotsOptions', () => {
  it('runs the default number of bots on the local server by default', () => {
    expect(parseBotsOptions([], {})).toEqual({
      count: DEFAULT_BOT_COUNT,
      serverUrl: `ws://localhost:${String(DEFAULT_SERVER_PORT)}`,
    });
  });

  it('runs as many bots as --count tells', () => {
    expect(parseBotsOptions(['--count', '12'], {}).count).toBe(12);
    expect(parseBotsOptions(['--count=1'], {}).count).toBe(1);
  });

  it('connects to the server of --server', () => {
    expect(
      parseBotsOptions(['--server', 'wss://game.example.com/play'], {})
        .serverUrl,
    ).toBe('wss://game.example.com/play');
    expect(parseBotsOptions(['--server=ws://[::1]:9001'], {}).serverUrl).toBe(
      'ws://[::1]:9001',
    );
  });

  it('connects to the server on the Unix socket file of --server', () => {
    expect(
      parseBotsOptions(
        ['--server', 'ws+unix:/run/clovervale/clovervale.sock'],
        {},
      ).serverUrl,
    ).toBe('ws+unix:/run/clovervale/clovervale.sock');
  });

  it('takes both options together', () => {
    expect(
      parseBotsOptions(
        ['--server', 'ws://127.0.0.1:9001', '--count', '2'],
        {},
      ),
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
    [['--server', 'ws+unix:']],
    [['--server', 'unix:/run/clovervale/clovervale.sock']],
  ])('refuses %j', (args: string[]) => {
    expect(() => parseBotsOptions(args, {})).toThrow();
  });

  it('runs as many bots as the BOT_COUNT setting tells', () => {
    expect(parseBotsOptions([], { BOT_COUNT: '7' })).toEqual({
      count: 7,
      serverUrl: `ws://localhost:${String(DEFAULT_SERVER_PORT)}`,
    });
  });

  it('connects to the server of the SERVER_URL setting', () => {
    expect(
      parseBotsOptions([], { SERVER_URL: 'wss://game.example.com/ws' }),
    ).toEqual({
      count: DEFAULT_BOT_COUNT,
      serverUrl: 'wss://game.example.com/ws',
    });
    expect(
      parseBotsOptions([], {
        SERVER_URL: 'ws+unix:/run/clovervale/clovervale.sock',
      }).serverUrl,
    ).toBe('ws+unix:/run/clovervale/clovervale.sock');
  });

  it('puts the options before the settings', () => {
    expect(
      parseBotsOptions(['--count', '2', '--server', 'ws://127.0.0.1:9001'], {
        BOT_COUNT: '7',
        SERVER_URL: 'wss://game.example.com/ws',
      }),
    ).toEqual({ count: 2, serverUrl: 'ws://127.0.0.1:9001' });
    expect(
      parseBotsOptions(['--count', '2'], {
        BOT_COUNT: 'many',
        SERVER_URL: 'wss://game.example.com/ws',
      }),
    ).toEqual({ count: 2, serverUrl: 'wss://game.example.com/ws' });
  });

  it.each([
    ['BOT_COUNT', ''],
    ['BOT_COUNT', '0'],
    ['BOT_COUNT', '-1'],
    ['BOT_COUNT', '2.5'],
    ['BOT_COUNT', 'many'],
    ['SERVER_URL', ''],
    ['SERVER_URL', 'localhost:8080'],
    ['SERVER_URL', 'https://game.example.com/ws'],
    ['SERVER_URL', 'ws+unix:'],
  ])('refuses the setting %s=%s, and names it', (name: string, value: string) => {
    expect(() => parseBotsOptions([], { [name]: value })).toThrow(name);
  });

  it('names the option when its value is wrong', () => {
    expect(() =>
      parseBotsOptions(['--count', 'many'], { BOT_COUNT: '7' }),
    ).toThrow('--count');
    expect(() =>
      parseBotsOptions(['--server', 'game.sock'], {
        SERVER_URL: 'wss://game.example.com/ws',
      }),
    ).toThrow('--server');
  });
});

describe('readBotsSettings', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'clovervale-bots-'));
    file = path.join(dir, '.env');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('has no settings when there is no file and no variable', () => {
    expect(readBotsSettings(file, {})).toEqual({});
  });

  it('reads the settings of the file', () => {
    writeFileSync(
      file,
      '# The bots.\nSERVER_URL=wss://game.example.com/ws\nBOT_COUNT=7\n',
    );
    expect(readBotsSettings(file, {})).toEqual({
      BOT_COUNT: '7',
      SERVER_URL: 'wss://game.example.com/ws',
    });
  });

  it('reads the settings of the environment variables', () => {
    expect(
      readBotsSettings(file, { BOT_COUNT: '3', HOME: '/home/player' }),
    ).toEqual({ BOT_COUNT: '3' });
  });

  it('puts the environment variables before the file', () => {
    writeFileSync(file, 'SERVER_URL=wss://game.example.com/ws\nBOT_COUNT=7\n');
    expect(readBotsSettings(file, { BOT_COUNT: '3' })).toEqual({
      BOT_COUNT: '3',
      SERVER_URL: 'wss://game.example.com/ws',
    });
  });

  it('refuses a file that cannot be read', () => {
    expect(() => readBotsSettings(dir, {})).toThrow(dir);
  });
});
