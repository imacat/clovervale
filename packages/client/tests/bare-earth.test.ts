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
 * @module client/tests/bare-earth Tests for the bare earth of the plaza,
 *   the paths and the monster's ground.
 */

import { Color, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { BufferAttribute, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import {
  FARM_FIELDS,
  findPlacement,
  findTurn,
  turnVector,
} from '@clovervale/shared';
import type { FarmFieldId, GroundVector, Pose } from '@clovervale/shared';

import {
  EARTH_PATHS,
  EDGE_WANDER,
  outlineEarthPath,
  traceEarthPath,
} from '../src/bare-earth.ts';
import type { EarthStrip } from '../src/bare-earth.ts';
import { EARTH_COLOR, createVillageScene } from '../src/village-scene.ts';

/**
 * How high the leaves of a four-leaf clover lying on the ground are, the
 * flattest of the items lying there, in meters.
 */
const LYING_CLOVER_HEIGHT = 0.02;

/** The most a line may turn from one of its points to the next, in degrees. */
const MOST_BEND = 20;

/**
 * How much nearer the line of a path its edges may come than they wander
 * in, where the line bends, in meters.
 */
const BEND_TOLERANCE = 0.02;

/**
 * Measures how far a point lies from a line through several points.
 *
 * @param {GroundVector} point - The point.
 * @param {readonly GroundVector[]} line - The points of the line.
 * @returns {number} The distance, in meters.
 */
function measureFromLine(
  point: GroundVector,
  line: readonly GroundVector[],
): number {
  let least = Infinity;
  line.forEach((end: GroundVector, index: number) => {
    const start: GroundVector = line[index - 1] ?? end;
    const dx: number = end.x - start.x;
    const dz: number = end.z - start.z;
    const length: number = dx * dx + dz * dz;
    const along: number =
      length === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((point.x - start.x) * dx + (point.z - start.z) * dz) / length,
            ),
          );
    least = Math.min(
      least,
      Math.hypot(
        point.x - (start.x + along * dx),
        point.z - (start.z + along * dz),
      ),
    );
  });
  return least;
}

/**
 * Finds where a point lies as a model that stands somewhere has it.
 *
 * @param {Pose} pose - Where the model stands, and which way it faces.
 * @param {GroundVector} point - The point, in the world.
 * @returns {GroundVector} The point, as the model has it.
 */
function findLocal(pose: Pose, point: GroundVector): GroundVector {
  return turnVector(
    { x: point.x - pose.x, z: point.z - pose.z },
    findTurn(-pose.yaw),
  );
}

/**
 * Lists the meshes of bare earth in the village.
 *
 * @returns {Mesh[]} The meshes, placed in the world.
 */
function listEarthMeshes(): Mesh[] {
  const { scene } = createVillageScene();
  scene.updateMatrixWorld(true);
  const earth = new Color(EARTH_COLOR);
  const meshes: Mesh[] = [];
  scene.traverse((child: Object3D) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const mesh: Mesh = child as Mesh;
    if (
      mesh.material instanceof MeshStandardMaterial &&
      mesh.material.color.equals(earth)
    ) {
      meshes.push(mesh);
    }
  });
  return meshes;
}

describe('the paths of bare earth', () => {
  it('lay each strip along its line, its edges wandering in a little', () => {
    for (const path of EARTH_PATHS) {
      const line: GroundVector[] = traceEarthPath(path);
      const strip: EarthStrip = outlineEarthPath(path);
      const half: number = path.width / 2;
      expect(strip.left).toHaveLength(strip.right.length);
      for (const point of [...strip.left, ...strip.right]) {
        const distance: number = measureFromLine(point, line);
        expect(distance).toBeLessThanOrEqual(half + 1e-9);
        expect(distance).toBeGreaterThan(
          half - path.width * EDGE_WANDER - BEND_TOLERANCE,
        );
      }
    }
  });

  it('round every turn of their lines', () => {
    for (const path of EARTH_PATHS) {
      const line: GroundVector[] = traceEarthPath(path);
      expect(line[0]).toEqual(path.points[0]);
      expect(line.at(-1)).toEqual(path.points.at(-1));
      for (let index = 2; index < line.length; index++) {
        const [a, b, c] = [line[index - 2], line[index - 1], line[index]];
        if (a === undefined || b === undefined || c === undefined) {
          continue;
        }
        const turn: number = Math.abs(
          Math.atan2(c.x - b.x, c.z - b.z) - Math.atan2(b.x - a.x, b.z - a.z),
        );
        const bend: number = Math.min(turn, 2 * Math.PI - turn);
        expect((bend * 180) / Math.PI).toBeLessThanOrEqual(MOST_BEND + 1e-6);
      }
    }
  });

  it('keep out of the farm fields', () => {
    for (const id of Object.keys(FARM_FIELDS) as FarmFieldId[]) {
      const { length, width } = FARM_FIELDS[id];
      const field: Pose = findPlacement(id);
      for (const path of EARTH_PATHS) {
        const strip: EarthStrip = outlineEarthPath(path);
        for (const point of [...strip.left, ...strip.right]) {
          const local: GroundVector = findLocal(field, point);
          expect(
            Math.abs(local.x) >= length / 2 || Math.abs(local.z) >= width / 2,
            id,
          ).toBe(true);
        }
      }
    }
  });
});

describe('the bare earth in the village', () => {
  it('faces up everywhere', () => {
    for (const mesh of listEarthMeshes()) {
      const position = mesh.geometry.getAttribute('position') as
        BufferAttribute;
      const index: number[] = Array.from(
        mesh.geometry.getIndex()?.array ??
          Array.from({ length: position.count }, (_, at: number) => at),
      );
      const corner = (at: number): Vector3 =>
        new Vector3()
          .fromBufferAttribute(position, index[at] ?? 0)
          .applyMatrix4(mesh.matrixWorld);
      for (let at = 0; at < index.length; at += 3) {
        const [a, b, c] = [corner(at), corner(at + 1), corner(at + 2)];
        const normal: Vector3 = b.sub(a).cross(c.sub(a));
        expect(normal.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('lies in layers apart, under the flattest item lying on it', () => {
    const heights: number[] = listEarthMeshes().map(
      (mesh: Mesh) => mesh.getWorldPosition(new Vector3()).y,
    );
    expect(heights.length).toBeGreaterThan(EARTH_PATHS.length);
    expect(new Set(heights).size).toBe(heights.length);
    for (const height of heights) {
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThan(LYING_CLOVER_HEIGHT);
    }
  });
});
