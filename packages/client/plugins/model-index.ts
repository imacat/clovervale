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
 * @module client/plugins/model-index A Vite plugin listing the model files.
 *
 * The browser cannot list a directory of the server, and the set of models
 * varies, so the client is served a list of them as `models/index.json`.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { compareCodeUnits } from '@clovervale/shared';
import type { Plugin } from 'vite';

/** The directory of the models, in the directory of public files. */
const MODELS_DIRECTORY = 'models';
/** The list of the models, as the client asks for it. */
const INDEX_FILE = `${MODELS_DIRECTORY}/index.json`;

/**
 * Lists the model files in a directory.
 *
 * @param {string} directory - The directory, which need not exist.
 * @returns {string[]} The names of the `.glb` files in it, in alphabetical
 *   order.
 */
export function listModelFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.glb'))
      .map((entry) => entry.name)
      .sort(compareCodeUnits);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Creates the Vite plugin that serves the client the list of its models.
 *
 * The development server lists the models there are at each request, and
 * reloads the page when they change.  A build lists those it bundles.
 *
 * @returns {Plugin} The plugin.
 */
export function listModels(): Plugin {
  let directory = '';
  return {
    name: 'clovervale-model-index',
    configResolved(config): void {
      directory = path.join(config.publicDir, MODELS_DIRECTORY);
    },
    configureServer(server): void {
      server.middlewares.use(`/${INDEX_FILE}`, (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(listModelFiles(directory)));
      });
      const reload = (file: string): void => {
        if (path.dirname(file) === directory && file.endsWith('.glb')) {
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.add(directory);
      for (const event of ['add', 'change', 'unlink'] as const) {
        server.watcher.on(event, reload);
      }
    },
    generateBundle(): void {
      this.emitFile({
        type: 'asset',
        fileName: INDEX_FILE,
        source: JSON.stringify(listModelFiles(directory)),
      });
    },
  };
}
