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
import { fetchClientConfig } from './client-config.ts';
import type { ClientConfig } from './client-config.ts';
import { SnapshotTimeline } from './interpolation.ts';
import type { PlayersView } from './interpolation.ts';
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
import { describeDisplay, describeSnapshot } from './player-readout.ts';
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

/** The latest snapshots from the server, to show the players from. */
const timeline = new SnapshotTimeline();

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
    showPlayers();
    for (const actor of actors) {
      actor.update(seconds);
    }
    figures.update(seconds);
  },
);

// For looking at what the page shows, and at the latest snapshot it shows
// that from, from the console of the browser.
Object.defineProperty(window, 'clovervale', {
  value: {
    describeFigures: () => figures.describeFigures(),
    listLatestPlayers: () => timeline.latest ?? [],
  },
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

/** The connection to the game server, once the page has found it. */
let socket: WebSocket | null = null;
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
  if (ownId === null || socket?.readyState !== WebSocket.OPEN) {
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
 * Shows the players as the panel is set to show them, with the camera on
 * the player of the page as it is shown: either smoothly, as they were a
 * while ago, or exactly as the latest snapshot tells them.
 */
function showPlayers(): void {
  const { isEnabled, delay } = panel.interpolation;
  const view: PlayersView = isEnabled
    ? timeline.readPast(performance.now(), delay)
    : timeline.readLatest();
  figures.showPlayers(view.players);
  panel.showDisplay(describeDisplay(ownId, timeline.latest, view));
  const own: PlayerState | undefined = view.players.find(
    (player: PlayerState) => player.id === ownId,
  );
  if (own !== undefined) {
    viewport.follow(own);
  }
}

/**
 * Handles a message from the game server.
 *
 * @param {MessageEvent<unknown>} event - The event of the message.
 */
function receiveMessage(event: MessageEvent<unknown>): void {
  let message: ServerMessage;
  try {
    message = decodeServerMessage(String(event.data));
  } catch {
    panel.state.server = 'misbehaving';
    return;
  }
  if (message.type === 'snapshot') {
    if (ownId !== null) {
      timeline.addSnapshot(message, performance.now());
      panel.showReadout(describeSnapshot(ownId, message.players));
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
}

/**
 * Connects to the game server of the page, which the settings of the site
 * may name.
 *
 * @returns {Promise<void>} A promise settled once the page is connecting.
 */
async function connectToServer(): Promise<void> {
  const config: ClientConfig = await fetchClientConfig(
    import.meta.env.BASE_URL,
  );
  socket = new WebSocket(
    resolveServerUrl(new URL(window.location.href), config.serverUrl),
  );
  socket.addEventListener('message', receiveMessage);
  socket.addEventListener('close', () => {
    ownId = null;
    panel.state.server = 'disconnected';
    timeline.clear();
    panel.showReadout(describeSnapshot(null, null));
  });
}

void connectToServer();

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
