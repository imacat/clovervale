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
 * @module shared/models The identifiers of the models that stand in the
 *   maps, by which the rules place them and give them their ground, apart
 *   from the files the client shows them with.
 */

import type { VillagerId } from './villagers.ts';

/** The identifier of a model of the village that is not a villager. */
export type VillagePropId =
  | 'fountain'
  | 'weapon-shop'
  | 'spawn-stones'
  | 'great-tree'
  | 'healing-stele'
  | 'village-sign'
  | 'cottage'
  | 'apothecary'
  | 'herb-rack'
  | 'potion-crate'
  | 'herb-crate'
  | 'potted-plant'
  | 'barrel'
  | 'chief-house'
  | 'pitchfork'
  | 'old-well'
  | 'yard-wall'
  | 'yard-wall-end'
  | 'pine-tree'
  | 'bush'
  | 'clover'
  | 'rock'
  | 'fence';

/** The identifier of a model of the cave that is not a villager. */
export type CavePropId =
  | 'cave'
  | 'cave-torch'
  | 'cave-bars'
  | 'cave-skeleton'
  | 'cave-chest'
  | 'cave-chest-open'
  | 'cave-barrel'
  | 'cave-barrel-open';

/**
 * The identifier of a model that stands in a map: a villager, by the
 * identifier of the villager, or a prop.
 */
export type ModelId = VillagerId | VillagePropId | CavePropId;
