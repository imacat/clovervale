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
 * @module scripts/build-models Generates the 3D models of the client.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { listModels } from './models/catalog.ts';

const rootDir: string = path.resolve(import.meta.dirname, '..');
const modelsDir: string = path.join(rootDir, 'packages/client/public/models');

mkdirSync(modelsDir, { recursive: true });
for (const { file, build } of listModels()) {
  const { model, report } = build();
  const glb: Buffer = model.encodeGlb();
  writeFileSync(path.join(modelsDir, file), glb);
  const size = `${(glb.length / 1024).toFixed(1)} KB`;
  const measured: string =
    report === undefined
      ? ''
      : ` ${JSON.stringify(Object.fromEntries(report))}`;
  console.log(
    `${file}: ${String(model.countTriangles())} triangles, ${size}` +
      measured,
  );
}
