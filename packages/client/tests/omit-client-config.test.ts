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
 * @module client/tests/omit-client-config Tests for leaving the settings
 *   file of a site out of a build.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { omitClientConfig } from '../plugins/client-config.ts';
import { CLIENT_CONFIG_FILE } from '../src/client-config.ts';

describe('omitClientConfig', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'clovervale-build-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>\n');
    mkdirSync(path.join(root, 'public'));
    writeFileSync(
      path.join(root, 'public', CLIENT_CONFIG_FILE),
      'SERVER_URL=ws://localhost:1/\n',
    );
    writeFileSync(path.join(root, 'public', 'favicon.svg'), '<svg/>\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('leaves the settings file out of a build', async () => {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [omitClientConfig()],
    });
    expect(existsSync(path.join(root, 'dist', 'favicon.svg'))).toBe(true);
    expect(existsSync(path.join(root, 'dist', CLIENT_CONFIG_FILE))).toBe(
      false,
    );
  });
});
