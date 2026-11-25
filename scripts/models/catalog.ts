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
 * @module scripts/models/catalog The list of every model to generate.
 */

import { FARM_FIELD_IDS } from '@clovervale/shared';
import type { FarmFieldId } from '@clovervale/shared';
import {
  CHARACTER_FILES,
  LYING_ITEM_MODELS,
  LYING_PITCHFORK_FILE,
  MODEL_FILES,
  MONSTER_FILE,
} from '../../packages/client/src/model-catalog.ts';
import {
  buildBarrel,
  buildHerbCrate,
  buildHerbRack,
  buildPotionCrate,
  buildPottedPlant,
} from './apothecary-props.ts';
import {
  buildApothecary,
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
import { buildFarmField } from './farm-field.ts';
import { buildItemLeatherArmor, buildItemSword } from './gear.ts';
import { buildItemClovervaleMessage } from './message.ts';
import { buildNpcBasil } from './npc-basil.ts';
import { buildNpcEmma } from './npc-emma.ts';
import { buildNpcEdwin } from './npc-edwin.ts';
import { buildNpcMartha } from './npc-martha.ts';
import { buildNpcNancy } from './npc-nancy.ts';
import { buildNpcToby } from './npc-toby.ts';
import { buildItemMarthaOintment } from './ointment.ts';
import { buildPalisadeGate } from './palisade-gate.ts';
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
interface ModelEntry {
  /** The file name of the model. */
  readonly file: string;
  /** Builds the model. */
  readonly build: () => BuiltModel;
}

/**
 * Lists the models to generate.
 *
 * @returns {ModelEntry[]} The models, in the order to generate them, under
 *   the file names the client loads them by.
 */
export function listModels(): ModelEntry[] {
  return [
    ...VARIANTS.map(
      (_: unknown, index: number): ModelEntry => ({
        file: findCharacterFile(index),
        build: (): BuiltModel => buildCharacter(index),
      }),
    ),
    { file: MODEL_FILES.nancy, build: buildNpcNancy },
    { file: MODEL_FILES.emma, build: buildNpcEmma },
    { file: MODEL_FILES.martha, build: buildNpcMartha },
    { file: MODEL_FILES.toby, build: buildNpcToby },
    { file: MODEL_FILES.basil, build: buildNpcBasil },
    { file: MODEL_FILES.edwin, build: buildNpcEdwin },
    { file: MONSTER_FILE, build: buildWildDog },
    { file: MODEL_FILES['weapon-shop'], build: buildWeaponShop },
    { file: MODEL_FILES.fountain, build: buildFountain },
    { file: MODEL_FILES.cottage, build: buildCottage },
    { file: MODEL_FILES.apothecary, build: buildApothecary },
    { file: MODEL_FILES['herb-rack'], build: buildHerbRack },
    { file: MODEL_FILES['potion-crate'], build: buildPotionCrate },
    { file: MODEL_FILES['herb-crate'], build: buildHerbCrate },
    { file: MODEL_FILES['potted-plant'], build: buildPottedPlant },
    { file: MODEL_FILES.barrel, build: buildBarrel },
    { file: MODEL_FILES['great-tree'], build: buildGreatTree },
    { file: MODEL_FILES['pine-tree'], build: buildPineTree },
    { file: MODEL_FILES.bush, build: buildBush },
    { file: MODEL_FILES.rock, build: buildRock },
    { file: MODEL_FILES.fence, build: buildFence },
    { file: MODEL_FILES.clover, build: buildClover },
    { file: MODEL_FILES['spawn-stones'], build: buildSpawnStones },
    { file: MODEL_FILES['palisade-gate'], build: buildPalisadeGate },
    { file: MODEL_FILES['healing-stele'], build: buildHealingStele },
    { file: MODEL_FILES['village-sign'], build: buildVillageSign },
    { file: MODEL_FILES['chief-house'], build: buildChiefHouse },
    { file: MODEL_FILES['yard-wall'], build: buildYardWall },
    { file: MODEL_FILES['yard-wall-end'], build: buildYardWallEnd },
    { file: MODEL_FILES['old-well'], build: buildOldWell },
    ...FARM_FIELD_IDS.map(
      (id: FarmFieldId): ModelEntry => ({
        file: MODEL_FILES[id],
        build: (): BuiltModel => buildFarmField(id),
      }),
    ),
    { file: MODEL_FILES.pitchfork, build: buildPropPitchfork },
    { file: LYING_PITCHFORK_FILE, build: buildPropPitchforkLying },
    { file: MODEL_FILES.cave, build: buildCave },
    { file: MODEL_FILES['cave-torch'], build: buildCaveTorch },
    { file: MODEL_FILES['cave-bars'], build: buildCaveBars },
    { file: MODEL_FILES['cave-skeleton'], build: buildCaveSkeleton },
    { file: MODEL_FILES['cave-chest'], build: buildCaveChest },
    { file: MODEL_FILES['cave-chest-open'], build: buildCaveChestOpen },
    { file: MODEL_FILES['cave-barrel'], build: buildCaveBarrel },
    { file: MODEL_FILES['cave-barrel-open'], build: buildCaveBarrelOpen },
    { file: LYING_ITEM_MODELS.sword, build: buildItemSword },
    {
      file: LYING_ITEM_MODELS['leather-armor'],
      build: buildItemLeatherArmor,
    },
    {
      file: LYING_ITEM_MODELS['healing-potion'],
      build: buildItemHealingPotion,
    },
    {
      file: LYING_ITEM_MODELS['clovervale-message'],
      build: buildItemClovervaleMessage,
    },
    { file: LYING_ITEM_MODELS['spy-token'], build: buildItemSpyToken },
    {
      file: LYING_ITEM_MODELS['martha-ointment'],
      build: buildItemMarthaOintment,
    },
  ];
}

/**
 * Finds the file name of the character of a variant.
 *
 * @param {number} index - The number of the variant, from 0.
 * @returns {string} The file name of the character.
 * @throws {Error} If the client has no character for the variant.
 */
function findCharacterFile(index: number): string {
  const file: string | undefined = CHARACTER_FILES[index];
  if (file === undefined) {
    throw new Error(
      `The client has no character for variant ${String(index)}.`,
    );
  }
  return file;
}
