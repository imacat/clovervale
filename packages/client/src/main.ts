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
  VILLAGE_TERRAIN,
  decodeServerMessage,
  encodeClientMessage,
  findSpawnPoint,
} from '@clovervale/shared';
import type {
  EntityRef,
  GameEvent,
  GroundVector,
  MonsterState,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  ServerMessage,
} from '@clovervale/shared';

import type { Actor } from './actor.ts';
import { keepFollowedPlayer, listCameraChoices } from './camera-choice.ts';
import { fetchClientConfig } from './client-config.ts';
import type { ClientConfig } from './client-config.ts';
import { EventSchedule } from './event-schedule.ts';
import { HitMarkers } from './hit-markers.ts';
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
import { MonsterFigures } from './monster-figures.ts';
import { DelayLine } from './network-delay.ts';
import { createObstacleOutlines } from './obstacle-outlines.ts';
import { createPanel } from './panel.ts';
import type { Panel } from './panel.ts';
import { PlayerFigures } from './player-figures.ts';
import { MoveKeys, findKeyCommand } from './player-input.ts';
import type { KeyCommand } from './player-input.ts';
import {
  describeDisplay,
  describeMonster,
  describePrediction,
  describeSnapshot,
} from './player-readout.ts';
import { PlayerPrediction, placeOwnPlayer } from './prediction.ts';
import { resolveServerUrl } from './server-url.ts';
import './style.css';
import {
  createMonsterFigure,
  createPlayerFigure,
  createVillageScene,
  populateVillage,
} from './village-scene.ts';
import { showScene } from './viewport.ts';
import type { Viewport } from './viewport.ts';

/** The URL of the directory of the models, relative to the page. */
const MODELS_URL = `${import.meta.env.BASE_URL}models/`;

/** The colour of the number of a hit on the player of the page. */
const OWN_HIT_COLOUR = '#ff4b3e';
/** The colour of the number of a hit on another player. */
const PLAYER_HIT_COLOUR = '#ff9a3d';
/** The colour of the number of a hit on a monster. */
const MONSTER_HIT_COLOUR = '#ffe14d';
/** The most hits that are remembered as shown, for looking at. */
const SHOWN_HIT_LIMIT = 100;

/** The models that stand in the village whoever is connected. */
const actors: Actor[] = [];
/** The models that have been loaded so far. */
let models: readonly LoadedModel[] = [];

/** The latest snapshots from the server, to show the players from. */
const timeline = new SnapshotTimeline();
/** The events from the server that are yet to be shown. */
const schedule = new EventSchedule();
/** The latest hits that have been shown, the latest last. */
const shownHits: GameEvent[] = [];

const panel: Panel = createPanel();
const scene = createVillageScene();
const outlines = createObstacleOutlines(VILLAGE_TERRAIN);
scene.add(outlines);
const figures = new PlayerFigures(scene, (appearance: number) =>
  createPlayerFigure(models, appearance),
);
const monsterFigures = new MonsterFigures(scene, () =>
  createMonsterFigure(models),
);
const markers = new HitMarkers(scene);
const viewport: Viewport = showScene(
  scene,
  findSpawnPoint(0),
  (seconds: number) => {
    sendMove();
    showPlayers();
    outlines.visible = panel.obstacles.isShown;
    for (const actor of actors) {
      actor.update(seconds);
    }
    figures.update(seconds);
    monsterFigures.update(seconds);
    markers.update(seconds);
  },
);

// For looking at what the page shows, and at the latest snapshot it shows
// that from, from the console of the browser.
Object.defineProperty(window, 'clovervale', {
  value: {
    describeCamera: () => viewport.getFocus(),
    describeFigures: () => figures.describeFigures(),
    describeMonsters: () => monsterFigures.describeMonsters(),
    listLatestPlayers: () => timeline.latest ?? [],
    listLatestMonsters: () => timeline.latestMonsters ?? [],
    listShownHits: () => [...shownHits],
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
 * Shows the hits whose moment has come in what is shown, each once, with a
 * number that floats up from whoever was hit, where it is shown.  A hit on
 * whoever is not shown is not shown either.
 *
 * @param {PlayersView} view - The players and the monsters as they are
 *   shown.
 */
function showHits(view: PlayersView): void {
  for (const event of schedule.takeDue(view.time)) {
    const { target }: { target: EntityRef } = event;
    const shown: GroundVector | undefined =
      target.kind === 'player'
        ? view.players.find((player: PlayerState) => player.id === target.id)
        : view.monsters.find(
            (monster: MonsterState) => monster.id === target.id,
          );
    if (shown === undefined) {
      continue;
    }
    let colour: string = MONSTER_HIT_COLOUR;
    if (target.kind === 'player') {
      colour = target.id === ownId ? OWN_HIT_COLOUR : PLAYER_HIT_COLOUR;
    }
    markers.show(shown, event.damage, colour);
    shownHits.push(event);
    if (shownHits.length > SHOWN_HIT_LIMIT) {
      shownHits.shift();
    }
  }
}

/**
 * Shows the players as the panel is set to show them, with the camera on
 * the player the panel has it follow, as it is shown.  The player of the
 * page is shown as predicted, or like the others.  The others and the
 * monsters are shown either smoothly, as they were a while ago, or exactly
 * as the latest snapshot tells them, and so are the hits among them.
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
    view = { ...view, players };
  }
  figures.showPlayers(view.players);
  monsterFigures.showMonsters(view.monsters);
  showHits(view);
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
      panel.showMonster(describeMonster(message.monsters));
    }
    return;
  }
  if (message.type === 'events') {
    if (ownId !== null) {
      schedule.receive(message.events);
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
    schedule.clear();
    panel.showMonster(describeMonster(null));
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
  } else if (!event.repeat && prediction?.motion.action !== 'Die') {
    // A dead player cannot slash, and is not to slash once it is back for
    // a key pressed while it was dead.
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
