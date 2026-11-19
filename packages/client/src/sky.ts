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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/sky The stars, the sun and the moon, far off in the sky.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import type { Camera, Object3D, Scene } from 'three';

import type { DaylightLook } from './daylight.ts';
import { createRandom } from './mountains.ts';

/**
 * How far from the camera the stars, the sun and the moon are drawn, in
 * metres: within the far plane of the camera.  They are drawn before
 * anything else, so that whatever stands in front of them hides them,
 * however far off it is.
 */
const SKY_DISTANCE = 500;
/** The number of stars. */
const STAR_COUNT = 1400;
/** The seed of where the stars are. */
const STAR_SEED = 0x57a125;
/** The lowest a star stands above the horizon, in degrees. */
const STAR_LOWEST = 3;
/** The size of a star, in pixels. */
const STAR_SIZE = 2;
/** The colour of the faintest star, as a share of the brightest. */
const STAR_FAINTEST = 0.35;
/**
 * The width of the picture of the sun, whose middle half the sun fills, in
 * metres at the distance of the sky.
 */
const SUN_SIZE = 46;
/** The colour of the sun high in the sky. */
const SUN_HIGH_COLOUR = '#fff4d6';
/** The colour of the sun on the horizon. */
const SUN_LOW_COLOUR = '#ff9a4c';
/**
 * The width of the picture of the moon, whose middle half the moon fills,
 * in metres at the distance of the sky.
 */
const MOON_SIZE = 32;
/** The colour of the moon. */
const MOON_COLOUR = '#dfe7ff';
/** The width and height of the picture of the sun and the moon, in pixels. */
const DISC_PIXELS = 64;

/**
 * Draws a round disc with a soft edge and a faint glow around it, white on
 * black, so that, added to the sky, it leaves the sky around it as it is.
 *
 * @returns {DataTexture} The picture.
 */
