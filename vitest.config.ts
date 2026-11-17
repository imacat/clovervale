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
 * @module vitest.config The Vitest configuration of all packages.
 */

import { defineConfig } from 'vitest/config';

const packages = ['shared', 'server', 'client', 'bots'];

export default defineConfig({
  test: {
    projects: packages.map((name) => ({
      test: {
        name,
        root: `packages/${name}`,
        include: ['tests/**/*.test.ts'],
        environment: 'node',
      },
    })),
    coverage: {
      include: ['packages/*/src/**/*.ts'],
      reportsDirectory: 'coverage',
    },
  },
});
