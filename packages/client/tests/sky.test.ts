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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/sky Tests for the stars, the sun and the moon in the
 *   sky.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import { NOON, findPhaseTime } from '@clovervale/shared';

import { findDaylight } from '../src/daylight.ts';
import type { DaylightLook } from '../src/daylight.ts';
import { Sky } from '../src/sky.ts';
import { CAMERA_FAR } from '../src/viewport.ts';

/** Where a camera stands, away from the middle of the village. */
const CAMERA_POSITION = new Vector3(30, 12, -20);

/**
 * Finds the stars of a sky in a scene.
 *
 * @param {Scene} scene - The scene.
 * @returns {Points} The stars, drawn as points, which are all the points
 *   in the scene.
 * @throws {Error} If the scene has no points, or more than one set of them.
 */
function findStars(scene: Scene): Points {
  const [stars, ...others] = scene.children.filter(
    (object: Object3D): object is Points => object instanceof Points,
  );
  if (stars === undefined || others.length > 0) {
    throw new Error('The stars are not drawn all at once.');
  }
  return stars;
}

/**
 * Creates a camera standing away from the middle of the village and
 * looking up at the sky, slightly turned.
 *
 * @returns {PerspectiveCamera} The camera.
 */
function createCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(40, 1, 0.5, CAMERA_FAR);
  camera.position.copy(CAMERA_POSITION);
  camera.lookAt(CAMERA_POSITION.x + 10, 40, CAMERA_POSITION.z - 30);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * Lists where the stars of a sky are, around the camera.
 *
 * @param {Points} stars - The stars.
 * @returns {Vector3[]} Where each star is, from the camera.
 */
function listStars(stars: Points): Vector3[] {
  const positions = stars.geometry.getAttribute('position') as BufferAttribute;
  return Array.from({ length: positions.count }, (_, index: number) =>
    new Vector3().fromBufferAttribute(positions, index),
  );
}

describe('Sky', () => {
  it('draws all the stars at once, the same on every run', () => {
    const scene = new Scene();
    new Sky(scene);
    const again = new Scene();
    new Sky(again);
    const positions: Vector3[] = listStars(findStars(scene));
    expect(positions.length).toBeGreaterThan(300);
    expect(listStars(findStars(again))).toEqual(positions);
  });

  it('keeps the stars above the horizon and within sight', () => {
    const scene = new Scene();
    new Sky(scene);
    for (const star of listStars(findStars(scene))) {
      expect(star.y).toBeGreaterThan(0);
      expect(star.length()).toBeLessThan(CAMERA_FAR);
    }
  });

  it('keeps the sky round the camera, without turning with it', () => {
    const scene = new Scene();
    const sky = new Sky(scene);
    sky.show(findDaylight(0));
    const camera: PerspectiveCamera = createCamera();
    const stars: Points = findStars(scene);
    sky.centreOn(camera);
    expect(stars.position.distanceTo(CAMERA_POSITION)).toBeLessThan(1e-9);
    expect(stars.quaternion.equals(camera.quaternion)).toBe(false);
    expect(stars.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('brings the stars out at night and puts them away by day', () => {
    const scene = new Scene();
    const sky = new Sky(scene);
    const stars: Points = findStars(scene);
    const material = stars.material as PointsMaterial;
    sky.show(findDaylight(0));
    expect(stars.visible).toBe(true);
    expect(material.color.getHex()).toBe(0xffffff);
    // Drawn before everything, the stars add their light to the sky, and
    // fade by adding less of it.
    sky.show({ ...findDaylight(0), stars: 0.5 });
    expect(material.color.r).toBeCloseTo(0.5, 9);
    expect(material.blending).toBe(AdditiveBlending);
    sky.show(findDaylight(NOON));
    expect(stars.visible).toBe(false);
  });

  it('adds nothing to the sky around the sun and the moon', () => {
    const scene = new Scene();
    new Sky(scene);
    for (const object of scene.children) {
      if (!(object instanceof Mesh)) {
        continue;
      }
      const material = object.material as MeshBasicMaterial;
      expect(material.blending).toBe(AdditiveBlending);
      const { data, width, height } = (material.map as DataTexture).image;
      const readPixel = (x: number, y: number): number[] => {
        const at: number = (y * width + x) * 4;
        return Array.from(data?.subarray(at, at + 3) ?? []);
      };
      expect(readPixel(0, 0)).toEqual([0, 0, 0]);
      expect(readPixel(width >> 1, height >> 1)).toEqual([255, 255, 255]);
    }
  });

  it('shows the sun and the moon where they are, while they are up', () => {
    const scene = new Scene();
    const sky = new Sky(scene);
    const camera: PerspectiveCamera = createCamera();
    const discs: Mesh[] = scene.children.filter(
      (object: Object3D): object is Mesh => object instanceof Mesh,
    );
    expect(discs).toHaveLength(2);
    for (const time of [NOON, 0, findPhaseTime('dusk', 0.3)]) {
      const look: DaylightLook = findDaylight(time);
      sky.show(look);
      sky.centreOn(camera);
      const shown: Vector3[] = [];
      for (const disc of discs) {
        if (disc.visible) {
          shown.push(disc.position.clone().sub(CAMERA_POSITION).normalize());
        }
      }
      // Only one of them is up at a time.
      expect(shown).toHaveLength(1);
      const [direction = new Vector3()] = shown;
      const body: Vector3 = look.body === 'sun' ? look.sun : look.moon;
      expect(direction.angleTo(body)).toBeLessThan(1e-6);
    }
  });
});
