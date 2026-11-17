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

/**
 * Shows a scene in the browser window, for the owner to look around in.
 *
 * Dragging with the left mouse button orbits, the wheel zooms, and dragging
 * with the right mouse button pans.
 *
 * @param {Scene} scene - The scene to show.
 * @param {(seconds: number) => void} update - Called before every frame is
 *   drawn, with the time since the last one, in seconds.
 */
export function showScene(
  scene: Scene,
  update: (seconds: number) => void,
): void {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  document.body.append(renderer.domElement);

  const camera = new PerspectiveCamera(40, 1, 0.5, 600);
  camera.position.set(0, 14, 28);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.5, -5);
  controls.enableDamping = true;
  controls.minDistance = 2;
  controls.maxDistance = 90;
  // Panning along the ground and never looking up from below the target
  // keep the owner above the ground.
  controls.screenSpacePanning = false;
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
}
