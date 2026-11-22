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
 * @module shared/tests/village Tests for what is known of the village.
 */

import { describe, expect, it } from 'vitest';

import { PLAZA_CENTRE, findSpawnPoint } from '../src/index.ts';
import type { GroundVector } from '../src/index.ts';

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('findSpawnPoint', () => {
  const points: GroundVector[] = Array.from(
    { length: 24 },
    (_: unknown, index: number) => findSpawnPoint(index),
  );

  it('keeps the spawn points well apart from each other', () => {
    points.forEach((point: GroundVector, index: number) => {
      for (const other of points.slice(index + 1)) {
        expect(measureDistance(point, other)).toBeGreaterThan(1.5);
      }
    });
  });

  it('puts the spawn points in front of the fountain, clear of it', () => {
    for (const point of points) {
      expect(point.z).toBeGreaterThan(PLAZA_CENTRE.z);
      expect(measureDistance(point, PLAZA_CENTRE)).toBeGreaterThan(4);
    }
  });

  it('puts the first spawn points on the plaza', () => {
    for (const point of points.slice(0, 8)) {
      expect(measureDistance(point, PLAZA_CENTRE)).toBeLessThan(8);
    }
  });

  it('starts by the middle of the plaza', () => {
    const [first, second] = points;
    expect(Math.abs((first?.x ?? NaN) - PLAZA_CENTRE.x)).toBeLessThan(1);
    expect(Math.abs((second?.x ?? NaN) - PLAZA_CENTRE.x)).toBeLessThan(1);
  });
});
