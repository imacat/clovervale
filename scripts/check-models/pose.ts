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
 * @module scripts/check-models/pose Loads the models the way the client
 *   does, stands and poses them, and reads where their vertices are.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AnimationMixer, LoopOnce, Mesh, SkinnedMesh, Vector3 } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import type { Placement } from '@clovervale/shared';

import { MODEL_FILES } from '../../packages/client/src/model-catalog.ts';
import { getItem } from '../models/items.ts';
import { modelsDir } from './constants.ts';

/** The vertices of a posed model, in world space. */
export interface WorldVertices {
  /** The positions of the vertices. */
  readonly positions: Vector3[];
  /** The index of the bone each vertex follows, or -1 for none. */
  readonly bones: number[];
}

/** The loader of the models, as the client loads them. */
export const loader = new GLTFLoader();

/**
 * Poses a loaded model at a time of one of its clips.
 *
 * @param {GLTF} model - The loaded model.
 * @param {AnimationClip} clip - The clip.
 * @param {number} time - The time in seconds.
 * @returns {AnimationMixer} The mixer that holds the pose.
 */
export function poseModel(
  model: GLTF,
  clip: AnimationClip,
  time: number,
): AnimationMixer {
  const mixer = new AnimationMixer(model.scene);
  const action: AnimationAction = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(Math.min(time, clip.duration));
  model.scene.updateMatrixWorld(true);
  return mixer;
}

/**
 * Restores the rest pose of a model.
 *
 * @param {GLTF} model - The loaded model.
 * @param {AnimationMixer} mixer - The mixer that holds its pose.
 */
export function resetModel(model: GLTF, mixer: AnimationMixer): void {
  mixer.stopAllAction();
  mixer.uncacheRoot(model.scene);
  model.scene.traverse((node: Object3D) => {
    if (node instanceof SkinnedMesh) {
      node.skeleton.pose();
    }
  });
  model.scene.updateMatrixWorld(true);
}

/**
 * Tells whether a node of a loaded model is a mesh.
 *
 * @param {Object3D} node - The node.
 * @returns {boolean} Whether the node is a mesh.
 */
export function isMesh(node: Object3D): node is Mesh {
  return node instanceof Mesh;
}

/**
 * Lists the vertices of every mesh of a posed model, in world space.
 *
 * @param {Object3D} root - The model.
 * @returns {WorldVertices} The positions and, for skinned vertices, the
 *   index of the bone each one follows.
 */
export function listWorldVertices(root: Object3D): WorldVertices {
  const positions: Vector3[] = [];
  const bones: number[] = [];
  root.traverse((node: Object3D) => {
    if (!isMesh(node)) {
      return;
    }
    const skinned: boolean = node.geometry.hasAttribute('skinIndex');
    const count: number = node.geometry.getAttribute('position').count;
    for (let i = 0; i < count; i++) {
      const vertex: Vector3 = node.getVertexPosition(i, new Vector3());
      positions.push(vertex.applyMatrix4(node.matrixWorld));
      bones.push(
        skinned ? node.geometry.getAttribute('skinIndex').getX(i) : -1,
      );
    }
  });
  return { positions, bones };
}

/**
 * Lists where every node of a posed model is.
 *
 * @param {Object3D} root - The model.
 * @returns {number[]} The world matrices of the nodes, flat.
 */
export function listNodeMatrices(root: Object3D): number[] {
  const values: number[] = [];
  root.traverse((node: Object3D) => {
    values.push(...node.matrixWorld.elements);
  });
  return values;
}

/**
 * Measures how far apart two poses are.
 *
 * @param {readonly number[]} a - The node matrices of one pose.
 * @param {readonly number[]} b - The node matrices of the other pose.
 * @returns {number} The greatest difference between two matrix elements.
 */
export function measureDifference(
  a: readonly number[],
  b: readonly number[],
): number {
  let difference = 0;
  a.forEach((value: number, index: number) => {
    difference = Math.max(difference, Math.abs(value - getItem(b, index)));
  });
  return difference;
}

/**
 * Lists the vertices in a material of a posed model, in world space.
 *
 * @param {Object3D} root - The model.
 * @param {string} material - The name of the material.
 * @returns {Vector3[]} The positions of the vertices.
 */
export function listMaterialVertices(
  root: Object3D,
  material: string,
): Vector3[] {
  const positions: Vector3[] = [];
  root.traverse((node: Object3D) => {
    if (
      isMesh(node) &&
      !Array.isArray(node.material) &&
      node.material.name === material
    ) {
      positions.push(...listWorldVertices(node).positions);
    }
  });
  return positions;
}

/**
 * Loads a model the way the client does, and stands it in a place.
 *
 * @param {Placement} placement - The model, and where it stands.
 * @returns {Promise<GLTF>} The model, standing there.
 */
export async function loadAt(placement: Placement): Promise<GLTF> {
  const file: string = MODEL_FILES[placement.model];
  const glb: Buffer = readFileSync(path.join(modelsDir, file));
  const model: GLTF = await loader.parseAsync(new Uint8Array(glb).buffer, '');
  model.scene.position.set(placement.x, 0, placement.z);
  model.scene.rotation.y = (placement.yaw * Math.PI) / 180;
  model.scene.updateMatrixWorld(true);
  return model;
}
