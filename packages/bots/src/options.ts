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
 * @module bots/options The command-line options of the bots program.
 */

import { parseArgs } from 'node:util';

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

/** How to use the bots program. */
export const USAGE = 'Usage: bots [--count <number>] [--server <url>]';

/** The number of bots unless told otherwise. */
export const DEFAULT_BOT_COUNT = 4;

/** The WebSocket URL of the game server unless told otherwise. */
export const DEFAULT_SERVER_URL = `ws://localhost:${String(DEFAULT_SERVER_PORT)}`;

/** What the command-line arguments tell the bots program to do. */
export interface BotsOptions {
  /** The number of bots. */
  readonly count: number;
  /** The WebSocket URL of the game server. */
  readonly serverUrl: string;
}

/**
 * Parses the command-line arguments of the bots program.
 *
 * @param {string[]} args - The command-line arguments, without the program
 *   itself.
 * @returns {BotsOptions} The number of bots of `--count`, or else the
 *   default number, and the server URL of `--server`, or else the default
 *   URL.
 * @throws {Error} If an option is unknown, a value is missing or invalid,
 *   or there is an argument that is not an option.
 */
export function parseBotsOptions(args: string[]): BotsOptions {
  const { values } = parseArgs({
    args,
    options: { count: { type: 'string' }, server: { type: 'string' } },
  });
  const { count, server } = values;
  if (count !== undefined && !isCount(count)) {
    throw new Error(`Option --count needs a number from 1, not '${count}'.`);
  }
  if (server !== undefined && !isWebSocketUrl(server)) {
    throw new Error(
      `Option --server needs a ws: or wss: URL, not '${server}'.`,
    );
  }
  return {
    count: count === undefined ? DEFAULT_BOT_COUNT : Number(count),
    serverUrl: server ?? DEFAULT_SERVER_URL,
  };
}

/**
 * Tells whether a text is a number of bots.
 *
 * @param {string} text - The text.
 * @returns {boolean} Whether it is a whole number from 1, in decimal digits.
 */
function isCount(text: string): boolean {
  return (
    /^\d+$/.test(text) &&
    Number.isSafeInteger(Number(text)) &&
    Number(text) >= 1
  );
}

/**
 * Tells whether a text is a WebSocket URL.
 *
 * @param {string} text - The text.
 * @returns {boolean} Whether it is an absolute ws: or wss: URL.
 */
function isWebSocketUrl(text: string): boolean {
  const url: URL | null = URL.parse(text);
  return url !== null && (url.protocol === 'ws:' || url.protocol === 'wss:');
}
