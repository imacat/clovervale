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
 * @module shared/tests/combat Tests for what a strike reaches.
 */

import { describe, expect, it } from 'vitest';

import { STRIKE_HALF_ANGLE, isWithinStrike } from '../src/index.ts';
import type { Pose } from '../src/index.ts';

/** A striker at the origin, facing +X. */
const STRIKER: Pose = { x: 0, z: 0, yaw: 90 };

describe('isWithinStrike', () => {
  it('reaches what stands straight ahead within reach', () => {
    expect(isWithinStrike(STRIKER, { x: 1.5, z: 0 }, 1.6)).toBe(true);
  });

  it('does not reach what stands ahead beyond reach', () => {
    expect(isWithinStrike(STRIKER, { x: 1.7, z: 0 }, 1.6)).toBe(false);
  });

  it('does not reach what stands behind or beside the striker', () => {
    expect(isWithinStrike(STRIKER, { x: -1, z: 0 }, 1.6)).toBe(false);
    expect(isWithinStrike(STRIKER, { x: 0, z: 1 }, 1.6)).toBe(false);
  });

  it('reaches to either side as far as its half angle', () => {
    const inside: number = ((STRIKE_HALF_ANGLE - 1) * Math.PI) / 180;
    const outside: number = ((STRIKE_HALF_ANGLE + 1) * Math.PI) / 180;
    for (const side of [-1, 1]) {
      expect(
        isWithinStrike(
          STRIKER,
          { x: Math.cos(inside), z: side * Math.sin(inside) },
          1.6,
        ),
      ).toBe(true);
      expect(
        isWithinStrike(
          STRIKER,
          { x: Math.cos(outside), z: side * Math.sin(outside) },
          1.6,
        ),
      ).toBe(false);
    }
  });

  it('reaches what stands right where the striker does', () => {
    expect(isWithinStrike(STRIKER, { x: 0, z: 0 }, 1.6)).toBe(true);
  });
});
