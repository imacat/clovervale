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
 * @module client/tests/fortress Tests for the border fortress that guards
 *   the mountain pass, far off beyond the village gate.
 */

import {
  Box3,
  Color,
  Fog,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
import type { BufferAttribute, Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';

import { NOON, PLAZA_CENTER, VILLAGE_TERRAIN } from '@clovervale/shared';
import type { Boundary } from '@clovervale/shared';

import { createFortress, tintFortress } from '../src/fortress.ts';
import { createMountains, tintMountains } from '../src/mountains.ts';
import { createVillageScene } from '../src/village-scene.ts';
import { CAMERA_FAR, CAMERA_MAX_DISTANCE } from '../src/viewport.ts';

/** The boundary the players cannot leave. */
const BOUNDARY: Boundary = VILLAGE_TERRAIN.boundary;
/** How high above the ground the eye looks from, in meters. */
const EYE_HEIGHT = 1.7;
/**
 * How far from the way out through the gate the middle of the fortress may
 * be, seen from the middle of the boundary, in degrees.
 */
const MOST_OFF_GATE = 1;
/**
 * How far from the way out through the gate any part of the fortress may
 * be, seen from the plaza, in degrees: well within the opening in the
 * hills.
 */
const OPEN_WITHIN = 10;
/**
 * How far from the way out through the gate the ridges are measured, in
 * degrees.
 */
const PASS_WITHIN = 10;
/** How far from the ground what the camera looks at can be, in meters. */
const FOCUS_SLACK = 2;
/** The most fog any part of the fortress may be drawn in, from 0 to 1. */
const MOST_FOG = 0.9;
/** The most triangles the fortress may have. */
const MOST_TRIANGLES = 450;
/**
 * How far to either side of the middle of the fortress the front of the
 * crag is looked at for its spine, in meters.
 */
const SPINE_REACH = 4;
/**
 * How far below the outline of the crag the front of the crag is looked
 * at for its spine, seen from the plaza, in meters.
 */
const SPINE_DROP = 5;
/** The most triangles the crag may have. */
const MOST_CRAG_TRIANGLES = 40;
/** The least number of windows of the fortress. */
const LEAST_WINDOWS = 3;
/** The number of corners of a window. */
const WINDOW_CORNERS = 4;
/**
 * How far below the outline of the stone of the fortress, seen from the
 * plaza, it must still stand against the sky, in meters.
 */
const SKY_CLEAR = 2;
/**
 * How far apart the outline of the stone of the fortress is looked at,
 * across and up and down, in meters.
 */
const OUTLINE_STEP = 0.25;
/** How far in from either side the outline is looked at, in meters. */
const OUTLINE_INSET = 0.5;
/**
 * The most share of the width of the pass, at the height of the top of
 * the walls, that the walls may take up, seen from the plaza.
 */
const MOST_PASS_SHARE = 0.55;
/**
 * How far out from the fortress the slopes of the pass are looked for, in
 * meters.
 */
const PASS_REACH = 200;
/**
 * The most the top of the crag may be lighter than the ridge behind it,
 * in each channel of its color.
 */
const MOST_ROCK_SHIFT = 0.1;
/**
 * How far below the top of the crag its corners still count as its top,
 * in meters.
 */
const TOP_DROP = 2;
/**
 * The most the top of the crag may reach out beyond the walls, in meters.
 */
const TOP_SLACK = 0.5;
/**
 * How far apart the outline of the crag is looked at, across, in meters.
 */
const KNOB_STEP = 0.5;
/**
 * How far below the top of the crag its outline must fall for its side to
 * have begun to slope down, seen from the plaza, in meters.
 */
const BROW_DROP = 0.5;
/**
 * How much farther at least the gentle right side of the crag runs down
 * to meet the ridge behind it than its steep left side, as a share.
 */
const LEAST_GENTLENESS = 2;

/**
 * Finds a group of a scene by its name.
 *
 * @param {Scene} scene - The scene.
 * @param {string} name - The name.
 * @returns {Object3D} The group.
 * @throws {Error} If the scene has no such group.
 */
function findGroup(scene: Scene, name: string): Object3D {
  const group: Object3D | undefined = scene.getObjectByName(name);
  if (!(group instanceof Group)) {
    throw new Error(`The scene has no group named ${name}.`);
  }
  return group;
}

/**
 * Lists the meshes among the children of a group.
 *
 * @param {Object3D} group - The group.
 * @returns {Mesh[]} The meshes, in order.
 */
function listMeshes(group: Object3D): Mesh[] {
  return group.children.filter(
    (child: Object3D): child is Mesh => child instanceof Mesh,
  );
}

/**
 * Lists the corners of a mesh, in world space.
 *
 * @param {Mesh} mesh - The mesh, its world matrix up to date.
 * @returns {Vector3[]} The corners.
 */
function listCorners(mesh: Mesh): Vector3[] {
  const position = mesh.geometry.getAttribute('position') as BufferAttribute;
  return Array.from({ length: position.count }, (_, index: number) =>
    new Vector3()
      .fromBufferAttribute(position, index)
      .applyMatrix4(mesh.matrixWorld),
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
 * Measures how far the direction along the ground from a place to a point
 * is from the way out through the gate, +Z.
 *
 * @param {Vector3} from - The place.
 * @param {Vector3} point - The point.
 * @returns {number} The angle between them, in degrees.
 */
function measureFromGate(from: Vector3, point: Vector3): number {
  const turn: number = Math.atan2(point.x - from.x, point.z - from.z);
  return Math.abs((turn * 180) / Math.PI);
}

/**
 * Finds the farthest reach of the corners of a ridge toward the gate.
 *
 * @param {Mesh} ridge - The ridge.
 * @returns {number} The farthest distance from the middle of the
 *   boundary, in meters.
 */
function measureRidgeReach(ridge: Mesh): number {
  const middle = new Vector3(BOUNDARY.x, 0, BOUNDARY.z);
  const reaches: number[] = listCorners(ridge)
    .filter(
      (corner: Vector3) => measureFromGate(middle, corner) < PASS_WITHIN,
    )
    .map(measureReach);
  return Math.max(...reaches);
}

/**
 * Finds what is seen first looking from the plaza toward a point.
 *
 * @param {readonly Object3D[]} objects - What may be seen.
 * @param {Vector3} point - The point.
 * @returns {Object3D | null} The mesh seen first, or `null` for the sky.
 */
function findFirstSeen(
  objects: readonly Object3D[],
  point: Vector3,
): Object3D | null {
  const eye = new Vector3(PLAZA_CENTER.x, EYE_HEIGHT, PLAZA_CENTER.z);
  const direction: Vector3 = point.clone().sub(eye).normalize();
  const [hit] = new Raycaster(eye, direction).intersectObjects(
    [...objects],
    true,
  );
  return hit?.object ?? null;
}

/**
 * Finds the middle of each window of the fortress.
 *
 * @param {Mesh} windows - The windows, their world matrix up to date.
 * @returns {Vector3[]} The middles, in world space.
 */
function listWindowMiddles(windows: Mesh): Vector3[] {
  const corners: Vector3[] = listCorners(windows);
  const middles: Vector3[] = [];
  for (let start = 0; start < corners.length; start += WINDOW_CORNERS) {
    const middle = new Vector3();
    for (const corner of corners.slice(start, start + WINDOW_CORNERS)) {
      middle.addScaledVector(corner, 1 / WINDOW_CORNERS);
    }
    middles.push(middle);
  }
  return middles;
}

/**
 * Finds how high the outline of a mesh is, seen from the plaza, as a
 * point on the upright plane across the way out through the gate at some
 * distance.
 *
 * @param {Mesh} mesh - The mesh.
 * @param {number} x - Where across the point is, in meters.
 * @param {number} z - Where along the way out the plane is, in meters.
 * @param {number} top - How high to look down from, in meters.
 * @returns {number | null} How high the outline is, in meters, or `null`
 *   if the mesh is not seen there at all.
 */
function findOutlineHeight(
  mesh: Mesh,
  x: number,
  z: number,
  top: number,
): number | null {
  for (let y = top; y > 0; y -= OUTLINE_STEP) {
    if (findFirstSeen([mesh], new Vector3(x, y, z)) !== null) {
      return y;
    }
  }
  return null;
}

/**
 * Finds where a slope of the pass rises to some height, seen from the
 * plaza, on the upright plane across the way out through the gate at some
 * distance.
 *
 * @param {readonly Object3D[]} slopes - The hills and the mountains.
 * @param {number} from - Where across to look out from, in meters.
 * @param {number} side - Which way to look, -1 for left or 1 for right.
 * @param {number} y - The height, in meters.
 * @param {number} z - Where along the way out the plane is, in meters.
 * @returns {number} Where across the slope rises to the height, in meters.
 */
function findSlope(
  slopes: readonly Object3D[],
  from: number,
  side: number,
  y: number,
  z: number,
): number {
  for (let reach = 0; reach < PASS_REACH; reach += OUTLINE_STEP) {
    const x: number = from + side * reach;
    if (findFirstSeen(slopes, new Vector3(x, y, z)) !== null) {
      return x;
    }
  }
  return from + side * PASS_REACH;
}

describe('the border fortress', () => {
  const scene: Scene = createVillageScene().scene;
  scene.updateMatrixWorld(true);
  const fortress: Object3D = findGroup(scene, 'fortress');
  const mountains: Object3D = findGroup(scene, 'mountains');
  const hills: Object3D = findGroup(scene, 'hills');
  const parts: Mesh[] = listMeshes(fortress);
  const [stone, slate, windows, rock] = parts;
  if (
    stone === undefined ||
    slate === undefined ||
    windows === undefined ||
    rock === undefined
  ) {
    throw new Error('The fortress has no walls, slate, windows or crag.');
  }
  const corners: Vector3[] = parts.flatMap(listCorners);
  const box: Box3 = new Box3().setFromObject(fortress);
  const middle: Vector3 = box.getCenter(new Vector3());

  it('stands straight out from the gate, between the first ridges', () => {
    const center = new Vector3(BOUNDARY.x, 0, BOUNDARY.z);
    expect(measureFromGate(center, middle)).toBeLessThan(MOST_OFF_GATE);
    const ridges: Mesh[] = listMeshes(mountains);
    const [nearest, next] = ridges;
    if (nearest === undefined || next === undefined) {
      throw new Error('The mountains have fewer than two ridges.');
    }
    expect(measureReach(middle)).toBeGreaterThan(measureRidgeReach(nearest));
    expect(measureReach(middle)).toBeLessThan(measureRidgeReach(next));
    const farthestHill: number = Math.max(
      ...listMeshes(hills).flatMap(listCorners).map(measureReach),
    );
    for (const corner of corners) {
      expect(measureReach(corner)).toBeGreaterThan(farthestHill);
    }
  });

  it('is framed by the opening in the hills, seen from the plaza', () => {
    const eye = new Vector3(PLAZA_CENTER.x, EYE_HEIGHT, PLAZA_CENTER.z);
    for (const corner of corners) {
      expect(measureFromGate(eye, corner)).toBeLessThan(OPEN_WITHIN);
    }
  });

  it('has its foot hidden by the nearer ridge', () => {
    const foot = new Vector3(middle.x, 0, box.min.z);
    const seen: Object3D | null = findFirstSeen(
      [hills, mountains, fortress],
      foot,
    );
    expect(seen?.parent).toBe(mountains);
  });

  it('stands its walls and towers against the sky, seen from the plaza', () => {
    const walls: Box3 = new Box3().setFromObject(stone);
    for (
      let x = walls.min.x + OUTLINE_INSET;
      x < walls.max.x - OUTLINE_INSET;
      x += OUTLINE_STEP
    ) {
      const outline: number | null = findOutlineHeight(
        stone,
        x,
        middle.z,
        walls.max.y + 1,
      );
      expect(outline).not.toBeNull();
      const below = new Vector3(x, (outline ?? 0) - SKY_CLEAR, middle.z);
      const seen: Object3D | null = findFirstSeen(
        [hills, mountains, fortress],
        below,
      );
      expect(seen?.parent).toBe(fortress);
      expect(findFirstSeen([hills, mountains], below)).toBeNull();
    }
  });

  it('leaves the slopes of the pass room, seen from the plaza', () => {
    const walls: Box3 = new Box3().setFromObject(stone);
    const left: number = findSlope(
      [hills, mountains],
      middle.x,
      -1,
      walls.max.y,
      middle.z,
    );
    const right: number = findSlope(
      [hills, mountains],
      middle.x,
      1,
      walls.max.y,
      middle.z,
    );
    expect(walls.max.x - walls.min.x).toBeLessThan(
      (right - left) * MOST_PASS_SHARE,
    );
  });

  it('shows its windows from the plaza, hidden by nothing', () => {
    const middles: Vector3[] = listWindowMiddles(windows);
    expect(middles.length).toBeGreaterThanOrEqual(LEAST_WINDOWS);
    for (const point of middles) {
      expect(findFirstSeen([hills, mountains, fortress], point)).toBe(
        windows,
      );
    }
  });

  it('stays within the far plane and clear of the fog', () => {
    expect(scene.fog).toBeInstanceOf(Fog);
    const fog = scene.fog as Fog;
    for (const corner of corners) {
      const farthest: number =
        Math.hypot(
          measureReach(corner) + BOUNDARY.radius,
          Math.abs(corner.y) + FOCUS_SLACK,
        ) + CAMERA_MAX_DISTANCE;
      expect(farthest).toBeLessThan(CAMERA_FAR);
      const t: number = Math.min(
        Math.max((farthest - fog.near) / (fog.far - fog.near), 0),
        1,
      );
      expect(t * t * (3 - 2 * t)).toBeLessThan(MOST_FOG);
    }
  });

  it('grows out of a crag in the colors of the ridges', () => {
    const material = rock.material as MeshStandardMaterial;
    expect(material.vertexColors).toBe(true);
    const colors = rock.geometry.getAttribute('color') as BufferAttribute;
    const heights: number[] = listCorners(rock).map(
      (corner: Vector3) => corner.y,
    );
    const lowest: number = heights.indexOf(Math.min(...heights));
    const highest: number = heights.indexOf(Math.max(...heights));
    const foot = new Color().fromBufferAttribute(colors, lowest);
    const top = new Color().fromBufferAttribute(colors, highest);
    const [nearest, next] = listMeshes(mountains);
    const ridge = nearest?.material as MeshStandardMaterial;
    expect(foot.r).toBeCloseTo(ridge.color.r, 6);
    expect(foot.g).toBeCloseTo(ridge.color.g, 6);
    expect(foot.b).toBeCloseTo(ridge.color.b, 6);
    expect(top.b).toBeGreaterThan(foot.b);
    expect(top.b).toBeGreaterThan(top.r);
    const behind: Color = (next?.material as MeshStandardMaterial).color;
    for (const channel of ['r', 'g', 'b'] as const) {
      expect(top[channel]).toBeGreaterThanOrEqual(behind[channel]);
      expect(top[channel] - behind[channel]).toBeLessThan(MOST_ROCK_SHIFT);
    }
  });

  it('stands its walls right at the edge of the top of the crag', () => {
    const walls: Box3 = new Box3().setFromObject(stone);
    const top: number = new Box3().setFromObject(rock).max.y;
    for (const corner of listCorners(rock)) {
      if (corner.y < top - TOP_DROP) {
        continue;
      }
      expect(corner.x).toBeGreaterThan(walls.min.x - TOP_SLACK);
      expect(corner.x).toBeLessThan(walls.max.x + TOP_SLACK);
      expect(corner.z).toBeGreaterThan(walls.min.z - TOP_SLACK);
      expect(corner.z).toBeLessThan(walls.max.z + TOP_SLACK);
    }
  });

  it('has a crag of few, large faces, as plain as the ridges', () => {
    const triangles: number =
      rock.geometry.getAttribute('position').count / 3;
    expect(triangles).toBeLessThanOrEqual(MOST_CRAG_TRIANGLES);
  });

  it('breaks the front of its crag along a spine, seen from the plaza', () => {
    const eye = new Vector3(PLAZA_CENTER.x, EYE_HEIGHT, PLAZA_CENTER.z);
    const top: number = new Box3().setFromObject(stone).max.y;
    const peak: number = findOutlineHeight(rock, middle.x, middle.z, top) ?? 0;
    const facings: number[] = [-1, 1].map((side: number): number => {
      const point = new Vector3(
        middle.x + side * SPINE_REACH,
        peak - SPINE_DROP,
        middle.z,
      );
      const direction: Vector3 = point.sub(eye).normalize();
      const [hit] = new Raycaster(eye, direction).intersectObjects(
        [hills, mountains, fortress],
        true,
      );
      expect(hit?.object).toBe(rock);
      const normal: Vector3 = (hit?.face?.normal ?? new Vector3())
        .clone()
        .transformDirection(rock.matrixWorld);
      return normal.dot(direction) > 0 ? -normal.x : normal.x;
    });
    const [left = 0, right = 0] = facings;
    expect(left).toBeLessThan(0);
    expect(right).toBeGreaterThan(0);
  });

  it('rises out of the ridge behind it, steeper left than right', () => {
    const [, behind] = listMeshes(mountains);
    if (behind === undefined) {
      throw new Error('The mountains have fewer than two ridges.');
    }
    const top: number = new Box3().setFromObject(stone).max.y;
    const peak: number = findOutlineHeight(rock, middle.x, middle.z, top) ?? 0;
    const runs: number[] = [-1, 1].map((side: number): number => {
      let brow: number | null = null;
      for (let reach = 0; reach < PASS_REACH; reach += KNOB_STEP) {
        const x: number = middle.x + side * reach;
        const outline: number | null = findOutlineHeight(
          rock,
          x,
          middle.z,
          top,
        );
        expect(outline).not.toBeNull();
        const ridge: number = findOutlineHeight(behind, x, middle.z, top) ?? 0;
        if (brow === null && (outline ?? 0) < peak - BROW_DROP) {
          brow = reach;
        }
        if ((outline ?? 0) <= ridge) {
          return reach - (brow ?? reach);
        }
      }
      throw new Error('The crag never meets the ridge behind it.');
    });
    const [left = 0, right = 0] = runs;
    expect(right).toBeGreaterThan(left * LEAST_GENTLENESS);
  });

  it('is low-poly, with few triangles', () => {
    const triangles: number = parts.reduce(
      (total: number, part: Mesh) =>
        total +
        (part.geometry.index?.count ??
          part.geometry.getAttribute('position').count) /
          3,
      0,
    );
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThan(MOST_TRIANGLES);
  });
});

describe('tintFortress', () => {
  /**
   * Lists the materials of the walls, the slate, the windows and the crag
   * of a fresh fortress.
   *
   * @returns {[Object3D, MeshStandardMaterial[]]} The fortress, and the
   *   materials of its parts.
   */
  function createParts(): [Object3D, MeshStandardMaterial[]] {
    const fortress: Object3D = createFortress();
    const materials: MeshStandardMaterial[] = listMeshes(fortress).map(
      (part: Mesh) => part.material as MeshStandardMaterial,
    );
    expect(materials).toHaveLength(4);
    return [fortress, materials];
  }

  /**
   * Measures the light a material gives off by itself.
   *
   * @param {MeshStandardMaterial} material - The material.
   * @returns {Color} The light.
   */
  function measureGlow(material: MeshStandardMaterial): Color {
    return material.emissive.clone().multiplyScalar(material.emissiveIntensity);
  }

  it('hazes the fortress in its own colors when untinted', () => {
    const sky = new Color('#bfe4f2');
    const [fortress, materials] = createParts();
    const own: Color[] = materials.map((material) => material.color.clone());
    tintFortress(fortress, sky, 0);
    expect(materials.map((material) => material.color)).toEqual(own);
    const [stone, slate, windows] = materials;
    for (const material of [stone, slate]) {
      if (material === undefined) {
        throw new Error('The fortress has no walls or slate.');
      }
      const glow: Color = measureGlow(material);
      const shade: number = glow.b / sky.b;
      expect(shade).toBeGreaterThan(0);
      expect(shade).toBeLessThan(1);
      expect(glow.r).toBeCloseTo(sky.r * shade, 9);
      expect(glow.g).toBeCloseTo(sky.g * shade, 9);
    }
    expect(windows).toBeDefined();
    if (windows !== undefined) {
      expect(measureGlow(windows).equals(new Color(0, 0, 0))).toBe(true);
    }
  });

  it('leaves its crag unhazed when untinted, as the ridges are', () => {
    const sky = new Color('#bfe4f2');
    const [fortress, materials] = createParts();
    tintFortress(fortress, sky, 0);
    const ridges: Object3D = createMountains();
    tintMountains(ridges, sky, 0);
    const [ridge] = listMeshes(ridges).map(
      (mesh: Mesh) => mesh.material as MeshStandardMaterial,
    );
    const [, , , rock] = materials;
    if (rock === undefined || ridge === undefined) {
      throw new Error('The fortress has no crag, or there are no ridges.');
    }
    expect(measureGlow(rock).equals(measureGlow(ridge))).toBe(true);
  });

  it('gives its stone, slate and crag the sky color as ridges have', () => {
    const sky = new Color('#0e1a3c');
    const [fortress, materials] = createParts();
    tintFortress(fortress, sky, 1);
    const ridges: Object3D = createMountains();
    tintMountains(ridges, sky, 1);
    const shades: number[] = listMeshes(ridges).map(
      (ridge: Mesh) =>
        (ridge.material as MeshStandardMaterial).emissive.b / sky.b,
    );
    const [stone, slate, windows, rock] = materials;
    for (const material of [stone, slate, rock]) {
      if (material === undefined) {
        throw new Error('The fortress has no walls, slate or crag.');
      }
      expect(material.color.equals(new Color(0, 0, 0))).toBe(true);
      const glow: Color = measureGlow(material);
      const shade: number = glow.b / sky.b;
      expect(glow.r).toBeCloseTo(sky.r * shade, 9);
      expect(glow.g).toBeCloseTo(sky.g * shade, 9);
      expect(shade).toBeGreaterThan(Math.min(...shades));
      expect(shade).toBeLessThan(Math.max(...shades));
    }
    expect(windows?.color.equals(new Color(0, 0, 0))).toBe(true);
  });
});

describe('the fortress of the village', () => {
  /**
   * Finds the materials of the walls and the windows of the fortress of a
   * village.
   *
   * @param {Scene} scene - The village.
   * @returns {[MeshStandardMaterial, MeshStandardMaterial]} The walls and
   *   the windows.
   */
  function findMaterials(
    scene: Scene,
  ): [MeshStandardMaterial, MeshStandardMaterial] {
    const [stone, , windows] = listMeshes(findGroup(scene, 'fortress')).map(
      (part: Mesh) => part.material as MeshStandardMaterial,
    );
    if (stone === undefined || windows === undefined) {
      throw new Error('The fortress has no walls or no windows.');
    }
    return [stone, windows];
  }

  it('lights its windows warmly only at night', () => {
    const village = createVillageScene();
    village.populate([]);
    const [, windows] = findMaterials(village.scene);
    village.showTimeOfDay(NOON);
    expect(windows.emissiveIntensity).toBe(0);
    village.showTimeOfDay(0);
    expect(windows.emissiveIntensity).toBeGreaterThan(0);
    const glow: Color = windows.emissive
      .clone()
      .multiplyScalar(windows.emissiveIntensity);
    expect(glow.r).toBeGreaterThan(glow.g);
    expect(glow.g).toBeGreaterThan(glow.b);
  });

  it('is hazed with the sky by day, and melts into it at night', () => {
    const village = createVillageScene();
    const [stone] = findMaterials(village.scene);
    village.showTimeOfDay(NOON);
    const day: Color = stone.emissive.clone();
    expect(day.b).toBeGreaterThan(day.r);
    village.showTimeOfDay(0);
    expect(stone.emissive.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0);
  });
});
