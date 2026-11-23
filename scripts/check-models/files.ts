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
 * @module scripts/check-models/files The file names of the models, and what
 *   each model stands for in the game.
 */

import {
  CHARACTER_FILES,
  MODEL_FILES,
  MONSTER_FILE,
  REQUIRED_MODEL_FILES,
  isModelUsed,
} from '../../packages/client/src/model-catalogue.ts';

/** What a model stands for in the game. */
export type ModelKind = 'character' | 'npc' | 'monster' | 'static';

/** The file names of the models the game cannot do without. */
export const REQUIRED_FILES: readonly string[] = REQUIRED_MODEL_FILES;
/** The file names of the models of the items as they lie on the ground. */
export const LYING_ITEM_PATTERN = /^prop-item-[a-z]+(-[a-z]+)*\.glb$/;
/** The file name of the smith, who hammers hot iron on an anvil. */
export const SMITH_FILE: string = MODEL_FILES.emma;
/** The file name of the model with the anvil the smith works at. */
export const ANVIL_FILE: string = MODEL_FILES['weapon-shop'];
/** The file name of the chief, who stands on the porch of her house. */
export const CHIEF_FILE: string = MODEL_FILES.martha;
/** The file name of the apothecary's. */
export const APOTHECARY_FILE: string = MODEL_FILES.apothecary;
/** The file name of Basil the apothecary. */
export const BASIL_FILE: string = MODEL_FILES.basil;

/**
 * Tells what a model file stands for in the game.
 *
 * @param {string} file - The file name of the model.
 * @returns {ModelKind} The kind of the model.
 */
export function classifyModel(file: string): ModelKind {
  if (CHARACTER_FILES.includes(file)) {
    return 'character';
  }
  if (file.startsWith('npc-') && isModelUsed(file)) {
    return 'npc';
  }
  return file === MONSTER_FILE ? 'monster' : 'static';
}
