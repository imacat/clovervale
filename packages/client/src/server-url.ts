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
 * @module client/server-url Finding the game server of a page.
 */

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

/**
 * Resolves the WebSocket URL of the game server for a page.
 *
 * The server is the one the page address names in its `server` query
 * parameter, or else the one the site has set, or else the one on the
 * default port of the host serving the page.
 *
 * @param {URL} pageUrl - The address of the page.
 * @param {string | null} siteServerUrl - The WebSocket URL of the game
 *   server the site has set, or `null` if it has set none.
 * @returns {string} The WebSocket URL of the game server.
 */
export function resolveServerUrl(
  pageUrl: URL,
  siteServerUrl: string | null,
): string {
  const override = pageUrl.searchParams.get('server');
  if (override !== null) {
    return override;
  }
  if (siteServerUrl !== null) {
    return siteServerUrl;
  }
  const scheme = pageUrl.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${pageUrl.hostname}:${String(DEFAULT_SERVER_PORT)}`;
}
