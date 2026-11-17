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

import { DEFAULT_SERVER_PORT } from '@clovervale/shared';

import { runBot } from './bot.ts';

const defaultUrl = `ws://localhost:${String(DEFAULT_SERVER_PORT)}`;
const url = process.env.SERVER_URL ?? defaultUrl;

runBot(url)
  .then((message) => {
    console.log(`Clovervale bot received: ${JSON.stringify(message)}`);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
