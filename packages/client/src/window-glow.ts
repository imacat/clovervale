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
 * @module client/window-glow The warm light in the windows of the houses,
 *   and of the fortress far off, from late in the day, shortly before
 *   dusk, until the end of dawn.
 */

import { Color, Mesh, MeshStandardMaterial } from 'three';
import type { Material, Object3D } from 'three';

/**
 * The name of the material of the glass of the windows that the light
 * lights, in the models and in the fortress.
 */
export const GLASS_MATERIAL = 'glass';
/** The color of the light in the windows. */
const LAMPLIGHT_COLOR = '#ffb45c';
/** How strongly the windows glow when they are fully lit. */
const LAMPLIGHT_STRENGTH = 1.1;

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
 * The light in the windows of the houses, and of the fortress far off,
 * which glow warmly from late in the day, shortly before dusk, until the
 * end of dawn.
 */
export class WindowGlow {
  readonly #glass: MeshStandardMaterial[] = [];

  /**
   * Finds the windows of the houses and of the fortress, which stay dark
   * until lit.
   *
   * @param {Object3D} root - The village, which holds the houses and the
   *   fortress.
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
          material.name === GLASS_MATERIAL &&
          !this.#glass.includes(material)
        ) {
          material.emissive = new Color(LAMPLIGHT_COLOR);
          this.#glass.push(material);
        }
      }
    });
    this.show(0);
  }

  /**
   * Lights the windows up.
   *
   * @param {number} strength - How brightly, from 0 for dark windows to 1
   *   for fully lit windows.
   */
  show(strength: number): void {
    for (const material of this.#glass) {
      material.emissiveIntensity = LAMPLIGHT_STRENGTH * strength;
    }
  }
}
