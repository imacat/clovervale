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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/on-screen Tests for telling whether the camera sees
 *   a figure.
 */

import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from 'three';
import { describe, expect, it } from 'vitest';

import { isOnScreen } from '../src/on-screen.ts';

/**
 * Makes a camera looking at the middle of a figure from 10 metres south.
 *
 * @returns {PerspectiveCamera} The camera.
 */
function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(40, 1, 0.5, 600);
  camera.position.set(0, 1, 10);
  camera.lookAt(0, 1, 0);
  return camera;
}

/**
 * Makes a box.
 *
 * @param {number} width - Its width along X, in metres.
 * @param {number} height - Its height, in metres.
 * @param {number} depth - Its depth along Z, in metres.
 * @param {number} z - Where its middle stands along Z, in metres.
 * @returns {Mesh} The box, its foot on the ground.
 */
function makeBox(
  width: number,
  height: number,
  depth: number,
  z: number,
): Mesh {
  const box = new Mesh(
    new BoxGeometry(width, height, depth),
    new MeshBasicMaterial(),
  );
  box.position.set(0, height / 2, z);
  box.updateMatrixWorld();
  return box;
}

describe('isOnScreen', () => {
  it('sees a figure in front of the camera with nothing in between', () => {
    const figure: Mesh = makeBox(0.6, 1.8, 0.6, 0);
    const rock: Mesh = makeBox(4, 4, 1, -5);
    expect(isOnScreen(makeCamera(), figure, rock)).toBe(true);
  });

  it('does not see a figure out of the view of the camera', () => {
    const figure: Mesh = makeBox(0.6, 1.8, 0.6, 20);
    expect(isOnScreen(makeCamera(), figure, null)).toBe(false);
  });

  it('does not see a figure behind the rock', () => {
    const figure: Mesh = makeBox(0.6, 1.8, 0.6, 0);
    const rock: Mesh = makeBox(4, 4, 1, 5);
    expect(isOnScreen(makeCamera(), figure, rock)).toBe(false);
  });
});
