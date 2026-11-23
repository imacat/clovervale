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
 * @module client/map-views How the page shows each map a player can be in.
 */

import type { MapId } from '@clovervale/shared';

import { VILLAGE_LEAST_ELEVATION } from './viewport.ts';

/** How the page shows a map. */
export interface MapView {
  /**
   * The least angle the camera looks down at the player of the page there,
   * in degrees.
   */
  readonly leastElevation: number;
  /**
   * What the prompt tells a player it does when it takes a way into the
   * map: enters it, or climbs up into it.
   */
  readonly entryPrompt: 'enter' | 'climb';
}

/**
 * How the page shows each map: the village, which a player climbs up into
 * out of the cave, with the camera low behind the player; and the cave,
 * which a player enters down the burrow of the wild dog, with the camera
 * looking down steeply enough to look over the walls of the passage.
 */
export const MAP_VIEWS: Readonly<Record<MapId, MapView>> = {
  village: { leastElevation: VILLAGE_LEAST_ELEVATION, entryPrompt: 'climb' },
  cave: { leastElevation: 40, entryPrompt: 'enter' },
};
