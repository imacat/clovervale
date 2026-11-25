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
 * @module client/model-catalog Knowing which model files the game uses.
 */

import {
  APPEARANCE_COUNT,
  VILLAGERS,
  compareCodeUnits,
} from '@clovervale/shared';
import type {
  ItemKindId,
  ModelId,
  MonsterKindId,
  Villager,
} from '@clovervale/shared';

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

/**
 * The file names of the models that stand in the maps, by the identifiers
 * the rules place them by.
 */
export const MODEL_FILES: Readonly<Record<ModelId, string>> = {
  nancy: 'npc-nancy.glb',
  emma: 'npc-emma.glb',
  martha: 'npc-martha.glb',
  toby: 'npc-toby.glb',
  basil: 'npc-basil.glb',
  edwin: 'npc-edwin.glb',
  fountain: 'fountain.glb',
  'weapon-shop': 'weapon-shop.glb',
  'spawn-stones': 'prop-spawn-stones.glb',
  'palisade-gate': 'prop-palisade-gate.glb',
  'great-tree': 'prop-great-tree.glb',
  'healing-stele': 'prop-healing-stele.glb',
  'village-sign': 'prop-village-sign.glb',
  cottage: 'prop-cottage.glb',
  apothecary: 'prop-apothecary.glb',
  'herb-rack': 'prop-herb-rack.glb',
  'potion-crate': 'prop-potion-crate.glb',
  'herb-crate': 'prop-herb-crate.glb',
  'potted-plant': 'prop-potted-plant.glb',
  barrel: 'prop-barrel.glb',
  'chief-house': 'prop-chief-house.glb',
  pitchfork: 'prop-pitchfork.glb',
  'old-well': 'prop-old-well.glb',
  'yard-wall': 'prop-yard-wall.glb',
  'yard-wall-end': 'prop-yard-wall-end.glb',
  'chief-field': 'prop-chief-field.glb',
  'cottage-field': 'prop-cottage-field.glb',
  'apothecary-field': 'prop-apothecary-field.glb',
  'pine-tree': 'prop-pine-tree.glb',
  bush: 'prop-bush.glb',
  clover: 'prop-clover.glb',
  rock: 'prop-rock.glb',
  fence: 'prop-fence.glb',
  cave: 'prop-cave.glb',
  'cave-torch': 'prop-cave-torch.glb',
  'cave-bars': 'prop-cave-bars.glb',
  'cave-skeleton': 'prop-cave-skeleton.glb',
  'cave-chest': 'prop-cave-chest.glb',
  'cave-chest-open': 'prop-cave-chest-open.glb',
  'cave-barrel': 'prop-cave-barrel.glb',
  'cave-barrel-open': 'prop-cave-barrel-open.glb',
};

/** The file name of the monster, the wild dog. */
export const MONSTER_FILE = 'wild-dog.glb';

/**
 * The name of the bone of the pitchfork in the hands of Martha, who holds
 * it only while she is out to deal with a player.
 */
export const PITCHFORK_BONE = 'Pitchfork';

/**
 * How high above the ground the number of a hit on a dog starts, in meters,
 * just above its health bar, as the dog is lower than a player.
 */
const DOG_HIT_HEIGHT = 1.8;

/** How a monster of a kind is shown. */
export interface MonsterModel {
  /** The file name of its model. */
  readonly file: string;
  /**
   * The name of the bone of the weapon in the hands of the model, which is
   * shown only while the monster holds it, or `null` for a kind that holds
   * none.
   */
  readonly weaponBone: string | null;
  /**
   * How high above the ground the number of a hit on the monster starts, in
   * meters, or `null` for as high as on a player.
   */
  readonly hitHeight: number | null;
}

/**
 * How each kind of monster is shown: the wild dogs as the wild dog, and
 * Martha, the village chief, who fights as a monster, as herself, with her
 * pitchfork in her hands.
 */
export const MONSTER_MODELS: Readonly<Record<MonsterKindId, MonsterModel>> = {
  'village-dog': {
    file: MONSTER_FILE,
    weaponBone: null,
    hitHeight: DOG_HIT_HEIGHT,
  },
  'cave-dog': {
    file: MONSTER_FILE,
    weaponBone: null,
    hitHeight: DOG_HIT_HEIGHT,
  },
  martha: {
    file: MODEL_FILES.martha,
    weaponBone: PITCHFORK_BONE,
    hitHeight: null,
  },
};

/**
 * The file name of Martha's pitchfork as it lies on the ground beside her
 * where she has dropped it, beaten.
 */
export const LYING_PITCHFORK_FILE = 'prop-pitchfork-lying.glb';

/**
 * The name the model of a four-leaf clover lying on the ground goes by
 * among the models, which the page draws itself instead of loading it.
 */
export const LYING_CLOVER_MODEL = 'drawn-lying-clover';

/**
 * The names of the models of the items drawn as they lie on the ground, by
 * their kinds: the file names of those loaded, and
 * {@link LYING_CLOVER_MODEL} for the four-leaf clover.
 */
export const LYING_ITEM_MODELS: Readonly<Record<ItemKindId, string>> = {
  clover: LYING_CLOVER_MODEL,
  sword: 'prop-item-sword.glb',
  'leather-armor': 'prop-item-leather-armor.glb',
  'healing-potion': 'prop-item-healing-potion.glb',
  'clovervale-message': 'prop-item-clovervale-message.glb',
  'spy-token': 'prop-item-spy-token.glb',
  'martha-ointment': 'prop-item-martha-ointment.glb',
};

/** The file names of the required models other than the characters. */
const FIXED_FILES: readonly string[] = [
  ...VILLAGERS.map((villager: Villager) => MODEL_FILES[villager.id]),
  MONSTER_FILE,
  MODEL_FILES['weapon-shop'],
  MODEL_FILES.fountain,
];

/** The file names of the models the game cannot do without. */
export const REQUIRED_MODEL_FILES: readonly string[] = [
  ...CHARACTER_FILES,
  ...FIXED_FILES,
];

/** The file names of the NPCs. */
const NPC_PATTERN = /^npc-[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;

/** The file names of the optional props. */
const PROP_PATTERN = /^prop-[a-z0-9]+(?:-[a-z0-9]+)*\.glb$/;

/**
 * Tells whether the game uses a model file.
 *
 * @param {string} file - The file name of the model.
 * @returns {boolean} Whether it does: a character, an NPC or a prop by its
 *   name, or one of the other required models.
 */
export function isModelUsed(file: string): boolean {
  return (
    CHARACTER_FILES.includes(file) ||
    NPC_PATTERN.test(file) ||
    PROP_PATTERN.test(file) ||
    FIXED_FILES.includes(file)
  );
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
    .filter(isModelUsed)
    .sort(compareCodeUnits);
  const missing: string[] = REQUIRED_MODEL_FILES.filter(
    (file: string) => !shown.includes(file),
  );
  return { shown, missing };
}
