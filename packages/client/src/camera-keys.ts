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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/camera-keys Turning the arrow keys held into turns of the
 *   camera.
 */

/**
 * How fast the left and right arrows orbit the camera round what it looks
 * at, in degrees per second: a full turn in four seconds.
 */
export const CAMERA_ORBIT_RATE = 90;
/**
 * How fast the up and down arrows lower and raise the camera, in degrees
 * per second: from the ground to overhead in about two seconds.
 */
export const CAMERA_TILT_RATE = 45;

/** How far the arrow keys held turn the camera over some time. */
export interface CameraTurn {
  /**
   * How far the camera goes round what it looks at, in degrees: positive
   * to the left of the camera, and negative to its right.
   */
  readonly orbit: number;
  /**
   * How far the camera rises over what it looks at, in degrees: positive
   * upwards, and negative downwards.
   */
  readonly tilt: number;
}

/** What the owner holds to turn the camera, as the arrow keys. */
export interface CameraHold {
  /**
   * Whether the owner holds the camera with it now.
   *
   * @returns {boolean} Whether it does.
   */
  readonly isHeld: boolean;
  /**
   * Resolves how far it turns the camera over some time.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {CameraTurn} The turn.
   */
  readonly resolveTurn: (seconds: number) => CameraTurn;
}

/** Which way each arrow key turns the camera, by the code of the key. */
const KEY_TURNS: Readonly<Record<string, CameraTurn>> = {
  ArrowLeft: { orbit: -1, tilt: 0 },
  ArrowRight: { orbit: 1, tilt: 0 },
  ArrowUp: { orbit: 0, tilt: -1 },
  ArrowDown: { orbit: 0, tilt: 1 },
};

/**
 * Tells whether a key turns the camera while it is held: whether it is an
 * arrow key.
 *
 * @param {string} code - The code of the key, as in a keyboard event.
 * @returns {boolean} Whether it does.
 */
export function isCameraKey(code: string): boolean {
  return Object.hasOwn(KEY_TURNS, code);
}

/**
 * The arrow keys held down to turn the camera: the left and right arrows
 * orbit it round what it looks at, so that the view turns left and right
 * on the screen, and the up and down arrows lower and raise it, so that
 * the view tilts up and down, each at a steady rate.  Opposite keys cancel
 * out.
 */
export class CameraKeys implements CameraHold {
  readonly #held = new Set<string>();

  /**
   * Tells whether the owner holds the camera with the keys now.
   *
   * @returns {boolean} Whether any arrow key is held down.
   */
  get isHeld(): boolean {
    return this.#held.size > 0;
  }

  /**
   * Notes that a key is held down, if it is an arrow key.
   *
   * @param {string} code - The code of the key, as in a keyboard event.
   * @returns {boolean} Whether the key turns the camera.
   */
  pressKey(code: string): boolean {
    if (!isCameraKey(code)) {
      return false;
    }
    this.#held.add(code);
    return true;
  }

  /**
   * Notes that a key is no longer held down.
   *
   * @param {string} code - The code of the key.
   */
  releaseKey(code: string): void {
    this.#held.delete(code);
  }

  /** Notes that no key is held down any more. */
  releaseAllKeys(): void {
    this.#held.clear();
  }

  /**
   * Resolves how far the keys held down turn the camera over some time.
   *
   * @param {number} seconds - The time, in seconds.
   * @returns {CameraTurn} The turn.
   */
  resolveTurn(seconds: number): CameraTurn {
    let orbit = 0;
    let tilt = 0;
    for (const code of this.#held) {
      const turn: CameraTurn | undefined = KEY_TURNS[code];
      orbit += turn?.orbit ?? 0;
      tilt += turn?.tilt ?? 0;
    }
    return {
      orbit: orbit * CAMERA_ORBIT_RATE * seconds,
      tilt: tilt * CAMERA_TILT_RATE * seconds,
    };
  }
}
