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
 * @module scripts/check-models/measure Measures a model at rest and through
 *   each of its clips.
 */

import { Box3, SkinnedMesh, Vector3 } from 'three';
import type { AnimationClip, AnimationMixer, Object3D } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { TOBY_RUN_SPEED } from '@clovervale/shared';

import { getItem } from '../models/items.ts';
import { SAMPLE_RATE } from './constants.ts';
import {
  isMesh,
  listNodeMatrices,
  listWorldVertices,
  loader,
  measureDifference,
  poseModel,
  resetModel,
} from './pose.ts';

/** What a clip does to a model. */
export interface ClipMeasurements {
  /** The length of the clip, in seconds. */
  readonly duration: number;
  /** The lowest point the model reaches. */
  readonly lowest: number;
  /** How far apart the first and the last poses are. */
  readonly seam: number;
  /** The node matrices of the first pose. */
  readonly start: readonly number[];
  /** The node matrices of the last pose. */
  readonly end: readonly number[];
  /** How far along X and Z the hips end from where they start. */
  readonly hipsDrift: readonly [number, number];
  /** The mean speed along Z of each foot while on the ground, by bone name. */
  readonly footSpeeds: ReadonlyMap<string, number>;
  /**
   * The lowest point the hands reach, and how far in front of the feet the
   * hands are then, in metres, if the model has hands.
   */
  readonly handReach: readonly [low: number, ahead: number] | null;
}

/** What a model measures when loaded and animated. */
export interface ModelMeasurements {
  /** The number of triangles. */
  readonly triangles: number;
  /** The bounds of the rest pose. */
  readonly rest: Box3;
  /** The bounds of the feet in the rest pose, if the model has feet. */
  readonly feet: Box3 | null;
  /** The middle of the vertices in each material, by material name. */
  readonly centroids: ReadonlyMap<string, Vector3>;
  /** The measurements of the clips, by clip name. */
  readonly clips: ReadonlyMap<string, ClipMeasurements>;
}

/**
 * The speed each clip in which the feet tread the ground stands for, in
 * metres per second, by the length of the clip in seconds: a `Walk` cycle
 * stands for 1.5 m, and a `Run` of Toby for his speed.
 */
export const TREADING_SPEEDS: Readonly<
  Record<string, (duration: number) => number>
> = {
  /**
   * Finds the speed a `Walk` cycle stands for.
   *
   * @param {number} duration - The length of the cycle, in seconds.
   * @returns {number} The speed, in metres per second.
   */
  Walk: (duration: number) => 1.5 / duration,
  /**
   * Finds the speed a `Run` of Toby stands for.
   *
   * @returns {number} The speed, in metres per second.
   */
  Run: () => TOBY_RUN_SPEED,
};
/** The greatest height of a point that touches the ground, in metres. */
const CONTACT_HEIGHT = 0.004;

/**
 * Measures what a clip does to a model.
 *
 * @param {GLTF} model - The loaded model.
 * @param {AnimationClip} clip - The clip.
 * @param {readonly string[]} boneNames - The names of the bones.
 * @returns {ClipMeasurements} The measurements.
 */
