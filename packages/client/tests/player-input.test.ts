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
 * @module client/tests/player-input Tests for reading the keys of a player.
 */

import { describe, expect, it } from 'vitest';

import {
  CLOVER_PATCHES,
  NO_WORLD_ITEMS,
  createMotion,
  killMotion,
} from '@clovervale/shared';
import type { GroundVector, PlayerMotion } from '@clovervale/shared';

import {
  MoveKeys,
  chooseSpaceInput,
  findKeyCommand,
} from '../src/player-input.ts';

/** The heading of a camera that looks towards -Z, in degrees. */
const NORTHWARD = 180;

/**
 * Resolves the direction a set of keys moves the player in.
 *
 * @param {string[]} codes - The codes of the keys held down.
 * @param {number} heading - The heading of the camera, in degrees.
 * @returns {{ x: number, z: number }} The direction.
 */
function resolveKeys(
  codes: string[],
  heading: number,
): { x: number; z: number } {
  const keys = new MoveKeys();
  for (const code of codes) {
    keys.pressKey(code);
  }
  return keys.resolveDirection(heading);
}

describe('findKeyCommand', () => {
  it('knows the keys that move the player', () => {
    expect(findKeyCommand('KeyW')).toBe('forward');
    expect(findKeyCommand('ArrowUp')).toBe('forward');
    expect(findKeyCommand('KeyS')).toBe('backward');
    expect(findKeyCommand('ArrowDown')).toBe('backward');
    expect(findKeyCommand('KeyA')).toBe('left');
    expect(findKeyCommand('ArrowLeft')).toBe('left');
    expect(findKeyCommand('KeyD')).toBe('right');
    expect(findKeyCommand('ArrowRight')).toBe('right');
  });

  it('knows the key the player interacts with', () => {
    expect(findKeyCommand('Space')).toBe('interact');
  });

  it('does not know the keys the game does not use', () => {
    expect(findKeyCommand('KeyQ')).toBeNull();
    expect(findKeyCommand('KeyI')).toBeNull();
    expect(findKeyCommand('Enter')).toBeNull();
    expect(findKeyCommand('toString')).toBeNull();
  });
});

describe('chooseSpaceInput', () => {
  /** Where the patch of clover east of the fountain is. */
  const PATCH: GroundVector = CLOVER_PATCHES[6] ?? { x: NaN, z: NaN };

  /** A player south of that patch, facing it. */
  const BY_PATCH: PlayerMotion = createMotion(
    { x: PATCH.x, z: PATCH.z + 1 },
    180,
  );

  it('picks while the clover of the patch is within reach', () => {
    const world = { clovers: [6], items: [] };
    expect(chooseSpaceInput(BY_PATCH, 0, world)).toEqual({ type: 'pick' });
  });

  it('interacts while there is nothing to pick within reach', () => {
    expect(chooseSpaceInput(BY_PATCH, 0, NO_WORLD_ITEMS)).toEqual({
      type: 'interact',
    });
  });

  it('interacts while the player cannot interact', () => {
    const world = { clovers: [6], items: [] };
    expect(chooseSpaceInput(killMotion(BY_PATCH), 0, world)).toEqual({
      type: 'interact',
    });
  });
});

describe('MoveKeys', () => {
  it('stands still without keys', () => {
    expect(resolveKeys([], NORTHWARD)).toEqual({ x: 0, z: 0 });
  });

  it('moves away from the camera with the forward keys', () => {
    expect(resolveKeys(['KeyW'], NORTHWARD)).toEqual({ x: 0, z: -1 });
    expect(resolveKeys(['ArrowUp'], NORTHWARD)).toEqual({ x: 0, z: -1 });
  });

  it('moves towards the camera with the backward keys', () => {
    expect(resolveKeys(['KeyS'], NORTHWARD)).toEqual({ x: 0, z: 1 });
    expect(resolveKeys(['ArrowDown'], NORTHWARD)).toEqual({ x: 0, z: 1 });
  });

  it('moves to the sides of the view with the side keys', () => {
    expect(resolveKeys(['KeyA'], NORTHWARD)).toEqual({ x: -1, z: 0 });
    expect(resolveKeys(['ArrowLeft'], NORTHWARD)).toEqual({ x: -1, z: 0 });
    expect(resolveKeys(['KeyD'], NORTHWARD)).toEqual({ x: 1, z: 0 });
    expect(resolveKeys(['ArrowRight'], NORTHWARD)).toEqual({ x: 1, z: 0 });
  });

  it('follows the heading of the camera', () => {
    // A camera that looks towards +X has +Z on its right.
    expect(resolveKeys(['KeyW'], 90)).toEqual({ x: 1, z: 0 });
    expect(resolveKeys(['KeyD'], 90)).toEqual({ x: 0, z: 1 });
    expect(resolveKeys(['KeyW'], 0)).toEqual({ x: 0, z: 1 });
    expect(resolveKeys(['KeyD'], 0)).toEqual({ x: -1, z: 0 });
  });

  it('moves diagonally, one metre long, with two keys', () => {
    const direction = resolveKeys(['KeyW', 'KeyD'], NORTHWARD);
    expect(direction).toEqual({ x: 0.707, z: -0.707 });
  });

  it('cancels opposite keys out', () => {
    expect(resolveKeys(['KeyW', 'ArrowDown'], NORTHWARD)).toEqual({
      x: 0,
      z: 0,
    });
    expect(resolveKeys(['KeyA', 'KeyD', 'KeyS'], NORTHWARD)).toEqual({
      x: 0,
      z: 1,
    });
  });

  it('moves no faster with two keys for the same way', () => {
    expect(resolveKeys(['KeyW', 'ArrowUp'], NORTHWARD)).toEqual({
      x: 0,
      z: -1,
    });
  });

  it('keeps moving until the last key for that way is released', () => {
    const keys = new MoveKeys();
    keys.pressKey('KeyW');
    keys.pressKey('ArrowUp');
    keys.releaseKey('KeyW');
    expect(keys.resolveDirection(NORTHWARD)).toEqual({ x: 0, z: -1 });
    keys.releaseKey('ArrowUp');
    expect(keys.resolveDirection(NORTHWARD)).toEqual({ x: 0, z: 0 });
  });

  it('stands still once all keys are released at once', () => {
    const keys = new MoveKeys();
    keys.pressKey('KeyW');
    keys.pressKey('KeyD');
    keys.releaseAllKeys();
    expect(keys.resolveDirection(NORTHWARD)).toEqual({ x: 0, z: 0 });
  });

  it('is not moved by the other keys', () => {
    expect(resolveKeys(['Space', 'KeyQ'], NORTHWARD)).toEqual({ x: 0, z: 0 });
  });

  it('gives the same direction for headings that barely differ', () => {
    const direction = resolveKeys(['KeyW'], 37);
    expect(resolveKeys(['KeyW'], 37 + 1e-9)).toEqual(direction);
  });
});
