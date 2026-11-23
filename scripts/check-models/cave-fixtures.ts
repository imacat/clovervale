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
 * @module scripts/check-models/cave-fixtures Checks what stands in the side
 *   chambers of the cave, and the prisoner holding the bars of his cell.
 */

import { Box3, Vector3 } from 'three';
import type { AnimationClip, AnimationMixer, Mesh, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import {
  CAVE_CELLS,
  CAVE_CONTAINERS,
  CAVE_CONTAINER_MODELS,
  CAVE_FIXTURE_FOOTPRINTS,
  CAVE_PLACEMENTS,
  placePoint,
  placeShape,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GroundVector,
  ModelId,
  Placement,
  Shape,
} from '@clovervale/shared';
import { MODEL_FILES } from '../../packages/client/src/model-catalog.ts';

import { findCavePlacement } from './cave.ts';
import { FOOTPRINT_TOLERANCE } from './constants.ts';
import type { StrikeResult } from './constants.ts';
import {
  isMesh,
  listMaterialVertices,
  listWorldVertices,
  loadAt,
  poseModel,
  resetModel,
} from './pose.ts';

/** How closely the prisoner keeps to the bars of his cell. */
interface Grip {
  /** The farthest a fist is from the axis of a bar, in meters. */
  readonly loosest: number;
  /**
   * The least room between the axis of a bar and the rest of him, in
   * meters.
   */
  readonly closest: number;
}

/** The material of the hands of the prisoner, which hold the bars. */
const HAND_MATERIAL = 'hand';
/** The material of the bars of a cell. */
const BAR_MATERIAL = 'iron';
/**
 * The farthest the middle of a fist of the prisoner may be from the bar it
 * holds, along the ground, in meters.
 */
const GRIP_TOLERANCE = 0.03;
/** How many times in his idle clip the prisoner is looked at. */
const EDWIN_SAMPLES = 48;
/**
 * The least room between the axis of a bar of a cell and anything of the
 * prisoner but his fists, along the ground, in meters: the radius of a bar.
 */
const BAR_CLEARANCE = 0.036;
/** The file name of the model of the prisoner in the north cell. */
const EDWIN_FILE: string = MODEL_FILES.edwin;

/**
 * Finds the extent of the ground some shapes take up, along X and Z.
 *
 * @param {readonly Shape[]} shapes - The shapes, in the world.
 * @returns {[number, number, number, number]} The least and the greatest X,
 *   and the least and the greatest Z.
 */
function measureShapes(
  shapes: readonly Shape[],
): [number, number, number, number] {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const shape of shapes) {
    const corners: GroundVector[] =
      shape.shape === 'circle'
        ? [
            { x: shape.x - shape.radius, z: shape.z - shape.radius },
            { x: shape.x + shape.radius, z: shape.z + shape.radius },
          ]
        : [-1, 1].flatMap((u: number) =>
            [-1, 1].map((v: number) =>
              placePoint(shape, {
                x: u * shape.halfWidth,
                z: v * shape.halfDepth,
              }),
            ),
          );
    for (const { x, z } of corners) {
      [minX, maxX] = [Math.min(minX, x), Math.max(maxX, x)];
      [minZ, maxZ] = [Math.min(minZ, z), Math.max(maxZ, z)];
    }
  }
  return [minX, maxX, minZ, maxZ];
}

/**
 * Finds the axes of the bars of a cell, along X, as its model stands.
 *
 * @param {Object3D} root - The model of the bars, standing in its place.
 * @returns {number[]} Where the axis of each bar stands along X, in order.
 */
function findBarAxes(root: Object3D): number[] {
  const xs: number[] = listMaterialVertices(root, BAR_MATERIAL)
    .map((p: Vector3) => p.x)
    .sort((a: number, b: number) => a - b);
  const axes: number[] = [];
  let first: number | undefined = xs[0];
  xs.forEach((x: number, index: number) => {
    const next: number | undefined = xs[index + 1];
    if (next === undefined || next - x > 0.05) {
      axes.push(((first ?? x) + x) / 2);
      first = next;
    }
  });
  return axes;
}

/**
 * Checks that each of the bars, the bones and the containers, shut and
 * open, standing in its place, reaches out to the edges of the ground it
 * takes up, and no farther; that the bars of each cell run across its
 * whole opening; and that the bones lean on the back wall of the south
 * cell.
 *
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {Promise<number>} How many models are checked.
 */
async function checkFixtureGround(failures: string[]): Promise<number> {
  // Each model in its place, and the model whose ground it takes up: a
  // container takes up the same ground open as shut.
  const placements: (readonly [Placement, ModelId])[] = [
    ...CAVE_PLACEMENTS.filter(
      ({ model }: Placement) =>
        model === 'cave-bars' || model === 'cave-skeleton',
    ).map((placement: Placement) => [placement, placement.model] as const),
    ...CAVE_CONTAINERS.flatMap(
      (container: CaveContainer): (readonly [Placement, ModelId])[] => {
        const { closed, open } = CAVE_CONTAINER_MODELS[container.kind];
        return [
          [{ ...container, model: closed }, closed],
          [{ ...container, model: open }, closed],
        ];
      },
    ),
  ];
  for (const [placement, groundModel] of placements) {
    const model: GLTF = await loadAt(placement);
    const box: Box3 = new Box3().setFromObject(model.scene, true);
    const shapes: Shape[] = (CAVE_FIXTURE_FOOTPRINTS[groundModel] ?? []).map(
      (shape: Shape) => placeShape(placement, shape),
    );
    const where =
      `${MODEL_FILES[placement.model]} at (${placement.x.toFixed(2)}, ` +
      `${placement.z.toFixed(2)})`;
    if (shapes.length > 0) {
      const [minX, maxX, minZ, maxZ] = measureShapes(shapes);
      const gaps: number[] = [
        box.min.x - minX,
        maxX - box.max.x,
        box.min.z - minZ,
        maxZ - box.max.z,
      ];
      if (gaps.some((gap: number) => Math.abs(gap) > FOOTPRINT_TOLERANCE)) {
        failures.push(`${where} does not take up the ground it stands on`);
      }
    }
    if (placement.model === 'cave-bars') {
      const cell = CAVE_CELLS[placement.z < 0 ? 0 : 1];
      if (
        Math.abs(box.min.x - cell.west) > FOOTPRINT_TOLERANCE ||
        Math.abs(box.max.x - cell.east) > FOOTPRINT_TOLERANCE
      ) {
        failures.push(`${where} does not close off the whole cell`);
      }
    }
    if (placement.model === 'cave-skeleton') {
      const wall: number = CAVE_CELLS[1].south;
      if (box.max.z > wall || box.max.z < wall - FOOTPRINT_TOLERANCE) {
        failures.push(`${where} does not lean on the back wall of its cell`);
      }
    }
  }
  return placements.length;
}

