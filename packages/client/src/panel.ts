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
 * @module client/panel The settings panel of the client.
 */

import GUI from 'lil-gui';

import { DEFAULT_MUSIC_VOLUME } from './background-music.ts';
import type { MusicSettings } from './background-music.ts';
import type { CameraChoice } from './camera-choice.ts';
import { describeSpaceKey } from './interaction-prompt.ts';
import { DEFAULT_DELAY, MAX_DELAY } from './interpolation.ts';
import type { ModelProblem } from './model-report.ts';
import { MAX_NETWORK_DELAY } from './network-delay.ts';
import {
  describeDisplay,
  describeMonster,
  describePrediction,
  describeSlash,
  describeSnapshot,
} from './player-readout.ts';
import type {
  DisplayReadout,
  MonsterReadout,
  PlayerReadout,
  PredictionReadout,
  SlashReadout,
} from './player-readout.ts';

/** What the panel shows of the client itself. */
export interface PanelState {
  /** The status of the connection to the server. */
  server: string;
  /** How showing the models went. */
  models: string;
}

/** How the owner has the players shown. */
export interface InterpolationSettings {
  /**
   * Whether the players are shown moving smoothly, slightly in the past,
   * rather than exactly as the latest snapshot tells them.
   */
  isEnabled: boolean;
  /** How far in the past the players are then shown, in milliseconds. */
  delay: number;
}

/** How the owner has the player of the page shown. */
export interface PredictionSettings {
  /**
   * Whether the player of the page is shown as predicted, rather than as
   * the snapshots tell it, like every other player.
   */
  isEnabled: boolean;
}

/** The connection the owner has the page pretend to have. */
export interface NetworkSettings {
  /**
   * How long every message of the page is held back for, each way, in
   * milliseconds.
   */
  delay: number;
}

/** How the owner has the slashes of the player of the page judged. */
export interface CompensationSettings {
  /**
   * Whether the page asks the server to judge each slash of its player on
   * the world as the page showed it when the slash started, rather than on
   * the world as it is when the slash starts on the server.
   */
  isEnabled: boolean;
}

/** What the owner has drawn to see what the rules of the game use. */
export interface ObstacleSettings {
  /**
   * Whether the outlines of the obstacles and of the boundary of the
   * village are drawn on the ground.
   */
  isShown: boolean;
}

/** Where the owner has the camera. */
export interface CameraSettings {
  /**
   * The identifier of the player the camera follows, or `null` for the
   * player of the page.
   */
  followedId: number | null;
}

/** The settings panel of the client. */
export interface Panel {
  /** What the panel shows of the client itself. */
  readonly state: PanelState;
  /** How the owner has the players shown, as the panel is set now. */
  readonly interpolation: Readonly<InterpolationSettings>;
  /** How the owner has the player of the page shown, as set now. */
  readonly prediction: Readonly<PredictionSettings>;
  /** The connection the page pretends to have, as set now. */
  readonly network: Readonly<NetworkSettings>;
  /** How the owner has the slashes judged, as set now. */
  readonly compensation: Readonly<CompensationSettings>;
  /** What the owner has drawn of the obstacles, as set now. */
  readonly obstacles: Readonly<ObstacleSettings>;
  /**
   * Where the owner has the camera, as set now, which the page changes
   * when the player it follows is gone.
   */
  readonly camera: CameraSettings;
  /** How the owner has the music played, as set now. */
  readonly music: Readonly<MusicSettings>;
  /**
   * Offers the owner the players the camera can follow.
   *
   * @param {readonly CameraChoice[]} choices - The players, in the order
   *   offered.
   */
  readonly offerCameraChoices: (choices: readonly CameraChoice[]) => void;
  /**
   * Shows what is synchronised with the server, for the owner to see.
   *
   * @param {PlayerReadout} readout - What the owner reads.
   */
  readonly showReadout: (readout: PlayerReadout) => void;
  /**
   * Shows the monster as the latest snapshot tells it, for the owner to
   * see.
   *
   * @param {MonsterReadout} readout - What the owner reads.
   */
  readonly showMonster: (readout: MonsterReadout) => void;
  /**
   * Shows how the player of the page is shown, for the owner to compare
   * with what is synchronised.
   *
   * @param {DisplayReadout} readout - What the owner reads.
   */
  readonly showDisplay: (readout: DisplayReadout) => void;
  /**
   * Shows what is predicted of the player of the page, for the owner to
   * compare with what is synchronised and with what is shown.
   *
   * @param {PredictionReadout} readout - What the owner reads.
   */
  readonly showPrediction: (readout: PredictionReadout) => void;
  /**
   * Shows what the space bar makes the player of the page do now, as
   * predicted, for the owner to see.
   *
   * @param {string} interaction - What it makes the player do.
   */
  readonly showInteraction: (interaction: string) => void;
  /**
   * Shows how the server judged the latest slash of the player of the page,
   * for the owner to compare with what was shown.
   *
   * @param {SlashReadout} readout - What the owner reads.
   */
  readonly showSlash: (readout: SlashReadout) => void;
  /**
   * Lists the models that cannot be shown, for the owner to see.
   *
   * @param {readonly ModelProblem[]} problems - The models that cannot be
   *   shown.
   */
  readonly listProblems: (problems: readonly ModelProblem[]) => void;
}

