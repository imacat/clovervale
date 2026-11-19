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
 * @module client/tests/window-glow Tests for the light in the windows of
 *   the houses.
 */

import {
  BoxGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';

import { WindowGlow } from '../src/window-glow.ts';

/**
 * Creates a village of two houses, each with its glass and its plaster,
 * the second a copy of the first, sharing its materials.
 *
 * @returns {[Object3D, MeshStandardMaterial, MeshStandardMaterial]} The
 *   village, the glass and the plaster.
 */
function createVillage(): [
  Object3D,
  MeshStandardMaterial,
  MeshStandardMaterial,
] {
  const glass = new MeshStandardMaterial({ name: 'glass', color: '#a9dcec' });
  const plaster = new MeshStandardMaterial({ name: 'plaster' });
  const house = new Object3D();
  house.add(new Mesh(new BoxGeometry(), glass));
  house.add(new Mesh(new BoxGeometry(), plaster));
  const village = new Object3D();
  village.add(house, house.clone());
  return [village, glass, plaster];
}

/**
 * Measures how brightly a material glows.
 *
 * @param {MeshStandardMaterial} material - The material.
 * @returns {Color} The light it gives off by itself.
 */
function measureGlow(material: MeshStandardMaterial): Color {
  return material.emissive.clone().multiplyScalar(material.emissiveIntensity);
}

describe('WindowGlow', () => {
  it('lights the windows warmly, as brightly as told', () => {
    const [village, glass] = createVillage();
    const glow = new WindowGlow(village);
    glow.show(1);
    const full: Color = measureGlow(glass);
    expect(full.r).toBeGreaterThan(0.5);
    expect(full.r).toBeGreaterThan(full.g);
    expect(full.g).toBeGreaterThan(full.b);
    glow.show(0.5);
    expect(measureGlow(glass).r).toBeCloseTo(full.r / 2, 9);
  });

  it('leaves the windows dark when told to', () => {
    const [village, glass] = createVillage();
    const glow = new WindowGlow(village);
    glow.show(1);
    glow.show(0);
    expect(measureGlow(glass).equals(new Color(0, 0, 0))).toBe(true);
    expect(glass.color.equals(new Color('#a9dcec'))).toBe(true);
  });

  it('leaves the walls alone', () => {
    const [village, , plaster] = createVillage();
    const glow = new WindowGlow(village);
    glow.show(1);
    expect(measureGlow(plaster).equals(new Color(0, 0, 0))).toBe(true);
  });
});
