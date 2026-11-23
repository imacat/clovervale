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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/fountain-glow The soft light of the water of the healing
 *   fountain, and the motes of light that rise from it.
 */

import {
  AdditiveBlending,
  Color,
  DataTexture,
  Mesh,
  MeshStandardMaterial,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Material, Object3D } from 'three';

/** The name of the material of the water in the model of the fountain. */
const WATER_MATERIAL = 'water';
/** The color the water glows in. */
const GLOW_COLOR = '#3fd6b0';
/** The least strength of the glow of the water. */
const GLOW_LEAST = 0.45;
/** The greatest strength of the glow of the water. */
const GLOW_MOST = 0.75;
/** How long the glow of the water takes to wax and wane, in seconds. */
const GLOW_PERIOD = 5;

/** The number of motes of light. */
export const MOTE_COUNT = 10;
/** How long a mote of light lasts, in seconds. */
export const MOTE_LIFETIME = 4.5;
/** The height of the water the motes rise from, in meters. */
export const WATER_HEIGHT = 0.62;
/** How fast a mote rises, in meters per second. */
const RISE_SPEED = 0.32;
/**
 * The least distance of a mote from the middle of the fountain, in meters,
 * outside the bowl above the water.
 */
export const MOTE_LEAST_RADIUS = 0.88;
/**
 * The greatest distance of a mote from the middle of the fountain, in
 * meters, inside the rim of the basin.
 */
export const MOTE_MOST_RADIUS = 1.04;
/** How far a mote sways to either side as it rises, in meters. */
const SWAY = 0.06;
/** The size of a mote, in meters. */
const MOTE_SIZE = 0.16;
/** The color of a mote. */
const MOTE_COLOR = '#b8ffcf';
/** The width and height of the picture of a mote, in pixels. */
const MOTE_PIXELS = 16;

/** A mote of light. */
interface Mote {
  /** The mote, drawn on a sprite. */
  readonly sprite: Sprite;
  /** How long it has risen in this life, in seconds. */
  age: number;
  /** The number of lives it has had. */
  lives: number;
}

/**
 * Draws a soft round spot, white and opaque in the middle, fading out
 * toward the edge.
 *
 * @returns {DataTexture} The picture.
 */
function drawSpot(): DataTexture {
  const data = new Uint8Array(MOTE_PIXELS * MOTE_PIXELS * 4);
  const middle: number = (MOTE_PIXELS - 1) / 2;
  for (let y = 0; y < MOTE_PIXELS; y++) {
    for (let x = 0; x < MOTE_PIXELS; x++) {
      const distance: number = Math.hypot(x - middle, y - middle) / middle;
      const alpha: number = Math.max(1 - distance, 0) ** 1.5;
      const index: number = (y * MOTE_PIXELS + x) * 4;
      data.set([255, 255, 255, Math.round(alpha * 255)], index);
    }
  }
  const texture = new DataTexture(data, MOTE_PIXELS, MOTE_PIXELS);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Tells whether a node of a model is a mesh.
 *
 * @param {Object3D} node - The node.
 * @returns {boolean} True if the node is a mesh, or false otherwise.
 */
function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

/**
 * The soft light of the water of the healing fountain, waxing and waning,
 * and the motes of light that rise slowly from the water and fade.
 */
export class FountainGlow {
  readonly #water: MeshStandardMaterial[] = [];
  readonly #motes: Mote[] = [];
  #time = 0;

  /**
   * Makes the water of the fountain glow, and starts the motes rising from
   * it.
   *
   * @param {Object3D} root - The root of the model of the fountain, which
   *   the motes are added to.
   */
  constructor(root: Object3D) {
    root.traverse((node: Object3D) => {
      if (!isMesh(node)) {
        return;
      }
      const materials: Material[] = Array.isArray(node.material)
        ? node.material
        : [node.material];
      for (const material of materials) {
        if (
          material instanceof MeshStandardMaterial &&
          material.name === WATER_MATERIAL &&
          !this.#water.includes(material)
        ) {
          material.emissive = new Color(GLOW_COLOR);
          this.#water.push(material);
        }
      }
    });
    const spot: DataTexture = drawSpot();
    for (let index = 0; index < MOTE_COUNT; index++) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: spot,
          color: MOTE_COLOR,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.scale.setScalar(MOTE_SIZE);
      root.add(sprite);
      // The motes start at different points of their lives.
      this.#motes.push({
        sprite,
        age: (MOTE_LIFETIME * index) / MOTE_COUNT,
        lives: 0,
      });
    }
    this.update(0);
  }

  /**
   * Moves the glow of the water and the motes on.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    this.#time += seconds;
    const wave: number =
      (1 - Math.cos((2 * Math.PI * this.#time) / GLOW_PERIOD)) / 2;
    for (const material of this.#water) {
      material.emissiveIntensity = GLOW_LEAST + (GLOW_MOST - GLOW_LEAST) * wave;
    }
    this.#motes.forEach((mote: Mote, index: number) => {
      mote.age += seconds;
      while (mote.age >= MOTE_LIFETIME) {
        mote.age -= MOTE_LIFETIME;
        mote.lives++;
      }
      // Each life starts somewhere else around the water.
      const seed: number = index * 7 + mote.lives * 3;
      const angle: number = seed * 2.39996;
      const share: number = (Math.sin(seed * 12.9898) + 1) / 2;
      const radius: number =
        MOTE_LEAST_RADIUS + (MOTE_MOST_RADIUS - MOTE_LEAST_RADIUS) * share;
      const sway: number = SWAY * Math.sin(mote.age * 1.7 + seed);
      const life: number = mote.age / MOTE_LIFETIME;
      mote.sprite.position.set(
        radius * Math.sin(angle) + sway * Math.cos(angle),
        WATER_HEIGHT + RISE_SPEED * mote.age,
        radius * Math.cos(angle) - sway * Math.sin(angle),
      );
      mote.sprite.material.opacity = Math.sin(Math.PI * life);
    });
  }
}
