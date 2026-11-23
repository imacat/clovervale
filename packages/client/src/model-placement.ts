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
 * @module client/model-placement Standing the models of a map where they
 *   have their places in it.
 */

import type { Object3D, Scene } from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

import type { Placement } from '@clovervale/shared';

import { MODEL_FILES } from './model-catalog.ts';
import type { LoadedModel } from './model-loader.ts';

/**
 * Stands a model in a map where a placement has it, if the model is among
 * the models.
 *
 * @param {Placement} placement - Where the model stands.
 * @returns {LoadedModel | null} The model as it stands, or `null` if it is
 *   not among the models.
 */
export type ModelPlacer = (placement: Placement) => LoadedModel | null;

/**
 * Makes what stands the models of a map in it, each where a placement has
 * it, facing the way the placement has it.  A model that stands in several
 * places stands itself in the first and a copy of itself in each other.
 *
 * @param {Scene} scene - The scene of the map.
 * @param {readonly LoadedModel[]} models - The models.
 * @returns {ModelPlacer} What stands the models.
 */
export function createModelPlacer(
  scene: Scene,
  models: readonly LoadedModel[],
): ModelPlacer {
  const used = new Set<string>();
  return (placement: Placement): LoadedModel | null => {
    const model: LoadedModel | undefined = models.find(
      (candidate: LoadedModel) =>
        candidate.file === MODEL_FILES[placement.model],
    );
    if (model === undefined) {
      return null;
    }
    const root: Object3D = used.has(model.file)
      ? clone(model.root)
      : model.root;
    used.add(model.file);
    root.position.set(placement.x, 0, placement.z);
    root.rotation.y = (placement.yaw * Math.PI) / 180;
    scene.add(root);
    return { ...model, root };
  };
}
