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
 * @module server/main The entry point of the game server program.
 */

import type { DayCycle } from '@clovervale/shared';

import { parseDayCycle, parseListenTarget, USAGE } from './options.ts';
import { startServer } from './server.ts';
import type { RunningServer } from './server.ts';

/**
 * Runs the game server until the program is asked to stop.
 *
 * The server listens on the Unix socket file of the `--socket` option, or
 * else on the TCP port of the `--port` option, or else on the default port,
 * and stops on SIGTERM and SIGINT.  Its day lasts as many minutes as the
 * `--day-length` option tells, or the default length, and starts at the
 * default time of day, unless the `--hold-time` option holds the clock of
 * the world at a fixed time of day.  When the options are wrong, the program
 * says why and how to use it, and fails without listening.
 *
 * @param {string[]} args - The command-line arguments, without the program
 *   itself.
 * @returns {Promise<void>} A promise settled once the server is listening.
 */
async function runServer(args: string[]): Promise<void> {
  let target: number | string;
  let day: DayCycle;
  try {
    target = parseListenTarget(args);
    day = parseDayCycle(args);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const server: RunningServer = await startServer(target, day);
  const stop = (): void => {
    server.stop().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  // Be ready to stop before saying so, as a signal may follow at once.
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const place: string =
    server.socketPath === null
      ? `port ${String(server.port)}`
      : `socket ${server.socketPath}`;
  console.log(`Clovervale server listening on ${place}.`);
}

try {
  await runServer(process.argv.slice(2));
} catch (error: unknown) {
  console.error(error);
  process.exitCode = 1;
}
