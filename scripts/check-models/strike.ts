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
 * @module scripts/check-models/strike Checks that the hammer of the smith
 *   meets the hot iron on the anvil.
 */

import { Vector3 } from 'three';
import type { AnimationClip, AnimationMixer } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

import { findPlacement } from '@clovervale/shared';

import { getItem } from '../models/items.ts';
import { SAMPLE_RATE, TOLERANCE } from './constants.ts';
import type { StrikeResult } from './constants.ts';
import { ANVIL_FILE, SMITH_FILE } from './files.ts';
import {
  listMaterialVertices,
  loadAt,
  poseModel,
  resetModel,
} from './pose.ts';

/** The clip in which the smith hammers. */
const HAMMERING_CLIP = 'Work';
/** The material of the head of the hammer of the smith. */
const HAMMER_MATERIAL = 'hammerHead';
/** The material of the bar of hot iron on the anvil. */
const IRON_MATERIAL = 'hotIron';
/**
 * The farthest the face of the hammer may stop above the iron at the blow,
 * or sink into it, in metres.
 */
const STRIKE_TOLERANCE = 0.003;

/**
 * Tells whether a point on the ground lies within the outline of points
 * around a convex shape.
 *
 * @param {Vector3} point - The point; its height does not count.
 * @param {readonly Vector3[]} corners - The points around the shape, in no
 *   particular order; their heights do not count.
 * @returns {boolean} Whether the point lies within the outline.
 */
function isWithinOutline(
  point: Vector3,
  corners: readonly Vector3[],
): boolean {
  const middle = new Vector3();
  for (const corner of corners) {
    middle.add(corner);
  }
  middle.divideScalar(corners.length);
  const findAngle = (p: Vector3): number =>
    Math.atan2(p.z - middle.z, p.x - middle.x);
  const ring: Vector3[] = corners.toSorted(
    (a: Vector3, b: Vector3) => findAngle(a) - findAngle(b),
  );
  return ring.every((a: Vector3, index: number) => {
    const b: Vector3 = getItem(ring, (index + 1) % ring.length);
    const cross: number =
      (b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x);
    return cross >= -1e-9;
  });
}

/**
 * Checks that the hammer of the smith meets the hot iron on the anvil, as
 * the village stands both: that at the lowest point of its stroke the face
 * of the hammer comes down on the top of the iron, neither short of it nor
 * into it, and over it.
 *
 * @returns {Promise<StrikeResult>} The outcome.
 */
export async function checkStrike(): Promise<StrikeResult> {
  const smith: GLTF = await loadAt(findPlacement('emma'));
  const anvil: GLTF = await loadAt(findPlacement('weapon-shop'));
  const iron: Vector3[] = listMaterialVertices(anvil.scene, IRON_MATERIAL);
  const clip: AnimationClip | undefined = smith.animations.find(
    (candidate: AnimationClip) => candidate.name === HAMMERING_CLIP,
  );
  if (iron.length === 0 || clip === undefined) {
    return {
      summary: '',
      failures: [
        `${ANVIL_FILE} has no hot iron or ${SMITH_FILE} does not hammer`,
      ],
    };
  }
  const ironTop: number = Math.max(...iron.map((p: Vector3) => p.y));
  const topFace: Vector3[] = iron.filter(
    (p: Vector3) => p.y > ironTop - TOLERANCE,
  );
  const steps: number = Math.round(clip.duration * SAMPLE_RATE);
  let gap = Infinity;
  let face = new Vector3();
  for (let k = 0; k <= steps; k++) {
    const mixer: AnimationMixer = poseModel(
      smith,
      clip,
      (clip.duration * k) / steps,
    );
    const head: Vector3[] = listMaterialVertices(smith.scene, HAMMER_MATERIAL);
    const lowest: number = Math.min(...head.map((p: Vector3) => p.y));
    if (lowest - ironTop < gap) {
      gap = lowest - ironTop;
      face = new Vector3();
      const bottom: Vector3[] = head.filter(
        (p: Vector3) => p.y < lowest + 0.001,
      );
      for (const p of bottom) {
        face.add(p);
      }
      face.divideScalar(bottom.length);
    }
    resetModel(smith, mixer);
  }
  const failures: string[] = [];
  const subject = `the hammer of ${SMITH_FILE}`;
  if (Math.abs(gap) > STRIKE_TOLERANCE) {
    failures.push(`${subject} does not meet the iron on ${ANVIL_FILE}`);
  }
  const isOver: boolean = isWithinOutline(face, topFace);
  if (!isOver) {
    failures.push(`${subject} comes down beside the iron on ${ANVIL_FILE}`);
  }
  const summary: string =
    `${subject} comes down ${(gap * 1000).toFixed(1)} mm above the iron ` +
    `on ${ANVIL_FILE}, ${isOver ? 'over' : 'beside'} it`;
  return { summary, failures };
}
