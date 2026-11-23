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
 * @module client/vite.config The Vite configuration of the browser client.
 */

import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, join } from 'node:path';

import { defineConfig } from 'vite';

import { omitClientConfig } from './plugins/client-config.ts';
import { listModels } from './plugins/model-index.ts';

/** The package.json of lil-gui. */
const lilGuiPackage: string | undefined = findPackageJSON(
  'lil-gui',
  import.meta.url,
);
if (lilGuiPackage === undefined) {
  throw new Error('Cannot find the package.json of lil-gui.');
}
/**
 * The stylesheet lil-gui names in config.style, which is bundled because
 * the CSP of the site forbids the inline style lil-gui would inject.  Its
 * exports do not list it, so it cannot be imported by its package path.
 */
const lilGuiStyle: string = join(
  dirname(lilGuiPackage),
  (
    JSON.parse(readFileSync(lilGuiPackage, 'utf8')) as {
      config: { style: string };
    }
  ).config.style,
);

export default defineConfig({
  // Relative asset URLs let the built client be served from any directory.
  base: './',
  plugins: [listModels(), omitClientConfig()],
  resolve: {
    alias: [{ find: /^lil-gui\/style$/, replacement: lilGuiStyle }],
  },
  build: {
    // Three.js alone exceeds the default 500 kB warning threshold.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Three.js in a chunk of its own stays cached across releases
          // that change only the code of the game.
          groups: [
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
  },
});
