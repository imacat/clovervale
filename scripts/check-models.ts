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

import {
  CAVE_CONTAINER_MODELS,
  CAVE_PLACEMENTS,
  compareCodeUnits,
} from '@clovervale/shared';
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
 * Lists what is wrong with the files in the directory of the models: that
 * it holds something other than models, that a required model is missing,
 * or that a file has a name the game does not use.
 *
 * @param {readonly string[]} files - The file names in the directory.
 * @returns {string[]} The problems.
 */
function listFileProblems(files: readonly string[]): string[] {
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
  return problems;
}

/**
 * Checks how the models meet one another in the world: the strike of the
 * smith, the face of the chief, the cave, the side chambers of the cave,
 * and the apothecary shop.  A check whose required models are missing
 * fails as not checked; one whose optional props are missing is skipped
 * with an empty outcome.
 *
 * @param {string[]} files - The file names of the models there are.
 * @returns {Promise<StrikeResult[]>} The outcomes, in that order.
 */
async function checkMeetings(files: string[]): Promise<StrikeResult[]> {
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
  // The chief is required, so a missing one is already reported; her face
  // is reported as not checked as well.
  const sight: StrikeResult = files.includes(CHIEF_FILE)
    ? await checkChiefInSight(files)
    : {
        summary: '',
        failures: [`the face of ${CHIEF_FILE} cannot be checked`],
      };
  // The models of the cave are optional props; without them, the cave is
  // not checked.
  const cave: StrikeResult =
    files.includes(MODEL_FILES.cave) &&
    files.includes(MODEL_FILES['cave-torch'])
      ? await checkCave(files)
      : { summary: '', failures: [] };
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
  // Basil is required, so a missing one is already reported; the shop is
  // reported as not checked as well.
  const apothecary: StrikeResult = files.includes(BASIL_FILE)
    ? await checkApothecary(files)
    : {
        summary: '',
        failures: [`the apothecary shop cannot be checked`],
      };
  return [strike, sight, cave, fixtures, apothecary];
}

/**
 * Lists what keeps the characters from sharing one rig: that they do not
 * share one skeleton, or the same clips.
 *
 * @param {readonly ModelResult[]} results - The outcomes of the models.
 * @returns {string[]} The problems.
 */
function listRigProblems(results: readonly ModelResult[]): string[] {
  const problems: string[] = [];
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
  return problems;
}

/**
 * Prints the outcomes of the check: each model with what it does not
 * meet, each check of how the models meet that is not skipped, and then
 * every other problem.
 *
 * @param {readonly ModelResult[]} results - The outcomes of the models.
 * @param {readonly StrikeResult[]} meetings - The outcomes of how the
 *   models meet one another.
 * @param {readonly string[]} problems - The other problems.
 */
function printOutcomes(
  results: readonly ModelResult[],
  meetings: readonly StrikeResult[],
  problems: readonly string[],
): void {
  for (const result of results) {
    const mark: string = result.failures.length > 0 ? 'FAIL' : 'ok  ';
    console.log(`${mark} ${result.file}: ${result.summary}`);
    for (const failure of result.failures) {
      console.log(`     - ${failure}`);
    }
  }
  for (const meeting of meetings) {
    if (meeting.summary !== '') {
      const mark: string = meeting.failures.length > 0 ? 'FAIL' : 'ok  ';
      console.log(`${mark} ${meeting.summary}`);
    }
  }
  for (const problem of problems) {
    console.log(`FAIL ${problem}`);
  }
}

/**
 * Checks the models of the client.
 *
 * @returns {Promise<boolean>} Whether every model meets every requirement.
 */
async function checkModels(): Promise<boolean> {
  const files: string[] = readdirSync(modelsDir).sort(compareCodeUnits);
  const problems: string[] = listFileProblems(files);
  const results: ModelResult[] = await Promise.all(
    files
      .filter((file: string) => file.endsWith('.glb'))
      .map((file: string) => checkModel(file)),
  );
  const meetings: StrikeResult[] = await checkMeetings(files);
  problems.push(
    ...meetings.flatMap((meeting: StrikeResult) => meeting.failures),
    ...listRigProblems(results),
  );
  printOutcomes(results, meetings, problems);
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
