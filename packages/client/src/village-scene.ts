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
 *   of the houses and of the fortress far off.
 */

import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Fog,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from 'three';
import type { Color, Object3D } from 'three';

import type { GroundVector } from '@clovervale/shared';

import { Actor } from './actor.ts';
import {
  EARTH_PATCHES,
  EARTH_PATHS,
  outlineEarthPath,
} from './bare-earth.ts';
import type { EarthPatch, EarthPath, EarthStrip } from './bare-earth.ts';
import { createCloverCover } from './clover-cover.ts';
import { Daylight } from './daylight.ts';
import type { DaylightLook } from './daylight.ts';
import { prepareModel } from './figure-copies.ts';
import { ForgeGlow } from './forge-glow.ts';
import { createFortress, tintFortress } from './fortress.ts';
import { FountainGlow } from './fountain-glow.ts';
import { createHills, tintHills } from './hills.ts';
import type { MapScene } from './map-scene.ts';
import { MODEL_FILES } from './model-catalog.ts';
import { findModelRoot } from './model-library.ts';
import type { LoadedModel } from './model-loader.ts';
import { createModelPlacer } from './model-placement.ts';
import type { ModelPlacer } from './model-placement.ts';
import { createMountains, tintMountains } from './mountains.ts';
import { layoutVillage } from './village-layout.ts';
import { WindowGlow } from './window-glow.ts';

/**
 * The village, with its light, and the models that stand in it whoever is
 * connected, once they are shown.
 */
export interface VillageScene extends MapScene {
  /** The light and the colors of the village through the day. */
  readonly daylight: Daylight;
  /**
   * Stands the models that have a place in the village there, as far as
   * they are among the models, each idling if it is animated, scatters
   * the clover cover over the open grass around the village if the patch
   * of clover is among them, and starts the light in the windows of the
   * houses shown and of the fortress far off, and the glows of the fountain
   * and the forge, as far as their models are among them.
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
   * tells, with the light in the windows of the houses and of the fortress,
   * once the houses are shown.
   *
   * @param {number} time - The time of day, from 0 up to 1.
   */
  readonly showTimeOfDay: (time: number) => void;
}

/** The color of the grass. */
const GRASS_COLOR = '#8cc65c';
/** The color of the bare earth. */
export const EARTH_COLOR = '#d2995f';
/** How high above the ground the lowest bare earth lies, in meters. */
const EARTH_HEIGHT = 0.004;
/**
 * How much higher than the one before each patch or path of bare earth
 * lies, in meters.
 */
const EARTH_HEIGHT_STEP = 0.001;
/** The radius of the ground, which reaches under every mountain, in meters. */
const GROUND_RADIUS = 440;
/** How far from the camera the fog starts, in meters. */
const FOG_NEAR = 70;
/**
 * How far from the camera the fog hides everything, in meters: beyond the
 * farthest mountain, so that the mountains pale with distance, but none is
 * lost in it.
 */
const FOG_FAR = 760;

/**
 * Creates a flat disk lying on the ground.
 *
 * @param {string} color - The color of the disk.
 * @param {number} height - The height of the disk above the ground, in
 *   meters.
 * @returns {Mesh} The disk, one meter in radius.
 */
function createDisk(color: string, height: number): Mesh {
  const disk = new Mesh(
    new CircleGeometry(1, 48),
    new MeshStandardMaterial({ color, roughness: 1 }),
  );
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = height;
  disk.receiveShadow = true;
  return disk;
}

/**
 * Finds how high above the ground a patch or path of bare earth lies: each
 * a little higher than the one before, so that none flickers where they
 * overlap, and all below the top of the flattest item lying on them.
 *
 * @param {number} layer - The place of the patch or path among them all,
 *   the patches first, from 0.
 * @returns {number} The height, in meters.
 */
export function findEarthHeight(layer: number): number {
  return EARTH_HEIGHT + layer * EARTH_HEIGHT_STEP;
}

/**
 * Creates a strip of bare earth lying on the ground.
 *
 * @param {EarthStrip} strip - The strip.
 * @param {number} height - The height of the strip above the ground, in
 *   meters.
 * @returns {Mesh} The strip, facing up.
 */
function createStrip(strip: EarthStrip, height: number): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  strip.left.forEach((left: GroundVector, row: number) => {
    const right: GroundVector = strip.right[row] ?? left;
    positions.push(left.x, 0, left.z, right.x, 0, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    if (row > 0) {
      const [lastLeft, lastRight, nextLeft, nextRight] = [
        2 * row - 2,
        2 * row - 1,
        2 * row,
        2 * row + 1,
      ];
      indices.push(lastRight, nextRight, lastLeft);
      indices.push(lastLeft, nextRight, nextLeft);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: EARTH_COLOR, roughness: 1 }),
  );
  mesh.position.y = height;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Creates the village without its models: the ground, the low hills with
 * pine trees just outside it, open toward the way out through its gate,
 * the mountains far beyond them, the border fortress that guards the pass
 * far off through that opening, and the sky, the fog and the light, as at
 * noon until told the time.
 *
 * @returns {VillageScene} The village.
 */
export function createVillageScene(): VillageScene {
  const scene = new Scene();
  const fog = new Fog(0, FOG_NEAR, FOG_FAR);
  scene.fog = fog;

  const ground: Mesh = createDisk(GRASS_COLOR, 0);
  ground.scale.setScalar(GROUND_RADIUS);
  scene.add(ground);
  EARTH_PATCHES.forEach(
    ([x, z, radiusX, radiusZ, yaw]: EarthPatch, index: number) => {
      const patch: Mesh = createDisk(EARTH_COLOR, findEarthHeight(index));
      patch.position.x = x;
      patch.position.z = z;
      patch.scale.set(radiusX, radiusZ, 1);
      patch.rotation.z = (yaw * Math.PI) / 180;
      scene.add(patch);
    },
  );
  EARTH_PATHS.forEach((path: EarthPath, index: number) => {
    scene.add(
      createStrip(
        outlineEarthPath(path),
        findEarthHeight(EARTH_PATCHES.length + index),
      ),
    );
  });
  const mountains: Object3D = createMountains();
  const hills: Object3D = createHills();
  const fortress: Object3D = createFortress();
  scene.add(mountains, hills, fortress);
  const daylight = new Daylight(scene, fog, [
    {
      tint: (sky: Color, share: number): void => {
        tintMountains(mountains, sky, share);
      },
    },
    {
      tint: (sky: Color, share: number): void => {
        tintFortress(fortress, sky, share);
      },
    },
    {
      tint: (sky: Color, share: number): void => {
        tintHills(hills, sky, share);
      },
    },
  ]);
  const actors: Actor[] = [];
  let fountainGlow: FountainGlow | null = null;
  let forgeGlow: ForgeGlow | null = null;
  let windowGlow: WindowGlow | null = null;
  return {
    scene,
    daylight,
    populate: (models: readonly LoadedModel[]): void => {
      const clover: Object3D | null = findModelRoot(
        models,
        MODEL_FILES.clover,
      );
      if (clover !== null) {
        scene.add(createCloverCover(clover));
      }
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
