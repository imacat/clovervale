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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/25
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/bare-earth Knowing where the ground of the village is
 *   bare earth instead of grass: the plaza, its paths and the monster's
 *   ground.
 */

/**
 * A patch of bare earth, an ellipse on the ground: its center, its radii
 * along X and Z, and its turn around the Y axis, in degrees, the way a
 * model turns.
 */
export type EarthPatch = readonly [
  x: number,
  z: number,
  radiusX: number,
  radiusZ: number,
  yaw: number,
];

/**
 * The plaza, the paths into and out of it, the way from the plaza up to the
 * porch of the chief's house, and the monster's ground.  The path on the
 * east, narrower than the one on the west, winds in three lengths from
 * behind the great tree past the end of the low wall in front of the
 * chief's yard, on the side away from the house, and past the end of the
 * fence behind the tree, to the back of the village.
 */
export const BARE_EARTH: readonly EarthPatch[] = [
  [0, 8, 2.6, 16, 0],
  [0, -8, 9, 8.2, 0],
  [-5.2, -21, 1.6, 10, -12],
  [2.15, -17.2, 0.9, 2.7, 3.6],
  [3.25, -20.9, 0.9, 2.25, -39.8],
  [4.45, -26.35, 0.9, 4.45, 0.7],
  [5.3, -14.6, 1.4, 1.8, -60],
  [10, 8, 4, 3, 0],
];
