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
 * @module client/tests/obstacle-outlines Tests for drawing on the ground
 *   what stands in the way of the players.
 */

import { BufferAttribute, LineLoop } from 'three';
import type { Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { Terrain } from '@clovervale/shared';

import { createObstacleOutlines } from '../src/obstacle-outlines.ts';

/** Some ground with a turned box, a circle and a boundary. */
const TERRAIN = new Terrain(
  [
    { shape: 'box', x: 4, z: 1, halfWidth: 2, halfDepth: 0.5, yaw: 90 },
    { shape: 'circle', x: -3, z: 2, radius: 1.5 },
  ],
  { x: 0, z: 0, radius: 10 },
);

/**
 * Lists the corners of an outline.
 *
 * @param {Object3D | undefined} outline - The outline.
 * @returns {[number, number, number][]} The corners, as X, Y and Z.
 */
function listCorners(
  outline: Object3D | undefined,
): [number, number, number][] {
  expect(outline).toBeInstanceOf(LineLoop);
  const position = (outline as LineLoop).geometry.getAttribute(
    'position',
  ) as BufferAttribute;
  return Array.from({ length: position.count }, (_, index: number) => [
    position.getX(index),
    position.getY(index),
    position.getZ(index),
  ]);
}

describe('createObstacleOutlines', () => {
  const outlines = createObstacleOutlines(TERRAIN);
  const [box, circle, boundary] = outlines.children;

  it('draws a closed outline for every obstacle, and the boundary last', () => {
    expect(outlines.children).toHaveLength(3);
  });

  it('draws a box by its corners, turned as it is', () => {
    const corners = listCorners(box).map(([x, , z]) => [x, z]);
    const expected: [number, number][] = [
      [3.5, 3],
      [3.5, -1],
      [4.5, -1],
      [4.5, 3],
    ];
    expect(corners).toHaveLength(4);
    for (const [x, z] of expected) {
      expect(
        corners.some(
          ([cx = NaN, cz = NaN]) =>
            Math.abs(cx - x) < 1e-6 && Math.abs(cz - z) < 1e-6,
        ),
      ).toBe(true);
    }
  });

  it('draws a circle and the boundary round, just above the ground', () => {
    for (const [outline, x, z, radius] of [
      [circle, -3, 2, 1.5],
      [boundary, 0, 0, 10],
    ] as const) {
      for (const [cx, cy, cz] of listCorners(outline)) {
        expect(Math.hypot(cx - x, cz - z)).toBeCloseTo(radius, 5);
        expect(cy).toBeGreaterThan(0);
        expect(cy).toBeLessThan(0.05);
      }
    }
  });
});
