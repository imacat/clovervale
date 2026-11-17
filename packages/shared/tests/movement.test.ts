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
 * @module shared/tests/movement Tests for the movement rules.
 */

import { describe, expect, it } from 'vitest';

import { WALK_SPEED, findYaw, movePosition } from '../src/index.ts';

describe('movePosition', () => {
  it('moves at walking speed along a direction', () => {
    const moved = movePosition({ x: 1, z: 2 }, { x: 1, z: 0 }, 0.5);
    expect(moved.x).toBeCloseTo(1 + WALK_SPEED * 0.5);
    expect(moved.z).toBeCloseTo(2);
  });

  it('does not move faster diagonally', () => {
    const moved = movePosition({ x: 0, z: 0 }, { x: 1, z: 1 }, 1);
    expect(Math.hypot(moved.x, moved.z)).toBeCloseTo(WALK_SPEED);
  });

  it('moves at walking speed whatever the length of the direction', () => {
    const slow = movePosition({ x: 0, z: 0 }, { x: 0, z: -0.5 }, 1);
    const fast = movePosition({ x: 0, z: 0 }, { x: 0, z: -40 }, 1);
    expect(slow.x).toBeCloseTo(0);
    expect(slow.z).toBeCloseTo(-WALK_SPEED);
    expect(fast.z).toBeCloseTo(-WALK_SPEED);
  });

  it('stays put without a direction', () => {
    const moved = movePosition({ x: 3, z: 4 }, { x: 0, z: 0 }, 1);
    expect(moved).toEqual({ x: 3, z: 4 });
  });
});

describe('findYaw', () => {
  it('faces +Z without a turn', () => {
    expect(findYaw({ x: 0, z: 1 })).toBeCloseTo(0);
  });

  it('turns towards +X by a quarter to face it', () => {
    expect(findYaw({ x: 2, z: 0 })).toBeCloseTo(90);
    expect(findYaw({ x: -2, z: 0 })).toBeCloseTo(-90);
  });

  it('turns half way round to face -Z', () => {
    expect(findYaw({ x: 0, z: -3 })).toBeCloseTo(180);
  });

  it('faces a diagonal half way between its axes', () => {
    expect(findYaw({ x: 1, z: 1 })).toBeCloseTo(45);
  });
});