/** The names of the values of the readout, in the order they are shown. */
const READOUT_NAMES: readonly [keyof PlayerReadout, string][] = [
  ['player', 'Player'],
  ['players', 'Players'],
  ['position', 'Position'],
  ['yaw', 'Yaw'],
  ['action', 'Action'],
  ['health', 'Health'],
];

/** The names of the values of the monster, in the order they are shown. */
const MONSTER_NAMES: readonly [keyof MonsterReadout, string][] = [
  ['mode', 'Monster'],
  ['action', 'Monster action'],
  ['health', 'Monster health'],
  ['position', 'Monster at'],
];

/** The names of the values of the prediction, in the order shown. */
const PREDICTION_NAMES: readonly [keyof PredictionReadout, string][] = [
  ['predicted', 'Predicted'],
  ['corrections', 'Corrections'],
];

/** The names of the values of the display, in the order they are shown. */
const DISPLAY_NAMES: readonly [keyof DisplayReadout, string][] = [
  ['drawnAt', 'Drawn at'],
  ['behind', 'Behind'],
];

/** The names of the values of the latest slash, in the order shown. */
const SLASH_NAMES: readonly [keyof SlashReadout, string][] = [
  ['result', 'Result'],
  ['judgedBack', 'Judged back'],
];

/** The step of the delays the owner sets, in milliseconds. */
const DELAY_STEP = 10;
/** The step of the volume of the music the owner sets. */
const VOLUME_STEP = 0.05;

/**
 * Creates the settings panel, which starts with nothing synchronised yet,
 * with the player of the page to be shown as predicted, the other players
 * smoothly, by the default delay, no message held back, the slashes judged
 * on the world as the page showed it, the camera on the player of the page,
 * no outlines of the obstacles, and the music on at its default volume.
 *
 * @returns {Panel} The panel.
 */
