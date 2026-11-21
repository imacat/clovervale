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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/cave-scene Building the cave under the burrow of the wild
 *   dog, with the prisoner, the bones and the containers in it, and
 *   lighting it by its torches.
 */

import {
  AdditiveBlending,
  Color,
  DataTexture,
  Fog,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  RectAreaLight,
  Scene,
  Shape,
  ShapeGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
} from 'three';
import type { Material, Object3D, Texture } from 'three';
import {
  RectAreaLightUniformsLib,
} from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import {
  CAVE_CONTAINERS,
  CAVE_CONTAINER_FILES,
  CAVE_FLAMES,
  CAVE_FLAME_HEIGHT,
  CAVE_MOUTH,
  CAVE_MOUTH_OUTLINE,
  CAVE_PASSAGE,
  CAVE_PLACEMENTS,
  CAVE_TORCH_FILE,
  NOON,
  isEmptyContainer,
} from '@clovervale/shared';
import type {
  CaveContainer,
  CaveContainerFiles,
  GroundVector,
  Placement,
} from '@clovervale/shared';

import { Actor } from './actor.ts';
import { findDaylight } from './daylight.ts';
import type { DaylightLook } from './daylight.ts';
import type { LoadedModel } from './model-loader.ts';

/** The colour of the dark beyond the torchlight. */
const DARK_COLOUR = '#030204';
/** How far from the camera the dark starts to close in, in metres. */
const FOG_NEAR = 18;
/** How far from the camera the dark hides everything, in metres. */
const FOG_FAR = 46;
/** The colour of the faint light that comes from nowhere in the cave. */
const AMBIENT_SKY = '#5a5a78';
/** The colour of the faint light that comes up off the floor. */
const AMBIENT_GROUND = '#3a2c22';
/**
 * The strength of the faint light that comes from nowhere, enough for the
 * floor to be made out between the torches.
 */
const AMBIENT_INTENSITY = 0.9;
/** The colour of the light of a torch. */
const TORCH_COLOUR = '#ffa04a';
/**
 * The strength of the light of a torch, in candela, which falls off with
 * the distance rather than its square, so that the wall beside the torch is
 * lit warmly without a hot spot, and the floor across the passage is still
 * lit.
 */
const TORCH_INTENSITY = 3.2;
/** How the light of a torch falls off with the distance. */
const TORCH_DECAY = 1;
/** The farthest the light of a torch reaches, in metres. */
const TORCH_RANGE = 9;
/**
 * How far out from its flame, away from the wall, the light of a torch
 * shines from, in metres, so that the wall beside it is not lit from a
 * hand's breadth away.
 */
const TORCH_LIGHT_OUT = 0.35;
/** How much the light of a torch flickers, as a share of its strength. */
const FLICKER_DEPTH = 0.12;
/**
 * How long the two waves that make a torch flicker take, in seconds.
 * Neither is a whole multiple of the other, so that the flicker does not
 * fall into a plain rhythm.
 */
const FLICKER_PERIODS: readonly [number, number] = [0.61, 1.7];
/** The colour of the flame of a torch, unlit by anything. */
const FLAME_COLOUR = '#ffb04a';
/** The colour of the heart of the flame of a torch. */
const FLAME_CORE_COLOUR = '#fff2b8';
/** The colour of the glow around the flame of a torch. */
const HALO_COLOUR = '#ff9a40';
/** How wide the glow around the flame of a torch is, in metres. */
const HALO_SIZE = 0.75;
/** How strongly the glow around the flame of a torch shows, from 0 to 1. */
const HALO_STRENGTH = 0.55;
/** The width of the picture of a soft glow, in pixels. */
const GLOW_PIXELS = 64;
/** How brightly the opening of the mouth of the burrow shows at noon. */
const MOUTH_BRIGHTNESS = 1;
/**
 * How far in front of the face of the rock the opening of the mouth of the
 * burrow shows, in metres, so that the rock never hides it.
 */
const MOUTH_AHEAD = 0.01;
/**
 * How bright the opening of the mouth of the burrow is as a source of the
 * daylight falling in at noon, in nits, all over its area.
 */
