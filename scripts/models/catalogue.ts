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
import {
  buildCaveBarrel,
  buildCaveBarrelOpen,
  buildCaveBars,
  buildCaveChest,
  buildCaveChestOpen,
  buildCaveSkeleton,
} from './cave-fixtures.ts';
import { buildCave, buildCaveTorch } from './cave.ts';
import { VARIANTS, buildCharacter } from './characters.ts';
import { buildItemLeatherArmour, buildItemSword } from './gear.ts';
import { buildItemClovervaleMessage } from './message.ts';
import { buildNpcEmma } from './npc-emma.ts';
import { buildNpcEdwin } from './npc-edwin.ts';
import { buildNpcMartha } from './npc-martha.ts';
import { buildNpcNancy } from './npc-nancy.ts';
import { buildNpcToby } from './npc-toby.ts';
import { buildPropPitchfork, buildPropPitchforkLying } from './pitchfork.ts';
import { buildItemHealingPotion } from './potion.ts';
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
import { buildItemSpyToken } from './token.ts';
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
    { name: 'npc-toby', build: buildNpcToby },
    { name: 'npc-edwin', build: buildNpcEdwin },
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
    { name: 'prop-pitchfork', build: buildPropPitchfork },
    { name: 'prop-pitchfork-lying', build: buildPropPitchforkLying },
    { name: 'prop-cave', build: buildCave },
    { name: 'prop-cave-torch', build: buildCaveTorch },
    { name: 'prop-cave-bars', build: buildCaveBars },
    { name: 'prop-cave-skeleton', build: buildCaveSkeleton },
    { name: 'prop-cave-chest', build: buildCaveChest },
    { name: 'prop-cave-chest-open', build: buildCaveChestOpen },
    { name: 'prop-cave-barrel', build: buildCaveBarrel },
    { name: 'prop-cave-barrel-open', build: buildCaveBarrelOpen },
    { name: 'prop-item-sword', build: buildItemSword },
    { name: 'prop-item-leather-armour', build: buildItemLeatherArmour },
    { name: 'prop-item-healing-potion', build: buildItemHealingPotion },
    {
      name: 'prop-item-clovervale-message',
      build: buildItemClovervaleMessage,
    },
    { name: 'prop-item-spy-token', build: buildItemSpyToken },
  ];
}
