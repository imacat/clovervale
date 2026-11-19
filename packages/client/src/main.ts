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

import type { Vector3 } from 'three';

import {
  NOON,
  PROTOCOL_VERSION,
  SIMULATION_RATE,
  TOBY_FILE,
  VILLAGERS,
  VILLAGE_TERRAIN,
  createInteractMessage,
  decodeServerMessage,
  encodeClientMessage,
  findSpawnPoint,
} from '@clovervale/shared';
import type {
  ClientMessage,
  EntityRef,
  GameEvent,
  GroundVector,
  HealEvent,
  HitEvent,
  MonsterState,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  ServerMessage,
  SlashJudgement,
  StampedInput,
  Villager,
} from '@clovervale/shared';

import type { Actor } from './actor.ts';
import { BackgroundMusic, MUSIC_FILE } from './background-music.ts';
import { keepFollowedPlayer, listCameraChoices } from './camera-choice.ts';
import { fetchClientConfig } from './client-config.ts';
import type { ClientConfig } from './client-config.ts';
import {
  CorrectionSmoothing,
  reconcileSmoothly,
} from './correction-smoothing.ts';
import { DayClock, findShownTime } from './day-clock.ts';
import type { DaylightLook } from './daylight.ts';
import { EventSchedule } from './event-schedule.ts';
import { ForgeGlow } from './forge-glow.ts';
import { FountainGlow } from './fountain-glow.ts';
import { HitMarkers } from './hit-markers.ts';
import {
  createPrompt,
  describePrompt,
  describeSpaceKey,
} from './interaction-prompt.ts';
import type { Prompt } from './interaction-prompt.ts';
import { SnapshotTimeline } from './interpolation.ts';
import type { PlayersView } from './interpolation.ts';
import {
  chooseLanguage,
  findLanguageStorage,
  readSavedLanguage,
  saveLanguage,
} from './language.ts';
import type { LanguageCode, LanguageStorage } from './language.ts';
import {
  FOUNTAIN_FILE,
  REQUIRED_MODEL_FILES,
  WEAPON_SHOP_FILE,
  planModels,
} from './model-catalogue.ts';
import {
  MODEL_INDEX_FILE,
  fetchModelIndex,
  loadModels,
} from './model-loader.ts';
import type { LoadedModel } from './model-loader.ts';
import { reportFailure, summariseModels } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';
import { MonsterFigures } from './monster-figures.ts';
import { DelayLine } from './network-delay.ts';
import { createObstacleOutlines } from './obstacle-outlines.ts';
import { createPanel } from './panel.ts';
import type { Panel } from './panel.ts';
import { PlayerFigures } from './player-figures.ts';
import type { Figure } from './player-figures.ts';
import { MoveKeys, findKeyCommand } from './player-input.ts';
import type { KeyCommand } from './player-input.ts';
import {
  describeDisplay,
  describeMonster,
  describePrediction,
  describeSlash,
  describeSnapshot,
  describeTimeOfDay,
} from './player-readout.ts';
import { PlayerPrediction, placeOwnPlayer } from './prediction.ts';
import { PushForecast } from './push-forecast.ts';
import { resolveServerUrl } from './server-url.ts';
import { SpeechBubble, findHeadTop } from './speech-bubble.ts';
import './style.css';
import { TalkWatch } from './talk-watch.ts';
import { TobyFigure } from './toby-figure.ts';
import { Translator } from './translator.ts';
import {
  createMonsterFigure,
  createPlayerFigure,
  createVillageScene,
  createVillagerFigure,
  populateVillage,
} from './village-scene.ts';
import { showScene } from './viewport.ts';
import type { Viewport } from './viewport.ts';
import { WindowGlow } from './window-glow.ts';

/** The URL of the directory of the models, relative to the page. */
const MODELS_URL = `${import.meta.env.BASE_URL}models/`;
/** The URL of the music of the village, relative to the page. */
const MUSIC_URL = `${import.meta.env.BASE_URL}music/${MUSIC_FILE}`;

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** Toby, the child who goes about by the gate, as a villager. */
const TOBY_VILLAGER: Villager | undefined = VILLAGERS.find(
  (villager: Villager) => villager.file === TOBY_FILE,
);

