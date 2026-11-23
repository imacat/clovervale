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
 * @module client/panel The settings panel of the client, which shows the
 *   settings the client runs by for the owner to change, and what the
 *   client reads out.
 */

import GUI from 'lil-gui';
import type { Controller } from 'lil-gui';

import type { CameraChoice } from './camera-choice.ts';
import { addHourControl } from './hour-control.ts';
import type { HourControl } from './hour-control.ts';
import { MAX_DELAY } from './interpolation.ts';
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
import type { ClientSettings } from './settings.ts';
import { describeSpaceKey } from './space-words.ts';
import {
  MAX_ANGLE_LIMIT,
  MAX_DEAD_ZONE,
  MAX_EASE_TIME,
  MAX_RECENTER_DELAY,
  MAX_TURN_RATE,
} from './trailing-camera.ts';
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

/** The settings panel of the client. */
export interface Panel {
  /** What the panel shows of the client itself. */
  readonly state: PanelState;
  /**
   * Offers the owner the players the camera can follow.
   *
   * @param {readonly CameraChoice[]} choices - The players, in the order
   *   offered.
   */
  readonly offerCameraChoices: (choices: readonly CameraChoice[]) => void;
  /**
   * Shows what is synchronized with the server, for the owner to see.
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
   * with what is synchronized.
   *
   * @param {DisplayReadout} readout - What the owner reads.
   */
  readonly showDisplay: (readout: DisplayReadout) => void;
  /**
   * Shows what is predicted of the player of the page, for the owner to
   * compare with what is synchronized and with what is shown.
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
/** The step of the angles of the camera the owner sets, in degrees. */
const ANGLE_STEP = 1;
/** The step of the times of the camera the owner sets, in seconds. */
const CAMERA_TIME_STEP = 0.05;
/** The step of the volume of the music the owner sets. */
const VOLUME_STEP = 0.05;
/**
 * Takes the keyboard from the control of the panel that has it, so that the
 * keys go to the game again.
 */
function blurControl(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

/**
 * What names the controls and the folders of the panel in the language of
 * the page, and again in each language the page comes to speak.
 */
class PanelLabels {
  /** The translator of the text of the page. */
  readonly #translator: Translator;
  /** What names everything in the panel again in another language. */
  readonly #relabels: (() => void)[] = [];

  /**
   * Starts with nothing named.
   *
   * @param {Translator} translator - The translator of the text of the page.
   */
  constructor(translator: Translator) {
    this.#translator = translator;
  }

  /**
   * Names a control by a message, now and in each language the page comes
   * to speak.
   *
   * @param {T} control - The control.
   * @param {PlainMessageId} id - The message of its name.
   * @returns {T} The control.
   * @template T
   */
  name<T extends Controller>(control: T, id: PlainMessageId): T {
    this.addRelabel(() => {
      control.name(this.#translator.translate(id));
    });
    return control;
  }

  /**
   * Adds a folder titled by a message, now and in each language the page
   * comes to speak.
   *
   * @param {GUI} parent - What the folder is added to.
   * @param {PlainMessageId} id - The message of its title.
   * @returns {GUI} The folder.
   */
  addFolder(parent: GUI, id: PlainMessageId): GUI {
    const folder: GUI = parent.addFolder(this.#translator.translate(id));
    folder.$title.classList.add('panel-folder-title');
    this.#relabels.push(() => {
      folder.title(this.#translator.translate(id));
    });
    return folder;
  }

  /**
   * Words something of the panel now, and again in each language the page
   * comes to speak.
   *
   * @param {() => void} relabel - Words it in the language of the page.
   */
  addRelabel(relabel: () => void): void {
    relabel();
    this.#relabels.push(relabel);
  }

  /** Words everything of the panel in the language of the page now. */
  relabelAll(): void {
    for (const relabel of this.#relabels) {
      relabel();
    }
  }
}

/** What the folders of the readouts of the panel show. */
interface ReadoutValues {
  /** What is synchronized with the server. */
  readonly shown: Record<keyof PlayerReadout, string>;
  /** The monster as the latest snapshot tells it. */
  readonly monster: Record<keyof MonsterReadout, string>;
  /** What is predicted of the player of the page. */
  readonly predicted: Record<keyof PredictionReadout, string>;
  /** What the space bar makes the player of the page do. */
  readonly spaceKey: { interaction: string };
  /** How the player of the page is shown. */
  readonly display: Record<keyof DisplayReadout, string>;
  /** How the server judged the latest slash of the player of the page. */
  readonly slash: Record<keyof SlashReadout, string>;
}

/**
 * Adds the controls that show how the client itself stands: the connection
 * to the server, the models, and the time of day of the world.
 *
 * @param {GUI} gui - The panel.
 * @param {PanelState} state - What the panel shows of the client itself.
 * @param {PanelLabels} labels - What names the controls.
 */
function addStateControls(
  gui: GUI,
  state: PanelState,
  labels: PanelLabels,
): void {
  labels.name(gui.add(state, 'server'), 'panel.server').disable().listen();
  labels.name(gui.add(state, 'models'), 'panel.models').disable().listen();
  labels
    .name(gui.add(state, 'timeOfDay'), 'panel.timeOfDay')
    .disable()
    .listen();
}

/**
 * Adds the controls of the camera: the player it follows, shown afresh
 * whenever the page changes it, and how it trails behind the player.
 *
 * @param {GUI} gui - The panel.
 * @param {ClientSettings} settings - The settings the client runs by.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PanelLabels} labels - What names the controls.
 * @returns {Controller} The control of the player the camera follows.
 */
function addCameraControls(
  gui: GUI,
  settings: ClientSettings,
  translator: Translator,
  labels: PanelLabels,
): Controller {
  const { camera, trailingCamera } = settings;
  const cameraControl: Controller = labels
    .name(
      gui.add(camera, 'followedId', {
        [translator.translate('camera.own')]: null,
      }),
      'panel.camera',
    )
    .listen();
  labels.name(gui.add(trailingCamera, 'isEnabled'), 'panel.trailingCamera');
  labels.name(
    gui.add(trailingCamera, 'turnRate', 0, MAX_TURN_RATE, ANGLE_STEP),
    'panel.turnRate',
  );
  labels.name(
    gui.add(trailingCamera, 'deadZone', 0, MAX_DEAD_ZONE, ANGLE_STEP),
    'panel.deadZone',
  );
  labels.name(
    gui.add(trailingCamera, 'easeTime', 0, MAX_EASE_TIME, CAMERA_TIME_STEP),
    'panel.easeTime',
  );
  labels.name(
    gui.add(trailingCamera, 'angleLimit', 0, MAX_ANGLE_LIMIT, ANGLE_STEP),
    'panel.angleLimit',
  );
  labels.name(
    gui.add(trailingCamera, 'delay', 0, MAX_RECENTER_DELAY, CAMERA_TIME_STEP),
    'panel.recenterDelay',
  );
  return cameraControl;
}

/**
 * Adds the controls of the synchronization with the server: prediction,
 * smoothing, foreseeing the pushes, the delay of the network,
 * interpolation, and lag compensation.
 *
 * @param {GUI} gui - The panel.
 * @param {ClientSettings} settings - The settings the client runs by.
 * @param {PanelLabels} labels - What names the controls.
 */
function addSyncControls(
  gui: GUI,
  settings: ClientSettings,
  labels: PanelLabels,
): void {
  const {
    prediction,
    smoothing,
    pushForecast,
    network,
    interpolation,
    compensation,
  } = settings;
  labels.name(gui.add(prediction, 'isEnabled'), 'panel.predict');
  labels.name(gui.add(smoothing, 'isEnabled'), 'panel.smooth');
  labels.name(gui.add(pushForecast, 'isEnabled'), 'panel.foreseePushes');
  labels.name(
    gui.add(network, 'delay', 0, MAX_NETWORK_DELAY, DELAY_STEP),
    'panel.netDelay',
  );
  labels.name(gui.add(interpolation, 'isEnabled'), 'panel.interpolate');
  labels.name(
    gui.add(interpolation, 'delay', 0, MAX_DELAY, DELAY_STEP),
    'panel.delay',
  );
  labels.name(gui.add(compensation, 'isEnabled'), 'panel.compensate');
}

/**
 * Adds the controls of what the world shows: the outlines of the
 * obstacles, and the time of day previewed, its hour shown on a clock.
 *
 * @param {GUI} gui - The panel.
 * @param {ClientSettings} settings - The settings the client runs by.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PanelLabels} labels - What names the controls.
 */
function addWorldControls(
  gui: GUI,
  settings: ClientSettings,
  translator: Translator,
  labels: PanelLabels,
): void {
  const { obstacles, timePreview } = settings;
  labels.name(gui.add(obstacles, 'isShown'), 'panel.obstacles');
  labels.name(gui.add(timePreview, 'isEnabled'), 'panel.previewTime');
  const hourControl: HourControl = addHourControl(
    gui,
    timePreview,
    blurControl,
  );
  labels.addRelabel(() => {
    hourControl.name(translator.translate('panel.previewHour'));
  });
}

/**
 * Adds the controls of the music.
 *
 * @param {GUI} gui - The panel.
 * @param {ClientSettings} settings - The settings the client runs by.
 * @param {PanelLabels} labels - What names the controls.
 */
function addMusicControls(
  gui: GUI,
  settings: ClientSettings,
  labels: PanelLabels,
): void {
  const { music } = settings;
  labels.name(gui.add(music, 'isEnabled'), 'panel.music');
  labels.name(gui.add(music, 'volume', 0, 1, VOLUME_STEP), 'panel.volume');
}

/**
 * Adds the control of the language of the page, which has the page speak
 * the language the owner chooses, and goes back to the language spoken if
 * that cannot be had.
 *
 * @param {GUI} gui - The panel.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {(code: LanguageCode) => Promise<void>} chooseLanguage - Has the
 *   page speak a language, settled once it does, or once it cannot.
 * @param {PanelLabels} labels - What names the control.
 * @returns {() => void} Shows the language the page speaks in the control.
 */
function addLanguageControl(
  gui: GUI,
  translator: Translator,
  chooseLanguage: (code: LanguageCode) => Promise<void>,
  labels: PanelLabels,
): () => void {
  const languageChoice: { code: LanguageCode } = {
    code: translator.language,
  };
  const languageControl: Controller = labels.name(
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
  return showLanguage;
}

/**
 * Adds a folder of readouts, each value of which the owner reads but does
 * not change.
 *
 * @param {GUI} gui - The panel.
 * @param {PanelLabels} labels - What names the folder and its values.
 * @param {PlainMessageId} id - The message of the title of the folder.
 * @param {Record<K, string>} values - The values read out.
 * @param {readonly [K, PlainMessageId][]} names - The message of the name
 *   of each value, in the order they are shown.
 * @returns {GUI} The folder.
 * @template K
 */
function addReadoutFolder<K extends string>(
  gui: GUI,
  labels: PanelLabels,
  id: PlainMessageId,
  values: Record<K, string>,
  names: readonly [K, PlainMessageId][],
): GUI {
  const folder: GUI = labels.addFolder(gui, id);
  for (const [key, name] of names) {
    labels.name(folder.add(values, key), name).disable().listen();
  }
  return folder;
}

/**
 * Adds the folders of the readouts, with nothing synchronized yet: what is
 * synchronized, the monster, the prediction with what the space bar does,
 * how the player of the page is shown, and its latest slash.
 *
 * @param {GUI} gui - The panel.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PanelLabels} labels - What names the folders and their values.
 * @returns {ReadoutValues} What the folders show.
 */
function addReadoutFolders(
  gui: GUI,
  translator: Translator,
  labels: PanelLabels,
): ReadoutValues {
  const values: ReadoutValues = {
    shown: { ...describeSnapshot(translator, null, null) },
    monster: { ...describeMonster(translator, null) },
    predicted: { ...describePrediction(translator, null) },
    spaceKey: { interaction: describeSpaceKey(translator, null) },
    display: {
      ...describeDisplay(null, null, {
        players: [],
        monsters: [],
        lag: 0,
        time: null,
      }),
    },
    slash: { ...describeSlash(translator, null) },
  };
  addReadoutFolder(gui, labels, 'panel.snapshot', values.shown, READOUT_NAMES);
  addReadoutFolder(
    gui,
    labels,
    'panel.monster',
    values.monster,
    MONSTER_NAMES,
  );
  const predictionFolder: GUI = addReadoutFolder(
    gui,
    labels,
    'panel.prediction',
    values.predicted,
    PREDICTION_NAMES,
  );
  labels
    .name(
      predictionFolder.add(values.spaceKey, 'interaction'),
      'panel.spaceKey',
    )
    .disable()
    .listen();
  addReadoutFolder(
    gui,
    labels,
    'panel.displayed',
    values.display,
    DISPLAY_NAMES,
  );
  addReadoutFolder(
    gui,
    labels,
    'panel.lastSlash',
    values.slash,
    SLASH_NAMES,
  );
  return values;
}

/**
 * Makes what offers the owner the players the camera can follow, which
 * leaves the choices as they are if they are the same as those offered
 * last.
 *
 * @param {Controller} cameraControl - The control of the player the camera
 *   follows.
 * @returns {(choices: readonly CameraChoice[]) => void} Offers the players,
 *   in the order offered.
 */
function createCameraOffer(
  cameraControl: Controller,
): (choices: readonly CameraChoice[]) => void {
  let offered = '';
  return (choices: readonly CameraChoice[]): void => {
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
}

/**
 * Makes what lists the models that cannot be shown in a folder of their
 * own, with the reason of each in the language of the page, as a tooltip
 * too, now and in each language the page comes to speak.
 *
 * @param {GUI} gui - The panel.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {PanelLabels} labels - What names the folder and its entries.
 * @returns {(problems: readonly ModelProblem[]) => void} Lists the models,
 *   which adds nothing if there are none.
 */
function createProblemList(
  gui: GUI,
  translator: Translator,
  labels: PanelLabels,
): (problems: readonly ModelProblem[]) => void {
  return (problems: readonly ModelProblem[]): void => {
    if (problems.length === 0) {
      return;
    }
    const folder: GUI = labels.addFolder(gui, 'panel.modelProblems');
    for (const problem of problems) {
      const shownProblem: { reason: string } = { reason: '' };
      const entry = folder
        .add(shownProblem, 'reason')
        .name(problem.file)
        .disable();
      labels.addRelabel(() => {
        shownProblem.reason = explainProblem(translator, problem);
        entry.updateDisplay();
        // The panel is too narrow for a long reason.
        entry.domElement.title = `${problem.file}: ${shownProblem.reason}`;
      });
    }
  };
}

/**
 * Creates the settings panel, in the language of the page, which starts
 * folded up to its title, which opens it when clicked, and with nothing
 * synchronized yet.  Its controls change the settings the client runs by
 * as the owner sets them, and show the camera setting afresh whenever the
 * page changes it.  The panel names everything in it again in each
 * language the page comes to speak.
 *
 * @param {ClientSettings} settings - The settings the client runs by.
 * @param {Translator} translator - The translator of the text of the page.
 * @param {(code: LanguageCode) => Promise<void>} chooseLanguage - Has the
 *   page speak the language the owner chooses in the panel, settled once
 *   it does, or once it cannot.
 * @returns {Panel} The panel.
 */
export function createPanel(
  settings: ClientSettings,
  translator: Translator,
  chooseLanguage: (code: LanguageCode) => Promise<void>,
): Panel {
  const state: PanelState = {
    server: translator.translate('server.connecting'),
    models: translator.translate('models.loading'),
    timeOfDay: describeTimeOfDay(translator, null),
  };
  const labels = new PanelLabels(translator);
  // The site's CSP forbids the inline style lil-gui would inject, so the
  // style sheet of the client bundles lil-gui's own instead.
  const gui = new GUI({
    title: translator.translate('title'),
    injectStyles: false,
  });
  // The style sheet of the client knows the panel by classes of its own.
  gui.domElement.classList.add('panel');
  gui.$title.classList.add('panel-title');
  gui.$children.classList.add('panel-contents');
  labels.addRelabel(() => {
    gui.title(translator.translate('title'));
  });
  gui.close();
  addStateControls(gui, state, labels);
  const cameraControl: Controller = addCameraControls(
    gui,
    settings,
    translator,
    labels,
  );
  addSyncControls(gui, settings, labels);
  addWorldControls(gui, settings, translator, labels);
  addMusicControls(gui, settings, labels);
  const showLanguage: () => void = addLanguageControl(
    gui,
    translator,
    chooseLanguage,
    labels,
  );
  // The panel keeps the keys from the game while a control of it is in use.
  gui.onFinishChange(blurControl);
  const values: ReadoutValues = addReadoutFolders(gui, translator, labels);
  translator.addListener(() => {
    labels.relabelAll();
    showLanguage();
  });
  return {
    state,
    offerCameraChoices: createCameraOffer(cameraControl),
    showReadout: (readout: PlayerReadout): void => {
      Object.assign(values.shown, readout);
    },
    showMonster: (readout: MonsterReadout): void => {
      Object.assign(values.monster, readout);
    },
    showDisplay: (readout: DisplayReadout): void => {
      Object.assign(values.display, readout);
    },
    showPrediction: (readout: PredictionReadout): void => {
      Object.assign(values.predicted, readout);
    },
    showInteraction: (interaction: string): void => {
      values.spaceKey.interaction = interaction;
    },
    showSlash: (readout: SlashReadout): void => {
      Object.assign(values.slash, readout);
    },
    listProblems: createProblemList(gui, translator, labels),
  };
}
