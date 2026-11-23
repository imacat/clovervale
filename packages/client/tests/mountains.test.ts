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
 * @module client/tests/mountains Tests for the mountains around the valley.
 */

import {
  Color,
  Group,
  Fog,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
import type { BufferAttribute, Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';

import { VILLAGE_TERRAIN } from '@clovervale/shared';
import type { Boundary } from '@clovervale/shared';

import { tintMountains } from '../src/mountains.ts';
import { createVillageScene } from '../src/village-scene.ts';
import { CAMERA_FAR, CAMERA_MAX_DISTANCE } from '../src/viewport.ts';

/** The boundary the players cannot leave. */
const BOUNDARY: Boundary = VILLAGE_TERRAIN.boundary;
/**
 * How far from the ground what the camera looks at can be, at most, in
 * meters.
 */
const FOCUS_SLACK = 2;
/** The least room between the camera and the mountains, in meters. */
const CAMERA_CLEARANCE = 10;
/** The most fog any part of a mountain may be drawn in, from 0 to 1. */
const MOST_FOG = 0.9;
/** The number of directions the skyline is measured in. */
const SKYLINE_DIRECTIONS = 360;
/** The number of directions every ridge is looked for in. */
const GAP_DIRECTIONS = 1440;
/** The height above the ground the gaps are looked for at, in meters. */
const GAP_HEIGHT = 3;
/** The least number of peaks a ridge has. */
const LEAST_PEAKS = 5;
/** How far around a peak stands above its neighbors, in degrees. */
const PEAK_WINDOW = 8;

/**
 * Finds the mountains of a scene: the one group of the village without its
 * models.
 *
 * @param {Scene} scene - The scene.
 * @returns {Object3D} The mountains.
 * @throws {Error} If the scene has no one group.
 */
function findMountains(scene: Scene): Object3D {
  const groups: Object3D[] = scene.children.filter(
    (child: Object3D) => child instanceof Group,
  );
  const [mountains] = groups;
  if (mountains === undefined || groups.length !== 1) {
    throw new Error('The scene has no one group for its mountains.');
  }
  return mountains;
}

/**
 * Finds the ridges of the mountains of a scene, nearest first.
 *
 * @param {Scene} scene - The scene.
 * @returns {Mesh[]} The ridges.
 */
function findRidges(scene: Scene): Mesh[] {
  const mountains: Object3D = findMountains(scene);
  scene.updateMatrixWorld(true);
  const ridges: Mesh[] = mountains.children.filter(
    (child: Object3D): child is Mesh => child instanceof Mesh,
  );
  expect(ridges.length).toBeGreaterThanOrEqual(2);
  return ridges.toSorted(
    (a: Mesh, b: Mesh) => measureMeanReach(a) - measureMeanReach(b),
  );
}

/**
 * Lists the corners of a ridge, in world space.
 *
 * @param {Mesh} ridge - The ridge.
 * @returns {Vector3[]} The corners.
 */
function listCorners(ridge: Mesh): Vector3[] {
  const position = ridge.geometry.getAttribute('position') as BufferAttribute;
  return Array.from({ length: position.count }, (_, index: number) =>
    new Vector3().fromBufferAttribute(position, index).applyMatrix4(
      ridge.matrixWorld,
    ),
  );
}

/**
 * Measures how far a point is from the middle of the boundary along the
 * ground.
 *
 * @param {Vector3} point - The point.
 * @returns {number} The distance, in meters.
 */
function measureReach(point: Vector3): number {
  return Math.hypot(point.x - BOUNDARY.x, point.z - BOUNDARY.z);
}

/**
 * Measures how far the corners of a ridge are from the middle of the
 * boundary along the ground, on average.
 *
 * @param {Mesh} ridge - The ridge.
 * @returns {number} The mean distance, in meters.
 */
function measureMeanReach(ridge: Mesh): number {
  const corners: Vector3[] = listCorners(ridge);
  const sum: number = corners.reduce(
    (total: number, corner: Vector3) => total + measureReach(corner),
    0,
  );
  return sum / corners.length;
}

/**
 * Measures the farthest a point can be from the camera, wherever the
 * players and the camera go.
 *
 * @param {Vector3} point - The point.
 * @returns {number} The distance, in meters.
 */
function measureFarthestView(point: Vector3): number {
  const focus: number = Math.hypot(
    measureReach(point) + BOUNDARY.radius,
    Math.abs(point.y) + FOCUS_SLACK,
  );
  return focus + CAMERA_MAX_DISTANCE;
}

/**
 * Tells how much fog a point at a depth is drawn in, as three.js draws it.
 *
 * @param {Fog} fog - The fog.
 * @param {number} depth - The depth of the point from the camera, in meters.
 * @returns {number} The amount of fog, from 0 to 1.
 */
function measureFog(fog: Fog, depth: number): number {
  const t: number = Math.min(
    Math.max((depth - fog.near) / (fog.far - fog.near), 0),
    1,
  );
  return t * t * (3 - 2 * t);
}

/**
 * Measures how high a ridge rises in a direction, seen from the middle of
 * the boundary on the ground.
 *
 * @param {Mesh} ridge - The ridge.
 * @param {number} degrees - The direction along the ground, in degrees.
 * @returns {number} The angle of the top of the ridge above the horizon, in
 *   degrees.
 */
function measureSkyline(ridge: Mesh, degrees: number): number {
  const origin = new Vector3(BOUNDARY.x, 0, BOUNDARY.z);
  const turn: number = (degrees * Math.PI) / 180;
  let low = 0;
  let high = 60;
  for (let step = 0; step < 16; step++) {
    const middle: number = (low + high) / 2;
    const rise: number = (middle * Math.PI) / 180;
    const direction = new Vector3(
      Math.sin(turn) * Math.cos(rise),
      Math.sin(rise),
      Math.cos(turn) * Math.cos(rise),
    );
    const hits = new Raycaster(origin, direction).intersectObject(ridge);
    if (hits.length > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Finds the peaks of a skyline: the points that stand above every other
 * point near them.
 *
 * @param {readonly number[]} skyline - The heights of the skyline, one a
 *   degree around.
 * @returns {number[]} The heights of the peaks.
 */
function findPeaks(skyline: readonly number[]): number[] {
  const count: number = skyline.length;
  return skyline.filter((height: number, index: number) => {
    for (let offset = -PEAK_WINDOW; offset <= PEAK_WINDOW; offset++) {
      const other: number = skyline[(index + offset + count) % count] ?? 0;
      if (offset !== 0 && other >= height) {
        return false;
      }
    }
    return true;
  });
}

describe('the mountains around the valley', () => {
  const scene: Scene = createVillageScene().scene;

  it('stand beyond the reach of the players and the camera', () => {
    const ridges: Mesh[] = findRidges(scene);
    const reach: number =
      BOUNDARY.radius + CAMERA_MAX_DISTANCE + CAMERA_CLEARANCE;
    for (const ridge of ridges) {
      for (const corner of listCorners(ridge)) {
        expect(measureReach(corner)).toBeGreaterThan(reach);
      }
    }
  });

  it('stay within the far plane and clear of the fog', () => {
    const ridges: Mesh[] = findRidges(scene);
    expect(scene.fog).toBeInstanceOf(Fog);
    const fog = scene.fog as Fog;
    for (const ridge of ridges) {
      for (const corner of listCorners(ridge)) {
        const farthest: number = measureFarthestView(corner);
        expect(farthest).toBeLessThan(CAMERA_FAR);
        expect(measureFog(fog, farthest)).toBeLessThan(MOST_FOG);
      }
    }
  });

  it('grow paler and nearer the sky the farther they are', () => {
    const ridges: Mesh[] = findRidges(scene);
    const sky: Color = scene.background as Color;
    const distances: number[] = ridges.map((ridge: Mesh) => {
      expect(ridge.material).toBeInstanceOf(MeshStandardMaterial);
      const color: Color = (ridge.material as MeshStandardMaterial).color;
      return Math.hypot(color.r - sky.r, color.g - sky.g, color.b - sky.b);
    });
    for (let index = 1; index < distances.length; index++) {
      expect(distances[index]).toBeLessThan(distances[index - 1] ?? 0);
    }
  });

  it('ring the valley without a gap, each facing it', () => {
    const ridges: Mesh[] = findRidges(scene);
    const origin = new Vector3(BOUNDARY.x, GAP_HEIGHT, BOUNDARY.z);
    for (const ridge of ridges) {
      for (let index = 0; index < GAP_DIRECTIONS; index++) {
        const turn: number = (index * 2 * Math.PI) / GAP_DIRECTIONS;
        const direction = new Vector3(Math.sin(turn), 0, Math.cos(turn));
        const hits = new Raycaster(origin, direction).intersectObject(ridge);
        expect(hits.length).toBeGreaterThan(0);
      }
    }
  });

  it('rise into peaks and saddles of different heights', () => {
    const ridges: Mesh[] = findRidges(scene);
    for (const ridge of ridges) {
      const skyline: number[] = Array.from(
        { length: SKYLINE_DIRECTIONS },
        (_, index: number) =>
          measureSkyline(ridge, (index * 360) / SKYLINE_DIRECTIONS),
      );
      const peaks: number[] = findPeaks(skyline);
      expect(peaks.length).toBeGreaterThanOrEqual(LEAST_PEAKS);
      expect(Math.max(...peaks)).toBeGreaterThan(Math.min(...peaks) * 1.3);
      expect(Math.min(...skyline)).toBeLessThan(Math.max(...skyline) * 0.6);
    }
  });

  it('come out the same every time', () => {
    const ridges: Mesh[] = findRidges(scene);
    const again: Mesh[] = findRidges(createVillageScene().scene);
    expect(again.map(listCorners)).toEqual(ridges.map(listCorners));
  });

  it('stand on the ground, reaching down into it', () => {
    const ridges: Mesh[] = findRidges(scene);
    const mountains: Object3D = findMountains(scene);
    const ground: Object3D[] = scene.children.filter(
      (child: Object3D) => child !== mountains,
    );
    for (const ridge of ridges) {
      const corners: Vector3[] = listCorners(ridge);
      const lowest: number = Math.min(
        ...corners.map((corner: Vector3) => corner.y),
      );
      expect(lowest).toBeLessThanOrEqual(0);
      for (const corner of corners) {
        if (corner.y > 0) {
          continue;
        }
        const above = new Vector3(corner.x, 1, corner.z);
        const down = new Vector3(0, -1, 0);
        const hits = new Raycaster(above, down).intersectObjects(ground);
        expect(hits.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('tintMountains', () => {
  /**
   * Lists the colors of the ridges of fresh mountains, and their glow.
   *
   * @param {Color} sky - The color of the sky to tint them with.
   * @param {number} share - How far to tint them.
   * @returns {[Color[], Color[], Color[]]} The colors of the ridges as
   *   created and as tinted, and the light they give off by themselves,
   *   nearest first.
   */
  function tint(sky: Color, share: number): [Color[], Color[], Color[]] {
    const scene: Scene = createVillageScene().scene;
    const ridges: Mesh[] = findRidges(scene);
    const materials: MeshStandardMaterial[] = ridges.map(
      (ridge: Mesh) => ridge.material as MeshStandardMaterial,
    );
    const own: Color[] = materials.map((material) => material.color.clone());
    tintMountains(findMountains(scene), sky, share);
    return [
      own,
      materials.map((material) => material.color.clone()),
      materials.map((material) =>
        material.emissive.clone().multiplyScalar(material.emissiveIntensity),
      ),
    ];
  }

  it('leaves the mountains in their own colors when untinted', () => {
    const [own, tinted, glow] = tint(new Color('#e2643c'), 0);
    expect(tinted).toEqual(own);
    for (const color of glow) {
      expect(color.equals(new Color(0, 0, 0))).toBe(true);
    }
  });

  it('gives them the color of the sky, nearer ones a little darker', () => {
    const sky = new Color('#0e1a3c');
    const [, tinted, glow] = tint(sky, 1);
    for (const color of tinted) {
      expect(color.equals(new Color(0, 0, 0))).toBe(true);
    }
    const shades: number[] = glow.map((color: Color) => {
      const shade: number = color.b / sky.b;
      expect(color.r).toBeCloseTo(sky.r * shade, 9);
      expect(color.g).toBeCloseTo(sky.g * shade, 9);
      return shade;
    });
    for (let index = 0; index < shades.length; index++) {
      expect(shades[index]).toBeGreaterThan(0.4);
      expect(shades[index]).toBeLessThan(1);
      expect(shades[index]).toBeGreaterThan(shades[index - 1] ?? 0);
    }
  });
});
