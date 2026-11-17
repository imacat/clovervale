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
 * @module scripts/clean Removes everything the build tools generate.
 */

import { globSync, rmSync } from 'node:fs';
import path from 'node:path';

const rootDir: string = path.resolve(import.meta.dirname, '..');
const patterns: string[] = ['packages/*/dist', 'docs/api', 'release', 'coverage'];

for (const generated of globSync(patterns, { cwd: rootDir })) {
  rmSync(path.join(rootDir, generated), { recursive: true, force: true });
}