/** The colour of the number of a hit on the player of the page. */
const OWN_HIT_COLOUR = '#ff4b3e';
/** The colour of the number of a hit on another player. */
const PLAYER_HIT_COLOUR = '#ff9a3d';
/** The colour of the number of a hit on a monster. */
const MONSTER_HIT_COLOUR = '#ffe14d';
/**
 * How high above the ground the number of a hit on a monster starts, in
 * metres, just above the health bar of the dog, which is lower than a
 * player.
 */
const MONSTER_HIT_HEIGHT = 1.8;
/** The colour of the number of a heal on any player. */
const HEAL_COLOUR = '#7cf5c0';
/**
 * The most hits, and the most heals, that are remembered as shown, for
 * looking at.
 */
const SHOWN_HIT_LIMIT = 100;

/** Where the browser lets the page remember the language chosen. */
const languageStorage: LanguageStorage | null = findLanguageStorage();
/** The translator of the text of the page into the language it speaks. */
const translator = new Translator();
// The page speaks English if the language chosen cannot be loaded.
await translator.choose(
  chooseLanguage(readSavedLanguage(languageStorage), navigator.languages),
);

/**
 * Words how the connection to the server stands.
 *
 * @returns {string} How it stands, in the language of the page.
 */
let describeServer = (): string => translator.translate('server.connecting');
/**
 * Words how showing the models went.
 *
 * @returns {string} How it went, in the language of the page.
 */
let describeModels = (): string => translator.translate('models.loading');
/** How the server judged the latest slash of the player of the page. */
let lastSlash: SlashJudgement | null = null;

/** The models that stand in the village whoever is connected. */
const actors: Actor[] = [];
/** The models that have been loaded so far. */
let models: readonly LoadedModel[] = [];
/** The glow of the fountain, once its model has been loaded. */
let fountainGlow: FountainGlow | null = null;
/** The glow of the forge, once the model of the weapon shop has been loaded. */
let forgeGlow: ForgeGlow | null = null;
/** The light in the windows of the houses, once their models are shown. */
let windowGlow: WindowGlow | null = null;
/** Toby, once his model has been loaded. */
let toby: TobyFigure | null = null;

/** The time of day of the world, as the page reckons it. */
const dayClock = new DayClock();
/**
 * The time of day the page last showed, which it goes on showing while it
 * does not know the time of day of the world.
 */
let shownTime: number = NOON;

/** The latest snapshots from the server, to show the players from. */
const timeline = new SnapshotTimeline();
/** The events from the server that are yet to be shown. */
const schedule = new EventSchedule();
/** The latest hits that have been shown, the latest last. */
const shownHits: HitEvent[] = [];
/** The latest heals that have been shown, the latest last. */
const shownHeals: HealEvent[] = [];

