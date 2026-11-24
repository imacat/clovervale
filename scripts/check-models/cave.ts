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
 * @module scripts/check-models/cave Checks that the model of the cave stands
 *   where the cave stands in the way of the players, that its torches burn
 *   where the cave lights them from, and that the items lying on its floor
 *   rise above it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Box3, Raycaster, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  CAVE_CONTAINERS,
  CAVE_CONTAINER_MODELS,
  CAVE_FIXTURE_FOOTPRINTS,
  CAVE_FLAME_AHEAD,
  CAVE_FLAME_HEIGHT,
  CAVE_MODEL_CENTER,
  CAVE_PASSAGE,
  CAVE_PASSAGE_HALF_WIDTH,
  CAVE_PLACEMENTS,
  CAVE_ROPE,
  CAVE_TERRAIN,
  PLAYER_RADIUS,
  Terrain,
  placePoint,
  placeShape,
} from '@clovervale/shared';
import type {
  Boundary,
  CaveContainer,
  GroundVector,
  ModelId,
  Placement,
  Shape,
} from '@clovervale/shared';
import { MODEL_FILES } from '../../packages/client/src/model-catalog.ts';

import { modelsDir } from './constants.ts';
import type { StrikeResult } from './constants.ts';
import { LYING_ITEM_PATTERN } from './files.ts';
import { listMaterialVertices, loadAt, loader } from './pose.ts';

/** What looking straight down on the cave finds. */
interface CaveGround {
  /** How many points of floor there are. */
  readonly floorCount: number;
  /** How many points of rock there are. */
  readonly rockCount: number;
  /** The highest the floor stands where a player can walk, in meters. */
  readonly floorTop: number;
}

/**
 * The least height the rock and the stonework of the cave stand, where they
 * stand in the way, in meters: above the head of a player.
 */
const CAVE_WALL_HEIGHT = 2;
/**
 * The highest anything on the floor of the cave may stand where a player
 * can walk, in meters: no more than a flat stone.
 */
const CAVE_FLOOR_HEIGHT = 0.05;
/**
 * How far into what stands in the way of the players in the cave a point
 * must lie for the model to have to stand there, in meters.
 */
const CAVE_INSIDE = 0.05;
/**
 * Half the length and half the width of the ground the model of the cave
 * covers, around the middle it stands on, in meters.
 */
const CAVE_HALF_SIZE: readonly [number, number] = [13, 6.5];
/** The distance between two points the floor of the cave is checked at. */
const CAVE_SAMPLE_SPACING = 0.2;
/**
 * The least share of how far up the slope from the burrow a point lies
 * that the slope must rise to there: a slope of 42 degrees at least.
 */
const CAVE_SLOPE_RISE = 0.9;
/** The farthest the flame of a torch may be from where it is to burn. */
const FLAME_TOLERANCE = 0.03;
/** The most points the check of the ground of the cave reports. */
const GROUND_REPORT_LIMIT = 5;
/** The file name of the model of the rock, the floor and the stonework. */
const CAVE_FILE: string = MODEL_FILES.cave;
/** The file name of the model of a torch on a wall. */
const CAVE_TORCH_FILE: string = MODEL_FILES['cave-torch'];

/**
 * Finds the first place the cave has for a model.
 *
 * @param {ModelId} model - The identifier of the model.
 * @returns {Placement} Where the model stands.
 * @throws {Error} If the cave has no place for the model.
 */
export function findCavePlacement(model: ModelId): Placement {
  const placement: Placement | undefined = CAVE_PLACEMENTS.find(
    (candidate: Placement) => candidate.model === model,
  );
  if (placement === undefined) {
    throw new Error(`The cave has no place for ${model}.`);
  }
  return placement;
}

/**
 * Makes the ground the model of the cave takes up, without what stands in
 * it.
 *
 * @returns {Terrain} The ground of the rock and the stonework.
 */
function makeRock(): Terrain {
  const fixtures: ReadonlySet<string> = new Set(
    [
      ...CAVE_PLACEMENTS,
      ...CAVE_CONTAINERS.map(
        (container: CaveContainer): Placement => ({
          ...container,
          model: CAVE_CONTAINER_MODELS[container.kind].closed,
        }),
      ),
    ].flatMap((placement: Placement) =>
      (CAVE_FIXTURE_FOOTPRINTS[placement.model] ?? []).map((shape: Shape) =>
        JSON.stringify(placeShape(placement, shape)),
      ),
    ),
  );
  return new Terrain(
    CAVE_TERRAIN.shapes.filter(
      (shape: Shape) => !fixtures.has(JSON.stringify(shape)),
    ),
    CAVE_TERRAIN.boundary,
  );
}

