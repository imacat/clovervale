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
 * @module client/tests/forge-glow Tests for the glow of the forge of the
 *   weapon shop.
 */

import { BoxGeometry, Color, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { ForgeGlow } from '../src/forge-glow.ts';

/** The color the flames of the model glow in by themselves. */
const FLAME_COLOR = '#ff6a00';

/** A model of the forge, with what glows in it and what does not. */
interface ForgeModel {
  /** The root of the model. */
  readonly root: Object3D;
  /** The materials, by their names. */
  readonly materials: ReadonlyMap<string, MeshStandardMaterial>;
}

/**
 * Creates a model of the forge: its coals, the hot iron on its anvil, its
 * flames, which glow by themselves, and its stone.
 *
 * @returns {ForgeModel} The model.
 */
function createForge(): ForgeModel {
  const root = new Object3D();
  const materials = new Map<string, MeshStandardMaterial>();
  for (const name of ['embers', 'hotIron', 'fire', 'stone']) {
    const material = new MeshStandardMaterial({ name });
    if (name === 'fire') {
      material.emissive = new Color(FLAME_COLOR);
    }
    materials.set(name, material);
    root.add(new Mesh(new BoxGeometry(), material));
  }
  return { root, materials };
}

/**
 * Finds a material of a model of the forge.
 *
 * @param {ForgeModel} forge - The model.
 * @param {string} name - The name of the material.
 * @returns {MeshStandardMaterial} The material.
 * @throws {Error} If the model has no such material.
 */
function findMaterial(forge: ForgeModel, name: string): MeshStandardMaterial {
  const material: MeshStandardMaterial | undefined = forge.materials.get(name);
  if (material === undefined) {
    throw new Error(`No material ${name}`);
  }
  return material;
}

/**
 * Records how strongly materials glow over ten seconds.
 *
 * @param {ForgeGlow} glow - The glow of the forge.
 * @param {readonly MeshStandardMaterial[]} materials - The materials.
 * @returns {number[][]} The strengths of the glow of each material, every
 *   tenth of a second.
 */
function recordStrengths(
  glow: ForgeGlow,
  materials: readonly MeshStandardMaterial[],
): number[][] {
  const strengths: number[][] = materials.map(() => []);
  for (let step = 0; step < 100; step++) {
    glow.update(0.1);
    materials.forEach((material: MeshStandardMaterial, index: number) => {
      strengths[index]?.push(material.emissiveIntensity);
    });
  }
  return strengths;
}

describe('ForgeGlow', () => {
  it('makes the coals and the hot iron glow orange-red, pulsing', () => {
    const forge: ForgeModel = createForge();
    const glowing: MeshStandardMaterial[] = ['embers', 'hotIron'].map(
      (name: string) => findMaterial(forge, name),
    );
    const glow = new ForgeGlow(forge.root);
    for (const material of glowing) {
      const { r, g, b } = material.emissive;
      expect(r).toBeGreaterThan(0.5);
      expect(r).toBeGreaterThan(2 * g);
      expect(g).toBeGreaterThanOrEqual(b);
    }
    for (const strengths of recordStrengths(glow, glowing)) {
      expect(Math.min(...strengths)).toBeGreaterThan(0);
      expect(Math.max(...strengths) - Math.min(...strengths)).toBeGreaterThan(
        0.1,
      );
    }
  });

  it('makes the flames flicker in their own color', () => {
    const forge: ForgeModel = createForge();
    const fire: MeshStandardMaterial = findMaterial(forge, 'fire');
    const glow = new ForgeGlow(forge.root);
    const [strengths = []] = recordStrengths(glow, [fire]);
    expect(fire.emissive.equals(new Color(FLAME_COLOR))).toBe(true);
    expect(Math.min(...strengths)).toBeGreaterThan(0);
    expect(Math.max(...strengths) - Math.min(...strengths)).toBeGreaterThan(
      0.1,
    );
  });

  it('leaves the stone of the forge dark', () => {
    const forge: ForgeModel = createForge();
    const stone: MeshStandardMaterial = findMaterial(forge, 'stone');
    const glow = new ForgeGlow(forge.root);
    glow.update(1.3);
    expect(stone.emissive.equals(new Color(0, 0, 0))).toBe(true);
    expect(stone.emissiveIntensity).toBe(1);
  });
});
