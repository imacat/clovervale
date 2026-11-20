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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/edwin-call When Edwin, the prisoner of the cave, calls out
 *   for help on his own.
 */

import { Box3, Frustum, Matrix4, Raycaster, Vector3 } from 'three';
import type { Camera, Intersection, Object3D } from 'three';

import type { MonsterState } from '@clovervale/shared';

/**
 * How long both dogs of the cave must have been dead before Edwin calls,
 * in seconds, a breather for the player.
 */
export const CALL_BREATHER = 1;
/**
 * How long after each call of Edwin the next falls due, in seconds, whether
 * he is seen meanwhile or not.
 */
export const CALL_INTERVAL = 10;
/**
 * The heights at which the figure of Edwin is looked at, as shares of its
 * height from its feet, from his legs to his head.
 */
const SIGHT_HEIGHTS: readonly number[] = [0.25, 0.5, 0.85];

/** How things stand for Edwin at a frame. */
export interface EdwinSituation {
  /**
   * Whether both dogs of the cave are dead together, as the page knows.
   */
  readonly areDogsDead: boolean;
  /** Whether Edwin has told the player of the page who he is. */
  readonly isAcquainted: boolean;
  /** Whether the player of the page is in a dialogue. */
  readonly isInDialogue: boolean;
  /**
   * Tells whether Edwin is on the screen, asked only while the rest would
   * have him call.
   *
   * @returns {boolean} Whether he is.
   */
  readonly isOnScreen: () => boolean;
}

/**
 * Tells whether the dogs of the cave are all dead, as the latest snapshot
 * tells of them.
 *
 * @param {(readonly MonsterState[]) | null} monsters - The monsters of the
 *   cave in the latest snapshot, or `null` without a snapshot of the cave.
 * @returns {boolean} Whether there is a snapshot of the cave and no dog in
 *   it is alive.
 */
export function areDogsDead(
  monsters: readonly MonsterState[] | null,
): boolean {
  return (
    monsters?.every((monster: MonsterState) => monster.mode === 'dead') ??
    false
  );
}

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
  const centre: Vector3 = box.getCenter(new Vector3());
  const raycaster = new Raycaster();
  return SIGHT_HEIGHTS.some((share: number): boolean => {
    const point = new Vector3(
      centre.x,
      box.min.y + (box.max.y - box.min.y) * share,
      centre.z,
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

/** What tells when Edwin calls out for help. */
export class EdwinCall {
  /** How long both dogs have been dead together, or `null` while not. */
  #deadTime: number | null = null;
  /**
   * How long since Edwin last called, or `null` while he has not called
   * since the rest of what has him call came to hold.
   */
  #callTime: number | null = null;

  /**
   * Notices how things stand at a frame, and tells whether Edwin calls out
   * then.
   *
   * A call falls due while both dogs of the cave have been dead together
   * for {@link CALL_BREATHER} seconds at least, Edwin has not told the
   * player of the page who he is, and the player is not in a dialogue: at
   * once as all of that comes to hold, and then {@link CALL_INTERVAL}
   * seconds after each call, whether he is on the screen meanwhile or not,
   * for as long as it holds.  He makes a call that is due as soon as he is
   * on the screen.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {EdwinSituation} situation - How things stand now.
   * @returns {boolean} Whether Edwin calls out at this frame.
   */
  update(seconds: number, situation: EdwinSituation): boolean {
    this.#deadTime = situation.areDogsDead
      ? this.#deadTime === null
        ? 0
        : this.#deadTime + seconds
      : null;
    const canCall: boolean =
      this.#deadTime !== null &&
      this.#deadTime >= CALL_BREATHER &&
      !situation.isAcquainted &&
      !situation.isInDialogue;
    if (!canCall) {
      this.#callTime = null;
      return false;
    }
    if (this.#callTime !== null) {
      this.#callTime += seconds;
    }
    const isDue: boolean =
      this.#callTime === null || this.#callTime >= CALL_INTERVAL;
    if (!isDue || !situation.isOnScreen()) {
      return false;
    }
    this.#callTime = 0;
    return true;
  }
}
