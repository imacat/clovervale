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
 * @module bots/main The entry point of the bots program.
 */

import { startBot } from './bot.ts';
import type { RunningBot } from './bot.ts';
import {
  SETTINGS_FILE,
  USAGE,
  parseBotsOptions,
  readBotsSettings,
} from './options.ts';
import type { BotsOptions } from './options.ts';

/**
 * Runs the bots until the program is asked to stop.
 *
 * As many bots as the `--count` option tells, or else the `BOT_COUNT`
 * setting, or else the default number, connect one after another to the
 * server of the `--server` option, or else of the `SERVER_URL` setting, or
 * else to the default server, and patrol the village.  A setting is an
 * environment variable, or else a line of the `.env` file in the working
 * directory, if there is one.  The bots leave on SIGTERM and SIGINT.  A
 * bot the server disconnects says so, and makes the program fail once
 * every bot has left.  When the options or the settings are wrong, the
 * program says why and how to use it, and fails without connecting.  When
 * a bot cannot connect, the program says why, and fails, the bots that did
 * connect leaving at once.
 *
 * @param {string[]} args - The command-line arguments, without the program
 *   itself.
 * @returns {Promise<void>} A promise settled once every bot has connected,
 *   or one could not.
 */
async function runBots(args: string[]): Promise<void> {
  let options: BotsOptions;
  try {
    options = parseBotsOptions(
      args,
      readBotsSettings(SETTINGS_FILE, process.env),
    );
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const { count, serverUrl } = options;
  const bots: RunningBot[] = [];
  const stopping = new AbortController();
  const stop = (): void => {
    stopping.abort();
    for (const bot of bots) {
      bot.stop();
    }
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    for (let index = 0; index < count; index++) {
      const bot: RunningBot = await startBot(serverUrl);
      bots.push(bot);
      bot.finished.catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
      if (stopping.signal.aborted) {
        bot.stop();
        break;
      }
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    stop();
    return;
  }
  if (!stopping.signal.aborted) {
    const ids: string = bots
      .map((bot: RunningBot) => `#${String(bot.playerId)}`)
      .join(', ');
    console.log(
      `Clovervale bots patrolling on ${serverUrl} as players ${ids}.`,
    );
  }
}

runBots(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
