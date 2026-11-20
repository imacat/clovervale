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

import { Group } from 'three';
import type { Object3D, Scene, Vector3 } from 'three';

import {
  CAVE_EDWIN_FILE,
  CAVE_FILE,
  CAVE_TERRAIN,
  NOON,
  NO_WORLD_ITEMS,
  PLAYER_HEALTH,
  PROTOCOL_VERSION,
  SIMULATION_RATE,
  SPAWN_YAW,
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
  DialogueView,
  EntityRef,
  GameEvent,
  GroundVector,
  HealEvent,
  HitEvent,
  InputProgress,
  ItemKindId,
  MapId,
  MonsterKindId,
  MonsterState,
  PlayerInput,
  PlayerMotion,
  PlayerState,
  ServerMessage,
  SlashJudgement,
  StampedInput,
  Villager,
  VillagerId,
  WorldItems,
} from '@clovervale/shared';

import type { Actor } from './actor.ts';
import { BackgroundMusic, MUSIC_FILE } from './background-music.ts';
import { createBagView } from './bag-view.ts';
import type { BagView } from './bag-view.ts';
import { keepFollowedPlayer, listCameraChoices } from './camera-choice.ts';
import { createCaveScene } from './cave-scene.ts';
import type { CaveScene } from './cave-scene.ts';
import { fetchClientConfig } from './client-config.ts';
import type { ClientConfig } from './client-config.ts';
import {
  CorrectionSmoothing,
  reconcileSmoothly,
} from './correction-smoothing.ts';
import { DayClock, findShownTime } from './day-clock.ts';
import type { DaylightLook } from './daylight.ts';
import { DialogueBox } from './dialogue-box.ts';
import type { DialogueRequest, DialogueResponse } from './dialogue-box.ts';
import { createDialogueView } from './dialogue-view.ts';
import type { DialogueBoxView } from './dialogue-view.ts';
import { EdwinCall, areDogsDead, isOnScreen } from './edwin-call.ts';
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
import { InventoryBag } from './inventory-bag.ts';
import type { BagResponse, ItemRequest } from './inventory-bag.ts';
import { ItemFigures } from './item-figures.ts';
import { createItemNotices, findGainedItems } from './item-notices.ts';
import type { ItemNotices } from './item-notices.ts';
import {
  chooseLanguage,
  findLanguageStorage,
  readSavedLanguage,
  saveLanguage,
} from './language.ts';
import type { LanguageCode, LanguageStorage } from './language.ts';
import { createMapFade } from './map-fade.ts';
import {
  FOUNTAIN_FILE,
  LYING_PITCHFORK_FILE,
  PITCHFORK_FILE,
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
import {
  MoveKeys,
  chooseSpaceInput,
  findKeyCommand,
} from './player-input.ts';
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
import { Translator, isMessageId } from './translator.ts';
import {
  createMonsterFigure,
  createPlayerFigure,
  createVillageScene,
  createVillagerFigure,
  populateVillage,
} from './village-scene.ts';
import { VILLAGE_LEAST_ELEVATION, showScene } from './viewport.ts';
import type { Viewport } from './viewport.ts';
import { describeVillager } from './villager-words.ts';
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
/** Edwin, the prisoner of the cave, as a villager. */
const EDWIN_VILLAGER: Villager | undefined = VILLAGERS.find(
  (villager: Villager) => villager.file === CAVE_EDWIN_FILE,
);
/** Martha, the village chief, who fights as a monster, as a villager. */
const MARTHA_VILLAGER: Villager | undefined = VILLAGERS.find(
  (villager: Villager) => villager.fighter !== undefined,
);

/**
 * The least angle the camera looks down at the player of the page in the
 * cave, in degrees, steep enough to look over the walls of the passage.
 */
const CAVE_LEAST_ELEVATION = 40;

/**
 * How far to her right Martha's pitchfork lies from her middle once she
 * has dropped it, beaten, in metres.
 */
const DROPPED_PITCHFORK_ASIDE = 0.6;

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
/** What there is to pick in the world, as the server last told. */
let worldItems: WorldItems | null = null;
/** What the player of the page carries, as the server last told. */
let inventory: readonly ItemKindId[] | null = null;
/**
 * The villagers who have told the player of the page who they are, as the
 * server last told.
 */
let acquaintances: readonly VillagerId[] = [];

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
/**
 * Martha's pitchfork as it leans against the wall of her house, once its
 * model has been loaded.
 */
let wallPitchfork: Object3D | null = null;
/**
 * Martha's pitchfork as it lies on the ground where she has dropped it,
 * once its model has been loaded.
 */
let lyingPitchfork: Object3D | null = null;

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
/** The monsters as they were last shown. */
let shownMonsters: readonly MonsterState[] = [];
/** The latest hits that have been shown, the latest last. */
const shownHits: HitEvent[] = [];
/** The latest heals that have been shown, the latest last. */
const shownHeals: HealEvent[] = [];

const panel: Panel = createPanel(translator, switchLanguage);
const music = new BackgroundMusic(new Audio(MUSIC_URL));
const prompt: Prompt = createPrompt(document.body);
/** The bag of the player of the page, which the person at the page opens. */
const bag = new InventoryBag();
const bagView: BagView = createBagView(
  document.body,
  translator,
  bag,
  (request: ItemRequest) => {
    carryOutItemAction(request);
  },
);
/** The dialogue the player of the page is in, and the reply chosen. */
const dialogueBox = new DialogueBox();
const dialogueView: DialogueBoxView = createDialogueView(
  document.body,
  translator,
  dialogueBox,
  (request: DialogueRequest) => {
    sendInput(request);
  },
);
/** The notices of the items the player of the page gets. */
const itemNotices: ItemNotices = createItemNotices(document.body, translator);
const { scene, daylight } = createVillageScene();
const cave: CaveScene = createCaveScene();
/** The map the player of the page is in, as the server last told. */
let shownMap: MapId = 'village';
/**
 * The map the server has told the player of the page is in from now on,
 * until the first snapshot of that map comes, or `null` while it has not.
 */
let comingMap: MapId | null = null;
/**
 * What stands wherever the player of the page is: the players, the
 * monsters, the items and the hits, which goes with it from map to map.
 */
const stage = new Group();
scene.add(stage);
const itemFigures = new ItemFigures(stage);
const outlines = createObstacleOutlines(VILLAGE_TERRAIN);
scene.add(outlines);
const caveOutlines = createObstacleOutlines(CAVE_TERRAIN);
cave.scene.add(caveOutlines);
const figures = new PlayerFigures(stage, (appearance: number) =>
  createPlayerFigure(models, appearance),
);
const monsterFigures = new MonsterFigures(stage, (kind: MonsterKindId) =>
  createMonsterFigure(models, kind),
);
const markers = new HitMarkers(stage);
const speech = new SpeechBubble(stage, translator);
/** What notices each talk of the player of the page to a villager. */
const talks = new TalkWatch();
/** What tells when Edwin calls out for help. */
const edwinCall = new EdwinCall();
const fade = createMapFade(document.body);
const viewport: Viewport = showScene(
  scene,
  findSpawnPoint(0),
  panel.trailingCamera,
  (seconds: number) => {
    sendMove();
    showPlayers();
    showTimeOfDay();
    outlines.visible = panel.obstacles.isShown;
    caveOutlines.visible = panel.obstacles.isShown;
    music.update(panel.music);
    for (const actor of actors) {
      actor.update(seconds);
    }
    cave.update(seconds);
    fountainGlow?.update(seconds);
    forgeGlow?.update(seconds);
    figures.update(seconds);
    // The monsters of the cave stand still while its player is in a
    // dialogue, as the server holds them.
    const isPaused: boolean = dialogueBox.isOpen && shownMap === 'cave';
    monsterFigures.update(isPaused ? 0 : seconds);
    markers.update(seconds);
    speech.update(seconds);
    showEdwinCall(seconds);
  },
);

// For looking at what the page shows, and at the latest snapshot it shows
// that from, from the console of the browser.
Object.defineProperty(window, 'clovervale', {
  value: {
    describeCamera: () => viewport.getFocus(),
    describeHeading: () => viewport.getHeading(),
    describeMap: () => shownMap,
    describeFigures: () => figures.describeFigures(),
    describeMonsters: () => monsterFigures.describeMonsters(),
    describeItems: () => itemFigures.describe(),
    describeContainers: () => cave.describeContainers(),
    listLatestPlayers: () => timeline.latest ?? [],
    listLatestMonsters: () => timeline.latestMonsters ?? [],
    listShownHits: () => [...shownHits],
    listShownHeals: () => [...shownHeals],
    describeSpeech: () => speech.describe(),
    describeDialogue: () => dialogueView.describe(),
    describeToby: () => toby?.describe() ?? null,
    describePitchfork: () => ({
      isOnWall: wallPitchfork?.visible ?? null,
      isOnGround: lyingPitchfork?.visible ?? null,
    }),
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
  cave.populate(models);
  itemFigures.useModels(models);
  windowGlow = new WindowGlow(scene);
  const child: Figure | null = createVillagerFigure(models, TOBY_FILE);
  if (child !== null) {
    scene.add(child.root);
    toby = new TobyFigure(child.root, child.clips);
  }
  wallPitchfork =
    models.find((model: LoadedModel) => model.file === PITCHFORK_FILE)
      ?.root ?? null;
  lyingPitchfork =
    models.find((model: LoadedModel) => model.file === LYING_PITCHFORK_FILE)
      ?.root ?? null;
  if (lyingPitchfork !== null) {
    lyingPitchfork.visible = false;
    lyingPitchfork.traverse((node: Object3D) => {
      node.castShadow = true;
    });
    scene.add(lyingPitchfork);
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
/**
 * What draws the player of the page gliding over its corrections, which
 * starts afresh in every map.
 */
let smoothing = new CorrectionSmoothing(panel.smoothing, panel.prediction);
/**
 * What draws the player of the page pushed out of the way of Toby while it
 * rests, before the server tells of it, which starts afresh in every map.
 */
let forecast = new PushForecast(
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
 * Carries out an action chosen in the menu of an item in the bag: a use has
 * the player of the page use the item of the slot, and a drop has it drop
 * the item at its feet, unless it is dead.  Whether anything comes of it is
 * for the server to decide, and shows once the server tells it.
 *
 * @param {ItemRequest} request - The action, and the slot of the item.
 */
function carryOutItemAction(request: ItemRequest): void {
  // The request of each action is its input.
  if (prediction?.motion.action !== 'Die') {
    sendInput({ type: request.action, slot: request.slot });
  }
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
    } else if ('kind' in shown && shown.kind === 'martha') {
      markers.show(shown, text, MONSTER_HIT_COLOUR);
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
 * starts to talk to a villager that chatters, as predicted, what the villager
 * says is shown above its head, and follows the head of Toby as he goes on and
 * squats, and that of Martha as she goes about.  Martha's pitchfork is shown
 * where it is, as {@link showPitchfork} tells.  The prompt is hidden while the
 * player is in a dialogue.
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
  const tobyStep: number | null = shownMap === 'village' ? shownStep : null;
  const drawn: PlayerMotion | null =
    prediction === null
      ? null
      : forecast.advance(prediction, smoothing, now, tobyStep);
  if (panel.prediction.isEnabled && drawn !== null && latest !== undefined) {
    const players: PlayerState[] = placeOwnPlayer(view.players, latest, drawn);
    view = { ...view, players };
  }
  if (shownStep !== null) {
    toby?.show(shownStep);
  }
  figures.showPlayers(view.players);
  monsterFigures.showMonsters(view.monsters);
  shownMonsters = view.monsters;
  showPitchfork(view.monsters);
  showEvents(view);
  panel.showDisplay(describeDisplay(ownId, timeline.latest, view));
  panel.showPrediction(describePrediction(translator, prediction));
  const predicted: PlayerMotion | null = prediction?.motion ?? null;
  // An interaction would start at the next step of the player.
  const nextStep: number = prediction?.readNextStep(now) ?? 0;
  const world: WorldItems = worldItems ?? NO_WORLD_ITEMS;
  const carried: readonly ItemKindId[] = inventory ?? [];
  const monsters: readonly MonsterState[] = timeline.latestMonsters ?? [];
  prompt.show(
    dialogueBox.isOpen
      ? null
      : describePrompt(
          translator,
          predicted,
          nextStep,
          world,
          carried,
          shownMap,
          monsters,
          acquaintances,
        ),
  );
  panel.showInteraction(
    describeSpaceKey(
      translator,
      predicted,
      nextStep,
      world,
      carried,
      shownMap,
      monsters,
      acquaintances,
    ),
  );
  const villager: Villager | null = talks.noticeTalk(
    predicted,
    prediction?.step ?? 0,
    shownMap,
    monsters,
  );
  // A villager with something to tell says what the server tells it to.
  if (
    villager !== null &&
    describeVillager(translator, villager).lines.length > 0
  ) {
    speech.say(villager, findShownHead(villager, shownStep ?? 0));
  }
  if (TOBY_VILLAGER !== undefined && shownStep !== null) {
    speech.follow(TOBY_VILLAGER, findShownHead(TOBY_VILLAGER, shownStep));
  }
  if (MARTHA_VILLAGER !== undefined) {
    speech.follow(MARTHA_VILLAGER, findShownHead(MARTHA_VILLAGER, 0));
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
 * Shows Martha's pitchfork where it is when she does not hold it: on the
 * ground at her right, lying the way she faces, while she sits beaten,
 * and against the wall of her house otherwise.
 *
 * @param {readonly MonsterState[]} monsters - The monsters as they are
 *   shown.
 */
function showPitchfork(monsters: readonly MonsterState[]): void {
  const martha: MonsterState | undefined = monsters.find(
    (monster: MonsterState) => monster.kind === 'martha',
  );
  const isArmed: boolean = martha?.isArmed === true;
  const isDropped: boolean = martha?.mode === 'sit' && !isArmed;
  if (wallPitchfork !== null) {
    wallPitchfork.visible = !isArmed && !isDropped;
  }
  if (lyingPitchfork === null) {
    return;
  }
  lyingPitchfork.visible = martha !== undefined && isDropped;
  if (martha !== undefined && isDropped) {
    const yaw: number = (martha.yaw * Math.PI) / 180;
    lyingPitchfork.position.set(
      martha.x - Math.cos(yaw) * DROPPED_PITCHFORK_ASIDE,
      0,
      martha.z + Math.sin(yaw) * DROPPED_PITCHFORK_ASIDE,
    );
    lyingPitchfork.rotation.y = yaw;
  }
}

/**
 * Finds the top of the head of a villager as it is shown, and of a
 * villager who fights as a monster where the monsters are shown.
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
  return findHeadTop(villager, model?.root ?? null, step, shownMonsters);
}

/**
 * Has Edwin call out for help in a bubble above his head whenever
 * {@link EdwinCall} tells he does, while the player of the page is in the
 * cave: once both dogs of the cave are dead, as long as he is on the
 * screen, not hidden by the rock of the cave, before he has told the
 * player who he is, and while the player is not in a dialogue.
 *
 * @param {number} seconds - The time since the last frame, in seconds.
 */
function showEdwinCall(seconds: number): void {
  const findRoot = (file: string): Object3D | null =>
    models.find((model: LoadedModel) => model.file === file)?.root ?? null;
  const figure: Object3D | null = findRoot(CAVE_EDWIN_FILE);
  const isCalling: boolean = edwinCall.update(seconds, {
    areDogsDead:
      ownId !== null &&
      shownMap === 'cave' &&
      areDogsDead(timeline.latestMonsters),
    isAcquainted: acquaintances.includes('edwin'),
    isInDialogue: dialogueBox.isOpen,
    isOnScreen: () =>
      figure !== null &&
      isOnScreen(viewport.getCamera(), figure, findRoot(CAVE_FILE)),
  });
  if (isCalling && EDWIN_VILLAGER !== undefined) {
    const step: number = prediction?.step ?? 0;
    speech.say(
      EDWIN_VILLAGER,
      findShownHead(EDWIN_VILLAGER, step),
      'villager.edwin.call',
    );
  }
}

/**
 * Shows the village, and the daylight at the mouth of the burrow in the
 * cave, as they look at the time of day the panel previews, or else at the
 * time of day of the world, and tells the time of day of the world in the
 * panel.  The preview is the page's alone: the server is
 * never told of it.
 */
function showTimeOfDay(): void {
  const worldTime: number | null = dayClock.read(performance.now());
  panel.state.timeOfDay = describeTimeOfDay(translator, worldTime);
  shownTime = findShownTime(worldTime, panel.timePreview) ?? shownTime;
  const look: DaylightLook = daylight.show(shownTime);
  windowGlow?.show(look.windows);
  cave.showTimeOfDay(shownTime);
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
  if (message.type === 'map') {
    comingMap = message.map;
    return;
  }
  if (message.type === 'snapshot') {
    if (ownId !== null) {
      const now: number = performance.now();
      const map: MapId | null = comingMap;
      comingMap = null;
      if (map !== null) {
        leaveMap();
      }
      timeline.addSnapshot(message, now);
      dayClock.observe(message.step, now);
      panel.camera.followedId = keepFollowedPlayer(
        panel.camera.followedId,
        message.players,
      );
      panel.offerCameraChoices(
        listCameraChoices(translator, ownId, message.players),
      );
      // The monsters tell whether the player slashes rather than talks.
      prediction?.noteMonsters(message.monsters);
      if (prediction === null) {
        prediction = new PlayerPrediction(
          message.own.motion,
          message.step,
          now,
          map ?? shownMap,
        );
        prediction.noteMonsters(message.monsters);
        if (map !== null) {
          showMap(map, message.own);
        }
      } else if (map !== null) {
        prediction.enterMap(map, message.own, message.step, now);
        showMap(map, message.own);
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
      worldItems = {
        clovers: message.clovers,
        items: message.items,
        looted: message.looted,
      };
      for (const kind of findGainedItems(inventory, message.inventory)) {
        itemNotices.show(kind);
      }
      inventory = message.inventory;
      itemFigures.show(worldItems);
      cave.showLooted(message.looted);
      const health: number =
        message.players.find((player: PlayerState) => player.id === ownId)
          ?.health ?? PLAYER_HEALTH;
      bagView.show(inventory, health);
      showDialogue(message.dialogue, message.acquaintances);
    }
    return;
  }
  if (message.type === 'speech') {
    const { line } = message;
    const villager: Villager | undefined = VILLAGERS.find(
      (candidate: Villager) => candidate.id === message.villager,
    );
    if (
      ownId !== null &&
      villager?.map === shownMap &&
      isMessageId(line) &&
      !dialogueBox.isOpen
    ) {
      const step: number = prediction?.step ?? 0;
      speech.say(villager, findShownHead(villager, step), line);
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
 * Shows the dialogue the player of the page is in, as the server tells,
 * with the villagers called by the names they go by once they have told the
 * player who they are.  As a dialogue opens, the bag closes, the bubble of
 * any villager is taken away, and the keys held down walk the player no
 * more.
 *
 * @param {DialogueView | null} dialogue - The dialogue, or `null` while
 *   the player is in none.
 * @param {readonly VillagerId[]} known - The villagers who have told the
 *   player who they are.
 */
function showDialogue(
  dialogue: DialogueView | null,
  known: readonly VillagerId[],
): void {
  const wasOpen: boolean = dialogueBox.isOpen;
  acquaintances = known;
  speech.noticeAcquaintances(known);
  dialogueView.show(dialogue, known);
  if (!dialogueBox.isOpen || wasOpen) {
    return;
  }
  speech.clear();
  if (bag.isOpen) {
    bag.clickIcon();
    bagView.render();
  }
  moveKeys.releaseAllKeys();
  sendMove();
}

/**
 * Forgets what the page was shown of the map the player of the page has
 * left, before it is shown the first snapshot of the map it is in now: the
 * snapshots, and with them the players and the monsters seen, the items on
 * the ground, the events yet to be shown, those shown, the numbers of the
 * hits and the heals still floating, and what a villager there was saying.  The items, the monsters and the
 * events of each map are numbered on their own, so that nothing of one map
 * is taken for something of another.
 */
function leaveMap(): void {
  timeline.clear();
  schedule.clear();
  shownHits.length = 0;
  shownHeals.length = 0;
  markers.clear();
  speech.clear();
  monsterFigures.showMonsters([]);
  shownMonsters = [];
  worldItems = null;
  itemFigures.show(null);
}

/**
 * Shows the map the player of the page is in now, as the first snapshot
 * there tells of the player.  The view darkens for a moment and shows that
 * map, with the camera at once on the player, looking the way it faces,
 * and down on it steeply, which it goes on doing in the cave, and the
 * players, the monsters, the items and the hits there.  The
 * corrections of the player and the pushes of Toby start afresh, without
 * gliding across from where the player was.
 *
 * @param {MapId} map - The map.
 * @param {InputProgress} own - How far the player had got with the inputs
 *   of the page, and the motion of the player there, as the snapshot tells.
 */
function showMap(map: MapId, own: InputProgress): void {
  shownMap = map;
  const shown: Scene = map === 'cave' ? cave.scene : scene;
  shown.add(stage);
  smoothing = new CorrectionSmoothing(panel.smoothing, panel.prediction);
  forecast = new PushForecast(
    panel.pushForecast,
    panel.smoothing,
    panel.prediction,
  );
  viewport.switchScene(
    shown,
    own.motion,
    own.motion.yaw,
    map === 'cave' ? CAVE_LEAST_ELEVATION : VILLAGE_LEAST_ELEVATION,
  );
  fade.darken();
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
    comingMap = null;
    // A page cut off in the cave shows the village from the plaza, facing
    // the fountain, as a page does before it connects.
    if (shownMap !== 'village') {
      scene.add(stage);
      shownMap = 'village';
      viewport.switchScene(
        scene,
        findSpawnPoint(0),
        SPAWN_YAW,
        VILLAGE_LEAST_ELEVATION,
      );
    }
    prediction = null;
    dayClock.reset();
    showServer(() => translator.translate('server.disconnected'));
    timeline.clear();
    schedule.clear();
    lastSlash = null;
    worldItems = null;
    inventory = null;
    itemFigures.show(null);
    bagView.show(null, PLAYER_HEALTH);
    showDialogue(null, []);
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
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  // The dialogue box takes every key while it is open, so that the player
  // neither moves nor does anything else.
  const answer: DialogueResponse = dialogueBox.pressKey(event.code);
  if (answer.isHandled) {
    event.preventDefault();
    if (answer.request !== null) {
      sendInput(answer.request);
    }
    dialogueView.render();
    return;
  }
  // The bag takes its keys first, so that while it is open the arrow keys,
  // Enter and Esc do nothing else; the keys of play go on working.
  const wasOpen: boolean = bag.isOpen;
  const response: BagResponse =
    event.repeat && event.code === 'KeyI'
      ? { isHandled: true, request: null }
      : bag.pressKey(event.code);
  if (response.isHandled) {
    event.preventDefault();
    if (response.request !== null) {
      carryOutItemAction(response.request);
    }
    if (bag.isOpen && !wasOpen) {
      // An arrow key held down as the bag opens walks the player no more.
      for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        moveKeys.releaseKey(code);
      }
      sendMove();
    }
    bagView.render();
    return;
  }
  const command: KeyCommand | null = findKeyCommand(event.code);
  if (command === null) {
    return;
  }
  event.preventDefault();
  if (command !== 'interact') {
    moveKeys.pressKey(event.code);
    sendMove();
    return;
  }
  // A dead player cannot interact, and is not to once it is back for a key
  // pressed while it was dead.
  if (
    event.repeat ||
    prediction === null ||
    prediction.motion.action === 'Die'
  ) {
    return;
  }
  // The space bar picks what the prompt tells it picks, as the page knows
  // it now; whether anything comes of it is for the server to decide.
  const step: number = prediction.readNextStep(performance.now());
  sendInput(
    chooseSpaceInput(
      prediction.motion,
      step,
      worldItems ?? NO_WORLD_ITEMS,
      shownMap,
      timeline.latestMonsters ?? [],
    ),
  );
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
