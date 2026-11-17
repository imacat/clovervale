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
 * @module server/tests/options Tests for the command-line options of the
 *   game server program.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

import { parseListenTarget } from '../src/options.ts';

describe('parseListenTarget', () => {
  it('listens on the default port without any options', () => {
    expect(parseListenTarget([])).toBe(DEFAULT_SERVER_PORT);
  });

  it('listens on the port of --port', () => {
    expect(parseListenTarget(['--port', '9001'])).toBe(9001);
    expect(parseListenTarget(['--port=0'])).toBe(0);
  });

  it('listens on the socket file of --socket', () => {
    expect(parseListenTarget(['--socket', '/run/game/game.sock'])).toBe(
      '/run/game/game.sock',
    );
    expect(parseListenTarget(['--socket=game.sock'])).toBe('game.sock');
  });

  it('refuses --socket and --port together', () => {
    expect(() =>
      parseListenTarget(['--socket', 'game.sock', '--port', '9001']),
    ).toThrow('cannot be used together');
  });

  it.each([
    [['--listen', '9001']],
    [['-p', '9001']],
    [['9001']],
    [['--port']],
    [['--socket']],
    [['--socket=']],
    [['--port=']],
    [['--port', 'http']],
    [['--port', '80.5']],
    [['--port', '-1']],
    [['--port', '0x50']],
    [['--port', '65536']],
  ])('refuses %j', (args: string[]) => {
    expect(() => parseListenTarget(args)).toThrow();
  });
});