function drawDisc(): DataTexture {
  const data = new Uint8Array(DISC_PIXELS * DISC_PIXELS * 4);
  const middle: number = (DISC_PIXELS - 1) / 2;
  for (let y = 0; y < DISC_PIXELS; y++) {
    for (let x = 0; x < DISC_PIXELS; x++) {
      const distance: number = Math.hypot(x - middle, y - middle) / middle;
      // The disc fills the middle half, and its glow fades out beyond it.
      const disc: number = 1 - MathUtils.smoothstep(distance, 0.44, 0.5);
      const glow: number = 0.25 * Math.max(1 - distance, 0) ** 2;
      const level: number = Math.round(Math.min(disc + glow, 1) * 255);
      data.set([level, level, level, 255], (y * DISC_PIXELS + x) * 4);
    }
  }
  const texture = new DataTexture(data, DISC_PIXELS, DISC_PIXELS);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Scatters the stars over the sky, the same every time.
 *
 * @returns {BufferGeometry} The stars, a point each, around the origin,
 *   each with its colour.
 */
function scatterStars(): BufferGeometry {
  const random: () => number = createRandom(STAR_SEED);
  const lowest: number = Math.sin(MathUtils.degToRad(STAR_LOWEST));
  const positions: number[] = [];
  const colours: number[] = [];
  for (let index = 0; index < STAR_COUNT; index++) {
    // Spread evenly in height, the stars cover the dome evenly.
    const height: number = lowest + (1 - lowest) * random();
    const turn: number = random() * 2 * Math.PI;
    const across: number = Math.sqrt(1 - height * height);
    positions.push(
      Math.sin(turn) * across * SKY_DISTANCE,
      height * SKY_DISTANCE,
      Math.cos(turn) * across * SKY_DISTANCE,
    );
    // Most stars are faint, a few bright, some a little warm or cool.
    const brightness: number =
      STAR_FAINTEST + (1 - STAR_FAINTEST) * random() ** 3;
    const tint: number = (random() - 0.5) * 0.2;
    colours.push(
      brightness * (1 + tint),
      brightness,
      brightness * (1 - tint),
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  return geometry;
}

/**
 * Has an object in the sky drawn before everything else, over the colour
 * of the sky, so that whatever stands in front of it hides it.  As it is
 * drawn along with everything else that is opaque, it cannot fade through
 * its opacity: it should instead add its light to the sky, and fade by
 * adding less.
 *
 * @param {Object3D} object - The object.
 */
function hangInSky(object: Object3D): void {
  object.renderOrder = -1;
  object.frustumCulled = false;
}

/**
 * Creates a disc for the sun or the moon.
 *
 * @param {DataTexture} picture - The picture of a disc.
 * @param {number} size - The width of the picture of the disc, whose
 *   middle half the disc fills, in metres.
 * @returns {Mesh} The disc.
 */
function createDisc(picture: DataTexture, size: number): Mesh {
  const disc = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({
      map: picture,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fog: false,
    }),
  );
  disc.visible = false;
  return disc;
}

/**
 * The stars, the sun and the moon, drawn far off behind everything else
 * and moving with the camera, so that they keep still in the sky.  The
 * stars are drawn all at once, scattered the same every time.
 */
export class Sky {
  readonly #stars: Points;
  readonly #starMaterial: PointsMaterial;
  readonly #sun: Mesh;
  readonly #moon: Mesh;
  readonly #sunOffset = new Vector3();
  readonly #moonOffset = new Vector3();
  readonly #sunLow = new Color(SUN_LOW_COLOUR);
  readonly #sunHigh = new Color(SUN_HIGH_COLOUR);
  readonly #moonColour = new Color(MOON_COLOUR);

  /**
   * Puts the stars, the sun and the moon in a scene, all hidden until
   * shown.
   *
   * @param {Scene} scene - The scene.
   */
  constructor(scene: Scene) {
    this.#starMaterial = new PointsMaterial({
      size: STAR_SIZE,
      sizeAttenuation: false,
      vertexColors: true,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.#stars = new Points(scatterStars(), this.#starMaterial);
    this.#stars.visible = false;
    const picture: DataTexture = drawDisc();
    this.#sun = createDisc(picture, SUN_SIZE);
    this.#moon = createDisc(picture, MOON_SIZE);
    for (const object of [this.#stars, this.#sun, this.#moon]) {
      hangInSky(object);
      scene.add(object);
    }
    // The scene still does whatever it already did before being drawn.
    const prepareScene: Scene['onBeforeRender'] =
      scene.onBeforeRender.bind(scene);
    scene.onBeforeRender = (
      ...args: Parameters<Scene['onBeforeRender']>
    ): void => {
      prepareScene(...args);
      this.centreOn(args[2]);
    };
  }

  /**
   * Places the sky around a camera, as the scene does before that camera
   * draws it: the stars, the sun and the moon keep their place relative to
   * the camera wherever it goes, and do not turn as it turns, though the
   * sun and the moon face it.
   *
   * @param {Camera} camera - The camera.
   */
  centreOn(camera: Camera): void {
    this.#stars.position.copy(camera.position);
    this.#sun.position.copy(camera.position).add(this.#sunOffset);
    this.#moon.position.copy(camera.position).add(this.#moonOffset);
    for (const disc of [this.#sun, this.#moon]) {
      disc.quaternion.copy(camera.quaternion);
    }
    for (const object of [this.#stars, this.#sun, this.#moon]) {
      object.updateMatrixWorld();
    }
  }

  /**
   * Shows the stars, the sun and the moon as the village looks at a time
   * of day: the stars as strongly as the look says, if at all, and the sun
   * and the moon where they stand, if they are up, the sun warmer the
   * lower it is and the moon fainter as the stars fade.
   *
   * @param {DaylightLook} look - How the village looks.
   */
  show(look: DaylightLook): void {
    this.#starMaterial.color.setScalar(look.stars);
    this.#stars.visible = look.stars > 0;
    this.#placeDisc(this.#moon, this.#moonOffset, look.moon, MOON_SIZE);
    this.#placeDisc(this.#sun, this.#sunOffset, look.sun, SUN_SIZE);
    const height: number = MathUtils.radToDeg(Math.asin(look.sun.y));
    (this.#sun.material as MeshBasicMaterial).color.lerpColors(
      this.#sunLow,
      this.#sunHigh,
      MathUtils.smoothstep(height, 0, 30),
    );
    (this.#moon.material as MeshBasicMaterial).color
      .copy(this.#moonColour)
      .multiplyScalar(look.stars);
  }

  /**
   * Places the disc of the sun or the moon in the sky, showing it while
   * any part of it is above the horizon.
   *
   * @param {Mesh} disc - The disc.
   * @param {Vector3} offset - Where the disc stands from the camera.
   * @param {Vector3} direction - The direction towards the body.
   * @param {number} size - The width of the picture of the disc, whose
   *   middle half the disc fills, in metres.
   */
  #placeDisc(
    disc: Mesh,
    offset: Vector3,
    direction: Vector3,
    size: number,
  ): void {
    offset.copy(direction).multiplyScalar(SKY_DISTANCE);
    disc.visible = offset.y > -size / 4;
  }
}
