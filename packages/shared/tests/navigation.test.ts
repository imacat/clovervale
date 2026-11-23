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
 * @module shared/tests/navigation Tests for finding a way around the
 *   obstacles.
 */

import { describe, expect, it } from 'vitest';

import {
  PLAZA_CENTER,
  Terrain,
  VILLAGE_TERRAIN,
  findSpawnPoint,
  findMapPath,
} from '../src/index.ts';
import type { GroundVector, Shape } from '../src/index.ts';
import { NavigationGraph } from '../src/navigation.ts';

/** A wall six meters wide across the Z axis, at the origin. */
const WALL: Shape = {
  shape: 'box',
  x: 0,
  z: 0,
  halfWidth: 3,
  halfDepth: 0.2,
  yaw: 0,
};

/** Some ground with a wall in the middle. */
const WALLED: Terrain = new Terrain([WALL], { x: 0, z: 0, radius: 20 });

/**
 * Checks that a player can walk a path one straight walk after another.
 *
 * @param {Terrain} terrain - The ground.
 * @param {GroundVector} from - Where the path starts.
 * @param {readonly GroundVector[]} path - The points of the path.
 */
function expectWalkable(
  terrain: Terrain,
  from: GroundVector,
  path: readonly GroundVector[],
): void {
  let start: GroundVector = from;
  for (const point of path) {
    expect(terrain.isPathClear(start, point)).toBe(true);
    start = point;
  }
}

describe('NavigationGraph.findPath', () => {
  const graph = new NavigationGraph(WALLED);

  it('goes straight where nothing is in the way', () => {
    const to: GroundVector = { x: 5, z: -2 };
    expect(graph.findPath({ x: 5, z: 2 }, to)).toEqual([to]);
  });

  it('goes around what is in the way', () => {
    const from: GroundVector = { x: 0.5, z: 2 };
    const to: GroundVector = { x: 0.5, z: -2 };
    const path: GroundVector[] | null = graph.findPath(from, to);
    expect(path).not.toBeNull();
    expect(path?.at(-1)).toEqual(to);
    expectWalkable(WALLED, from, path ?? []);
  });

  it('takes the shorter way around', () => {
    const path: GroundVector[] | null = graph.findPath(
      { x: 2, z: 2 },
      { x: 2, z: -2 },
    );
    for (const point of path ?? []) {
      expect(point.x).toBeGreaterThan(0);
    }
  });

  it('finds no way to where a player cannot stand', () => {
    expect(graph.findPath({ x: 0, z: 2 }, { x: 0, z: 0 })).toBeNull();
    expect(graph.findPath({ x: 0, z: 2 }, { x: 0, z: 30 })).toBeNull();
  });

  it('finds no way into a closed yard', () => {
    const side: Shape = { ...WALL, halfWidth: 2, halfDepth: 0.1 };
    const yard = new Terrain(
      [
        { ...side, z: -2 },
        { ...side, z: 2 },
        { ...side, x: -2, z: 0, yaw: 90 },
        { ...side, x: 2, z: 0, yaw: 90 },
      ],
      { x: 0, z: 0, radius: 20 },
    );
    const closed = new NavigationGraph(yard);
    expect(closed.findPath({ x: 6, z: 0 }, { x: 0, z: 0 })).toBeNull();
  });
});

describe('findMapPath in the village', () => {
  it('goes around the fountain, from the spawn points to behind it', () => {
    const behind: GroundVector = { x: PLAZA_CENTER.x, z: PLAZA_CENTER.z - 2.7 };
    for (let index = 0; index < 8; index++) {
      const from: GroundVector = findSpawnPoint(index);
      const path: GroundVector[] | null = findMapPath('village', from, behind);
      expect(path).not.toBeNull();
      expect(path?.at(-1)).toEqual(behind);
      expectWalkable(VILLAGE_TERRAIN, from, path ?? []);
    }
  });
});
