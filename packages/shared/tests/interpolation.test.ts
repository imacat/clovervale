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
 * @module shared/tests/interpolation Tests for placing everything between
 *   two snapshots.
 */

import { describe, expect, it } from 'vitest';

import { interpolateYaw } from '../src/index.ts';

describe('interpolateYaw', () => {
  it('turns part of the way from one yaw to another', () => {
    expect(interpolateYaw(10, 50, 0.25)).toBeCloseTo(20);
    expect(interpolateYaw(50, 10, 0.25)).toBeCloseTo(40);
  });

  it('gives the yaws themselves at both ends', () => {
    expect(interpolateYaw(-90, 180, 0)).toBeCloseTo(-90);
    expect(interpolateYaw(-90, 180, 1)).toBeCloseTo(180);
    expect(interpolateYaw(180, 180, 0.5)).toBe(180);
  });

  it('turns the shorter way round, across the back', () => {
    expect(interpolateYaw(170, -170, 0.25)).toBeCloseTo(175);
    expect(interpolateYaw(170, -170, 0.75)).toBeCloseTo(-175);
    expect(interpolateYaw(-170, 170, 0.25)).toBeCloseTo(-175);
  });

  it('turns the shorter way round between yaws counted from 0 to 360', () => {
    expect(interpolateYaw(350, 10, 0.5) % 360).toBeCloseTo(0);
    expect(interpolateYaw(10, 350, 0.25)).toBeCloseTo(5);
  });
});
