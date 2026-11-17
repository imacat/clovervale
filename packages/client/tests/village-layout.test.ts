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
 * @module client/tests/village-layout Tests for arranging the village.
 */

import { describe, expect, it } from 'vitest';

import {
  CHARACTER_FILES,
  REQUIRED_MODEL_FILES,
} from '../src/model-catalogue.ts';
import { layoutVillage } from '../src/village-layout.ts';
import type { Placement } from '../src/village-layout.ts';

/** The required models, and the props the plaza is built from. */
const PLAZA_FILES: readonly string[] = [
  ...REQUIRED_MODEL_FILES,
  'prop-cottage.glb',
  'prop-great-tree.glb',
];

/**
 * Measures how far apart two models stand.
 *
 * @param {Placement} a - Where one model stands.
 * @param {Placement} b - Where the other model stands.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: Placement, b: Placement): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Finds where the only copy of a model stands.
 *
 * @param {readonly Placement[]} placements - Where the models stand.
 * @param {string} file - The file name of the model.
 * @returns {Placement} Where the model stands.
 * @throws {Error} If the model does not stand in exactly one place.
 */
function findOnly(placements: readonly Placement[], file: string): Placement {
  const found: Placement[] = placements.filter(
    (placement: Placement) => placement.file === file,
  );
  const [only] = found;
  if (only === undefined || found.length !== 1) {
    throw new Error(`${file} stands in ${String(found.length)} places.`);
  }
  return only;
}

describe('layoutVillage', () => {
  it('stands every required model in one place', () => {
    const placements: Placement[] = layoutVillage(REQUIRED_MODEL_FILES);
    expect(placements.map((placement: Placement) => placement.file)).toEqual(
      REQUIRED_MODEL_FILES,
    );
  });

  it('stands the characters evenly apart, all facing the same way', () => {
    const arc: Placement[] = layoutVillage(CHARACTER_FILES);
    const first: Placement = findOnly(arc, 'character-01.glb');
    const second: Placement = findOnly(arc, 'character-02.glb');
    expect(arc).toHaveLength(CHARACTER_FILES.length);
    const spacing: number = measureDistance(first, second);
    expect(spacing).toBeGreaterThan(1);
    arc.forEach((placement: Placement, index: number) => {
      const next: Placement | undefined = arc[index + 1];
      if (next !== undefined) {
        expect(next.x).toBeGreaterThan(placement.x);
        expect(measureDistance(placement, next)).toBeCloseTo(spacing);
      }
      expect(placement.yaw).toBe(first.yaw);
    });
  });

  it('stands the buildings around the fountain, each facing it', () => {
    const placements: Placement[] = layoutVillage(PLAZA_FILES);
    const fountain: Placement = findOnly(placements, 'fountain.glb');
    const buildings: Placement[] = placements.filter(
      (placement: Placement) =>
        ['prop-cottage.glb', 'weapon-shop.glb'].includes(placement.file),
    );
    expect(buildings).toHaveLength(4);
    const corners = new Set<string>();
    for (const building of buildings) {
      const x: number = fountain.x - building.x;
      const z: number = fountain.z - building.z;
      const yaw: number = (building.yaw * Math.PI) / 180;
      // The cosine of the angle between the front and the way to the
      // fountain.
      const facing: number =
        (x * Math.sin(yaw) + z * Math.cos(yaw)) / Math.hypot(x, z);
      expect(facing).toBeGreaterThan(Math.cos(Math.PI / 4));
      corners.add(`${String(x > 0)} ${String(z > 0)}`);
    }
    expect(corners.size).toBe(4);
  });

  it('stands the fountain between the characters and the great tree', () => {
    const placements: Placement[] = layoutVillage(PLAZA_FILES);
    const fountain: Placement = findOnly(placements, 'fountain.glb');
    const tree: Placement = findOnly(placements, 'prop-great-tree.glb');
    expect(tree.x).toBe(fountain.x);
    expect(tree.z).toBeLessThan(fountain.z);
    for (const file of CHARACTER_FILES) {
      expect(findOnly(placements, file).z).toBeGreaterThan(fountain.z);
    }
  });

  it('stands the NPC by the fountain', () => {
    const placements: Placement[] = layoutVillage(REQUIRED_MODEL_FILES);
    const fountain: Placement = findOnly(placements, 'fountain.glb');
    const npc: Placement = findOnly(placements, 'npc.glb');
    expect(measureDistance(npc, fountain)).toBeLessThan(5);
  });

  it('keeps a character in its place when others are missing', () => {
    const all: Placement[] = layoutVillage(CHARACTER_FILES);
    const alone: Placement[] = layoutVillage(['character-05.glb']);
    expect(alone).toEqual([findOnly(all, 'character-05.glb')]);
  });

  it('stands the monster farther out than everyone in the village', () => {
    const placements: Placement[] = layoutVillage(PLAZA_FILES);
    const fountain: Placement = findOnly(placements, 'fountain.glb');
    const monster: Placement = findOnly(placements, 'monster.glb');
    for (const villager of placements) {
      const isVillager: boolean = [
        ...CHARACTER_FILES,
        'npc.glb',
        'weapon-shop.glb',
        'prop-cottage.glb',
      ].includes(villager.file);
      if (isVillager) {
        expect(measureDistance(monster, fountain)).toBeGreaterThan(
          measureDistance(villager, fountain),
        );
      }
    }
  });

  it('stands a prop the village has no place for apart from the rest', () => {
    const files: string[] = [
      ...REQUIRED_MODEL_FILES,
      'prop-rock.glb',
      'prop-well.glb',
      'prop-windmill.glb',
    ];
    const placements: Placement[] = layoutVillage(files);
    for (const file of ['prop-well.glb', 'prop-windmill.glb']) {
      const spare: Placement = findOnly(placements, file);
      for (const other of placements) {
        if (other !== spare) {
          expect(measureDistance(spare, other)).toBeGreaterThan(4);
        }
      }
    }
  });

  it('stands nothing where there are no models', () => {
    expect(layoutVillage([])).toEqual([]);
    expect(layoutVillage(['notes.glb'])).toEqual([]);
  });
});
