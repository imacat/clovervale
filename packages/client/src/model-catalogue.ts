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
 * @module client/model-catalogue Knowing which model files the game uses.
 */

import {
  APPEARANCE_COUNT,
  CAVE_EDWIN_FILE,
  TOBY_FILE,
} from '@clovervale/shared';
import type { ItemKindId } from '@clovervale/shared';

/** What a model stands for in the game. */
export type ModelKind = 'character' | 'npc' | 'monster' | 'building' | 'prop';

/** The models to show, and the required ones that cannot be shown. */
export interface ModelPlan {
  /** The file names of the models to show, in alphabetical order. */
  readonly shown: readonly string[];
  /** The file names of the required models that are not available. */
  readonly missing: readonly string[];
}

/**
 * The file names of the player and bot characters, in the order of the
 * appearances they give a player.
 */
export const CHARACTER_FILES: readonly string[] = Array.from(
  { length: APPEARANCE_COUNT },
  (_, index: number) => `character-${String(index + 1).padStart(2, '0')}.glb`,
);

/** The file name of the monster, the wild dog. */
export const MONSTER_FILE = 'wild-dog.glb';

/** The file name of Martha, the village chief, who fights as a monster. */
export const MARTHA_FILE = 'npc-martha.glb';

/**
 * The file name of Martha's pitchfork, as it leans against the wall of her
 * house while she does not hold it.
 */
export const PITCHFORK_FILE = 'prop-pitchfork.glb';

/**
 * The file name of Martha's pitchfork as it lies on the ground beside her
 * where she has dropped it, beaten.
 */
export const LYING_PITCHFORK_FILE = 'prop-pitchfork-lying.glb';

/**
 * The file names of the models of the items drawn as they lie on the
 * ground, by their kinds, for every kind but the four-leaved clover.
 */
export const LYING_ITEM_FILES: Readonly<
  Record<Exclude<ItemKindId, 'clover'>, string>
> = {
  sword: 'prop-item-sword.glb',
  'leather-armour': 'prop-item-leather-armour.glb',
  'healing-potion': 'prop-item-healing-potion.glb',
  'clovervale-message': 'prop-item-clovervale-message.glb',
  'spy-token': 'prop-item-spy-token.glb',
  'martha-ointment': 'prop-item-martha-ointment.glb',
};

/** The file name of the healing fountain. */
export const FOUNTAIN_FILE = 'fountain.glb';

/** The file name of the weapon shop, with the forge beside it. */
export const WEAPON_SHOP_FILE = 'weapon-shop.glb';

/** The kinds of the required models other than the characters. */
const FIXED_KINDS: ReadonlyMap<string, ModelKind> = new Map<string, ModelKind>(
  [
    ['npc-nancy.glb', 'npc'],
    ['npc-emma.glb', 'npc'],
    [MARTHA_FILE, 'npc'],
    [TOBY_FILE, 'npc'],
    [CAVE_EDWIN_FILE, 'npc'],
    [MONSTER_FILE, 'monster'],
    [WEAPON_SHOP_FILE, 'building'],
    [FOUNTAIN_FILE, 'building'],
  ],
);

/** The file names of the models the game cannot do without. */
export const REQUIRED_MODEL_FILES: readonly string[] = [
  ...CHARACTER_FILES,
  ...FIXED_KINDS.keys(),
];

/** The file names of the NPCs. */
const NPC_PATTERN = /^npc-[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;

/** The file names of the optional props. */
const PROP_PATTERN = /^prop-[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;

/**
 * Tells what a model file stands for in the game.
 *
 * @param {string} file - The file name of the model.
 * @returns {ModelKind | null} The kind of the model, or `null` if the game
 *   does not use a file of that name.
 */
export function classifyModel(file: string): ModelKind | null {
  if (CHARACTER_FILES.includes(file)) {
    return 'character';
  }
  if (NPC_PATTERN.test(file)) {
    return 'npc';
  }
  if (PROP_PATTERN.test(file)) {
    return 'prop';
  }
  return FIXED_KINDS.get(file) ?? null;
}

/**
 * Plans which of the available model files to show.
 *
 * @param {readonly string[]} available - The file names of the models that
 *   are available.
 * @returns {ModelPlan} The models to show, and the required ones that are
 *   not available.
 */
export function planModels(available: readonly string[]): ModelPlan {
  const shown: string[] = [...new Set(available)]
    .filter((file: string) => classifyModel(file) !== null)
    .sort();
  const missing: string[] = REQUIRED_MODEL_FILES.filter(
    (file: string) => !shown.includes(file),
  );
  return { shown, missing };
}
