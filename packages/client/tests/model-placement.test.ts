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
 * @module client/tests/model-placement Tests for standing the models of a
 *   map where they have their places in it.
 */

import { Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';

import { MODEL_FILES } from '../src/model-catalog.ts';
import type { LoadedModel } from '../src/model-loader.ts';
import { createModelPlacer } from '../src/model-placement.ts';
import type { ModelPlacer } from '../src/model-placement.ts';

describe('createModelPlacer', () => {
  it('stands a model where its placement has it, facing its way', () => {
    const scene = new Scene();
    const root = new Object3D();
    const models: LoadedModel[] = [
      { file: MODEL_FILES.fountain, root, clips: [] },
    ];
    const place: ModelPlacer = createModelPlacer(scene, models);
    const placed: LoadedModel | null = place({
      model: 'fountain',
      x: 3,
      z: -4,
      yaw: 90,
    });
    expect(placed?.root).toBe(root);
    expect(root.parent).toBe(scene);
    expect(root.position.toArray()).toEqual([3, 0, -4]);
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2, 12);
  });

  it('stands a copy of a model in each place after its first', () => {
    const scene = new Scene();
    const root = new Object3D();
    const models: LoadedModel[] = [
      { file: MODEL_FILES.fountain, root, clips: [] },
    ];
    const place: ModelPlacer = createModelPlacer(scene, models);
    place({ model: 'fountain', x: 0, z: 0, yaw: 0 });
    const copy: LoadedModel | null = place({
      model: 'fountain',
      x: 5,
      z: 0,
      yaw: 0,
    });
    expect(copy?.root).not.toBe(root);
    expect(copy?.root.parent).toBe(scene);
    expect(root.position.x).toBe(0);
    expect(copy?.root.position.x).toBe(5);
  });

  it('stands nothing for a model not among the models', () => {
    const scene = new Scene();
    const place: ModelPlacer = createModelPlacer(scene, []);
    expect(place({ model: 'fountain', x: 0, z: 0, yaw: 0 })).toBeNull();
    expect(scene.children).toHaveLength(0);
  });
});
