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

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

import { startServer } from './server.ts';

/**
 * Runs the game server on the port given by the PORT environment variable.
 *
 * @returns {Promise<void>} A promise settled once the server is listening.
 */
async function runServer(): Promise<void> {
  const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
  const server = await startServer(port);
  console.log(`Clovervale server listening on port ${String(server.port)}.`);
}

runServer().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
