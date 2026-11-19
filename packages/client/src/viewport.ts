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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/viewport Showing a scene in the browser window.
 */

import { PCFShadowMap, PerspectiveCamera, WebGLRenderer } from 'three';
import type { Scene } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { GroundVector } from '@clovervale/shared';

import { TrailingCamera } from './trailing-camera.ts';
import type { TrailingCameraSettings } from './trailing-camera.ts';

/** A view of a scene in the browser window. */
export interface Viewport {
  /**
   * Tells which way the camera looks along the ground.
   *
   * @returns {number} The turn around the Y axis, measured from looking
   *   along +Z and positive towards +X, in degrees.
   */
  readonly getHeading: () => number;
  /**
   * Tells where what the camera looks at stands.
   *
   * @returns {GroundVector} The point on the ground.
   */
  readonly getFocus: () => GroundVector;
  /**
   * Moves the camera along with what it looks at, at once, keeping its
   * distance and its angles.
   *
   * @param {GroundVector} focus - Where what the camera looks at stands now.
   */
  readonly follow: (focus: GroundVector) => void;
}

/**
 * The farthest the camera can be from what it looks at, zoomed out, in
 * metres.
 */
export const CAMERA_MAX_DISTANCE = 90;
/** The farthest from the camera anything is drawn, in metres. */
export const CAMERA_FAR = 600;

/** The height above the ground the camera looks at, in metres. */
const FOCUS_HEIGHT = 1.2;

/**
 * Shows a scene in the browser window, for the owner to look around in.
 *
 * Dragging with the left mouse button orbits around what the camera looks
 * at, and the wheel zooms.  While the trailing camera is switched on, the
 * camera also turns softly round behind the way what it looks at goes
 * forwards, while the owner leaves it alone.
 *
 * @param {Scene} scene - The scene to show.
 * @param {GroundVector} focus - Where what the camera looks at stands at
 *   first.
 * @param {Readonly<TrailingCameraSettings>} trailing - How the owner has
 *   the camera turn after what it looks at, as set at every frame.
 * @param {(seconds: number) => void} update - Called before every frame is
 *   drawn, with the time since the last one, in seconds.
 * @returns {Viewport} The view.
 */
export function showScene(
  scene: Scene,
  focus: GroundVector,
  trailing: Readonly<TrailingCameraSettings>,
  update: (seconds: number) => void,
): Viewport {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  document.body.append(renderer.domElement);

  const camera = new PerspectiveCamera(40, 1, 0.5, CAMERA_FAR);
  camera.position.set(focus.x, 7.5, focus.z + 13);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(focus.x, FOCUS_HEIGHT, focus.z);
  controls.enableDamping = true;
  controls.minDistance = 2;
  controls.maxDistance = CAMERA_MAX_DISTANCE;
  // The camera stays on what it follows, and never looks up from below it.
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.update();

  const fitViewToWindow = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', fitViewToWindow);
  fitViewToWindow();

  const readHeading = (): number => {
    const x: number = controls.target.x - camera.position.x;
    const z: number = controls.target.z - camera.position.z;
    return (Math.atan2(x, z) * 180) / Math.PI;
  };
  const trailingCamera = new TrailingCamera();
  // Whether the owner holds the camera now, and whether the owner has
  // handled it since the last frame, as a turn of the wheel does at once.
  let isHeld = false;
  let isTouched = false;
  controls.addEventListener('start', () => {
    isHeld = true;
    isTouched = true;
  });
  controls.addEventListener('end', () => {
    isHeld = false;
  });
  const steerCamera = (seconds: number): void => {
    const heading: number = readHeading();
    const steered: number = trailingCamera.steer(
      heading,
      { x: controls.target.x, z: controls.target.z },
      seconds,
      trailing,
      isHeld || isTouched,
    );
    isTouched = false;
    if (steered === heading) {
      return;
    }
    // The camera swings round what it looks at, keeping its distance and
    // its height.
    const turn: number = ((steered - heading) * Math.PI) / 180;
    const x: number = camera.position.x - controls.target.x;
    const z: number = camera.position.z - controls.target.z;
    const cos: number = Math.cos(turn);
    const sin: number = Math.sin(turn);
    camera.position.x = controls.target.x + x * cos + z * sin;
    camera.position.z = controls.target.z - x * sin + z * cos;
  };

  let lastTime: number = performance.now();
  renderer.setAnimationLoop((time: number) => {
    // A page left in the background must not leap ahead when it comes back.
    const seconds: number = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    update(seconds);
    steerCamera(seconds);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    getHeading: readHeading,
    getFocus: (): GroundVector => ({
      x: controls.target.x,
      z: controls.target.z,
    }),
    follow: (next: GroundVector): void => {
      camera.position.x += next.x - controls.target.x;
      camera.position.z += next.z - controls.target.z;
      controls.target.x = next.x;
      controls.target.z = next.z;
    },
  };
}
