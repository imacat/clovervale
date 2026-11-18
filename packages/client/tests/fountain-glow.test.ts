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
 * @module client/tests/fountain-glow Tests for the glow of the healing
 *   fountain.
 */

import {
  BoxGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Sprite,
} from 'three';
import { describe, expect, it } from 'vitest';

import {
  FountainGlow,
  MOTE_COUNT,
  MOTE_LEAST_RADIUS,
  MOTE_LIFETIME,
  MOTE_MOST_RADIUS,
  WATER_HEIGHT,
} from '../src/fountain-glow.ts';

/** A model of the fountain: its water and its stone. */
interface FountainModel {
  /** The root of the model. */
  readonly root: Object3D;
  /** The material of the water. */
  readonly water: MeshStandardMaterial;
  /** The material of the stone. */
  readonly stone: MeshStandardMaterial;
}

/**
 * Creates a model of the fountain, with water and stone.
 *
 * @returns {FountainModel} The model.
 */
function createFountain(): FountainModel {
  const root = new Object3D();
  const water = new MeshStandardMaterial({ name: 'water' });
  const stone = new MeshStandardMaterial({ name: 'stone' });
  root.add(new Mesh(new BoxGeometry(), water));
  root.add(new Mesh(new BoxGeometry(), stone));
  return { root, water, stone };
}

/**
 * Lists the motes of light on a model.
 *
 * @param {Object3D} root - The root of the model.
 * @returns {Sprite[]} The motes.
 */
function listMotes(root: Object3D): Sprite[] {
  return root.children.filter(
    (child: Object3D): child is Sprite => child instanceof Sprite,
  );
}

describe('FountainGlow', () => {
  it('makes the water glow, waxing and waning, and not the stone', () => {
    const { root, water, stone } = createFountain();
    const glow = new FountainGlow(root);
    expect(water.emissive.equals(new Color(0, 0, 0))).toBe(false);
    const strengths: number[] = [];
    for (let step = 0; step < 50; step++) {
      glow.update(0.1);
      strengths.push(water.emissiveIntensity);
    }
    expect(Math.min(...strengths)).toBeGreaterThan(0);
    expect(Math.max(...strengths) - Math.min(...strengths)).toBeGreaterThan(
      0.1,
    );
    expect(stone.emissive.equals(new Color(0, 0, 0))).toBe(true);
  });

  it('raises motes slowly from the water, fading in and out', () => {
    const { root } = createFountain();
    const glow = new FountainGlow(root);
    expect(listMotes(root)).toHaveLength(MOTE_COUNT);
    const step = 0.05;
    let previous: number[] = listMotes(root).map(
      (mote: Sprite) => mote.position.y,
    );
    for (let time = 0; time < MOTE_LIFETIME * 2; time += step) {
      glow.update(step);
      const motes: Sprite[] = listMotes(root);
      motes.forEach((mote: Sprite, index: number) => {
        const { x, y, z } = mote.position;
        const across: number = Math.hypot(x, z);
        expect(across).toBeGreaterThan(MOTE_LEAST_RADIUS - 0.1);
        expect(across).toBeLessThan(MOTE_MOST_RADIUS + 0.1);
        expect(y).toBeGreaterThanOrEqual(WATER_HEIGHT);
        const rise: number = y - (previous[index] ?? NaN);
        // A mote rises slowly, or starts again from the water faded out.
        if (rise < 0) {
          expect(mote.material.opacity).toBeLessThan(0.1);
        } else {
          expect(rise).toBeLessThan(0.5 * step);
        }
        expect(mote.material.opacity).toBeGreaterThanOrEqual(0);
        expect(mote.material.opacity).toBeLessThanOrEqual(1);
      });
      previous = motes.map((mote: Sprite) => mote.position.y);
    }
  });
});
