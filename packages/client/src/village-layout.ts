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
 * @module client/village-layout Arranging the models into a village.
 */

import { VILLAGERS, VILLAGE_PLACEMENTS } from '@clovervale/shared';
import type { Placement, Villager } from '@clovervale/shared';

import { MODEL_FILES } from './model-catalog.ts';

export type { Placement } from '@clovervale/shared';

/**
 * The file names of the models of the villagers who fight as monsters,
 * who stand wherever the server has them, as the monsters do.
 */
const FIGHTER_FILES: ReadonlySet<string> = new Set<string>(
  VILLAGERS.filter(
    (villager: Villager) => villager.fighter !== undefined,
  ).map((villager: Villager) => MODEL_FILES[villager.id]),
);

/**
 * Arranges the models into a village.
 *
 * The fountain stands in the middle of a plaza, in front of the great tree,
 * and the cottage, the apothecary shop, the weapon shop and the house of the
 * village chief, in its open yard with the old well, stand around the
 * plaza, each facing it.  Nancy the villager is by the fountain, as is the
 * healing stele, Emma the smith works at the anvil by the forge of the
 * weapon shop, and Basil the apothecary stands by the door of his shop,
 * among his herb rack, his crates, his potted plant and his barrels.
 * The village sign stands by the gate, and the spawn stones of the monster
 * are a little way outside.  The characters and the monster have no place
 * of their own, as they stand wherever the server has them, and neither
 * has Martha the village chief, who fights as a monster, nor Toby, who
 * runs around between the cottage and the gate.  The models of the cave,
 * and of what stands in it, stand in the cave, not in the village, and the
 * models of the items lie wherever the items do.
 *
 * @param {readonly string[]} files - The file names of the models to
 *   arrange.
 * @returns {Placement[]} Where each model stands.  A model can stand in
 *   several places, and a character, the monster, a villager who fights
 *   as a monster, an NPC without a place of its own or a file the game
 *   does not use stands nowhere.
 */
export function layoutVillage(files: readonly string[]): Placement[] {
  const placements: Placement[] = [];
  for (const file of files) {
    if (!FIGHTER_FILES.has(file)) {
      placements.push(
        ...VILLAGE_PLACEMENTS.filter(
          (placement: Placement) => MODEL_FILES[placement.model] === file,
        ),
      );
    }
  }
  return placements;
}
