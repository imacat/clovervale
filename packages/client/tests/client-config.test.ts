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
 * @module client/tests/client-config Tests for the settings file of the
 *   client.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLIENT_CONFIG_FILE,
  fetchClientConfig,
  parseClientConfig,
} from '../src/client-config.ts';

describe('parseClientConfig', () => {
  it('reads the address of the game server', () => {
    const text = 'SERVER_URL=wss://play.example.com/ws\n';
    expect(parseClientConfig(text)).toEqual({
      serverUrl: 'wss://play.example.com/ws',
    });
  });

  it('names no game server when the file sets none', () => {
    expect(parseClientConfig('')).toEqual({ serverUrl: null });
    expect(parseClientConfig('SERVER_URL=\n')).toEqual({ serverUrl: null });
  });

  it('skips the comments and the blank lines', () => {
    const text: string = [
      '# The settings of the client',
      '',
      '  # The game server',
      '#SERVER_URL=ws://old.example.com:9000',
      'SERVER_URL=ws://game.example.com:9000  # The new one',
      '',
    ].join('\r\n');
    expect(parseClientConfig(text)).toEqual({
      serverUrl: 'ws://game.example.com:9000',
    });
  });

  it('takes a value with or without quotes and spaces around it', () => {
    for (const line of [
      'SERVER_URL="ws://game.example.com:9000"',
      "SERVER_URL='ws://game.example.com:9000'",
      '  SERVER_URL = ws://game.example.com:9000  ',
    ]) {
      expect(parseClientConfig(line)).toEqual({
        serverUrl: 'ws://game.example.com:9000',
      });
    }
  });

  it('skips the settings it does not know', () => {
    expect(parseClientConfig('COLOUR=green\n')).toEqual({ serverUrl: null });
  });

  it('refuses a file that is not made of settings', () => {
    const page = '<!doctype html>\n<html lang="en"></html>\n';
    expect(() => parseClientConfig(page)).toThrow('line 1');
  });

  it('refuses a game server address that is not a WebSocket URL', () => {
    for (const value of ['play.example.com', 'https://play.example.com/ws']) {
      expect(() => parseClientConfig(`SERVER_URL=${value}\n`)).toThrow(
        'SERVER_URL',
      );
    }
  });
});

describe('fetchClientConfig', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the settings file next to the page', async () => {
    const requested: string[] = [];
    const fetchFile = (url: string): Promise<Response> => {
      requested.push(url);
      return Promise.resolve(new Response('SERVER_URL=wss://example.com/ws'));
    };
    expect(await fetchClientConfig('./', fetchFile)).toEqual({
      serverUrl: 'wss://example.com/ws',
    });
    expect(requested).toEqual([`./${CLIENT_CONFIG_FILE}`]);
  });

  it('does without settings, silently, when there is no file', async () => {
    const fetchFile = (): Promise<Response> =>
      Promise.resolve(new Response('Not Found', { status: 404 }));
    expect(await fetchClientConfig('./', fetchFile)).toEqual({
      serverUrl: null,
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('does without settings when the file cannot be fetched', async () => {
    const fetchFile = (): Promise<Response> =>
      Promise.reject(new TypeError('NetworkError'));
    expect(await fetchClientConfig('./', fetchFile)).toEqual({
      serverUrl: null,
    });
  });

  it('does without settings when the site refuses the file', async () => {
    const fetchFile = (): Promise<Response> =>
      Promise.resolve(new Response('Forbidden', { status: 403 }));
    expect(await fetchClientConfig('./', fetchFile)).toEqual({
      serverUrl: null,
    });
  });

  it('does without settings when the file is malformed', async () => {
    const fetchFile = (): Promise<Response> =>
      Promise.resolve(new Response('<!doctype html>\n<html></html>\n'));
    expect(await fetchClientConfig('./', fetchFile)).toEqual({
      serverUrl: null,
    });
    expect(console.warn).toHaveBeenCalled();
  });
});