const panel: Panel = createPanel(translator, switchLanguage);
const music = new BackgroundMusic(new Audio(MUSIC_URL));
const prompt: Prompt = createPrompt(document.body);
const { scene, daylight } = createVillageScene();
const outlines = createObstacleOutlines(VILLAGE_TERRAIN);
scene.add(outlines);
const figures = new PlayerFigures(scene, (appearance: number) =>
  createPlayerFigure(models, appearance),
);
const monsterFigures = new MonsterFigures(scene, () =>
  createMonsterFigure(models),
);
const markers = new HitMarkers(scene);
const speech = new SpeechBubble(scene, translator);
/** What notices each talk of the player of the page to a villager. */
const talks = new TalkWatch();
const viewport: Viewport = showScene(
  scene,
  findSpawnPoint(0),
  panel.trailingCamera,
  (seconds: number) => {
    sendMove();
    showPlayers();
    showTimeOfDay();
    outlines.visible = panel.obstacles.isShown;
    music.update(panel.music);
    for (const actor of actors) {
      actor.update(seconds);
    }
    fountainGlow?.update(seconds);
    forgeGlow?.update(seconds);
    figures.update(seconds);
    monsterFigures.update(seconds);
    markers.update(seconds);
    speech.update(seconds);
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
    listShownHeals: () => [...shownHeals],
    describeSpeech: () => speech.describe(),
    describeToby: () => toby?.describe() ?? null,
    describeTimeOfDay: () => ({
      world: dayClock.read(performance.now()),
      shown: shownTime,
    }),
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
    problems.push(reportFailure(MODEL_INDEX_FILE, error));
  }
  const plan = planModels(available);
  for (const file of plan.missing) {
    problems.push({ file, reason: 'missing' });
  }
  const loaded = await loadModels(MODELS_URL, plan.shown);
  problems.push(...loaded.problems);
  models = loaded.models;
  actors.push(...populateVillage(scene, models));
  windowGlow = new WindowGlow(scene);
  const child: Figure | null = createVillagerFigure(models, TOBY_FILE);
  if (child !== null) {
    scene.add(child.root);
    toby = new TobyFigure(child.root, child.clips);
  }
  const fountain: LoadedModel | undefined = models.find(
    (model: LoadedModel) => model.file === FOUNTAIN_FILE,
  );
  if (fountain !== undefined) {
    fountainGlow = new FountainGlow(fountain.root);
  }
  const weaponShop: LoadedModel | undefined = models.find(
    (model: LoadedModel) => model.file === WEAPON_SHOP_FILE,
  );
  if (weaponShop !== undefined) {
    forgeGlow = new ForgeGlow(weaponShop.root);
  }
  const shownCount: number = models.length;
  describeModels = (): string =>
    summariseModels(translator, shownCount, problems);
  panel.state.models = describeModels();
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
/** What draws the player of the page gliding over its corrections. */
const smoothing = new CorrectionSmoothing(panel.smoothing, panel.prediction);
/**
 * What draws the player of the page pushed out of the way of Toby while it
 * rests, before the server tells of it.
 */
const forecast = new PushForecast(
  panel.pushForecast,
  panel.smoothing,
  panel.prediction,
);
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
 * An interaction names the time of the server at which the world was as the
 * page shows it at the step the interaction shows from, for the server to
 * judge it on, if the panel is set so.
 *
 * @param {PlayerInput} input - The input.
 * @returns {boolean} Whether the player was given the input.
 */
function sendInput(input: PlayerInput): boolean {
  if (prediction === null || socket?.readyState !== WebSocket.OPEN) {
    return false;
  }
  const stamped: StampedInput = prediction.issueInput(input, performance.now());
  let message: ClientMessage = stamped;
  const stepTime: number | null = prediction.inputStepTime;
  if (
    stamped.type === 'interact' &&
    panel.compensation.isEnabled &&
    stepTime !== null
  ) {
    const { isEnabled, delay } = panel.interpolation;
    const viewTime: number | null = timeline.findViewTime(
      stepTime,
      isEnabled ? delay : null,
    );
    message = createInteractMessage(stamped, viewTime);
  }
  outgoing.send(encodeClientMessage(message), panel.network.delay);
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
 * Shows the hits and the heals whose moment has come in what is shown, each
 * once, with a number that floats up from whoever was hit or healed, where
 * it is shown.  A hit or a heal of whoever is not shown is not shown
 * either.
 *
 * @param {PlayersView} view - The players and the monsters as they are
 *   shown.
 */
function showEvents(view: PlayersView): void {
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
    if (event.type === 'heal') {
      markers.show(shown, `+${String(event.amount)}`, HEAL_COLOUR);
      rememberShown(shownHeals, event);
      continue;
    }
    const text = `-${String(event.damage)}`;
    if (target.kind === 'player') {
      const colour: string =
        target.id === ownId ? OWN_HIT_COLOUR : PLAYER_HIT_COLOUR;
      markers.show(shown, text, colour);
    } else {
      markers.show(shown, text, MONSTER_HIT_COLOUR, MONSTER_HIT_HEIGHT);
    }
    rememberShown(shownHits, event);
  }
}

/**
 * Remembers an event as shown, forgetting the earliest of its kind once
 * there are too many to remember.
 *
 * @param {T[]} shown - The events of its kind shown so far, the latest
 *   last.
 * @param {T} event - The event.
 * @template T
 */
function rememberShown<T extends GameEvent>(shown: T[], event: T): void {
  shown.push(event);
  if (shown.length > SHOWN_HIT_LIMIT) {
    shown.shift();
  }
}

/**
 * Shows the players as the panel is set to show them, with the camera on the
 * player the panel has it follow, as it is shown.  The player of the page is
 * shown as predicted, gliding over its corrections and, while it rests, pushed
 * out of the way of Toby as foreseen, if the panel is set so, or like the
 * others.  The others and the monsters are shown either smoothly, as they were
 * a while ago, or exactly as the latest snapshot tells them, and so are the
 * hits among them.  Toby is shown as he is at the step of the server the
 * player of the page is shown at as it walks, running on evenly whether it
 * walks or rests, while the player of the page is shown as predicted, and as
 * he is when the others are shown otherwise.  Once the player of the page
 * starts to talk to a villager, as predicted, what the villager says is shown
 * above its head, and follows the head of Toby as he goes on and squats.
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
  const shownStep: number | null =
    panel.prediction.isEnabled && prediction !== null
      ? prediction.readDrawnStep(now)
      : view.time === null
        ? null
        : view.time / STEP_MILLISECONDS;
  // The smoothing and the forecast are told of every frame, so that a glide
  // or a push ends as soon as prediction is switched off.
  const drawn: PlayerMotion | null =
    prediction === null
      ? null
      : forecast.advance(prediction, smoothing, now, shownStep);
  if (panel.prediction.isEnabled && drawn !== null && latest !== undefined) {
    const players: PlayerState[] = placeOwnPlayer(view.players, latest, drawn);
    view = { ...view, players };
  }
  if (shownStep !== null) {
    toby?.show(shownStep);
  }
  figures.showPlayers(view.players);
  monsterFigures.showMonsters(view.monsters);
  showEvents(view);
  panel.showDisplay(describeDisplay(ownId, timeline.latest, view));
  panel.showPrediction(describePrediction(translator, prediction));
  const predicted: PlayerMotion | null = prediction?.motion ?? null;
  // An interaction would start at the next step of the player.
  const nextStep: number = prediction?.readNextStep(now) ?? 0;
  prompt.show(describePrompt(translator, predicted, nextStep));
  panel.showInteraction(describeSpaceKey(translator, predicted, nextStep));
  const villager: Villager | null = talks.noticeTalk(
    predicted,
    prediction?.step ?? 0,
  );
  if (villager !== null) {
    speech.say(villager, findShownHead(villager, shownStep ?? 0));
  }
  if (TOBY_VILLAGER !== undefined && shownStep !== null) {
    speech.follow(TOBY_VILLAGER, findShownHead(TOBY_VILLAGER, shownStep));
  }
  const followedId: number | null = panel.camera.followedId ?? ownId;
  const followed: PlayerState | undefined = view.players.find(
    (player: PlayerState) => player.id === followedId,
  );
  if (followed !== undefined) {
    viewport.follow(followed);
  }
}

/**
 * Finds the top of the head of a villager as it is shown.
 *
 * @param {Villager} villager - The villager.
 * @param {number} step - The step of the server the villager is shown at,
 *   which may fall between two.
 * @returns {Vector3} The top of its head.
 */
function findShownHead(villager: Villager, step: number): Vector3 {
  const shown: Vector3 | null =
    villager.file === TOBY_FILE ? (toby?.findHeadTop() ?? null) : null;
  if (shown !== null) {
    return shown;
  }
  const model: LoadedModel | undefined = models.find(
    (candidate: LoadedModel) => candidate.file === villager.file,
  );
  return findHeadTop(villager, model?.root ?? null, step);
}

/**
 * Shows the village as it looks at the time of day the panel previews, or
 * else at the time of day of the world, and tells the time of day of the
 * world in the panel.  The preview is the page's alone: the server is
 * never told of it.
 */
function showTimeOfDay(): void {
  const worldTime: number | null = dayClock.read(performance.now());
  panel.state.timeOfDay = describeTimeOfDay(translator, worldTime);
  shownTime = findShownTime(worldTime, panel.timePreview) ?? shownTime;
  const look: DaylightLook = daylight.show(shownTime);
  windowGlow?.show(look.windows);
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
    showServer(() => translator.translate('server.misbehaving'));
    return;
  }
  if (message.type === 'snapshot') {
    if (ownId !== null) {
      const now: number = performance.now();
      timeline.addSnapshot(message, now);
      dayClock.observe(message.step, now);
      panel.camera.followedId = keepFollowedPlayer(
        panel.camera.followedId,
        message.players,
      );
      panel.offerCameraChoices(
        listCameraChoices(translator, ownId, message.players),
      );
      if (prediction === null) {
        prediction = new PlayerPrediction(
          message.own.motion,
          message.step,
          now,
        );
      } else {
        reconcileSmoothly(
          prediction,
          smoothing,
          message.own,
          message.step,
          now,
        );
      }
      panel.showReadout(describeSnapshot(translator, ownId, message.players));
      panel.showMonster(describeMonster(translator, message.monsters));
      lastSlash = message.slash;
      panel.showSlash(describeSlash(translator, lastSlash));
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
  if (message.protocolVersion !== PROTOCOL_VERSION || message.day === null) {
    showServer(() => translator.translate('server.incompatible', { version }));
    return;
  }
  ownId = message.playerId;
  dayClock.start(message.day);
  showServer(() => translator.translate('server.connected', { version }));
  panel.showReadout(describeSnapshot(translator, ownId, null));
}

/**
 * Shows how the connection to the server stands, in the language of the
 * page, now and in each language the page comes to speak.
 *
 * @param {() => string} describe - Words how it stands.
 */
function showServer(describe: () => string): void {
  describeServer = describe;
  panel.state.server = describe();
}

/**
 * Has the page speak a language the owner chooses, and remembers the
 * choice, once the page speaks it.
 *
 * @param {LanguageCode} code - The language.
 * @returns {Promise<void>} A promise settled once the page speaks it, or
 *   once it cannot.
 */
async function switchLanguage(code: LanguageCode): Promise<void> {
  if (await translator.choose(code)) {
    saveLanguage(languageStorage, code);
  }
}

/**
 * Words everything the page shows in the language it speaks now, outside
 * the names in the panel, which the panel words itself, and what the page
 * words afresh at every frame.
 */
function relabelPage(): void {
  document.documentElement.lang = translator.language;
  document.title = translator.translate('title');
  panel.state.server = describeServer();
  panel.state.models = describeModels();
  const players: readonly PlayerState[] | null = timeline.latest;
  panel.showReadout(describeSnapshot(translator, ownId, players));
  panel.showMonster(describeMonster(translator, timeline.latestMonsters));
  panel.showSlash(describeSlash(translator, lastSlash));
  panel.offerCameraChoices(listCameraChoices(translator, ownId, players));
  speech.relabel();
}

/**
 * Pauses the music if the page is hidden, or resumes it as the panel has it
 * set if the page is shown.
 */
function followPageVisibility(): void {
  if (document.visibilityState === 'hidden') {
    music.hide();
  } else {
    music.show(panel.music);
  }
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
    dayClock.reset();
    showServer(() => translator.translate('server.disconnected'));
    timeline.clear();
    schedule.clear();
    lastSlash = null;
    panel.showMonster(describeMonster(translator, null));
    panel.showSlash(describeSlash(translator, null));
    panel.camera.followedId = null;
    panel.offerCameraChoices(listCameraChoices(translator, null, null));
    panel.showReadout(describeSnapshot(translator, null, null));
  });
}

void connectToServer();

relabelPage();
translator.addListener(relabelPage);

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
    // A dead player cannot interact, and is not to once it is back for a
    // key pressed while it was dead.
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
// The browser lets the page make sound only once the user has pressed
// something on it.
for (const type of ['keydown', 'pointerdown']) {
  window.addEventListener(type, () => {
    music.allow(panel.music);
  });
}
followPageVisibility();
document.addEventListener('visibilitychange', followPageVisibility);
