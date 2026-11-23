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
 * @module client/on-screen Telling whether the camera sees a figure.
 */

import { Box3, Frustum, Matrix4, Raycaster, Vector3 } from 'three';
import type { Camera, Intersection, Object3D } from 'three';

/**
 * The heights at which a figure is looked at, as shares of its height from
 * its feet, from its legs to its head.
 */
const SIGHT_HEIGHTS: readonly number[] = [0.25, 0.5, 0.85];

/**
 * Tells whether a figure is on the screen: some part of it is within the
 * view of the camera, with nothing that hides it in between.
 *
 * @param {Camera} camera - The camera, as it stands now.
 * @param {Object3D} figure - The figure.
 * @param {Object3D | null} blocker - What may hide the figure from the
 *   camera, or `null` for nothing.
 * @returns {boolean} Whether the camera sees a point of the figure at its
 *   legs, its middle or its head.
 */
export function isOnScreen(
  camera: Camera,
  figure: Object3D,
  blocker: Object3D | null,
): boolean {
  camera.updateMatrixWorld();
  const box: Box3 = new Box3().setFromObject(figure);
  if (box.isEmpty()) {
    return false;
  }
  const frustum: Frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    ),
  );
  const eye: Vector3 = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const center: Vector3 = box.getCenter(new Vector3());
  const raycaster = new Raycaster();
  return SIGHT_HEIGHTS.some((share: number): boolean => {
    const point = new Vector3(
      center.x,
      box.min.y + (box.max.y - box.min.y) * share,
      center.z,
    );
    if (!frustum.containsPoint(point)) {
      return false;
    }
    if (blocker === null) {
      return true;
    }
    const distance: number = eye.distanceTo(point);
    raycaster.set(eye, point.clone().sub(eye).normalize());
    raycaster.far = distance;
    const hits: Intersection[] = raycaster.intersectObject(blocker, true);
    return hits.length === 0;
  });
}
