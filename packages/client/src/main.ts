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
import type { Object3D } from 'three';

import { HOME_MAP, WORLD_MAPS, findSpawnPoint } from '@clovervale/shared';
import type {
  MapId,
  MonsterKindId,
  PlayerInput,
  WorldMap,
} from '@clovervale/shared';

import {
  BackgroundMusic,
  MUSIC_FILE,
  listenForSoundGestures,
} from './background-music.ts';
import { createCaveScene } from './cave-scene.ts';
import type { CaveScene } from './cave-scene.ts';
import { fetchClientConfig } from './client-config.ts';
import type { ClientConfig } from './client-config.ts';
import { DayClock } from './day-clock.ts';
import { exposeDebugHook } from './debug-hook.ts';
import { EdwinFigure } from './edwin-figure.ts';
import { createMonsterFigure, createPlayerFigure } from './figure-copies.ts';
import { GameSession } from './game-session.ts';
import { createItemNotices } from './item-notices.ts';
import type { ItemNotices } from './item-notices.ts';
import { chooseLanguage, readSavedLanguage, saveLanguage } from './language.ts';
import type { LanguageCode } from './language.ts';
import { createMapFade } from './map-fade.ts';
import type { MapScene } from './map-scene.ts';
import { MapStage } from './map-stage.ts';
import { MarthaFigure } from './martha-figure.ts';
import { ModelLibrary } from './model-library.ts';
import type { ModelProblem } from './model-report.ts';
import { createObstacleOutlines } from './obstacle-outlines.ts';
import { OwnPlayer } from './own-player.ts';
import { findPageStorage } from './page-storage.ts';
import type { PageStorage } from './page-storage.ts';
import { createPanel } from './panel.ts';
import type { Panel } from './panel.ts';
import { PanelReadouts } from './panel-readouts.ts';
import { PlayControls } from './play-controls.ts';
import { PlayerRecord } from './player-record.ts';
import { ServerLink } from './server-link.ts';
import { resolveServerUrl } from './server-url.ts';
import { createSettings } from './settings.ts';
import type { ClientSettings } from './settings.ts';
import { SpeechBubble } from './speech-bubble.ts';
import { StoryFigures } from './story-figures.ts';
import './style.css';
import { TobyFigure } from './toby-figure.ts';
import { Translator } from './translator.ts';
import type { FigureContext } from './villager-figure.ts';
import { createVillageScene } from './village-scene.ts';
import type { VillageScene } from './village-scene.ts';
import { showScene } from './viewport.ts';
import type { Viewport } from './viewport.ts';

/** The URL of the directory of the models, relative to the page. */
const MODELS_URL = `${import.meta.env.BASE_URL}models/`;
/** The URL of the music of the village, relative to the page. */
const MUSIC_URL = `${import.meta.env.BASE_URL}music/${MUSIC_FILE}`;

/**
 * Where the browser lets the page remember the language chosen, and whether
 * the help sheet has been opened before.
 */
const storage: PageStorage | null = findPageStorage();
/** The translator of the text of the page into the language it speaks. */
const translator = new Translator();
// The page speaks English if the language chosen cannot be loaded.
await translator.choose(
  chooseLanguage(readSavedLanguage(storage), navigator.languages),
);