export function createPanel(): Panel {
  const state: PanelState = { server: 'connecting', models: 'loading' };
  const interpolation: InterpolationSettings = {
    isEnabled: true,
    delay: DEFAULT_DELAY,
  };
  const prediction: PredictionSettings = { isEnabled: true };
  const network: NetworkSettings = { delay: 0 };
  const compensation: CompensationSettings = { isEnabled: true };
  const obstacles: ObstacleSettings = { isShown: false };
  const camera: CameraSettings = { followedId: null };
  const music: MusicSettings = {
    isEnabled: true,
    volume: DEFAULT_MUSIC_VOLUME,
  };
  const predicted: Record<keyof PredictionReadout, string> = {
    ...describePrediction(null),
  };
  const spaceKey: { interaction: string } = {
    interaction: describeSpaceKey(null),
  };
  const slash: Record<keyof SlashReadout, string> = {
    ...describeSlash(null),
  };
  const shown: Record<keyof PlayerReadout, string> = {
    ...describeSnapshot(null, null),
  };
  const display: Record<keyof DisplayReadout, string> = {
    ...describeDisplay(null, null, {
      players: [],
      monsters: [],
      lag: 0,
      time: null,
    }),
  };
  const monster: Record<keyof MonsterReadout, string> = {
    ...describeMonster(null),
  };
  // The style sheet of the panel is part of the style sheet of the client.
  const gui = new GUI({ title: 'Clovervale', injectStyles: false });
  gui.add(state, 'server').name('Server').disable().listen();
  gui.add(state, 'models').name('Models').disable().listen();
  const cameraControl = gui
    .add(camera, 'followedId', { 'Own player': null })
    .name('Camera on')
    .listen();
  gui.add(prediction, 'isEnabled').name('Predict');
  gui
    .add(network, 'delay', 0, MAX_NETWORK_DELAY, DELAY_STEP)
    .name('Net delay (ms)');
  gui.add(interpolation, 'isEnabled').name('Interpolate');
  gui
    .add(interpolation, 'delay', 0, MAX_DELAY, DELAY_STEP)
    .name('Delay (ms)');
  gui.add(compensation, 'isEnabled').name('Compensate lag');
  gui.add(obstacles, 'isShown').name('Show obstacles');
  gui.add(music, 'isEnabled').name('Music');
  gui.add(music, 'volume', 0, 1, VOLUME_STEP).name('Music volume');
  // The panel keeps the keys from the game while a control of it is in use.
  gui.onFinishChange(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  const folder: GUI = gui.addFolder('Latest snapshot');
  for (const [key, name] of READOUT_NAMES) {
    folder.add(shown, key).name(name).disable().listen();
  }
  const monsterFolder: GUI = gui.addFolder('Monster');
  for (const [key, name] of MONSTER_NAMES) {
    monsterFolder.add(monster, key).name(name).disable().listen();
  }
  const predictionFolder: GUI = gui.addFolder('Prediction');
  for (const [key, name] of PREDICTION_NAMES) {
    predictionFolder.add(predicted, key).name(name).disable().listen();
  }
  predictionFolder
    .add(spaceKey, 'interaction')
    .name('Space key')
    .disable()
    .listen();
  const displayFolder: GUI = gui.addFolder('Displayed');
  for (const [key, name] of DISPLAY_NAMES) {
    displayFolder.add(display, key).name(name).disable().listen();
  }
  const slashFolder: GUI = gui.addFolder('Last slash');
  for (const [key, name] of SLASH_NAMES) {
    slashFolder.add(slash, key).name(name).disable().listen();
  }

  const showReadout = (readout: PlayerReadout): void => {
    Object.assign(shown, readout);
  };
  const showMonster = (readout: MonsterReadout): void => {
    Object.assign(monster, readout);
  };
  const showDisplay = (readout: DisplayReadout): void => {
    Object.assign(display, readout);
  };
  const showPrediction = (readout: PredictionReadout): void => {
    Object.assign(predicted, readout);
  };
  const showInteraction = (interaction: string): void => {
    spaceKey.interaction = interaction;
  };
  const showSlash = (readout: SlashReadout): void => {
    Object.assign(slash, readout);
  };
  let offered = '';
  const offerCameraChoices = (choices: readonly CameraChoice[]): void => {
    // Offering the same choices again would close the list as it is open.
    const next: string = JSON.stringify(choices);
    if (next === offered) {
      return;
    }
    offered = next;
    cameraControl.options(
      Object.fromEntries(
        choices.map(({ name, playerId }: CameraChoice) => [name, playerId]),
      ),
    );
  };
  const listProblems = (problems: readonly ModelProblem[]): void => {
    if (problems.length === 0) {
      return;
    }
    const folder: GUI = gui.addFolder('Model problems');
    for (const problem of problems) {
      const entry = folder.add(problem, 'reason').name(problem.file).disable();
      // The panel is too narrow for a long reason.
      entry.domElement.title = `${problem.file}: ${problem.reason}`;
    }
  };
  return {
    state,
    interpolation,
    prediction,
    network,
    compensation,
    obstacles,
    camera,
    music,
    offerCameraChoices,
    showReadout,
    showMonster,
    showDisplay,
    showPrediction,
    showInteraction,
    showSlash,
    listProblems,
  };
}
