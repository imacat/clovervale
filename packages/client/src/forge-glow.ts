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
 * @module client/forge-glow The glow of the coals in the forge of the weapon
 *   shop, of the hot iron on its anvil, and of its flames.
 */

import { Color, Mesh, MeshStandardMaterial } from 'three';
import type { Material, Object3D } from 'three';

/**
 * The colours the coals and the hot iron glow in, by the names of their
 * materials in the model of the weapon shop.
 */
const EMBER_COLOURS: ReadonlyMap<string, string> = new Map<string, string>([
  ['embers', '#ff4a14'],
  ['hotIron', '#ff5a1e'],
]);
/**
 * The names of the materials of the flames in the model, which glow in the
 * colours the model gives them.
 */
const FLAME_MATERIALS: readonly string[] = ['fire', 'glow'];
/** The least strength of the glow of the coals and of the hot iron. */
const EMBER_LEAST = 0.7;
/** The greatest strength of the glow of the coals and of the hot iron. */
const EMBER_MOST = 1.1;
/**
 * How long the glow of the coals and of the hot iron takes to wax and wane,
 * in seconds.
 */
const EMBER_PERIOD = 3;
/** The least strength of the glow of the flames. */
const FLAME_LEAST = 0.75;
/** The greatest strength of the glow of the flames. */
const FLAME_MOST = 1.25;
/**
 * How long the two waves that make the flames flicker take, in seconds.
 * Neither is a whole multiple of the other, so that the flicker does not
 * fall into a plain rhythm.
 */
const FLAME_PERIODS: readonly [number, number] = [0.7, 1.9];

/** A material that glows, and when its glow starts. */
interface Glowing {
  /** The material. */
  readonly material: MeshStandardMaterial;
  /** How far into its wave the glow starts, from 0 to 1. */
  readonly phase: number;
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
 * The glow of the forge of the weapon shop: its coals and the hot iron on
 * its anvil glow orange-red, pulsing gently, and its flames flicker.
 */
export class ForgeGlow {
  readonly #embers: Glowing[] = [];
  readonly #flames: MeshStandardMaterial[] = [];
  #time = 0;

  /**
   * Makes the coals and the hot iron of the forge glow, and its flames
   * flicker.
   *
   * @param {Object3D} root - The root of the model of the weapon shop.
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
        if (!(material instanceof MeshStandardMaterial)) {
          continue;
        }
        const colour: string | undefined = EMBER_COLOURS.get(material.name);
        if (
          colour !== undefined &&
          !this.#embers.some((glowing: Glowing) => glowing.material === material)
        ) {
          material.emissive = new Color(colour);
          // The iron glows a little out of step with the coals.
          this.#embers.push({ material, phase: this.#embers.length * 0.3 });
        } else if (
          FLAME_MATERIALS.includes(material.name) &&
          !this.#flames.includes(material)
        ) {
          this.#flames.push(material);
        }
      }
    });
    this.update(0);
  }

  /**
   * Moves the glow of the coals, of the hot iron and of the flames on.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    this.#time += seconds;
    for (const { material, phase } of this.#embers) {
      const angle: number = 2 * Math.PI * (this.#time / EMBER_PERIOD + phase);
      const wave: number = (1 - Math.cos(angle)) / 2;
      material.emissiveIntensity =
        EMBER_LEAST + (EMBER_MOST - EMBER_LEAST) * wave;
    }
    const [fast, slow] = FLAME_PERIODS;
    const flicker: number =
      (2 +
        Math.sin((2 * Math.PI * this.#time) / fast) +
        Math.sin((2 * Math.PI * this.#time) / slow)) /
      4;
    for (const material of this.#flames) {
      material.emissiveIntensity =
        FLAME_LEAST + (FLAME_MOST - FLAME_LEAST) * flicker;
    }
  }
}
