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

import {
  CircleGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from 'three';
import type { Object3D } from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { Actor } from './actor.ts';
import { classifyModel } from './model-catalogue.ts';
import type { LoadedModel } from './model-loader.ts';
import { layoutVillage } from './village-layout.ts';
import type { Placement } from './village-layout.ts';

/** A patch of bare earth: its centre and its radii along X and Z. */
type Patch = readonly [x: number, z: number, radiusX: number, radiusZ: number];

/** The colour of the sky. */
const SKY_COLOUR = '#bfe4f2';
/** The colour of the grass. */
const GRASS_COLOUR = '#8cc65c';
/** The colour of the bare earth. */
const EARTH_COLOUR = '#d2995f';
/** The radius of the ground, in metres. */
const GROUND_RADIUS = 300;
/** Half the width of the square of ground that receives shadows, in metres. */
const SHADOW_REACH = 34;

/** The square around the fountain, the paths and the monster's ground. */
const PATCHES: readonly Patch[] = [
  [0, 1, 2.2, 12],
  [0, -8.5, 5.5, 4.6],
  [6, -6.5, 6, 2],
  [-6, -6, 6, 2],
  [0, -2, 6.8, 1.5],
  [10.2, 6.3, 3.6, 2.8],
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
 * Creates the sun, which casts the shadows of the village.
 *
 * @returns {DirectionalLight} The sun.
 */
function createSun(): DirectionalLight {
  const sun = new DirectionalLight('#fff1d8', 2.4);
  sun.position.set(-22, 36, 14);
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -SHADOW_REACH;
  sun.shadow.camera.right = SHADOW_REACH;
  sun.shadow.camera.bottom = -SHADOW_REACH;
  sun.shadow.camera.top = SHADOW_REACH;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  return sun;
}

/**
 * Creates the village without its models: the sky, the ground and the light.
 *
 * @returns {Scene} The scene to add the models to.
 */
export function createVillageScene(): Scene {
  const scene = new Scene();
  scene.background = new Color(SKY_COLOUR);
  scene.fog = new Fog(SKY_COLOUR, 70, GROUND_RADIUS);
  scene.add(new HemisphereLight('#ffffff', '#8aa868', 1.5));
  const sun: DirectionalLight = createSun();
  scene.add(sun, sun.target);

  const ground: Mesh = createDisc(GRASS_COLOUR, 0);
  ground.scale.setScalar(GROUND_RADIUS);
  scene.add(ground);
  PATCHES.forEach(([x, z, radiusX, radiusZ]: Patch, index: number) => {
    // Each patch lies a little higher than the last, so that none flickers.
    const patch: Mesh = createDisc(EARTH_COLOUR, 0.004 + index * 0.001);
    patch.position.x = x;
    patch.position.z = z;
    patch.scale.set(radiusX, radiusZ, 1);
    scene.add(patch);
  });
  return scene;
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
  model.traverse((node: Object3D) => {
    node.castShadow = true;
    node.receiveShadow = true;
    // An animated model moves out of the bounds of its resting pose.
    node.frustumCulled = false;
  });
  model.position.set(placement.x, 0, placement.z);
  model.rotation.y = (placement.yaw * Math.PI) / 180;
  scene.add(model);
}

/**
 * Stands the models in the village, each idling if it is animated.
 *
 * @param {Scene} scene - The village.
 * @param {readonly LoadedModel[]} models - The models.
 * @returns {Actor[]} The models as actors, to animate and to direct.
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
    const kind = classifyModel(placement.file);
    if (model === undefined || kind === null) {
      continue;
    }
    // A model that stands in several places is copied for all but the first.
    const root: Object3D = used.has(model.file)
      ? clone(model.root)
      : model.root;
    used.add(model.file);
    placeModel(scene, root, placement);
    actors.push(new Actor(root, model.clips, kind));
  }
  return actors;
}
