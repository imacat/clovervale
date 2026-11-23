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
 * @module client/village-scene Building the village, with the models that
 *   stand in it whoever is connected, and lighting it through the day, with
 *   the glow of the fountain and of the forge, and the light in the windows
 *   of the houses.
 */

import { CircleGeometry, Fog, Mesh, MeshStandardMaterial, Scene } from 'three';
import type { Object3D } from 'three';

import { Actor } from './actor.ts';
import { Daylight } from './daylight.ts';
import type { DaylightLook } from './daylight.ts';
import { prepareModel } from './figure-copies.ts';
import { ForgeGlow } from './forge-glow.ts';
import { FountainGlow } from './fountain-glow.ts';
import type { MapScene } from './map-scene.ts';
import { MODEL_FILES } from './model-catalogue.ts';
import { findModelRoot } from './model-library.ts';
import type { LoadedModel } from './model-loader.ts';
import { createModelPlacer } from './model-placement.ts';
import type { ModelPlacer } from './model-placement.ts';
import { createMountains } from './mountains.ts';
import { layoutVillage } from './village-layout.ts';
import { WindowGlow } from './window-glow.ts';

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

/**
 * The village, with its light, and the models that stand in it whoever is
 * connected, once they are shown.
 */
export interface VillageScene extends MapScene {
  /** The light and the colours of the village through the day. */
  readonly daylight: Daylight;
  /**
   * Stands the models that have a place in the village there, as far as
   * they are among the models, each idling if it is animated, and starts
   * the light in the windows of the houses shown, and the glows of the
   * fountain and the forge, as far as their models are among them.
   *
   * @param {readonly LoadedModel[]} models - The models.
   */
  readonly populate: (models: readonly LoadedModel[]) => void;
  /**
   * Moves the models that stand in the village, and the glows of the
   * fountain and the forge, on, for one frame.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   */
  readonly update: (seconds: number) => void;
  /**
   * Shows the village as it looks at a time of day, as {@link Daylight.show}
   * tells, with the light in the windows of the houses, once they are
   * shown.
   *
   * @param {number} time - The time of day, from 0 up to 1.
   */
  readonly showTimeOfDay: (time: number) => void;
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
 * @returns {VillageScene} The village.
 */
export function createVillageScene(): VillageScene {
  const scene = new Scene();
  const fog = new Fog(0, FOG_NEAR, FOG_FAR);
  scene.fog = fog;

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
  const mountains: Object3D = createMountains();
  scene.add(mountains);
  const daylight = new Daylight(scene, fog, mountains);
  const actors: Actor[] = [];
  let fountainGlow: FountainGlow | null = null;
  let forgeGlow: ForgeGlow | null = null;
  let windowGlow: WindowGlow | null = null;
  return {
    scene,
    daylight,
    populate: (models: readonly LoadedModel[]): void => {
      actors.push(...populateVillage(scene, models));
      windowGlow = new WindowGlow(scene);
      const fountain: Object3D | null = findModelRoot(
        models,
        MODEL_FILES.fountain,
      );
      if (fountain !== null) {
        fountainGlow = new FountainGlow(fountain);
      }
      const weaponShop: Object3D | null = findModelRoot(
        models,
        MODEL_FILES['weapon-shop'],
      );
      if (weaponShop !== null) {
        forgeGlow = new ForgeGlow(weaponShop);
      }
    },
    update: (seconds: number): void => {
      for (const actor of actors) {
        actor.update(seconds);
      }
      fountainGlow?.update(seconds);
      forgeGlow?.update(seconds);
    },
    showTimeOfDay: (time: number): void => {
      const look: DaylightLook = daylight.show(time);
      windowGlow?.show(look.windows);
    },
  };
}

/**
 * Stands the models that have a place in the village there, each idling if
 * it is animated.
 *
 * @param {Scene} scene - The village.
 * @param {readonly LoadedModel[]} models - The models.
 * @returns {Actor[]} The models as actors, to animate.
 */
function populateVillage(
  scene: Scene,
  models: readonly LoadedModel[],
): Actor[] {
  const actors: Actor[] = [];
  const place: ModelPlacer = createModelPlacer(scene, models);
  const files: string[] = models.map((model: LoadedModel) => model.file);
  for (const placement of layoutVillage(files)) {
    const model: LoadedModel | null = place(placement);
    if (model === null) {
      continue;
    }
    prepareModel(model.root);
    actors.push(new Actor(model.root, model.clips));
  }
  return actors;
}
