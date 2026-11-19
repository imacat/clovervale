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

import {
  DEFAULT_DAY_LENGTH,
  DEFAULT_DAY_ORIGIN,
  DEFAULT_SERVER_PORT,
} from '@clovervale/shared';

import { parseDayCycle, parseListenTarget } from '../src/options.ts';

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

  it('listens where told alongside the day options', () => {
    expect(
      parseListenTarget(['--port', '9001', '--day-length', '5']),
    ).toBe(9001);
    expect(parseListenTarget(['--hold-time', '12:00'])).toBe(
      DEFAULT_SERVER_PORT,
    );
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

describe('parseDayCycle', () => {
  it('runs the default day from the default time without any options', () => {
    expect(parseDayCycle([])).toEqual({
      origin: DEFAULT_DAY_ORIGIN,
      length: DEFAULT_DAY_LENGTH,
    });
  });

  it('makes a day last as many minutes as --day-length tells', () => {
    expect(parseDayCycle(['--day-length', '30'])).toEqual({
      origin: DEFAULT_DAY_ORIGIN,
      length: 30 * 60_000,
    });
    expect(parseDayCycle(['--day-length=0.5']).length).toBe(30_000);
  });

  it('holds the clock at the time of --hold-time', () => {
    expect(parseDayCycle(['--hold-time', '12:00'])).toEqual({
      origin: 0.5,
      length: null,
    });
    expect(parseDayCycle(['--hold-time=6:30']).origin).toBeCloseTo(
      6.5 / 24,
      12,
    );
    expect(parseDayCycle(['--hold-time', '00:00']).origin).toBe(0);
    expect(parseDayCycle(['--hold-time', '23:59']).origin).toBeLessThan(1);
  });

  it('runs the day wherever the server listens', () => {
    expect(
      parseDayCycle(['--socket', 'game.sock', '--day-length', '2']).length,
    ).toBe(120_000);
  });

  it('refuses --day-length and --hold-time together', () => {
    expect(() =>
      parseDayCycle(['--day-length', '5', '--hold-time', '12:00']),
    ).toThrow('cannot be used together');
  });

  it.each([
    [['--day-length']],
    [['--day-length=']],
    [['--day-length', '0']],
    [['--day-length', '-5']],
    [['--day-length', 'long']],
    [['--day-length', '1e3']],
    [['--day-length', 'Infinity']],
    [['--day-length', '9'.repeat(400)]],
    [['--day-length', `1${'0'.repeat(305)}`]],
    [['--day-length', `0.${'0'.repeat(400)}1`]],
    [['--hold-time']],
    [['--hold-time=']],
    [['--hold-time', 'noon']],
    [['--hold-time', '12']],
    [['--hold-time', '1200']],
    [['--hold-time', '24:00']],
    [['--hold-time', '12:60']],
    [['--hold-time', '12:5']],
    [['--hold-time', '-1:00']],
    [['--dawn']],
  ])('refuses %j', (args: string[]) => {
    expect(() => parseDayCycle(args)).toThrow();
  });
});