const SPILL_INTENSITY = 5;
/**
 * How far in front of the opening of the mouth of the burrow the daylight
 * falling in comes from, in metres, so that the rock around the opening
 * does not stand in front of it.
 */
const SPILL_AHEAD = 0.05;
/** The parts of the flame of a torch, by the names of their materials. */
const FLAME_PARTS: ReadonlyMap<string, string> = new Map<string, string>([
  ['flame', FLAME_COLOUR],
  ['flameCore', FLAME_CORE_COLOUR],
]);

/** How the daylight outside shows at the mouth of the burrow. */
export interface MouthLight {
  /**
   * The colour the whole opening shows, unlit by anything, which is also
   * the colour of the daylight falling in.
   */
  readonly colour: Color;
  /**
   * How strong the daylight falling in is, from 0 at the darkest to 1 at
   * noon.
   */
  readonly strength: number;
}

/** The two models of a container, one of which is shown. */
interface ContainerFigure {
  /** The container shut, or `null` without its model. */
  readonly closed: Object3D | null;
  /** The container open and empty, or `null` without its model. */
  readonly open: Object3D | null;
}

/** The cave without its models, and its light. */
export interface CaveScene {
  /** The scene to add the models to. */
  readonly scene: Scene;
  /**
   * Stands the models of the cave in it, those that are among the models,
   * the flames of the torches burning bright, unlit by anything, the
   * prisoner idling, and each container shut or open as it was last shown,
   * all shut but those that hold nothing if never.
   *
   * @param {readonly LoadedModel[]} models - The models.
   */
  readonly populate: (models: readonly LoadedModel[]) => void;
  /**
   * Makes the torches flicker on, and the prisoner idle on, for one frame.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   */
  readonly update: (seconds: number) => void;
  /**
   * Shows each container open and empty if it holds nothing or has been
   * looted, and shut otherwise.
   *
   * @param {readonly number[]} looted - The numbers of the containers that
   *   have been looted.
   */
  readonly showLooted: (looted: readonly number[]) => void;
  /**
   * Tells which containers are shown open, for looking at.
   *
   * @returns {boolean[]} Whether each container is shown open, by its
   *   number.
   */
  readonly describeContainers: () => boolean[];
  /**
   * Shows the daylight outside at the mouth of the burrow as it is at a
   * time of day.
   *
   * @param {number} time - The time of day, from 0 up to 1.
   */
  readonly showTimeOfDay: (time: number) => void;
}

/** How strong the light of the sun is at noon, to measure it by. */
const NOON_STRENGTH: number = findDaylight(NOON).lightIntensity;

/**
 * The strength of the daylight outside while the sun is up but has no
 * strength yet, at dawn and at dusk, as a share of that at noon.
 */
const TWILIGHT_STRENGTH = 0.35;

/** The strength of the moonlight outside, as a share of noon daylight. */
const MOONLIGHT_STRENGTH = 0.18;

/**
 * Finds how the daylight outside shows at the mouth of the burrow at a
 * time of day, as the village looks then: the whole opening shows the
 * light of the sky, white by day, warm at dawn and at dusk and blue at
 * night; brightest at noon, dimmer at dawn and at dusk, and dim at night.
 *
 * @param {number} time - The time of day, from 0 up to 1.
 * @returns {MouthLight} How it shows.
 */
export function findMouthLight(time: number): MouthLight {
  const look: DaylightLook = findDaylight(time);
  const strength: number =
    look.body === 'sun'
      ? TWILIGHT_STRENGTH +
        (1 - TWILIGHT_STRENGTH) *
          MathUtils.clamp(look.lightIntensity / NOON_STRENGTH, 0, 1)
      : MOONLIGHT_STRENGTH;
  const colour: Color = look.skyLight.clone();
  const brightest: number = Math.max(colour.r, colour.g, colour.b, 1e-6);
  colour.multiplyScalar((MOUTH_BRIGHTNESS * strength) / brightest);
  return { colour, strength };
}

/**
 * Draws a soft round glow, brightest in its middle and fading out to its
 * edge, in white, in its transparency.
 *
 * @returns {Texture} The picture.
 */
