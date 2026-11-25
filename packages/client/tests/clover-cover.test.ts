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
 * @module client/tests/clover-cover Tests for the drifts of clover over
 *   the open grass around the village.
 */

import { Box3, BoxGeometry, Group, InstancedMesh, Mesh } from 'three';
import { describe, expect, it } from 'vitest';

import {
  CLOVER_PATCHES,
  FARM_FIELDS,
  VILLAGE_PLACEMENTS,
  VILLAGE_TERRAIN,
  findTurn,
  measureBoundaryReach,
  turnVector,
} from '@clovervale/shared';
import type {
  Boundary,
  FarmField,
  GroundVector,
  ModelId,
  Pose,
} from '@clovervale/shared';

import {
  EARTH_PATCHES,
  EARTH_PATHS,
  traceEarthPath,
} from '../src/bare-earth.ts';
import {
  CLOVER_REACH,
  COVER_BAND,
  createCloverCover,
  scatterCloverCover,
} from '../src/clover-cover.ts';
import type { CloverSpot } from '../src/clover-cover.ts';
import { MODEL_FILES } from '../src/model-catalog.ts';
import { createVillageScene } from '../src/village-scene.ts';

/** The boundary the players cannot leave. */
const BOUNDARY: Boundary = VILLAGE_TERRAIN.boundary;

/** The number of equal sectors around the village to look for it in. */
const SECTORS = 12;

/** The fewest patches of the cover in every sector around the village. */
const LEAST_IN_SECTOR = 2;

/** The patches of the cover. */
const SPOTS: CloverSpot[] = scatterCloverCover();

/**
 * Measures how far the leaves of a patch of the cover reach out from its
 * middle.
 *
 * @param {CloverSpot} spot - The patch.
 * @returns {number} The distance, in meters.
 */
function measureReach(spot: CloverSpot): number {
  return CLOVER_REACH * spot.size;
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
 * Makes a model of a patch of clover to stand in for the real one: a low
 * box, raised a little off its root.
 *
 * @returns {Group} The root of the model.
 */
function makePatch(): Group {
  const patch = new Group();
  const leaves = new Mesh(new BoxGeometry(1.2, 0.12, 1.1));
  leaves.position.y = 0.08;
  patch.add(leaves);
  return patch;
}

describe('the clover cover', () => {
  it('lies all around the village, near its edge', () => {
    const counts: number[] = new Array<number>(SECTORS).fill(0);
    for (const spot of SPOTS) {
      const offset: GroundVector = {
        x: spot.x - BOUNDARY.x,
        z: spot.z - BOUNDARY.z,
      };
      const depth: number =
        measureBoundaryReach(BOUNDARY, offset) -
        Math.hypot(offset.x, offset.z);
      expect(depth).toBeGreaterThan(measureReach(spot));
      expect(depth).toBeLessThanOrEqual(COVER_BAND);
      const turn: number = Math.atan2(offset.x, offset.z) + 2 * Math.PI;
      const sector: number =
        Math.floor((turn / (2 * Math.PI)) * SECTORS) % SECTORS;
      counts[sector] = (counts[sector] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThanOrEqual(LEAST_IN_SECTOR);
    }
  });

  it('is the same every time', () => {
    expect(scatterCloverCover()).toEqual(SPOTS);
  });

  it('stands in nobody’s way and keeps clear of what stands', () => {
    for (const spot of SPOTS) {
      expect(VILLAGE_TERRAIN.isClear(spot)).toBe(true);
      expect(VILLAGE_TERRAIN.isClear(spot, measureReach(spot))).toBe(true);
    }
  });

  it('keeps off the farm fields', () => {
    const fields: Readonly<Partial<Record<ModelId, FarmField>>> =
      FARM_FIELDS;
    for (const placement of VILLAGE_PLACEMENTS) {
      const field: FarmField | undefined = fields[placement.model];
      if (field === undefined) {
        continue;
      }
      for (const spot of SPOTS) {
        const local: GroundVector = findLocal(placement, spot);
        const reach: number = measureReach(spot);
        expect(
          Math.abs(local.x) > field.length / 2 + reach ||
            Math.abs(local.z) > field.width / 2 + reach,
        ).toBe(true);
      }
    }
  });

  it('keeps off the bare earth of the plaza and the paths', () => {
    for (const [x, z, radiusX, radiusZ, yaw] of EARTH_PATCHES) {
      for (const spot of SPOTS) {
        const local: GroundVector = findLocal({ x, z, yaw }, spot);
        const reach: number = measureReach(spot);
        expect(
          (local.x / (radiusX + reach)) ** 2 +
            (local.z / (radiusZ + reach)) ** 2,
        ).toBeGreaterThan(1);
      }
    }
    for (const path of EARTH_PATHS) {
      const line: GroundVector[] = traceEarthPath(path);
      for (const spot of SPOTS) {
        expect(measureFromLine(spot, line)).toBeGreaterThan(
          path.width / 2 + measureReach(spot),
        );
      }
    }
  });

  it('keeps off the patches of clover and lies over none of its own', () => {
    for (const spot of SPOTS) {
      for (const patch of CLOVER_PATCHES) {
        expect(
          Math.hypot(patch.x - spot.x, patch.z - spot.z),
        ).toBeGreaterThan(measureReach(spot) + CLOVER_REACH);
      }
      for (const other of SPOTS) {
        if (other !== spot) {
          expect(
            Math.hypot(other.x - spot.x, other.z - spot.z),
          ).toBeGreaterThan(measureReach(spot) + measureReach(other));
        }
      }
    }
  });

  it('stands on the ground as high as the patch of clover', () => {
    const patch: Group = makePatch();
    const cover: Group = createCloverCover(patch);
    cover.updateMatrixWorld(true);
    const bounds: Box3 = new Box3().setFromObject(cover);
    expect(bounds.min.y).toBeCloseTo(0.02);
    expect(bounds.max.y).toBeCloseTo(0.14);
  });

  it('is drawn all at once, without shadows, from the patch', () => {
    const patch: Group = makePatch();
    const cover: Group = createCloverCover(patch);
    expect(cover.children).toHaveLength(1);
    for (const part of cover.children) {
      const count: number | null =
        part instanceof InstancedMesh ? part.count : null;
      expect(count).toBe(SPOTS.length);
      expect(part.castShadow).toBe(false);
    }
    expect(new Box3().setFromObject(patch).max.y).toBeCloseTo(0.14);
  });
});

describe('the clover cover of the village', () => {
  it('is scattered once the patch of clover is among the models', () => {
    const village = createVillageScene();
    village.populate([
      { file: MODEL_FILES.clover, root: makePatch(), clips: [] },
    ]);
    expect(village.scene.getObjectByName('clover-cover')).toBeDefined();
  });

  it('is not scattered without the patch of clover', () => {
    const village = createVillageScene();
    village.populate([]);
    expect(village.scene.getObjectByName('clover-cover')).toBeUndefined();
  });
});
