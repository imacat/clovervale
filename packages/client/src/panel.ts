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

import { DEFAULT_DELAY, MAX_DELAY } from './interpolation.ts';
import type { ModelProblem } from './model-report.ts';
import { describeDisplay, describeSnapshot } from './player-readout.ts';
import type { DisplayReadout, PlayerReadout } from './player-readout.ts';

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

/** The settings panel of the client. */
export interface Panel {
  /** What the panel shows of the client itself. */
  readonly state: PanelState;
  /** How the owner has the players shown, as the panel is set now. */
  readonly interpolation: Readonly<InterpolationSettings>;
  /**
   * Shows what is synchronised with the server, for the owner to see.
   *
   * @param {PlayerReadout} readout - What the owner reads.
   */
  readonly showReadout: (readout: PlayerReadout) => void;
  /**
   * Shows how the player of the page is shown, for the owner to compare
   * with what is synchronised.
   *
   * @param {DisplayReadout} readout - What the owner reads.
   */
  readonly showDisplay: (readout: DisplayReadout) => void;
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
];

/** The names of the values of the display, in the order they are shown. */
const DISPLAY_NAMES: readonly [keyof DisplayReadout, string][] = [
  ['drawnAt', 'Drawn at'],
  ['behind', 'Behind'],
];

/** The step of the delay the owner sets, in milliseconds. */
const DELAY_STEP = 10;

/**
 * Creates the settings panel, which starts with nothing synchronised yet,
 * and with the players to be shown smoothly, by the default delay.
 *
 * @returns {Panel} The panel.
 */
export function createPanel(): Panel {
  const state: PanelState = { server: 'connecting', models: 'loading' };
  const interpolation: InterpolationSettings = {
    isEnabled: true,
    delay: DEFAULT_DELAY,
  };
  const shown: Record<keyof PlayerReadout, string> = {
    ...describeSnapshot(null, null),
  };
  const display: Record<keyof DisplayReadout, string> = {
    ...describeDisplay(null, null, { players: [], lag: 0 }),
  };
  // The style sheet of the panel is part of the style sheet of the client.
  const gui = new GUI({ title: 'Clovervale', injectStyles: false });
  gui.add(state, 'server').name('Server').disable().listen();
  gui.add(state, 'models').name('Models').disable().listen();
  gui.add(interpolation, 'isEnabled').name('Interpolate');
  gui
    .add(interpolation, 'delay', 0, MAX_DELAY, DELAY_STEP)
    .name('Delay (ms)');
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
  const displayFolder: GUI = gui.addFolder('Displayed');
  for (const [key, name] of DISPLAY_NAMES) {
    displayFolder.add(display, key).name(name).disable().listen();
  }

  const showReadout = (readout: PlayerReadout): void => {
    Object.assign(shown, readout);
  };
  const showDisplay = (readout: DisplayReadout): void => {
    Object.assign(display, readout);
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
  return { state, interpolation, showReadout, showDisplay, listProblems };
}
