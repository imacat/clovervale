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

import GUI, { NumberController } from 'lil-gui';
import type { Controller } from 'lil-gui';

import { DEFAULT_MUSIC_VOLUME } from './background-music.ts';
import type { MusicSettings } from './background-music.ts';
import type { CameraChoice } from './camera-choice.ts';
import { describeHour, parseHour } from './day-clock.ts';
import type { TimePreviewSettings } from './day-clock.ts';
import { describeSpaceKey } from './interaction-prompt.ts';
import { DEFAULT_DELAY, MAX_DELAY } from './interpolation.ts';
import { LANGUAGES } from './language.ts';
import type { Language, LanguageCode } from './language.ts';
import type { PlainMessageId } from './messages/en.ts';
import { explainProblem } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';
import { MAX_NETWORK_DELAY } from './network-delay.ts';
import {
  describeDisplay,
  describeMonster,
  describePrediction,
  describeSlash,
  describeSnapshot,
  describeTimeOfDay,
} from './player-readout.ts';
import type {
  DisplayReadout,
  MonsterReadout,
  PlayerReadout,
  PredictionReadout,
  SlashReadout,
} from './player-readout.ts';
import type { Translator } from './translator.ts';

/** What the panel shows of the client itself. */
export interface PanelState {
  /** The status of the connection to the server. */
  server: string;
  /** How showing the models went. */
  models: string;
  /** The time of day of the world. */
  timeOfDay: string;
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
  /** The time of day the owner previews, as set now. */
  readonly timePreview: Readonly<TimePreviewSettings>;
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
const READOUT_NAMES: readonly [keyof PlayerReadout, PlainMessageId][] = [
  ['player', 'panel.player'],
  ['players', 'panel.players'],
  ['position', 'panel.position'],
  ['yaw', 'panel.yaw'],
  ['action', 'panel.action'],
  ['health', 'panel.health'],
];

/** The names of the values of the monster, in the order they are shown. */
const MONSTER_NAMES: readonly [keyof MonsterReadout, PlainMessageId][] = [
  ['mode', 'panel.monsterMode'],
  ['action', 'panel.monsterAction'],
  ['health', 'panel.monsterHealth'],
  ['position', 'panel.monsterAt'],
];

/** The names of the values of the prediction, in the order shown. */
const PREDICTION_NAMES: readonly [
  keyof PredictionReadout,
  PlainMessageId,
][] = [
  ['predicted', 'panel.predicted'],
  ['corrections', 'panel.corrections'],
];

/** The names of the values of the display, in the order they are shown. */
const DISPLAY_NAMES: readonly [keyof DisplayReadout, PlainMessageId][] = [
  ['drawnAt', 'panel.drawnAt'],
  ['behind', 'panel.behind'],
];

/** The names of the values of the latest slash, in the order shown. */
const SLASH_NAMES: readonly [keyof SlashReadout, PlainMessageId][] = [
  ['result', 'panel.result'],
  ['judgedBack', 'panel.judgedBack'],
];

/** The step of the delays the owner sets, in milliseconds. */
const DELAY_STEP = 10;
/** The step of the volume of the music the owner sets. */
const VOLUME_STEP = 0.05;
/** The step of the hour the owner previews, in hours: three minutes. */
const HOUR_STEP = 0.05;

/**
 * Has a number control of hours show its hour as hours and minutes on a
 * 24-hour clock, such as `13:55`, rather than as a number, and take an
 * hour typed so, or as a whole hour alone.  Its slider, its arrow keys and
 * its wheel go on stepping the hour as before.
 *
 * @param {NumberController} control - The control.
 */
function showHourAsClock(control: NumberController): void {
  const input: HTMLInputElement = control.$input;
  // A field for numbers alone, as on a touch screen, cannot hold a clock.
  input.type = 'text';
  input.removeAttribute('step');
  const showClock = (): void => {
    input.value = describeHour(Number(control.getValue()));
  };
  const stepHour = (delta: number): void => {
    control._snapClampSetValue(Number(control.getValue()) + delta);
    showClock();
  };
  const updateDisplay = control.updateDisplay.bind(control);
  control.updateDisplay = (): NumberController => {
    updateDisplay();
    if (!control._inputFocused) {
      showClock();
    }
    return control;
  };
  // The control itself reads its field as a number, so the field is kept
  // from it, before it gets there.
  const options: AddEventListenerOptions = { capture: true };
  control.domElement.addEventListener(
    'input',
    (event: Event) => {
      if (event.target !== input) {
        return;
      }
      event.stopPropagation();
      const hour: number | null = parseHour(input.value);
      if (hour !== null) {
        control._snapClampSetValue(hour);
      }
    },
    options,
  );
  control.domElement.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (
        event.target !== input ||
        (event.code !== 'ArrowUp' && event.code !== 'ArrowDown')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const direction: number = event.code === 'ArrowUp' ? 1 : -1;
      stepHour(direction * HOUR_STEP * control._arrowKeyMultiplier(event));
    },
    options,
  );
  control.domElement.addEventListener(
    'wheel',
    (event: WheelEvent) => {
      if (event.target !== input || !control._inputFocused) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      stepHour(HOUR_STEP * Number(control._normalizeMouseWheel(event)));
    },
    { capture: true, passive: false },
  );
  // The wheel over the slider writes the hour into the field as a number.
  control.$slider.addEventListener('wheel', showClock);
  showClock();
}

