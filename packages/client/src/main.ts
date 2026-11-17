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

import {
  PROTOCOL_VERSION,
  createInteractMessage,
  createMoveMessage,
  decodeServerMessage,
  encodeClientMessage,
  findSpawnPoint,
} from '@clovervale/shared';
import type {
  ClientMessage,
  GroundVector,
  PlayerState,
  ServerMessage,
} from '@clovervale/shared';

import type { Actor } from './actor.ts';
import { REQUIRED_MODEL_FILES, planModels } from './model-catalogue.ts';
import {
  MODEL_INDEX_FILE,
  fetchModelIndex,
  loadModels,
} from './model-loader.ts';
import type { LoadedModel } from './model-loader.ts';
import { describeFailure, summariseModels } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';
import { createPanel } from './panel.ts';
import type { Panel } from './panel.ts';
import { PlayerFigures } from './player-figures.ts';
import { MoveKeys, findKeyCommand } from './player-input.ts';
import type { KeyCommand } from './player-input.ts';
import { describeSnapshot } from './player-readout.ts';
import { resolveServerUrl } from './server-url.ts';
import './style.css';
import {
  createPlayerFigure,
  createVillageScene,
  populateVillage,
} from './village-scene.ts';
import { showScene } from './viewport.ts';
import type { Viewport } from './viewport.ts';

/** The URL of the directory of the models, relative to the page. */
const MODELS_URL = `${import.meta.env.BASE_URL}models/`;

/** The models that stand in the village whoever is connected. */
const actors: Actor[] = [];
/** The models that have been loaded so far. */
let models: readonly LoadedModel[] = [];

const panel: Panel = createPanel();
const scene = createVillageScene();
const figures = new PlayerFigures(scene, (appearance: number) =>
  createPlayerFigure(models, appearance),
);
const viewport: Viewport = showScene(
  scene,
  findSpawnPoint(0),
  (seconds: number) => {
    sendMove();
    for (const actor of actors) {
      actor.update(seconds);
    }
    figures.update(seconds);
  },
);

// For looking at what the page shows from the console of the browser.
Object.defineProperty(window, 'clovervale', {
  value: { describeFigures: () => figures.describeFigures() },
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
  models = loaded.models;
  actors.push(...populateVillage(scene, models));
  panel.state.models = summariseModels(models.length, problems);
  panel.listProblems(problems);
}

void showModels();

const socket = new WebSocket(resolveServerUrl(new URL(window.location.href)));
/** The identifier of the player of the page, once the server has told it. */
let ownId: number | null = null;
/** The direction the server was last told the player wants to move in. */
let sentDirection: GroundVector = { x: 0, z: 0 };
const moveKeys = new MoveKeys();

/**
 * Sends the server a message, if the server has welcomed the page and is
 * still there.
 *
 * @param {ClientMessage} message - The message.
 * @returns {boolean} Whether the message was sent.
 */
function sendMessage(message: ClientMessage): boolean {
  if (ownId === null || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  socket.send(encodeClientMessage(message));
  return true;
}

/**
 * Tells the server which way the keys held down move the player, if that
 * has changed since the server was last told.
 */
function sendMove(): void {
  const direction: GroundVector = moveKeys.resolveDirection(
    viewport.getHeading(),
  );
  const isSame: boolean =
    direction.x === sentDirection.x && direction.z === sentDirection.z;
  if (!isSame && sendMessage(createMoveMessage(direction))) {
    sentDirection = direction;
  }
}

/**
 * Shows the players exactly as a snapshot tells them, with the camera on
 * the player of the page.
 *
 * @param {readonly PlayerState[]} players - The players in the snapshot.
 */
function showSnapshot(players: readonly PlayerState[]): void {
  figures.showSnapshot(players);
  panel.showReadout(describeSnapshot(ownId, players));
  const own: PlayerState | undefined = players.find(
    (player: PlayerState) => player.id === ownId,
  );
  if (own !== undefined) {
    viewport.follow(own);
  }
}

socket.addEventListener('message', (event: MessageEvent<unknown>) => {
  let message: ServerMessage;
  try {
    message = decodeServerMessage(String(event.data));
  } catch {
    panel.state.server = 'misbehaving';
    return;
  }
  if (message.type === 'snapshot') {
    if (ownId !== null) {
      showSnapshot(message.players);
    }
    return;
  }
  const version = String(message.protocolVersion);
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    panel.state.server = `incompatible (protocol ${version})`;
    return;
  }
  ownId = message.playerId;
  panel.state.server = `connected (protocol ${version})`;
  panel.showReadout(describeSnapshot(ownId, null));
});
socket.addEventListener('close', () => {
  ownId = null;
  panel.state.server = 'disconnected';
  figures.showSnapshot([]);
  panel.showReadout(describeSnapshot(null, null));
});

window.addEventListener('keydown', (event: KeyboardEvent) => {
  const command: KeyCommand | null = findKeyCommand(event.code);
  if (command === null || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  event.preventDefault();
  if (command !== 'interact') {
    moveKeys.pressKey(event.code);
    sendMove();
  } else if (!event.repeat) {
    sendMessage(createInteractMessage());
  }
});
window.addEventListener('keyup', (event: KeyboardEvent) => {
  moveKeys.releaseKey(event.code);
  sendMove();
});
window.addEventListener('blur', () => {
  moveKeys.releaseAllKeys();
  sendMove();
});
