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
 * @module server/options The command-line options of the game server
 *   program.
 */

import { parseArgs } from 'node:util';

import {
  DEFAULT_DAY_LENGTH,
  DEFAULT_DAY_ORIGIN,
  DEFAULT_SERVER_PORT,
} from '@clovervale/shared';
import type { DayCycle } from '@clovervale/shared';

/** How to use the game server program. */
export const USAGE =
  'Usage: server [--socket <path> | --port <number>] ' +
  '[--day-length <minutes> | --hold-time <hh:mm>]';

/** The largest TCP port number. */
const MAX_PORT = 65535;

/** The options of the game server program. */
const OPTIONS = {
  socket: { type: 'string' },
  port: { type: 'string' },
  'day-length': { type: 'string' },
  'hold-time': { type: 'string' },
} as const;

/** A number of minutes, whole or with a fraction. */
const MINUTES_PATTERN = /^\d+(?:\.\d+)?$/;

/** A time on a 24-hour clock, in hours and minutes. */
const CLOCK_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Parses where the command-line arguments tell the game server to listen.
 *
 * @param {string[]} args - The command-line arguments, without the program
 *   itself.
 * @returns {number | string} The Unix socket file of `--socket`, or else
 *   the TCP port of `--port`, or else the default port.
 * @throws {Error} If both options are given, an option is unknown, a value
 *   is missing or invalid, or there is an argument that is not an option.
 */
export function parseListenTarget(args: string[]): number | string {
  const { values } = parseArgs({ args, options: OPTIONS });
  const { socket, port } = values;
  if (socket !== undefined && port !== undefined) {
    throw new Error('Options --socket and --port cannot be used together.');
  }
  if (socket !== undefined) {
    if (socket === '') {
      throw new Error('Option --socket needs the path of a socket file.');
    }
    return socket;
  }
  if (port === undefined) {
    return DEFAULT_SERVER_PORT;
  }
  if (!/^\d+$/.test(port) || Number(port) > MAX_PORT) {
    throw new Error(
      `Option --port needs a number from 0 to ${String(MAX_PORT)}, ` +
        `not '${port}'.`,
    );
  }
  return Number(port);
}

/**
 * Parses how the command-line arguments tell the game server to run the
 * day.
 *
 * @param {string[]} args - The command-line arguments, without the program
 *   itself.
 * @returns {DayCycle} A day that starts at the default time of day and
 *   lasts as many minutes as `--day-length` tells, or the default length;
 *   or else a clock held at the time of day of `--hold-time`, given on a
 *   24-hour clock.
 * @throws {Error} If both options are given, an option is unknown, a value
 *   is missing or invalid, or there is an argument that is not an option.
 */
export function parseDayCycle(args: string[]): DayCycle {
  const { values } = parseArgs({ args, options: OPTIONS });
  const { 'day-length': minutes, 'hold-time': heldTime } = values;
  if (minutes !== undefined && heldTime !== undefined) {
    throw new Error(
      'Options --day-length and --hold-time cannot be used together.',
    );
  }
  if (heldTime !== undefined) {
    const match: RegExpExecArray | null = CLOCK_PATTERN.exec(heldTime);
    if (match === null) {
      throw new Error(
        `Option --hold-time needs a time from 00:00 to 23:59, ` +
          `not '${heldTime}'.`,
      );
    }
    const [, hours = '0', clockMinutes = '0'] = match;
    return {
      origin: (Number(hours) * 60 + Number(clockMinutes)) / (24 * 60),
      length: null,
    };
  }
  if (minutes === undefined) {
    return { origin: DEFAULT_DAY_ORIGIN, length: DEFAULT_DAY_LENGTH };
  }
  if (!MINUTES_PATTERN.test(minutes) || Number(minutes) === 0) {
    throw new Error(
      `Option --day-length needs a number of minutes above 0, ` +
        `not '${minutes}'.`,
    );
  }
  const length: number = Number(minutes) * 60_000;
  if (!Number.isFinite(length)) {
    throw new Error(
      `Option --day-length needs a smaller number of minutes, ` +
        `not '${minutes}'.`,
    );
  }
  return { origin: DEFAULT_DAY_ORIGIN, length };
}
