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
 * @module client/main The entry point of the browser client.
 */

import GUI from 'lil-gui';
import {
  BoxGeometry,
  Mesh,
  MeshNormalMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

import { decodeServerMessage } from '@clovervale/shared';

import { resolveServerUrl } from './server-url.ts';
import './style.css';

const settings = { spinSpeed: 1, server: 'connecting' };

const gui = new GUI({ title: 'Clovervale' });
gui.add(settings, 'spinSpeed', 0, 5).name('Spin speed');
gui.add(settings, 'server').name('Server').disable().listen();

const renderer = new WebGLRenderer({ antialias: true });
document.body.append(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(60, 1, 0.1, 100);
camera.position.z = 3;
const cube = new Mesh(new BoxGeometry(), new MeshNormalMaterial());
scene.add(cube);

/**
 * Fits the rendered view to the browser window.
 */
function fitViewToWindow(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', fitViewToWindow);
fitViewToWindow();

let lastTime = performance.now();
renderer.setAnimationLoop((time: number) => {
  const seconds = (time - lastTime) / 1000;
  lastTime = time;
  cube.rotation.x += settings.spinSpeed * seconds * 0.5;
  cube.rotation.y += settings.spinSpeed * seconds;
  renderer.render(scene, camera);
});

const socket = new WebSocket(resolveServerUrl(new URL(window.location.href)));
socket.addEventListener('message', (event: MessageEvent<unknown>) => {
  try {
    const message = decodeServerMessage(String(event.data));
    const version = String(message.protocolVersion);
    settings.server = `connected (protocol ${version})`;
  } catch {
    settings.server = 'misbehaving';
  }
});
socket.addEventListener('close', () => {
  settings.server = 'disconnected';
});
