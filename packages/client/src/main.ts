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
  decodeServerMessage,
  encodeClientMessage,
  findSpawnPoint,
} from '@clovervale/shared';
import type {
  GroundVector,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  ServerMessage,
} from '@clovervale/shared';

import type { Actor } from './actor.ts';
import { keepFollowedPlayer, listCameraChoices } from './camera-choice.ts';
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
import { DelayLine } from './network-delay.ts';
import { createPanel } from './panel.ts';
import type { Panel } from './panel.ts';
import { PlayerFigures } from './player-figures.ts';
import { MoveKeys, findKeyCommand } from './player-input.ts';
import type { KeyCommand } from './player-input.ts';
import {
  describeDisplay,
  describePrediction,
  describeSnapshot,
} from './player-readout.ts';
import { PlayerPrediction, placeOwnPlayer } from './prediction.ts';
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
    describeCamera: () => viewport.getFocus(),
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
/**
 * The player of the page as predicted, once the server has told where it
 * starts.
 */
let prediction: PlayerPrediction | null = null;
/** The direction the server was last told the player wants to move in. */
let sentDirection: GroundVector = { x: 0, z: 0 };
const moveKeys = new MoveKeys();

/** What the page sends the server, held back as the panel is set. */
const outgoing = new DelayLine<string>((data: string) => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(data);
  }
});
/** What the server sends the page, held back as the panel is set. */
const incoming = new DelayLine<string>(receiveMessage);

/**
 * Gives the player of the page an input, which the prediction shows from now
 * on and which is sent to the server, if the server has told the page of the
 * player and the connection is still open.
 *
 * @param {PlayerInput} input - The input.
 * @returns {boolean} Whether the player was given the input.
 */
function sendInput(input: PlayerInput): boolean {
  if (prediction === null || socket?.readyState !== WebSocket.OPEN) {
    return false;
  }
  outgoing.send(
    encodeClientMessage(prediction.issueInput(input, performance.now())),
    panel.network.delay,
  );
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
  if (!isSame && sendInput({ type: 'move', direction })) {
    sentDirection = direction;
  }
}

/**
 * Shows the players as the panel is set to show them, with the camera on
 * the player the panel has it follow, as it is shown.  The player of the
 * page is shown as predicted, or like the others.  The others are shown
 * either smoothly, as they were a while ago, or exactly as the latest
 * snapshot tells them.
 */
function showPlayers(): void {
  const now: number = performance.now();
  const { isEnabled, delay } = panel.interpolation;
  let view: PlayersView = isEnabled
    ? timeline.readPast(now, delay)
    : timeline.readLatest();
  const isOwn = (player: PlayerState): boolean => player.id === ownId;
  const latest: PlayerState | undefined = timeline.latest?.find(isOwn);
  prediction?.advance(now);
  if (
    panel.prediction.isEnabled &&
    prediction !== null &&
    latest !== undefined
  ) {
    const drawn: PlayerMotion = prediction.readDrawn(now);
    const players: PlayerState[] = placeOwnPlayer(view.players, latest, drawn);
    view = { players, lag: view.lag };
  }
  figures.showPlayers(view.players);
  panel.showDisplay(describeDisplay(ownId, timeline.latest, view));
  panel.showPrediction(describePrediction(prediction));
  const followedId: number | null = panel.camera.followedId ?? ownId;
  const followed: PlayerState | undefined = view.players.find(
    (player: PlayerState) => player.id === followedId,
  );
  if (followed !== undefined) {
    viewport.follow(followed);
  }
}

/**
 * Handles a message from the game server.
 *
 * @param {string} data - The message as received.
 */
function receiveMessage(data: string): void {
  let message: ServerMessage;
  try {
    message = decodeServerMessage(data);
  } catch {
    panel.state.server = 'misbehaving';
    return;
  }
  if (message.type === 'snapshot') {
    if (ownId !== null) {
      const now: number = performance.now();
      timeline.addSnapshot(message, now);
      panel.camera.followedId = keepFollowedPlayer(
        panel.camera.followedId,
        message.players,
      );
      panel.offerCameraChoices(listCameraChoices(ownId, message.players));
      if (prediction === null) {
        prediction = new PlayerPrediction(message.own.motion, now);
      } else {
        prediction.reconcile(message.own, now);
      }
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
  socket.addEventListener('message', (event: MessageEvent<unknown>) => {
    incoming.send(String(event.data), panel.network.delay);
  });
  socket.addEventListener('close', () => {
    incoming.clear();
    outgoing.clear();
    ownId = null;
    prediction = null;
    panel.state.server = 'disconnected';
    timeline.clear();
    panel.camera.followedId = null;
    panel.offerCameraChoices(listCameraChoices(null, null));
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
    sendInput({ type: 'interact' });
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
