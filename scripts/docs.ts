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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/26
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/docs Generates the documentation site in English, with
 *   the copy in Traditional Chinese in its zh-tw/ directory.
 */

import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

const rootDir: string = path.resolve(import.meta.dirname, '..');
const typedoc: string = path.join(rootDir, 'node_modules/typedoc/bin/typedoc');

/**
 * Generates one copy of the documentation with TypeDoc.
 *
 * @param {string} options - The TypeDoc options file of the copy.
 * @param {string} out - The directory to generate the copy in.
 * @returns {boolean} Whether TypeDoc succeeded.
 */
function generateCopy(options: string, out: string): boolean {
  const result: SpawnSyncReturns<Buffer> = spawnSync(
    process.execPath,
    [typedoc, '--options', options, '--out', out],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status === 0;
}

const { values } = parseArgs({
  options: { out: { type: 'string', default: 'docs/api' } },
});
const out: string = path.resolve(rootDir, values.out);

if (
  !generateCopy('typedoc.json', out) ||
  !generateCopy('typedoc.zh-TW.json', path.join(out, 'zh-tw'))
) {
  process.exitCode = 1;
}