function measureClip(
  model: GLTF,
  clip: AnimationClip,
  boneNames: readonly string[],
): ClipMeasurements {
  const root: Object3D = model.scene;
  const hips: Object3D | undefined = root.getObjectByName('Hips');
  const steps: number = Math.round(clip.duration * SAMPLE_RATE);
  const interval: number = clip.duration / steps;
  const speeds = new Map<string, number[]>();
  const hipsPath: Vector3[] = [];
  let lowest = Infinity;
  let handReach: [number, number] | null = null;
  let previous: Vector3[] | null = null;
  let start: number[] = [];
  let end: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const mixer: AnimationMixer = poseModel(
      model,
      clip,
      (clip.duration * k) / steps,
    );
    const { positions, bones } = listWorldVertices(root);
    for (const position of positions) {
      lowest = Math.min(lowest, position.y);
    }
    if (hips !== undefined) {
      hipsPath.push(new Vector3().setFromMatrixPosition(hips.matrixWorld));
    }
    if (k === 0) {
      start = listNodeMatrices(root);
    }
    if (k === steps) {
      end = listNodeMatrices(root);
    }
    positions.forEach((position: Vector3, i: number) => {
      const isHand: boolean =
        boneNames[getItem(bones, i)]?.startsWith('Hand') === true;
      if (isHand && (handReach === null || position.y < handReach[0])) {
        handReach = [position.y, position.z];
      }
    });
    if (clip.name in TREADING_SPEEDS) {
      boneNames.forEach((name: string, bone: number) => {
        if (!name.startsWith('Foot')) {
          return;
        }
        let sole = -1;
        positions.forEach((position: Vector3, i: number) => {
          if (
            getItem(bones, i) === bone &&
            (sole < 0 || position.y < getItem(positions, sole).y)
          ) {
            sole = i;
          }
        });
        if (sole < 0) {
          return;
        }
        const footSpeeds: number[] = speeds.get(name) ?? [];
        speeds.set(name, footSpeeds);
        if (
          previous !== null &&
          getItem(positions, sole).y < CONTACT_HEIGHT &&
          getItem(previous, sole).y < CONTACT_HEIGHT
        ) {
          footSpeeds.push(
            (getItem(positions, sole).z - getItem(previous, sole).z) /
              interval,
          );
        }
      });
      previous = positions;
    }
    resetModel(model, mixer);
  }
  const first: Vector3 = hipsPath[0] ?? new Vector3();
  const last: Vector3 = hipsPath[steps] ?? new Vector3();
  const footSpeeds = new Map<string, number>();
  for (const [name, values] of speeds) {
    const sum: number = values.reduce((a: number, b: number) => a + b, 0);
    footSpeeds.set(name, sum / values.length);
  }
  return {
    duration: clip.duration,
    lowest,
    seam: measureDifference(start, end),
    start,
    end,
    hipsDrift: [last.x - first.x, last.z - first.z],
    footSpeeds,
    handReach,
  };
}

/**
 * Loads a model the way the client does, and measures it.
 *
 * @param {Buffer} glb - The file.
 * @returns {Promise<ModelMeasurements>} The measurements.
 */
export async function measureModel(glb: Buffer): Promise<ModelMeasurements> {
  const model: GLTF = await loader.parseAsync(new Uint8Array(glb).buffer, '');
  const root: Object3D = model.scene;
  let triangles = 0;
  let boneNames: string[] = [];
  root.traverse((node: Object3D) => {
    if (isMesh(node)) {
      const count: number =
        node.geometry.index?.count ??
        node.geometry.getAttribute('position').count;
      triangles += count / 3;
    }
    if (node instanceof SkinnedMesh) {
      boneNames = node.skeleton.bones.map((bone: Object3D) => bone.name);
    }
  });
  root.updateMatrixWorld(true);
  const rest: Box3 = new Box3().setFromPoints(
    listWorldVertices(root).positions,
  );
  const centroids = new Map<string, Vector3>();
  const feet: Vector3[] = [];
  root.traverse((node: Object3D) => {
    if (!isMesh(node) || Array.isArray(node.material)) {
      return;
    }
    const sum = new Vector3();
    const { positions, bones } = listWorldVertices(node);
    positions.forEach((position: Vector3, i: number) => {
      sum.add(position);
      if (boneNames[getItem(bones, i)]?.startsWith('Foot') === true) {
        feet.push(position);
      }
    });
    centroids.set(node.material.name, sum.divideScalar(positions.length));
  });
  const clips = new Map<string, ClipMeasurements>();
  for (const clip of model.animations) {
    clips.set(clip.name, measureClip(model, clip, boneNames));
  }
  return {
    triangles,
    rest,
    feet: feet.length > 0 ? new Box3().setFromPoints(feet) : null,
    centroids,
    clips,
  };
}
