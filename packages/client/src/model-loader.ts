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
 * @module client/model-loader Loading the model files from the server.
 */

import type { AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { reportFailure } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';

/** A model that has been loaded. */
export interface LoadedModel {
  /** The file name of the model. */
  readonly file: string;
  /** The root of the model. */
  readonly root: Object3D;
  /** The animation clips of the model. */
  readonly clips: readonly AnimationClip[];
}

/** The outcome of loading several models. */
export interface LoadedModels {
  /** The models that have been loaded. */
  readonly models: readonly LoadedModel[];
  /** The models that could not be loaded. */
  readonly problems: readonly ModelProblem[];
}

/** The name of the list of the available model files, among those files. */
export const MODEL_INDEX_FILE = 'index.json';

/**
 * Fetches the file names of the models that are available.
 *
 * @param {string} baseUrl - The URL of the directory of the models, ending
 *   with a slash.
 * @returns {Promise<string[]>} The file names.
 * @throws {Error} If the list cannot be fetched or is not a list of names.
 */
export async function fetchModelIndex(baseUrl: string): Promise<string[]> {
  const response: Response = await fetch(baseUrl + MODEL_INDEX_FILE);
  if (!response.ok) {
    throw new Error(`the server answered ${String(response.status)}`);
  }
  const files: unknown = await response.json();
  if (!Array.isArray(files)) {
    throw new Error('it is not a list');
  }
  return files.filter((file: unknown) => typeof file === 'string');
}

/**
 * Loads models, going on with the others when one of them fails.
 *
 * @param {string} baseUrl - The URL of the directory of the models, ending
 *   with a slash.
 * @param {readonly string[]} files - The file names of the models.
 * @returns {Promise<LoadedModels>} The models that have been loaded, and
 *   those that could not be.
 */
export async function loadModels(
  baseUrl: string,
  files: readonly string[],
): Promise<LoadedModels> {
  const loader = new GLTFLoader();
  const models: LoadedModel[] = [];
  const problems: ModelProblem[] = [];
  await Promise.all(
    files.map(async (file: string) => {
      try {
        const gltf = await loader.loadAsync(baseUrl + file);
        models.push({ file, root: gltf.scene, clips: gltf.animations });
      } catch (error: unknown) {
        problems.push(reportFailure(file, error));
      }
    }),
  );
  const compareByFile = (a: { file: string }, b: { file: string }): number =>
    a.file.localeCompare(b.file);
  return {
    models: models.sort(compareByFile),
    problems: problems.sort(compareByFile),
  };
}
