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
 * @module client/model-library The models the page shows, once they have
 *   been loaded.
 */

import type { Object3D } from 'three';

import { REQUIRED_MODEL_FILES, planModels } from './model-catalogue.ts';
import {
  MODEL_INDEX_FILE,
  fetchModelIndex,
  loadModels,
} from './model-loader.ts';
import type { LoadedModel } from './model-loader.ts';
import { reportFailure } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';

/** The models that have been loaded, for every map to show. */
export class ModelLibrary {
  /** The models that have been loaded so far. */
  #models: readonly LoadedModel[] = [];

  /**
   * The models that have been loaded so far, none before they are.
   *
   * @returns {readonly LoadedModel[]} The models.
   */
  get models(): readonly LoadedModel[] {
    return this.#models;
  }

  /**
   * Loads the available models, which are the models from then on.
   *
   * @param {string} url - The URL of the directory of the models.
   * @returns {Promise<ModelProblem[]>} A promise of the models that cannot
   *   be shown, and why, which is settled once the others are loaded.
   */
  async load(url: string): Promise<ModelProblem[]> {
    const problems: ModelProblem[] = [];
    let available: readonly string[];
    try {
      available = await fetchModelIndex(url);
    } catch (error: unknown) {
      // Without the list, the required models may still be there.
      available = REQUIRED_MODEL_FILES;
      problems.push(reportFailure(MODEL_INDEX_FILE, error));
    }
    const plan = planModels(available);
    for (const file of plan.missing) {
      problems.push({ file, reason: 'missing' });
    }
    const loaded = await loadModels(url, plan.shown);
    problems.push(...loaded.problems);
    this.#models = loaded.models;
    return problems;
  }

  /**
   * Finds the root of a model that has been loaded.
   *
   * @param {string} file - The file of the model.
   * @returns {Object3D | null} The root of the model, or `null` if it has
   *   not been loaded.
   */
  findRoot(file: string): Object3D | null {
    return findModelRoot(this.#models, file);
  }
}

/**
 * Finds the root of a model among some models.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @param {string} file - The file of the model.
 * @returns {Object3D | null} The root of the model, or `null` if it is not
 *   among the models.
 */
export function findModelRoot(
  models: readonly LoadedModel[],
  file: string,
): Object3D | null {
  return (
    models.find((model: LoadedModel) => model.file === file)?.root ?? null
  );
}
