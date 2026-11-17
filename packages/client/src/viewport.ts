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

/** A view of a scene in the browser window. */
export interface Viewport {
  /**
   * Tells which way the camera looks along the ground.
   *
   * @returns {number} The turn around the Y axis from looking towards +Z
   *   towards +X, in degrees.
   */
  readonly getHeading: () => number;
  /**
   * Moves the camera along with what it looks at, at once, keeping its
   * distance and its angles.
   *
   * @param {GroundVector} focus - Where what the camera looks at stands now.
   */
  readonly follow: (focus: GroundVector) => void;
}

/** The height above the ground the camera looks at, in metres. */
const FOCUS_HEIGHT = 1.2;

/**
 * Shows a scene in the browser window, for the owner to look around in.
 *
 * Dragging with the left mouse button orbits around what the camera looks
 * at, and the wheel zooms.
 *
 * @param {Scene} scene - The scene to show.
 * @param {GroundVector} focus - Where what the camera looks at stands at
 *   first.
 * @param {(seconds: number) => void} update - Called before every frame is
 *   drawn, with the time since the last one, in seconds.
 * @returns {Viewport} The view.
 */
export function showScene(
  scene: Scene,
  focus: GroundVector,
  update: (seconds: number) => void,
): Viewport {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  document.body.append(renderer.domElement);

  const camera = new PerspectiveCamera(40, 1, 0.5, 600);
  camera.position.set(focus.x, 7.5, focus.z + 13);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(focus.x, FOCUS_HEIGHT, focus.z);
  controls.enableDamping = true;
  controls.minDistance = 2;
  controls.maxDistance = 90;
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

  let lastTime: number = performance.now();
  renderer.setAnimationLoop((time: number) => {
    // A page left in the background must not leap ahead when it comes back.
    const seconds: number = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    update(seconds);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    getHeading: (): number => {
      const x: number = controls.target.x - camera.position.x;
      const z: number = controls.target.z - camera.position.z;
      return (Math.atan2(x, z) * 180) / Math.PI;
    },
    follow: (next: GroundVector): void => {
      camera.position.x += next.x - controls.target.x;
      camera.position.z += next.z - controls.target.z;
      controls.target.x = next.x;
      controls.target.z = next.z;
    },
  };
}