function drawGlow(): Texture {
  const data = new Uint8Array(GLOW_PIXELS * GLOW_PIXELS * 4);
  const middle: number = (GLOW_PIXELS - 1) / 2;
  for (let y = 0; y < GLOW_PIXELS; y++) {
    for (let x = 0; x < GLOW_PIXELS; x++) {
      const distance: number = Math.hypot(x - middle, y - middle) / middle;
      const level: number = Math.max(1 - distance, 0) ** 2;
      const alpha: number = Math.round(level * 255);
      data.set([255, 255, 255, alpha], (y * GLOW_PIXELS + x) * 4);
    }
  }
  const texture = new DataTexture(data, GLOW_PIXELS, GLOW_PIXELS);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Makes the flames of a model of a torch burn bright, unlit by anything.
 *
 * @param {Object3D} model - The root of the model.
 */
function lightFlames(model: Object3D): void {
  model.traverse((node: Object3D) => {
    if (!(node instanceof Mesh)) {
      return;
    }
    const material: Material = node.material as Material;
    const colour: string | undefined = FLAME_PARTS.get(material.name);
    if (colour !== undefined) {
      node.material = new MeshBasicMaterial({ color: colour });
    }
  });
}

/**
 * Creates the cave without its models: the dark all round it and its
 * light, a faint light from nowhere, by which the floor can be made out,
 * and the warm, flickering light of each torch on the walls of the passage,
 * whose flame burns brighter than anything it lights, in a soft glow.  It
 * has no sky, no sun, no moon and no stars, but at the top of the slope at
 * its east end, out of reach, the mouth of the burrow opens onto the world
 * outside, the whole opening showing the light of the sky there, which
 * falls in down the slope, fading towards its foot.
 *
 * @returns {CaveScene} The cave.
 */
export function createCaveScene(): CaveScene {
  // The light from the opening of the mouth of the burrow needs these.
  RectAreaLightUniformsLib.init();
  const scene = new Scene();
  scene.background = new Color(DARK_COLOUR);
  scene.fog = new Fog(DARK_COLOUR, FOG_NEAR, FOG_FAR);
  scene.add(
    new HemisphereLight(AMBIENT_SKY, AMBIENT_GROUND, AMBIENT_INTENSITY),
  );
  const glow: Texture = drawGlow();
  const halos: Sprite[] = [];
  const torches: PointLight[] = CAVE_FLAMES.map((flame: GroundVector) => {
    const light = new PointLight(
      TORCH_COLOUR,
      TORCH_INTENSITY,
      TORCH_RANGE,
      TORCH_DECAY,
    );
    // The flames burn on the walls either side of the middle of the
    // passage, along which Z is zero.
    const out: number = -Math.sign(flame.z) * TORCH_LIGHT_OUT;
    light.position.set(flame.x, CAVE_FLAME_HEIGHT, flame.z + out);
    scene.add(light);
    const halo = new Sprite(
      new SpriteMaterial({
        map: glow,
        color: HALO_COLOUR,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    halo.position.set(flame.x, CAVE_FLAME_HEIGHT + 0.05, flame.z);
    halo.scale.setScalar(HALO_SIZE);
    scene.add(halo);
    halos.push(halo);
    return light;
  });
  const mouthMaterial = new MeshBasicMaterial({ fog: false });
  const outline: Vector2[] = CAVE_MOUTH_OUTLINE.map(
    ([across, height]) => new Vector2(across, height),
  );
  const mouth = new Mesh(new ShapeGeometry(new Shape(outline)), mouthMaterial);
  // The opening faces west, down the slope, across it running along Z.
  mouth.rotation.y = -Math.PI / 2;
  mouth.position.set(CAVE_MOUTH.x - MOUTH_AHEAD, 0, CAVE_MOUTH.z);
  scene.add(mouth);
  // The whole opening gives the daylight that falls in, over its whole
  // area, as the bright world outside does through it.
  const across: number[] = CAVE_MOUTH_OUTLINE.map(([side]) => side);
  const heights: number[] = CAVE_MOUTH_OUTLINE.map(([, height]) => height);
  const width: number = Math.max(...across) - Math.min(...across);
  const height: number = Math.max(...heights) - Math.min(...heights);
  const spill = new RectAreaLight(0xffffff, 0, width, height);
  spill.position.set(
    CAVE_MOUTH.x - SPILL_AHEAD,
    Math.min(...heights) + height / 2,
    CAVE_MOUTH.z + (Math.max(...across) + Math.min(...across)) / 2,
  );
  // It faces down the slope, towards its foot.
  spill.lookAt(CAVE_PASSAGE.east, 0, CAVE_MOUTH.z);
  scene.add(spill);
  let elapsed = 0;
  const actors: Actor[] = [];
  let figures: ContainerFigure[] = [];
  let looted = new Set<number>();
  const showContainers = (): void => {
    figures.forEach((figure: ContainerFigure, id: number) => {
      const container: CaveContainer | undefined = CAVE_CONTAINERS[id];
      const isOpen: boolean =
        looted.has(id) ||
        (container !== undefined && isEmptyContainer(container));
      if (figure.closed !== null) {
        figure.closed.visible = !isOpen;
      }
      if (figure.open !== null) {
        figure.open.visible = isOpen;
      }
    });
  };
  return {
    scene,
    populate: (models: readonly LoadedModel[]): void => {
      const used = new Set<string>();
      const stand = (placement: Placement): LoadedModel | null => {
        const model: LoadedModel | undefined = models.find(
          (candidate: LoadedModel) => candidate.file === placement.file,
        );
        if (model === undefined) {
          return null;
        }
        // A model that stands in several places is copied for all but the
        // first.
        const root: Object3D = used.has(model.file)
          ? clone(model.root)
          : model.root;
        used.add(model.file);
        placeModel(scene, root, placement);
        return { ...model, root };
      };
      for (const placement of CAVE_PLACEMENTS) {
        const model: LoadedModel | null = stand(placement);
        if (model === null) {
          continue;
        }
        if (placement.file === CAVE_TORCH_FILE) {
          lightFlames(model.root);
        }
        if (model.clips.length > 0) {
          model.root.traverse((node: Object3D) => {
            // An animated model moves out of the bounds of its resting pose.
            node.frustumCulled = false;
          });
          actors.push(new Actor(model.root, model.clips));
        }
      }
      figures = CAVE_CONTAINERS.map(
        (container: CaveContainer): ContainerFigure => {
          const files: CaveContainerFiles =
            CAVE_CONTAINER_FILES[container.kind];
          return {
            closed: stand({ ...container, file: files.closed })?.root ?? null,
            open: stand({ ...container, file: files.open })?.root ?? null,
          };
        },
      );
      showContainers();
    },
    showLooted: (numbers: readonly number[]): void => {
      looted = new Set<number>(numbers);
      showContainers();
    },
    describeContainers: (): boolean[] =>
      CAVE_CONTAINERS.map(
        (container: CaveContainer, id: number) =>
          looted.has(id) || isEmptyContainer(container),
      ),
    update: (seconds: number): void => {
      elapsed += seconds;
      for (const actor of actors) {
        actor.update(seconds);
      }
      torches.forEach((light: PointLight, index: number) => {
        const [first, second] = FLICKER_PERIODS;
        const wave: number =
          Math.sin((2 * Math.PI * elapsed) / first + index * 1.3) * 0.6 +
          Math.sin((2 * Math.PI * elapsed) / second + index * 2.1) * 0.4;
        light.intensity = TORCH_INTENSITY * (1 + FLICKER_DEPTH * wave);
        const halo: Sprite | undefined = halos[index];
        if (halo !== undefined) {
          halo.material.opacity = HALO_STRENGTH * (1 + FLICKER_DEPTH * wave);
        }
      });
    },
    showTimeOfDay: (time: number): void => {
      const { colour, strength } = findMouthLight(time);
      mouthMaterial.color.copy(colour);
      spill.color.copy(colour);
      spill.intensity = SPILL_INTENSITY * strength;
    },
  };
}

/**
 * Stands a model of the cave in it, without shadows, which the torches do
 * not cast.
 *
 * @param {Scene} scene - The cave.
 * @param {Object3D} model - The root of the model.
 * @param {Placement} placement - Where the model stands.
 */
function placeModel(
  scene: Scene,
  model: Object3D,
  placement: Placement,
): void {
  model.position.set(placement.x, 0, placement.z);
  model.rotation.y = (placement.yaw * Math.PI) / 180;
  scene.add(model);
}