/** What a point the cave is looked down on at turns out to be. */
interface CaveSpot {
  /** Whether the model stands there as the rock or the stonework. */
  readonly isRock: boolean;
  /** The requirement not met there, or null if every one is met. */
  readonly problem: string | null;
}

/**
 * Lists the points the ground of the cave is checked at: a grid with
 * {@link CAVE_SAMPLE_SPACING} between its points across the square around
 * a boundary, from west to east, and from north to south on each line.
 *
 * @param {Boundary} boundary - The boundary of the ground of the cave.
 * @returns {GroundVector[]} The points, in that order.
 */
function listCaveSamples(boundary: Boundary): GroundVector[] {
  const points: GroundVector[] = [];
  for (
    let x = boundary.x - boundary.radius;
    x <= boundary.x + boundary.radius;
    x += CAVE_SAMPLE_SPACING
  ) {
    for (
      let z = -boundary.radius;
      z <= boundary.radius;
      z += CAVE_SAMPLE_SPACING
    ) {
      points.push({ x, z });
    }
  }
  return points;
}

/**
 * Finds the top of a model straight above a point, looking down from 20
 * meters high.
 *
 * @param {Raycaster} raycaster - The ray caster to look down with.
 * @param {GLTF} model - The model to look down on.
 * @param {GroundVector} point - The point on the ground.
 * @returns {number | null} The height of its top there, in meters, or null
 *   if the model has nothing there.
 */
function findTopAt(
  raycaster: Raycaster,
  model: GLTF,
  point: GroundVector,
): number | null {
  raycaster.set(new Vector3(point.x, 20, point.z), new Vector3(0, -1, 0));
  const [hit] = raycaster.intersectObject(model.scene, true);
  return hit === undefined ? null : hit.point.y;
}

/**
 * Checks a point of the cave where a player cannot stand: that, well
 * inside what stands in the way and away from the rope, the model stands
 * there if the ground it covers takes the point in, and stands taller than
 * a player, or on the slope from the burrow rises steeply enough.
 *
 * @param {Terrain} rock - The ground of the rock and the stonework.
 * @param {GroundVector} point - The point on the ground.
 * @param {number | null} top - The height of the top of the model there,
 *   in meters, or null if it has nothing there.
 * @returns {CaveSpot} What the point turns out to be.
 */
function checkRockSpot(
  rock: Terrain,
  point: GroundVector,
  top: number | null,
): CaveSpot {
  const { x, z } = point;
  const isInside = !rock.isClear(point, -PLAYER_RADIUS - CAVE_INSIDE);
  const isRope: boolean =
    Math.hypot(x - CAVE_ROPE.x, z - CAVE_ROPE.z) <= PLAYER_RADIUS;
  if (!isInside || isRope) {
    return { isRock: false, problem: null };
  }
  if (top === null) {
    // Beyond the ground the model covers, nobody ever comes near.
    const [halfLength, halfWidth] = CAVE_HALF_SIZE;
    const isCovered: boolean =
      Math.abs(x - CAVE_MODEL_CENTER.x) < halfLength &&
      Math.abs(z - CAVE_MODEL_CENTER.z) < halfWidth;
    return {
      isRock: false,
      problem: isCovered ? `${CAVE_FILE} has nothing` : null,
    };
  }
  const along: number = x - CAVE_PASSAGE.east;
  const isSlope: boolean =
    along > 0 && Math.abs(z) < CAVE_PASSAGE_HALF_WIDTH - CAVE_INSIDE;
  if (isSlope) {
    const isLow: boolean = top < Math.min(along, 3) * CAVE_SLOPE_RISE;
    return {
      isRock: true,
      problem: isLow ? `the slope of ${CAVE_FILE} is too low` : null,
    };
  }
  return {
    isRock: true,
    problem:
      top < CAVE_WALL_HEIGHT ? `the rock of ${CAVE_FILE} is too low` : null,
  };
}

/**
 * Checks, looking straight down on the cave standing in its place, that
 * where a player could stand but for what stands in the side chambers, the
 * floor is seen, and nothing above it but a flat stone; that where the
 * rock or the stonework stands in the way, it stands taller than a player;
 * and that the slope from the burrow rises steeply from its foot.  Reports
 * no more than {@link GROUND_REPORT_LIMIT} points.
 *
 * @param {GLTF} cave - The model of the cave, standing in its place.
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {CaveGround} What looking down on it finds.
 */
