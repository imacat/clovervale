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
 * @module client/client-config The settings file a site may put next to
 *   the page.
 */

/** The name of the settings file, in the directory of the page. */
export const CLIENT_CONFIG_FILE = 'client.conf';

/** The settings of the client on a site. */
export interface ClientConfig {
  /** The WebSocket URL of the game server, or `null` if none is set. */
  readonly serverUrl: string | null;
}

/** Fetches a file, as `fetch` does. */
export type FileFetcher = (url: string, init: RequestInit) => Promise<Response>;

/** The settings of a site that sets nothing. */
const NO_CONFIG: ClientConfig = { serverUrl: null };

/** A line that sets a setting: its name and its value. */
const SETTING_PATTERN = /^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/;

/**
 * Reads the value of a setting as it is written in a settings file.
 *
 * @param {string} written - What follows the equals sign, trimmed.
 * @returns {string} The value, without its quotes or the comment after it.
 */
function readValue(written: string): string {
  const quoted: RegExpExecArray | null = /^(["'])(.*)\1(\s+#.*)?$/.exec(
    written,
  );
  if (quoted !== null) {
    return quoted[2] ?? '';
  }
  return written.replace(/(^|\s+)#.*$/, '');
}

/**
 * Parses the text of a settings file.
 *
 * The file holds `NAME=value` lines, and comments that start with `#`.
 * `SERVER_URL` is the WebSocket URL of the game server.  The settings the
 * client does not know are skipped.
 *
 * @param {string} text - The text of the file.
 * @returns {ClientConfig} The settings.
 * @throws {Error} If a line is neither a setting nor a comment, or the
 *   game server is not a `ws:` or `wss:` URL.
 */
export function parseClientConfig(text: string): ClientConfig {
  let serverUrl: string | null = null;
  const lines: string[] = text.split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line: string = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const setting: RegExpExecArray | null = SETTING_PATTERN.exec(line);
    if (setting === null) {
      throw new Error(`line ${String(index + 1)} is not a setting`);
    }
    if (setting[1] !== 'SERVER_URL') {
      continue;
    }
    const value: string = readValue(setting[2] ?? '');
    if (value !== '' && !/^wss?:\/\/\S+$/.test(value)) {
      throw new Error('SERVER_URL is not a ws: or wss: URL');
    }
    serverUrl = value === '' ? null : value;
  }
  return { serverUrl };
}

/**
 * Fetches the settings of the site the page is on.
 *
 * A site need not have a settings file.  A settings file that cannot be
 * fetched or is malformed sets nothing, which is told in the console.
 *
 * @param {string} baseUrl - The URL of the directory of the page, ending
 *   with a slash.
 * @param {FileFetcher} fetchFile - Fetches the file.
 * @returns {Promise<ClientConfig>} The settings.
 */
export async function fetchClientConfig(
  baseUrl: string,
  fetchFile: FileFetcher = fetch,
): Promise<ClientConfig> {
  let response: Response;
  try {
    // A site that answers every unknown address with its page will not do
    // so for a request that takes no page.
    response = await fetchFile(baseUrl + CLIENT_CONFIG_FILE, {
      cache: 'no-cache',
      headers: { Accept: 'text/plain' },
    });
  } catch (error: unknown) {
    console.warn(`${CLIENT_CONFIG_FILE} could not be fetched:`, error);
    return NO_CONFIG;
  }
  if (response.status === 404) {
    return NO_CONFIG;
  }
  if (!response.ok) {
    const status = String(response.status);
    const reason = `the site answered ${status}`;
    console.warn(`${CLIENT_CONFIG_FILE} is ignored: ${reason}.`);
    return NO_CONFIG;
  }
  try {
    return parseClientConfig(await response.text());
  } catch (error: unknown) {
    const reason: string = error instanceof Error ? error.message : 'unknown';
    console.warn(`${CLIENT_CONFIG_FILE} is ignored: ${reason}.`);
    return NO_CONFIG;
  }
}
