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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/25
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/hills Tests for the low hills that close in the
 *   valley just outside the village.
 */

import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
import type { BufferAttribute, Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';

import { NOON, VILLAGE_TERRAIN } from '@clovervale/shared';
import type { Boundary } from '@clovervale/shared';

import { createHills, tintHills } from '../src/hills.ts';
import { createMountains, tintMountains } from '../src/mountains.ts';
import { createVillageScene } from '../src/village-scene.ts';

/** The boundary the players cannot leave. */
const BOUNDARY: Boundary = VILLAGE_TERRAIN.boundary;
/**
 * The way out of the village through its gate, from the middle of the
 * boundary, as the turn around the Y axis from +Z toward +X, in degrees.
 */
const GATE_HEADING = 0;
/** The least room between the boundary and the hills, in meters. */
const CLEARANCE = 3;
/** The least height of the hills away from the opening, in meters. */
const LEAST_HEIGHT = 8;
/** The greatest height of the hills, in meters. */
const GREATEST_HEIGHT = 15;
/**
 * How far from the way out through the gate the hills stand at their full
 * height, at least, in degrees.
 */
const CLOSED_BEYOND = 40;
/**
 * How far to either side of the way out through the gate the hills are
 * gone, at least, in degrees.
 */
const OPEN_WITHIN = 10;
/** The number of directions the hills are measured in. */
const DIRECTIONS = 180;
/** How high above the ground the eye looks from, in meters. */
const EYE_HEIGHT = 1.7;
/**
 * The highest the hills rise above the horizon from the middle of the
 * valley, in degrees.
 */
const HIGHEST_SKYLINE = 14;
/** The least number of pine trees on the hills. */
const LEAST_TREES = 100;
/** How far a pine tree may sink into the slope, at most, in meters. */
const DEEPEST_TREE = 1;

/**
 * Finds the hills of a scene: the group named `hills`.
 *
 * @param {Scene} scene - The scene.
 * @returns {Object3D} The hills.
 * @throws {Error} If the scene has no group for its hills.
 */
function findHills(scene: Scene): Object3D {
  const hills: Object3D | undefined = scene.getObjectByName('hills');
  if (!(hills instanceof Group)) {
    throw new Error('The scene has no group for its hills.');
  }
  return hills;
}

/**
 * Finds the slopes and the pine trees of the hills.
 *
 * @param {Object3D} hills - The hills, their world matrices up to date.
 * @returns {[Mesh, InstancedMesh]} The slopes, and the trees, drawn all at
 *   once.
 */
function splitHills(hills: Object3D): [Mesh, InstancedMesh] {
  const slopes: Mesh[] = hills.children.filter(
    (child: Object3D): child is Mesh =>
      child instanceof Mesh && !(child instanceof InstancedMesh),
  );
  const trees: InstancedMesh[] = hills.children.filter(
    (child: Object3D): child is InstancedMesh =>
      child instanceof InstancedMesh,
  );
  const [slope] = slopes;
  const [tree] = trees;
  if (slope === undefined || tree === undefined) {
    throw new Error('The hills have no slopes or no trees.');
  }
  expect(slopes).toHaveLength(1);
  expect(trees).toHaveLength(1);
  return [slope, tree];
}

/**
 * Lists the corners of the slopes, in world space.
 *
 * @param {Mesh} slopes - The slopes.
 * @returns {Vector3[]} The corners.
 */
function listCorners(slopes: Mesh): Vector3[] {
  const position = slopes.geometry.getAttribute(
    'position',
  ) as BufferAttribute;
  return Array.from({ length: position.count }, (_, index: number) =>
    new Vector3()
      .fromBufferAttribute(position, index)
      .applyMatrix4(slopes.matrixWorld),
  );
}

/**
 * Lists where the pine trees stand, in world space.
 *
 * @param {InstancedMesh} trees - The trees.
 * @returns {Vector3[]} The foot of each tree.
 */
function listTreeFeet(trees: InstancedMesh): Vector3[] {
  return Array.from({ length: trees.count }, (_, index: number) => {
    const place = new Matrix4();
    trees.getMatrixAt(index, place);
    return new Vector3()
      .setFromMatrixPosition(place)
      .applyMatrix4(trees.matrixWorld);
  });
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
 * Measures how far a direction along the ground is from the way out
 * through the gate.
 *
 * @param {number} degrees - The direction, as the turn around the Y axis
 *   from +Z toward +X, in degrees.
 * @returns {number} The smaller angle between them, in degrees.
 */
function measureFromGate(degrees: number): number {
  const difference: number = Math.abs(degrees - GATE_HEADING) % 360;
  return Math.min(difference, 360 - difference);
}

/**
 * Finds the direction along the ground of a turn.
 *
 * @param {number} degrees - The turn around the Y axis from +Z toward +X,
 *   in degrees.
 * @param {number} rise - The angle above the horizon, in degrees.
 * @returns {Vector3} The direction, of unit length.
 */
function findDirection(degrees: number, rise: number): Vector3 {
  const turn: number = (degrees * Math.PI) / 180;
  const up: number = (rise * Math.PI) / 180;
  return new Vector3(
    Math.sin(turn) * Math.cos(up),
    Math.sin(up),
    Math.cos(turn) * Math.cos(up),
  );
}

/**
 * Lists the directions the hills are measured in.
 *
 * @returns {number[]} The directions, in degrees.
 */
function listDirections(): number[] {
  return Array.from(
    { length: DIRECTIONS },
    (_, index: number) => (index * 360) / DIRECTIONS,
  );
}

/**
 * Measures how high what stands around the valley rises in a direction,
 * seen from the middle of the boundary.
 *
 * @param {readonly Object3D[]} objects - What stands around the valley.
 * @param {number} degrees - The direction along the ground, in degrees.
 * @returns {number} The angle of its top above the horizon, in degrees.
 */
function measureSkyline(objects: readonly Object3D[], degrees: number): number {
  const eye = new Vector3(BOUNDARY.x, EYE_HEIGHT, BOUNDARY.z);
  let low = -5;
  let high = 40;
  for (let step = 0; step < 14; step++) {
    const middle: number = (low + high) / 2;
    const raycaster = new Raycaster(eye, findDirection(degrees, middle));
    if (raycaster.intersectObjects([...objects], true).length > 0) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Measures how high the slopes rise in a direction from the middle of the
 * boundary, at their highest along it.
 *
 * @param {Mesh} slopes - The slopes.
 * @param {number} degrees - The direction along the ground, in degrees.
 * @returns {number} The height of their top, in meters, or -Infinity where
 *   they are nowhere along it.
 */
function measureTop(slopes: Mesh, degrees: number): number {
  const along: Vector3 = findDirection(degrees, 0);
  const down = new Vector3(0, -1, 0);
  let top = -Infinity;
  for (let reach = BOUNDARY.radius; reach < BOUNDARY.radius + 60; reach++) {
    const above = new Vector3(BOUNDARY.x, 100, BOUNDARY.z).addScaledVector(
      along,
      reach,
    );
    const [hit] = new Raycaster(above, down).intersectObject(slopes);
    top = Math.max(top, hit?.point.y ?? -Infinity);
  }
  return top;
}

describe('the hills around the valley', () => {
  const scene: Scene = createVillageScene().scene;
  const hills: Object3D = findHills(scene);
  scene.updateMatrixWorld(true);
  const [slopes, trees] = splitHills(hills);

  it('stand beyond where the players can walk', () => {
    for (const point of [...listCorners(slopes), ...listTreeFeet(trees)]) {
      expect(measureReach(point)).toBeGreaterThan(
        BOUNDARY.radius + CLEARANCE,
      );
    }
  });

  it('rise 8 to 15 meters, and sink away toward the gate', () => {
    for (const degrees of listDirections()) {
      const top: number = measureTop(slopes, degrees);
      const away: number = measureFromGate(degrees);
      if (away >= CLOSED_BEYOND) {
        expect(top, String(degrees)).toBeGreaterThanOrEqual(LEAST_HEIGHT);
        expect(top, String(degrees)).toBeLessThanOrEqual(GREATEST_HEIGHT);
      } else if (away <= OPEN_WITHIN) {
        expect(top, String(degrees)).toBeLessThan(0);
      }
    }
  });

  it('close in the valley, but for the way out through the gate', () => {
    const middle = new Vector3(BOUNDARY.x, 2, BOUNDARY.z);
    const gate = new Vector3(BOUNDARY.x, 2, BOUNDARY.z + BOUNDARY.radius);
    for (const degrees of listDirections()) {
      const away: number = measureFromGate(degrees);
      if (away >= CLOSED_BEYOND) {
        const toward = new Raycaster(middle, findDirection(degrees, 0));
        expect(toward.intersectObject(slopes), String(degrees)).not.toEqual(
          [],
        );
      } else if (away <= OPEN_WITHIN) {
        const out = new Raycaster(gate, findDirection(degrees, 0));
        expect(out.intersectObject(hills, true), String(degrees)).toEqual([]);
      }
    }
  });

  it('keep low on the sky seen from the middle of the valley', () => {
    for (const degrees of listDirections()) {
      expect(measureSkyline([hills], degrees)).toBeLessThan(HIGHEST_SKYLINE);
    }
  });

  it('leave the skyline lowest toward the gate, with the mountains', () => {
    const mountains: Object3D | undefined = scene.getObjectByName('mountains');
    if (mountains === undefined) {
      throw new Error('The scene has no mountains.');
    }
    const skyline: number[] = listDirections().map((degrees: number) =>
      measureSkyline([hills, mountains], degrees),
    );
    const lowest: number = skyline.indexOf(Math.min(...skyline));
    expect(measureFromGate((lowest * 360) / DIRECTIONS)).toBeLessThan(
      OPEN_WITHIN,
    );
  });

  it('have pine trees standing on their slopes', () => {
    const feet: Vector3[] = listTreeFeet(trees);
    expect(feet.length).toBeGreaterThanOrEqual(LEAST_TREES);
    const down = new Vector3(0, -1, 0);
    for (const foot of feet) {
      const above = new Vector3(foot.x, 100, foot.z);
      const [ground] = new Raycaster(above, down).intersectObject(slopes);
      expect(ground).toBeDefined();
      const sink: number = (ground?.point.y ?? 0) - foot.y;
      expect(sink).toBeGreaterThanOrEqual(0);
      expect(sink).toBeLessThan(DEEPEST_TREE);
      expect(ground?.point.y).toBeGreaterThan(0);
    }
  });
});

describe('tintHills', () => {
  /**
   * Lists the colors of the slopes and the trees of fresh hills, and their
   * glow.
   *
   * @param {Color} sky - The color of the sky to tint them with.
   * @param {number} share - How far to tint them.
   * @returns {[Color[], Color[], Color[]]} The colors of the slopes and the
   *   trees as created and as tinted, and the light they give off by
   *   themselves.
   */
  function tint(sky: Color, share: number): [Color[], Color[], Color[]] {
    const hills: Object3D = createHills();
    hills.updateMatrixWorld(true);
    const materials: MeshStandardMaterial[] = splitHills(hills).map(
      (part: Mesh) => part.material as MeshStandardMaterial,
    );
    const own: Color[] = materials.map((material) => material.color.clone());
    tintHills(hills, sky, share);
    return [
      own,
      materials.map((material) => material.color.clone()),
      materials.map((material) =>
        material.emissive.clone().multiplyScalar(material.emissiveIntensity),
      ),
    ];
  }

  it('leaves the hills in their own colors when untinted', () => {
    const [own, tinted, glow] = tint(new Color('#e2643c'), 0);
    expect(tinted).toEqual(own);
    for (const color of glow) {
      expect(color.equals(new Color(0, 0, 0))).toBe(true);
    }
  });

  it('gives them the color of the sky, darker than the mountains', () => {
    const sky = new Color('#0e1a3c');
    const [, tinted, glow] = tint(sky, 1);
    const mountains: Object3D = createMountains();
    tintMountains(mountains, sky, 1);
    const [nearest] = mountains.children;
    expect(nearest).toBeInstanceOf(Mesh);
    const ridge = (nearest as Mesh).material as MeshStandardMaterial;
    for (const color of tinted) {
      expect(color.equals(new Color(0, 0, 0))).toBe(true);
    }
    for (const color of glow) {
      const shade: number = color.b / sky.b;
      expect(color.r).toBeCloseTo(sky.r * shade, 9);
      expect(color.g).toBeCloseTo(sky.g * shade, 9);
      expect(shade).toBeGreaterThan(0.2);
      expect(shade).toBeLessThan(ridge.emissive.b / sky.b);
    }
  });
});

describe('the hills of the village', () => {
  it('melt into the sky at night as the mountains do', () => {
    const village = createVillageScene();
    const [slopes, trees] = splitHills(findHills(village.scene));
    const glow = (part: Mesh): Color =>
      (part.material as MeshStandardMaterial).emissive.clone();
    village.showTimeOfDay(NOON);
    expect(glow(slopes).equals(new Color(0, 0, 0))).toBe(true);
    village.showTimeOfDay(0);
    for (const part of [slopes, trees]) {
      expect(glow(part).getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0);
    }
  });
});
