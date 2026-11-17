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

import { decodeServerMessage } from '@clovervale/shared';

import type { Actor } from './actor.ts';
import { REQUIRED_MODEL_FILES, planModels } from './model-catalogue.ts';
import {
  MODEL_INDEX_FILE,
  fetchModelIndex,
  loadModels,
} from './model-loader.ts';
import { describeFailure, summariseModels } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';
import { createPanel } from './panel.ts';
import type { Panel } from './panel.ts';
import { resolveServerUrl } from './server-url.ts';
import './style.css';
import { createVillageScene, populateVillage } from './village-scene.ts';
import { showScene } from './viewport.ts';

/** The URL of the directory of the models, relative to the page. */
const MODELS_URL = `${import.meta.env.BASE_URL}models/`;

const actors: Actor[] = [];

/**
 * Plays the animation set in the panel on every model, from its beginning.
 */
function playAnimation(): void {
  for (const actor of actors) {
    actor.repeats = panel.state.repeats;
    actor.play(panel.state.animation);
  }
}

const panel: Panel = createPanel(playAnimation);
const scene = createVillageScene();
showScene(scene, (seconds: number) => {
  for (const actor of actors) {
    actor.update(seconds);
  }
});

/**
 * Shows the available models in the village, and reports those that cannot
 * be shown in the panel.
 *
 * @returns {Promise<void>} A promise settled once the models are shown.
 */
async function showModels(): Promise<void> {
  const problems: ModelProblem[] = [];
  let available: readonly string[];
  try {
    available = await fetchModelIndex(MODELS_URL);
  } catch (error: unknown) {
    // Without the list, the required models may still be there.
    available = REQUIRED_MODEL_FILES;
    problems.push({ file: MODEL_INDEX_FILE, reason: describeFailure(error) });
  }
  const plan = planModels(available);
  for (const file of plan.missing) {
    problems.push({ file, reason: 'missing' });
  }
  const loaded = await loadModels(MODELS_URL, plan.shown);
  problems.push(...loaded.problems);
  actors.push(...populateVillage(scene, loaded.models));
  playAnimation();
  panel.state.models = summariseModels(loaded.models.length, problems);
  panel.listProblems(problems);
}

void showModels();

const socket = new WebSocket(resolveServerUrl(new URL(window.location.href)));
socket.addEventListener('message', (event: MessageEvent<unknown>) => {
  try {
    const message = decodeServerMessage(String(event.data));
    const version = String(message.protocolVersion);
    panel.state.server = `connected (protocol ${version})`;
  } catch {
    panel.state.server = 'misbehaving';
  }
});
socket.addEventListener('close', () => {
  panel.state.server = 'disconnected';
});
