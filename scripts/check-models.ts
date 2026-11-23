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
 * @module scripts/check-models Checks the 3D models of the client.
 */

import { readdirSync } from 'node:fs';

import { CAVE_CONTAINER_MODELS, CAVE_PLACEMENTS } from '@clovervale/shared';
import type { ModelId, Placement } from '@clovervale/shared';

import {
  MODEL_FILES,
  isModelUsed,
} from '../packages/client/src/model-catalog.ts';
import { checkApothecary } from './check-models/apothecary.ts';
import { checkCaveFixtures } from './check-models/cave-fixtures.ts';
import { checkCave } from './check-models/cave.ts';
import { checkChiefInSight } from './check-models/chief.ts';
import { modelsDir } from './check-models/constants.ts';
import type { StrikeResult } from './check-models/constants.ts';
import {
  ANVIL_FILE,
  BASIL_FILE,
  CHIEF_FILE,
  REQUIRED_FILES,
  SMITH_FILE,
} from './check-models/files.ts';
import { checkModel } from './check-models/model.ts';
import type { ModelResult } from './check-models/model.ts';
import { checkStrike } from './check-models/strike.ts';

/**
 * Checks the models of the client.
 *
 * @returns {Promise<boolean>} Whether every model meets every requirement.
 */
async function checkModels(): Promise<boolean> {
  const files: string[] = readdirSync(modelsDir).sort();
  const problems: string[] = [];
  if (!files.every((file: string) => file.endsWith('.glb'))) {
    problems.push('the directory holds something other than .glb files');
  }
  for (const file of REQUIRED_FILES) {
    if (!files.includes(file)) {
      problems.push(`${file} is missing`);
    }
  }
  for (const file of files) {
    if (!isModelUsed(file)) {
      problems.push(`${file} is not a name the game uses`);
    }
  }
  const results: ModelResult[] = [];
  for (const file of files) {
    if (file.endsWith('.glb')) {
      results.push(await checkModel(file));
    }
  }
  // Both models are required, so a missing one is already reported; the
  // strike is reported as not checked as well.
  const strike: StrikeResult =
    files.includes(SMITH_FILE) && files.includes(ANVIL_FILE)
      ? await checkStrike()
      : {
          summary: '',
          failures: [
            `the hammer of ${SMITH_FILE} cannot be checked against the ` +
              `iron on ${ANVIL_FILE}`,
          ],
        };
  problems.push(...strike.failures);
  // The chief is required, so a missing one is already reported; her face
  // is reported as not checked as well.
  const sight: StrikeResult = files.includes(CHIEF_FILE)
    ? await checkChiefInSight(files)
    : {
        summary: '',
        failures: [`the face of ${CHIEF_FILE} cannot be checked`],
      };
  problems.push(...sight.failures);
  // The models of the cave are optional props; without them, the cave is
  // not checked.
  const cave: StrikeResult =
    files.includes(MODEL_FILES.cave) &&
    files.includes(MODEL_FILES['cave-torch'])
      ? await checkCave(files)
      : { summary: '', failures: [] };
  problems.push(...cave.failures);
  // The models of the side chambers are required with the prisoner, and
  // optional props otherwise; without all of them, they are not checked.
  const fixtures: StrikeResult = [
    ...new Set(CAVE_PLACEMENTS.map(({ model }: Placement) => model)),
    ...Object.values(CAVE_CONTAINER_MODELS).flatMap(
      ({ closed, open }) => [closed, open],
    ),
  ].every((model: ModelId) => files.includes(MODEL_FILES[model]))
    ? await checkCaveFixtures()
    : { summary: '', failures: [] };
  problems.push(...fixtures.failures);
  // Basil is required, so a missing one is already reported; the shop is
  // reported as not checked as well.
  const apothecary: StrikeResult = files.includes(BASIL_FILE)
    ? await checkApothecary(files)
    : {
        summary: '',
        failures: [`the apothecary shop cannot be checked`],
      };
  problems.push(...apothecary.failures);
  const characters: ModelResult[] = results.filter(
    (result: ModelResult) => result.kind === 'character',
  );
  const countDistinct = (values: string[]): number => new Set(values).size;
  if (countDistinct(characters.map((result) => result.skeletonHash)) > 1) {
    problems.push('the characters do not share one skeleton');
  }
  if (countDistinct(characters.map((result) => result.clipsHash)) > 1) {
    problems.push('the characters do not share the same clips');
  }
  for (const result of results) {
    const mark: string = result.failures.length > 0 ? 'FAIL' : 'ok  ';
    console.log(`${mark} ${result.file}: ${result.summary}`);
    for (const failure of result.failures) {
      console.log(`     - ${failure}`);
    }
  }
  for (const meeting of [strike, sight, cave, fixtures, apothecary]) {
    if (meeting.summary !== '') {
      const mark: string = meeting.failures.length > 0 ? 'FAIL' : 'ok  ';
      console.log(`${mark} ${meeting.summary}`);
    }
  }
  for (const problem of problems) {
    console.log(`FAIL ${problem}`);
  }
  return (
    problems.length === 0 &&
    results.every((result: ModelResult) => result.failures.length === 0)
  );
}

try {
  if (await checkModels()) {
    console.log('Model check passed: every model meets the requirements.');
  } else {
    console.error('Model check failed.');
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const reason: string =
    error instanceof Error ? error.message : String(error);
  console.error(`Model check failed: ${reason}`);
  process.exitCode = 1;
}