/**
 * Creates the settings panel, in the language of the page, which starts
 * with nothing synchronised yet, with the player of the page to be shown
 * as predicted, the other players smoothly, by the default delay, no
 * message held back, the slashes judged on the world as the page showed
 * it, the camera on the player of the page, no outlines of the obstacles,
 * the time of day of the world, with midnight ready to preview, and the
 * music on at its default volume.  The panel names everything in
 * it again in each language the page comes to speak.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {(code: LanguageCode) => Promise<void>} chooseLanguage - Has the
 *   page speak the language the owner chooses in the panel, settled once
 *   it does, or once it cannot.
 * @returns {Panel} The panel.
 */
export function createPanel(
  translator: Translator,
  chooseLanguage: (code: LanguageCode) => Promise<void>,
): Panel {
  const state: PanelState = {
    server: translator.translate('server.connecting'),
    models: translator.translate('models.loading'),
    timeOfDay: describeTimeOfDay(translator, null),
  };
  const interpolation: InterpolationSettings = {
    isEnabled: true,
    delay: DEFAULT_DELAY,
  };
  const prediction: PredictionSettings = { isEnabled: true };
  const network: NetworkSettings = { delay: 0 };
  const compensation: CompensationSettings = { isEnabled: true };
  const obstacles: ObstacleSettings = { isShown: false };
  const timePreview: TimePreviewSettings = { isEnabled: false, hour: 0 };
  const camera: CameraSettings = { followedId: null };
  const music: MusicSettings = {
    isEnabled: true,
    volume: DEFAULT_MUSIC_VOLUME,
  };
  const predicted: Record<keyof PredictionReadout, string> = {
    ...describePrediction(translator, null),
  };
  const spaceKey: { interaction: string } = {
    interaction: describeSpaceKey(translator, null),
  };
  const slash: Record<keyof SlashReadout, string> = {
    ...describeSlash(translator, null),
  };
  const shown: Record<keyof PlayerReadout, string> = {
    ...describeSnapshot(translator, null, null),
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
    ...describeMonster(translator, null),
  };
  const languageChoice: { code: LanguageCode } = {
    code: translator.language,
  };
  /** What names everything in the panel again in another language. */
  const relabels: (() => void)[] = [];
  const name = <T extends Controller>(control: T, id: PlainMessageId): T => {
    const relabel = (): void => {
      control.name(translator.translate(id));
    };
    relabel();
    relabels.push(relabel);
    return control;
  };
  const addFolder = (parent: GUI, id: PlainMessageId): GUI => {
    const folder: GUI = parent.addFolder(translator.translate(id));
    relabels.push(() => {
      folder.title(translator.translate(id));
    });
    return folder;
  };
  // The style sheet of the panel is part of the style sheet of the client.
  const gui = new GUI({
    title: translator.translate('title'),
    injectStyles: false,
  });
  relabels.push(() => {
    gui.title(translator.translate('title'));
  });
  name(gui.add(state, 'server'), 'panel.server').disable().listen();
  name(gui.add(state, 'models'), 'panel.models').disable().listen();
  name(gui.add(state, 'timeOfDay'), 'panel.timeOfDay').disable().listen();
  const cameraControl = name(
    gui.add(camera, 'followedId', {
      [translator.translate('camera.own')]: null,
    }),
    'panel.camera',
  ).listen();
  name(gui.add(prediction, 'isEnabled'), 'panel.predict');
  name(
    gui.add(network, 'delay', 0, MAX_NETWORK_DELAY, DELAY_STEP),
    'panel.netDelay',
  );
  name(gui.add(interpolation, 'isEnabled'), 'panel.interpolate');
  name(
    gui.add(interpolation, 'delay', 0, MAX_DELAY, DELAY_STEP),
    'panel.delay',
  );
  name(gui.add(compensation, 'isEnabled'), 'panel.compensate');
  name(gui.add(obstacles, 'isShown'), 'panel.obstacles');
  name(gui.add(timePreview, 'isEnabled'), 'panel.previewTime');
  const hourControl: Controller = gui.add(
    timePreview,
    'hour',
    0,
    24,
    HOUR_STEP,
  );
  if (hourControl instanceof NumberController) {
    showHourAsClock(hourControl);
  }
  name(hourControl, 'panel.previewHour');
  name(gui.add(music, 'isEnabled'), 'panel.music');
  name(gui.add(music, 'volume', 0, 1, VOLUME_STEP), 'panel.volume');
  const languageControl = name(
    gui.add(
      languageChoice,
      'code',
      Object.fromEntries(
        LANGUAGES.map((language: Language) => [language.name, language.code]),
      ),
    ),
    'panel.language',
  );
  const showLanguage = (): void => {
    languageChoice.code = translator.language;
    languageControl.updateDisplay();
  };
  languageControl.onChange((value: unknown) => {
    const chosen: Language | undefined = LANGUAGES.find(
      (language: Language) => language.code === value,
    );
    if (chosen !== undefined) {
      // The choice goes back to the language spoken if it cannot be had.
      void chooseLanguage(chosen.code).finally(showLanguage);
    }
  });
  // The panel keeps the keys from the game while a control of it is in use.
  gui.onFinishChange(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  const folder: GUI = addFolder(gui, 'panel.snapshot');
  for (const [key, id] of READOUT_NAMES) {
    name(folder.add(shown, key), id).disable().listen();
  }
  const monsterFolder: GUI = addFolder(gui, 'panel.monster');
  for (const [key, id] of MONSTER_NAMES) {
    name(monsterFolder.add(monster, key), id).disable().listen();
  }
  const predictionFolder: GUI = addFolder(gui, 'panel.prediction');
  for (const [key, id] of PREDICTION_NAMES) {
    name(predictionFolder.add(predicted, key), id).disable().listen();
  }
  name(predictionFolder.add(spaceKey, 'interaction'), 'panel.spaceKey')
    .disable()
    .listen();
  const displayFolder: GUI = addFolder(gui, 'panel.displayed');
  for (const [key, id] of DISPLAY_NAMES) {
    name(displayFolder.add(display, key), id).disable().listen();
  }
  const slashFolder: GUI = addFolder(gui, 'panel.lastSlash');
  for (const [key, id] of SLASH_NAMES) {
    name(slashFolder.add(slash, key), id).disable().listen();
  }
  translator.addListener(() => {
    for (const relabel of relabels) {
      relabel();
    }
    showLanguage();
  });

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
    const folder: GUI = addFolder(gui, 'panel.modelProblems');
    for (const problem of problems) {
      const shownProblem: { reason: string } = { reason: '' };
      const entry = folder
        .add(shownProblem, 'reason')
        .name(problem.file)
        .disable();
      const relabel = (): void => {
        shownProblem.reason = explainProblem(translator, problem);
        entry.updateDisplay();
        // The panel is too narrow for a long reason.
        entry.domElement.title = `${problem.file}: ${shownProblem.reason}`;
      };
      relabel();
      relabels.push(relabel);
    }
  };
  return {
    state,
    interpolation,
    prediction,
    network,
    compensation,
    obstacles,
    timePreview,
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
