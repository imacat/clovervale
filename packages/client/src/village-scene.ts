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
 * @module client/village-scene Building the village the models stand in.
 */

import { CircleGeometry, Fog, Mesh, MeshStandardMaterial, Scene } from 'three';
import type { Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { Actor } from './actor.ts';
import { Daylight } from './daylight.ts';
import { CHARACTER_FILES, MONSTER_FILE } from './model-catalogue.ts';
import type { LoadedModel } from './model-loader.ts';
import { createMountains } from './mountains.ts';
import type { Figure } from './player-figures.ts';
import { layoutVillage } from './village-layout.ts';
import type { Placement } from './village-layout.ts';

/**
 * A patch of bare earth: its centre, its radii along X and Z, and its turn
 * around the Y axis, in degrees.
 */
type Patch = readonly [
  x: number,
  z: number,
  radiusX: number,
  radiusZ: number,
  yaw: number,
];

/** The village without its models, and its light. */
export interface VillageScene {
  /** The scene to add the models to. */
  readonly scene: Scene;
  /** The light and the colours of the village through the day. */
  readonly daylight: Daylight;
}

/** The colour of the grass. */
const GRASS_COLOUR = '#8cc65c';
/** The colour of the bare earth. */
const EARTH_COLOUR = '#d2995f';
/** The radius of the ground, which reaches under every mountain, in metres. */
const GROUND_RADIUS = 440;
/** How far from the camera the fog starts, in metres. */
const FOG_NEAR = 70;
/**
 * How far from the camera the fog hides everything, in metres: beyond the
 * farthest mountain, so that the mountains pale with distance, but none is
 * lost in it.
 */
const FOG_FAR = 760;

/**
 * The plaza, the paths into and out of it, the way from the plaza up to the
 * porch of the chief's house, and the monster's ground.  The path on the
 * east, narrower than the one on the west, winds in three lengths from
 * behind the great tree past the end of the low wall in front of the
 * chief's yard, on the side away from the house, and past the end of the
 * fence behind the tree, to the back of the village.
 */
const PATCHES: readonly Patch[] = [
  [0, 8, 2.6, 16, 0],
  [0, -8, 9, 8.2, 0],
  [-5.2, -21, 1.6, 10, -12],
  [2.15, -17.2, 0.9, 2.7, 3.6],
  [3.25, -20.9, 0.9, 2.25, -39.8],
  [4.45, -26.35, 0.9, 4.45, 0.7],
  [5.3, -14.6, 1.4, 1.8, -60],
  [10, 8, 4, 3, 0],
];

/**
 * Creates a flat disc lying on the ground.
 *
 * @param {string} colour - The colour of the disc.
 * @param {number} height - The height of the disc above the ground, in
 *   metres.
 * @returns {Mesh} The disc, one metre in radius.
 */
function createDisc(colour: string, height: number): Mesh {
  const disc = new Mesh(
    new CircleGeometry(1, 48),
    new MeshStandardMaterial({ color: colour, roughness: 1 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = height;
  disc.receiveShadow = true;
  return disc;
}

/**
 * Creates the village without its models: the ground, the mountains around
 * it, and the sky, the fog and the light, as at noon until told the time.
 *
 * @returns {VillageScene} The scene to add the models to, and its light.
 */
export function createVillageScene(): VillageScene {
  const scene = new Scene();
  scene.fog = new Fog(0, FOG_NEAR, FOG_FAR);

  const ground: Mesh = createDisc(GRASS_COLOUR, 0);
  ground.scale.setScalar(GROUND_RADIUS);
  scene.add(ground);
  PATCHES.forEach(([x, z, radiusX, radiusZ, yaw]: Patch, index: number) => {
    // Each patch lies a little higher than the last, so that none flickers.
    const patch: Mesh = createDisc(EARTH_COLOUR, 0.004 + index * 0.001);
    patch.position.x = x;
    patch.position.z = z;
    patch.scale.set(radiusX, radiusZ, 1);
    patch.rotation.z = (yaw * Math.PI) / 180;
    scene.add(patch);
  });
  scene.add(createMountains());
  return { scene, daylight: new Daylight(scene) };
}

/**
 * Makes a model cast and receive shadows, wherever its animation takes it.
 *
 * @param {Object3D} model - The root of the model.
 */
function prepareModel(model: Object3D): void {
  model.traverse((node: Object3D) => {
    node.castShadow = true;
    node.receiveShadow = true;
    // An animated model moves out of the bounds of its resting pose.
    node.frustumCulled = false;
  });
}

/**
 * Stands a model in the village.
 *
 * @param {Scene} scene - The village.
 * @param {Object3D} model - The root of the model.
 * @param {Placement} placement - Where the model stands.
 */
function placeModel(
  scene: Scene,
  model: Object3D,
  placement: Placement,
): void {
  prepareModel(model);
  model.position.set(placement.x, 0, placement.z);
  model.rotation.y = (placement.yaw * Math.PI) / 180;
  scene.add(model);
}

/**
 * Stands the models that have a place in the village there, each idling if
 * it is animated.
 *
 * @param {Scene} scene - The village.
 * @param {readonly LoadedModel[]} models - The models.
 * @returns {Actor[]} The models as actors, to animate.
 */
export function populateVillage(
  scene: Scene,
  models: readonly LoadedModel[],
): Actor[] {
  const actors: Actor[] = [];
  const used = new Set<string>();
  const files: string[] = models.map((model: LoadedModel) => model.file);
  for (const placement of layoutVillage(files)) {
    const model: LoadedModel | undefined = models.find(
      (candidate: LoadedModel) => candidate.file === placement.file,
    );
    if (model === undefined) {
      continue;
    }
    // A model that stands in several places is copied for all but the first.
    const root: Object3D = used.has(model.file)
      ? clone(model.root)
      : model.root;
    used.add(model.file);
    placeModel(scene, root, placement);
    actors.push(new Actor(root, model.clips));
  }
  return actors;
}

/**
 * Makes a model to show a player with, ready to stand in the village.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @param {number} appearance - The number of the appearance of the player,
 *   from 1.
 * @returns {Figure | null} A copy of the character of that appearance, or
 *   `null` if that character is not among the models.
 */
export function createPlayerFigure(
  models: readonly LoadedModel[],
  appearance: number,
): Figure | null {
  const file: string | undefined = CHARACTER_FILES[appearance - 1];
  const model: LoadedModel | undefined = models.find(
    (candidate: LoadedModel) => candidate.file === file,
  );
  if (model === undefined) {
    return null;
  }
  const root: Object3D = clone(model.root);
  prepareModel(root);
  return { root, clips: model.clips };
}

/**
 * Makes a model to show the monster with, ready to stand in the village.
 *
 * @param {readonly LoadedModel[]} models - The models.
 * @returns {Figure | null} A copy of the monster, or `null` if the monster
 *   is not among the models.
 */
export function createMonsterFigure(
  models: readonly LoadedModel[],
): Figure | null {
  const model: LoadedModel | undefined = models.find(
    (candidate: LoadedModel) => candidate.file === MONSTER_FILE,
  );
  if (model === undefined) {
    return null;
  }
  const root: Object3D = clone(model.root);
  prepareModel(root);
  return { root, clips: model.clips };
}
