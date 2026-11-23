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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/test-browser/connection Checks a page that cannot connect to
 *   its server.
 */

import type { BidiSession } from './bidi.ts';
import { PAGE_TIMEOUT } from './constants.ts';
import { readPageState, waitFor } from './page.ts';
import type { PageState } from './page.ts';

/**
 * Checks that a page whose address names a server it cannot connect to
 * tells it is disconnected: a relative address, which the page resolves
 * to a ws:// URL on the server of the client, whose connection is refused,
 * and an FTP URL, which no WebSocket can use.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {number} clientPort - The TCP port the client is served on.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not tell it in time.
 */
export async function checkUnusableServer(
  session: BidiSession,
  clientPort: number,
): Promise<void> {
  const created = (await session.send('browsingContext.create', {
    type: 'window',
  })) as { context: string };
  const { context } = created;
  for (const server of ['foo', 'ftp://127.0.0.1/']) {
    const url =
      `http://127.0.0.1:${String(clientPort)}/` +
      `?server=${encodeURIComponent(server)}`;
    await session.send('browsingContext.navigate', {
      context,
      url,
      wait: 'complete',
    });
    await waitFor(
      () => readPageState(session, context),
      (state: PageState) => state.panel.Server === 'disconnected',
      PAGE_TIMEOUT,
      (state: PageState) =>
        `A page whose address names the server "${server}" tells its ` +
        `server status is "${state.panel.Server ?? ''}".`,
    );
  }
  await session.send('browsingContext.close', { context });
}
