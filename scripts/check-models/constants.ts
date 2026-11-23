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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/check-models/constants What the checks of the models
 *   share: where the models are, the tolerances, and the forms of an
 *   outcome.
 */

import path from 'node:path';

/**
 * The outcome of checking how models meet: that the hammer of the smith
 * meets the iron, or that the face of the chief is seen from the plaza.
 */
export interface StrikeResult {
  /** How the models meet, for the owner to read. */
  readonly summary: string;
  /** The requirements not met. */
  readonly failures: string[];
}

/**
 * Notes a requirement of a model.
 *
 * @param {boolean} ok - Whether the model meets it.
 * @param {string} message - What to report if it does not.
 */
export type Check = (ok: boolean, message: string) => void;

/** The root directory of the project. */
export const rootDir: string = path.resolve(import.meta.dirname, '../..');
/** The directory of the models of the client. */
export const modelsDir: string = path.join(
  rootDir,
  'packages/client/public/models',
);
/** The greatest difference that counts as none, in meters. */
export const TOLERANCE = 1e-4;
/** How many times a second a clip is measured. */
export const SAMPLE_RATE = 240;
/**
 * The farthest an edge of what stands in the cave may lie from the edge of
 * the ground it takes up, inside it or out, in meters.
 */
export const FOOTPRINT_TOLERANCE = 0.03;
