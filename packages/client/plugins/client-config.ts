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
 * @module client/plugins/client-config A Vite plugin keeping the settings
 *   file of a site out of a build.
 *
 * A developer may keep a settings file among the public files, so that the
 * development server serves it.  A build is for any site, so it must not
 * carry that file.
 */

import { rmSync } from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

import { CLIENT_CONFIG_FILE } from '../src/client-config.ts';

/**
 * Creates the Vite plugin that leaves the settings file out of a build.
 *
 * The development server still serves the file from the public files.
 *
 * @returns {Plugin} The plugin.
 */
export function omitClientConfig(): Plugin {
  return {
    name: 'clovervale-omit-client-config',
    apply: 'build',
    writeBundle(options): void {
      if (options.dir !== undefined) {
        rmSync(path.join(options.dir, CLIENT_CONFIG_FILE), { force: true });
      }
    },
  };
}
