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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/camera-keys Tests for the arrow keys that turn the
 *   camera.
 */

import { describe, expect, it } from 'vitest';

import {
  CAMERA_ORBIT_RATE,
  CAMERA_TILT_RATE,
  CameraKeys,
} from '../src/camera-keys.ts';
import type { CameraTurn } from '../src/camera-keys.ts';

/**
 * Finds how far the keys turn the camera over some time, with the keys
 * pressed held down.
 *
 * @param {string[]} codes - The codes of the keys held down.
 * @param {number} seconds - The time, in seconds.
 * @returns {CameraTurn} The turn.
 */
function resolveKeys(codes: string[], seconds: number): CameraTurn {
  const keys = new CameraKeys();
  for (const code of codes) {
    keys.pressKey(code);
  }
  return keys.resolveTurn(seconds);
}

describe('CameraKeys', () => {
  it('takes the arrow keys and no others', () => {
    const keys = new CameraKeys();
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(keys.pressKey(code)).toBe(true);
    }
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) {
      expect(keys.pressKey(code)).toBe(false);
    }
  });

  it('does not turn the camera without keys', () => {
    expect(resolveKeys([], 1)).toEqual({ orbit: 0, tilt: 0 });
    expect(resolveKeys(['KeyW', 'KeyD'], 1)).toEqual({ orbit: 0, tilt: 0 });
  });

  it('turns the view left and right with the side arrows', () => {
    expect(resolveKeys(['ArrowLeft'], 1)).toEqual({
      orbit: -CAMERA_ORBIT_RATE,
      tilt: 0,
    });
    expect(resolveKeys(['ArrowRight'], 1)).toEqual({
      orbit: CAMERA_ORBIT_RATE,
      tilt: 0,
    });
  });

  it('tilts the view up and down with the up and down arrows', () => {
    expect(resolveKeys(['ArrowUp'], 1)).toEqual({
      orbit: 0,
      tilt: -CAMERA_TILT_RATE,
    });
    expect(resolveKeys(['ArrowDown'], 1)).toEqual({
      orbit: 0,
      tilt: CAMERA_TILT_RATE,
    });
  });

  it('turns at a steady rate whatever the frame rate', () => {
    const keys = new CameraKeys();
    keys.pressKey('ArrowLeft');
    keys.pressKey('ArrowUp');
    let orbit = 0;
    let tilt = 0;
    for (let frame = 0; frame < 144; frame += 1) {
      const turn: CameraTurn = keys.resolveTurn(1 / 144);
      orbit += turn.orbit;
      tilt += turn.tilt;
    }
    const slow: CameraTurn = keys.resolveTurn(1);
    expect(orbit).toBeCloseTo(slow.orbit);
    expect(tilt).toBeCloseTo(slow.tilt);
  });

  it('cancels opposite keys out', () => {
    expect(resolveKeys(['ArrowLeft', 'ArrowRight'], 1)).toEqual({
      orbit: 0,
      tilt: 0,
    });
    expect(resolveKeys(['ArrowUp', 'ArrowDown', 'ArrowLeft'], 1)).toEqual({
      orbit: -CAMERA_ORBIT_RATE,
      tilt: 0,
    });
  });

  it('tells whether the owner holds the camera with the keys', () => {
    const keys = new CameraKeys();
    expect(keys.isHeld).toBe(false);
    keys.pressKey('KeyW');
    expect(keys.isHeld).toBe(false);
    keys.pressKey('ArrowLeft');
    keys.pressKey('ArrowUp');
    expect(keys.isHeld).toBe(true);
    keys.releaseKey('ArrowLeft');
    expect(keys.isHeld).toBe(true);
    keys.releaseKey('ArrowUp');
    expect(keys.isHeld).toBe(false);
  });

  it('stops turning once all keys are released at once', () => {
    const keys = new CameraKeys();
    keys.pressKey('ArrowRight');
    keys.pressKey('ArrowDown');
    keys.releaseAllKeys();
    expect(keys.isHeld).toBe(false);
    expect(keys.resolveTurn(1)).toEqual({ orbit: 0, tilt: 0 });
  });
});
