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

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

/** How to use the game server program. */
export const USAGE = 'Usage: server [--socket <path> | --port <number>]';

/** The largest TCP port number. */
const MAX_PORT = 65535;

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
  const { values } = parseArgs({
    args,
    options: { socket: { type: 'string' }, port: { type: 'string' } },
  });
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
