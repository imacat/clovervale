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
 * @module scripts/models/catalogue The list of every model to generate.
 */

import {
  buildChiefHouse,
  buildCottage,
  buildFountain,
  buildWeaponShop,
} from './buildings.ts';
import { VARIANTS, buildCharacter } from './characters.ts';
import { buildNpcEmma } from './npc-emma.ts';
import { buildNpcMartha } from './npc-martha.ts';
import { buildNpcNancy } from './npc-nancy.ts';
import {
  buildBush,
  buildClover,
  buildFence,
  buildGreatTree,
  buildHealingStele,
  buildOldWell,
  buildPineTree,
  buildRock,
  buildSpawnStones,
  buildVillageSign,
  buildYardWall,
  buildYardWallEnd,
} from './props.ts';
import type { BuiltModel } from './rig.ts';
import { buildWildDog } from './wild-dog.ts';

/** A model to generate. */
export interface ModelEntry {
  /** The file name of the model, without its extension. */
  readonly name: string;
  /** Builds the model. */
  readonly build: () => BuiltModel;
}

/**
 * Lists the models to generate.
 *
 * @returns {ModelEntry[]} The models, in the order to generate them.
 */
export function listModels(): ModelEntry[] {
  return [
    ...VARIANTS.map(
      (_: unknown, index: number): ModelEntry => ({
        name: `character-0${String(index + 1)}`,
        build: (): BuiltModel => buildCharacter(index),
      }),
    ),
    { name: 'npc-nancy', build: buildNpcNancy },
    { name: 'npc-emma', build: buildNpcEmma },
    { name: 'npc-martha', build: buildNpcMartha },
    { name: 'wild-dog', build: buildWildDog },
    { name: 'weapon-shop', build: buildWeaponShop },
    { name: 'fountain', build: buildFountain },
    { name: 'prop-cottage', build: buildCottage },
    { name: 'prop-great-tree', build: buildGreatTree },
    { name: 'prop-pine-tree', build: buildPineTree },
    { name: 'prop-bush', build: buildBush },
    { name: 'prop-rock', build: buildRock },
    { name: 'prop-fence', build: buildFence },
    { name: 'prop-clover', build: buildClover },
    { name: 'prop-spawn-stones', build: buildSpawnStones },
    { name: 'prop-healing-stele', build: buildHealingStele },
    { name: 'prop-village-sign', build: buildVillageSign },
    { name: 'prop-chief-house', build: buildChiefHouse },
    { name: 'prop-yard-wall', build: buildYardWall },
    { name: 'prop-yard-wall-end', build: buildYardWallEnd },
    { name: 'prop-old-well', build: buildOldWell },
  ];
}