/** What the server has told the page of its player and of the world. */
const record = new PlayerRecord();
/** The models the page shows, once they have been loaded. */
const models = new ModelLibrary();
/** The time of day of the world, as the page reckons it. */
const dayClock = new DayClock();
/** The settings the client runs by. */
const settings: ClientSettings = createSettings();
const panel: Panel = createPanel(settings, translator, switchLanguage);
/** The player of the page as the page draws it. */
const ownPlayer = new OwnPlayer(settings);
/** The connection to the game server, once the page has opened it. */
const link = new ServerLink(settings.network, (data: string) => {
  session.receiveMessage(data);
});
const music = new BackgroundMusic(new Audio(MUSIC_URL));
/** The controls of play, and the sheets and the boxes over play. */
const controls: PlayControls = new PlayControls(
  document.body,
  translator,
  storage,
  {
    sendInput: (input: PlayerInput): boolean => session.sendInput(input),
    sayLine: (line: string) => {
      session.sayLine(line);
    },
    hasPlayer: () => record.playerId !== null,
    isPlayerDead: () => ownPlayer.prediction?.motion.action === 'Die',
    findSpaceInput: (): PlayerInput | null => session.findSpaceInput(),
    allowMusic: () => {
      music.allow(settings.music);
    },
    readHeading: () => viewport.getHeading(),
    zoom: (factor: number) => {
      viewport.zoom(factor);
    },
  },
);
/** The notices of the items and the silver coins the player gets. */
const itemNotices: ItemNotices = createItemNotices(document.body, translator);
const village: VillageScene = createVillageScene();
const cave: CaveScene = createCaveScene();
/** Each map, as it is shown whoever is connected. */
const scenes: Readonly<Record<MapId, MapScene>> = { village, cave };
/** What goes with the player of the page from map to map. */
const stageRoot = new Group();
/** The bubbles of what the villagers and the players say. */
const speech = new SpeechBubble(stageRoot, translator);
/** What the figures of the villagers are shown with. */
const figureContext: FigureContext = {
  models,
  speech,
  record,
  readViewport: () => viewport,
  isInDialogue: () => controls.isInDialogue,
};
/** Toby, as the page shows him. */
const toby = new TobyFigure(figureContext);
/** Martha, as the page shows her, with her pitchfork. */
const martha = new MarthaFigure(figureContext);
/** The villagers as the story has them shown. */
const story = new StoryFigures(figureContext, translator, [
  toby,
  martha,
  new EdwinFigure(figureContext),
]);
/** What stands wherever the player of the page is, and the map it is in. */
const stage = new MapStage({
  scenes,
  fade: createMapFade(document.body),
  root: stageRoot,
  speech,
  createPlayer: (appearance: number) =>
    createPlayerFigure(models.models, appearance),
  createMonster: (kind: MonsterKindId) =>
    createMonsterFigure(models.models, kind),
  others: [story],
  readViewport: () => viewport,
});
/** The outlines of the obstacles of every map, each standing in its map. */
const outlines: Object3D[] = Object.values(WORLD_MAPS).map(
  (map: WorldMap): Object3D => {
    const outline: Object3D = createObstacleOutlines(map.terrain);
    scenes[map.id].scene.add(outline);
    return outline;
  },
);
/** What the settings panel reads out of the play of the page. */
const readouts = new PanelReadouts(panel, translator, record);
const viewport: Viewport = showScene(
  scenes[HOME_MAP].scene,
  findSpawnPoint(0),
  settings.trailingCamera,
  controls.cameraHolds,
  (seconds: number) => {
    session.showFrame(seconds);
  },
);
/** The play of the page with the game server. */
const session: GameSession = new GameSession({
  translator,
  settings,
  readouts,
  record,
  ownPlayer,
  link,
  stage,
  scenes,
  story,
  controls,
  itemNotices,
  music,
  dayClock,
  outlines,
  showLooted: cave.showLooted,
  readViewport: () => viewport,
});

/** Draws the bubbles above the villagers at the size for the view. */
const fitSpeechToView = (): void => {
  stage.speech.fitView(
    window.innerWidth,
    window.innerHeight,
    viewport.getCamera().fov,
  );
};
window.addEventListener('resize', fitSpeechToView);
fitSpeechToView();

exposeDebugHook({
  viewport,
  stage,
  cave,
  controls,
  toby,
  martha,
  dayClock,
  readShownTime: () => session.shownTime,
});

/**
 * Shows the available models in every map, and reports those that cannot
 * be shown in the panel.
 *
 * @returns {Promise<void>} A promise settled once the models are shown.
 */
async function showModels(): Promise<void> {
  const problems: ModelProblem[] = await models.load(MODELS_URL);
  for (const scene of Object.values(scenes)) {
    scene.populate(models.models);
  }
  stage.figures.useItemModels(models.models);
  story.useModels(village.scene);
  readouts.showModels(models.models.length, problems);
}

void showModels();

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
    saveLanguage(storage, code);
  }
}

/**
 * Pauses the music if the page is hidden, or resumes it as the settings
 * have it if the page is shown.
 */
function followPageVisibility(): void {
  if (document.visibilityState === 'hidden') {
    music.hide();
  } else {
    music.show(settings.music);
  }
}

/**
 * Connects to the game server of the page, which the settings of the site
 * or the page address may name.  An address that names no server a page
 * can connect to leaves the page disconnected, as a failed connection does.
 *
 * @returns {Promise<void>} A promise settled once the page is connecting,
 *   or is disconnected.
 */
async function connectToServer(): Promise<void> {
  const config: ClientConfig = await fetchClientConfig(
    import.meta.env.BASE_URL,
  );
  const showDisconnected = (): void => {
    session.showDisconnected();
  };
  try {
    link.connect(
      resolveServerUrl(new URL(window.location.href), config.serverUrl),
      showDisconnected,
    );
  } catch {
    showDisconnected();
  }
}

void connectToServer();

session.relabel();
translator.addListener(() => {
  session.relabel();
});

controls.listen(window);
// The browser lets the page make sound only once the user has pressed
// something on it.
listenForSoundGestures(window, () => {
  music.allow(settings.music);
});
followPageVisibility();
document.addEventListener('visibilitychange', followPageVisibility);
