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
 * @module client/map-scene What every map is shown in, whoever is
 *   connected.
 */

import type { Scene } from 'three';

import type { LoadedModel } from './model-loader.ts';

/**
 * A map as it is shown whoever is connected: its scene, the models that
 * stand in it, and its light through the day.
 */
export interface MapScene {
  /** The scene to add the models to. */
  readonly scene: Scene;
  /**
   * Stands the models of the map in it, those that are among the models.
   *
   * @param {readonly LoadedModel[]} models - The models.
   */
  readonly populate: (models: readonly LoadedModel[]) => void;
  /**
   * Moves what stands and glows in the map on, for one frame.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   */
  readonly update: (seconds: number) => void;
  /**
   * Shows the map as it looks at a time of day.
   *
   * @param {number} time - The time of day, from 0 up to 1.
   */
  readonly showTimeOfDay: (time: number) => void;
}