/**
 * Checks that through his idle clip, both fists of the prisoner close
 * around a bar of his cell, and nothing else of him passes into a bar or
 * through the bars into the passage.
 *
 * @param {string[]} failures - The requirements not met, to add to.
 * @returns {Promise<Grip>} How closely he keeps to the bars.
 * @throws {Error} If the cave has no place for him or for the bars of his
 *   cell.
 */
async function checkEdwinGrip(failures: string[]): Promise<Grip> {
  const edwinPlacement: Placement = findCavePlacement('edwin');
  const barsPlacement: Placement | undefined = CAVE_PLACEMENTS.find(
    ({ model, z }: Placement) => model === 'cave-bars' && z < 0,
  );
  if (barsPlacement === undefined) {
    throw new Error('The cave has no place for cave-bars.');
  }
  let closest = Infinity;
  let loosest = 0;
  const edwin: GLTF = await loadAt(edwinPlacement);
  const bars: GLTF = await loadAt(barsPlacement);
  const axes: number[] = findBarAxes(bars.scene);
  const barTop: number = new Box3().setFromObject(bars.scene).max.y;
  const barZ: number = barsPlacement.z;
  const findBarDistance = (p: Vector3): number =>
    Math.min(...axes.map((x: number) => Math.hypot(p.x - x, p.z - barZ)));
  const clip: AnimationClip | undefined = edwin.animations.find(
    (candidate: AnimationClip) => candidate.name === 'Idle',
  );
  if (clip === undefined) {
    failures.push(`${EDWIN_FILE} does not idle`);
    return { loosest, closest };
  }
  let isHeld = true;
  let isClear = true;
  for (let k = 0; k <= EDWIN_SAMPLES; k++) {
    const mixer: AnimationMixer = poseModel(
      edwin,
      clip,
      (clip.duration * k) / EDWIN_SAMPLES,
    );
    const hands: Vector3[] = listMaterialVertices(edwin.scene, HAND_MATERIAL);
    for (const side of [-1, 1]) {
      const fist: Vector3[] = hands.filter(
        (p: Vector3) => Math.sign(p.x - edwinPlacement.x) === side,
      );
      const middle = new Vector3();
      for (const p of fist) {
        middle.add(p);
      }
      middle.divideScalar(fist.length);
      const grip: number =
        fist.length === 0 ? Infinity : findBarDistance(middle);
      loosest = Math.max(loosest, grip);
      if (grip > GRIP_TOLERANCE) {
        isHeld = false;
      }
    }
    const rest: Mesh[] = [];
    edwin.scene.traverse((node: Object3D) => {
      if (
        isMesh(node) &&
        !Array.isArray(node.material) &&
        node.material.name !== HAND_MATERIAL
      ) {
        rest.push(node);
      }
    });
    for (const p of rest.flatMap(
      (node: Mesh) => listWorldVertices(node).positions,
    )) {
      const distance: number = findBarDistance(p);
      closest = Math.min(closest, distance);
      if (p.z > barZ || (p.y < barTop && distance < BAR_CLEARANCE)) {
        isClear = false;
      }
    }
    resetModel(edwin, mixer);
  }
  if (!isHeld) {
    failures.push(`the fists of ${EDWIN_FILE} do not hold the bars`);
  }
  if (!isClear) {
    failures.push(`${EDWIN_FILE} passes into the bars of his cell`);
  }
  return { loosest, closest };
}

/**
 * Checks that what stands in the side chambers of the cave stands where the
 * cave has it, and takes up the ground the cave has it take up.
 *
 * Each of the bars, the bones and the containers, shut and open, standing
 * in its place, reaches out to the edges of the ground it takes up, and no
 * farther; the bars of each cell run across its whole opening; and the
 * bones lean on the back wall of the south cell.
 * Through his idle clip, both fists of the prisoner close around a bar of
 * his cell, and nothing else of him passes into a bar or through the bars
 * into the passage.
 *
 * @returns {Promise<StrikeResult>} The outcome.
 */
export async function checkCaveFixtures(): Promise<StrikeResult> {
  const failures: string[] = [];
  const count: number = await checkFixtureGround(failures);
  const { loosest, closest } = await checkEdwinGrip(failures);
  const summary =
    `what stands in the side chambers of the cave takes up its ground ` +
    `(${String(count)} models), and ${EDWIN_FILE} holds ` +
    `the bars, his fists ${(loosest * 1000).toFixed(0)} mm from their ` +
    `axes at the most, and the rest of him ${(closest * 1000).toFixed(0)} ` +
    `mm at the least`;
  return { summary, failures };
}