function checkCaveGround(cave: GLTF, failures: string[]): CaveGround {
  const rock: Terrain = makeRock();
  const raycaster = new Raycaster();
  const start: number = failures.length;
  let floorCount = 0;
  let floorTop = 0;
  let rockCount = 0;
  const report = (what: string, { x, z }: GroundVector): void => {
    if (failures.length - start < GROUND_REPORT_LIMIT) {
      failures.push(`${what} at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  };
  for (const point of listCaveSamples(rock.boundary)) {
    const top: number | null = findTopAt(raycaster, cave, point);
    if (rock.isClear(point)) {
      floorCount++;
      if (top === null || top > CAVE_FLOOR_HEIGHT) {
        report(`${CAVE_FILE} has no bare floor`, point);
      } else {
        floorTop = Math.max(floorTop, top);
      }
      continue;
    }
    const spot: CaveSpot = checkRockSpot(rock, point, top);
    if (spot.isRock) {
      rockCount++;
    }
    if (spot.problem !== null) {
      report(spot.problem, point);
    }
  }
  return { floorCount, rockCount, floorTop };
}

/**
 * Checks that the flame of a torch in its first place burns where the cave
 * has the light of that torch.
 *
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {Promise<void>} A promise settled once checked.
 */
async function checkTorch(failures: string[]): Promise<void> {
  const placement: Placement = findCavePlacement('cave-torch');
  const torch: GLTF = await loadAt(placement);
  const flame: Vector3[] = listMaterialVertices(torch.scene, 'flame');
  const middle = new Vector3();
  for (const point of flame) {
    middle.add(point);
  }
  middle.divideScalar(flame.length);
  const ahead: GroundVector = placePoint(placement, {
    x: 0,
    z: CAVE_FLAME_AHEAD,
  });
  if (
    flame.length === 0 ||
    Math.hypot(middle.x - ahead.x, middle.z - ahead.z) > FLAME_TOLERANCE ||
    Math.abs(middle.y - CAVE_FLAME_HEIGHT) > 0.1
  ) {
    failures.push(
      `the flame of ${CAVE_TORCH_FILE} does not burn where the cave lights it`,
    );
  }
}

/**
 * Checks that every item lying on the ground rises above the floor of the
 * cave, flat stones and all, so that the floor does not hide it.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @param {number} floorTop - The highest the floor stands, in meters.
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {Promise<void>} A promise settled once checked.
 */
async function checkLyingItems(
  files: readonly string[],
  floorTop: number,
  failures: string[],
): Promise<void> {
  const items: (readonly [string, GLTF])[] = await Promise.all(
    files
      .filter((name: string) => LYING_ITEM_PATTERN.test(name))
      .map(async (file: string) => {
        const glb: Buffer = readFileSync(path.join(modelsDir, file));
        const item: GLTF = await loader.parseAsync(
          new Uint8Array(glb).buffer,
          '',
        );
        return [file, item] as const;
      }),
  );
  for (const [file, item] of items) {
    const height: number = new Box3().setFromObject(item.scene).max.y;
    if (height <= floorTop) {
      failures.push(
        `${file} rises ${height.toFixed(3)} m, hidden under the floor of ` +
          `${CAVE_FILE}, ${floorTop.toFixed(3)} m high`,
      );
    }
  }
}

/**
 * Checks that the model of the cave stands where the cave stands in the
 * way of the players, and nowhere else, and that the torches burn where
 * the cave lights them from.
 *
 * Looking straight down on the cave standing in its place: where a player
 * could stand but for what stands in the side chambers, the floor is seen,
 * and nothing above it but a flat stone; where the rock or the stonework
 * stands in the way, it stands taller than a player; and the slope from
 * the burrow, which stands in the way at the east end of the passage,
 * rises steeply from its foot.  The flame of a torch in its first place
 * burns where the cave has the light of that torch.  Every item lying on
 * the ground rises above the floor, flat stones and all, so that the floor
 * does not hide it.
 *
 * @param {readonly string[]} files - The file names of the models there
 *   are.
 * @returns {Promise<StrikeResult>} The outcome.
 */
export async function checkCave(
  files: readonly string[],
): Promise<StrikeResult> {
  const cave: GLTF = await loadAt(findCavePlacement('cave'));
  const failures: string[] = [];
  const { floorCount, rockCount, floorTop } = checkCaveGround(
    cave,
    failures,
  );
  await checkTorch(failures);
  await checkLyingItems(files, floorTop, failures);
  const summary =
    `${CAVE_FILE} stands where the cave stands in the way ` +
    `(${String(floorCount)} points of floor, ${String(rockCount)} of rock), ` +
    `the items lying on it rise above it, ` +
    `and ${CAVE_TORCH_FILE} burns where it is lit`;
  return { summary, failures };
}
