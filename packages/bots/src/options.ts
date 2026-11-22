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
 * @module bots/options The command-line options and the settings of the
 *   bots program.
 */

import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

/** The setting that tells the number of bots. */
export const COUNT_SETTING = 'BOT_COUNT';

/** The setting that tells the WebSocket URL of the game server. */
export const SERVER_SETTING = 'SERVER_URL';

/** The settings file of the bots program, in its working directory. */
export const SETTINGS_FILE = '.env';

/** How to use the bots program. */
export const USAGE =
  'Usage: bots [--count <number>] [--server <url>]\n' +
  `Settings, in the environment or in the ${SETTINGS_FILE} file of the ` +
  `working directory: ${COUNT_SETTING}, ${SERVER_SETTING}`;

/** The number of bots unless told otherwise. */
export const DEFAULT_BOT_COUNT = 4;

/** The WebSocket URL of the game server unless told otherwise. */
export const DEFAULT_SERVER_URL = `ws://localhost:${String(DEFAULT_SERVER_PORT)}`;

/** What the options and the settings tell the bots program to do. */
export interface BotsOptions {
  /** The number of bots. */
  readonly count: number;
  /** The WebSocket URL of the game server. */
  readonly serverUrl: string;
}

/** The settings of the bots program, as the texts they are set to. */
export interface BotsSettings {
  /** The number of bots. */
  readonly [COUNT_SETTING]?: string;
  /** The WebSocket URL of the game server. */
  readonly [SERVER_SETTING]?: string;
}

/**
 * Reads the settings of the bots program.
 *
 * @param {string} file - The path of the settings file, in .env format.
 *   It need not exist.
 * @param {NodeJS.Dict<string>} env - The environment variables.
 * @returns {BotsSettings} The settings of the environment variables, or
 *   else of the settings file.  A setting that neither has is left out.
 * @throws {Error} If the settings file is there but cannot be read.
 */
export function readBotsSettings(
  file: string,
  env: NodeJS.Dict<string>,
): BotsSettings {
  const saved: NodeJS.Dict<string> = readSettingsFile(file);
  const settings: { -readonly [Name in keyof BotsSettings]: string } = {};
  for (const name of [COUNT_SETTING, SERVER_SETTING] as const) {
    const value: string | undefined = env[name] ?? saved[name];
    if (value !== undefined) {
      settings[name] = value;
    }
  }
  return settings;
}

/**
 * Reads a settings file.
 *
 * @param {string} file - The path of the settings file, in .env format.
 * @returns {NodeJS.Dict<string>} The values in the file, by their names,
 *   or nothing if there is no such file.
 * @throws {Error} If the file is there but cannot be read.
 */
function readSettingsFile(file: string): NodeJS.Dict<string> {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw new Error(`The settings file ${file} cannot be read.`, {
      cause: error,
    });
  }
  return parseEnv(content);
}

/**
 * Parses the command-line arguments and the settings of the bots program.
 *
 * @param {string[]} args - The command-line arguments, without the program
 *   itself.
 * @param {BotsSettings} settings - The settings.
 * @returns {BotsOptions} The number of bots of `--count`, or else of the
 *   `BOT_COUNT` setting, or else the default number, and the server URL of
 *   `--server`, or else of the `SERVER_URL` setting, or else the default
 *   URL.
 * @throws {Error} If an option is unknown, a value is missing or invalid,
 *   there is an argument that is not an option, or a setting that no
 *   option replaces is invalid.
 */
export function parseBotsOptions(
  args: string[],
  settings: BotsSettings = {},
): BotsOptions {
  const { values } = parseArgs({
    args,
    options: { count: { type: 'string' }, server: { type: 'string' } },
  });
  const count: string | undefined = values.count ?? settings[COUNT_SETTING];
  const server: string | undefined = values.server ?? settings[SERVER_SETTING];
  if (count !== undefined && !isCount(count)) {
    const source: string =
      values.count === undefined ? `Setting ${COUNT_SETTING}` : 'Option --count';
    throw new Error(`${source} needs a number from 1, not '${count}'.`);
  }
  if (server !== undefined && !isWebSocketUrl(server)) {
    const source: string =
      values.server === undefined
        ? `Setting ${SERVER_SETTING}`
        : 'Option --server';
    throw new Error(`${source} needs a ws: or wss: URL, not '${server}'.`);
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
