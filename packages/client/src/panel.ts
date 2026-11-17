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

import type { ModelProblem } from './model-report.ts';
import { describeSnapshot } from './player-readout.ts';
import type { PlayerReadout } from './player-readout.ts';

/** What the panel shows of the client itself. */
export interface PanelState {
  /** The status of the connection to the server. */
  server: string;
  /** How showing the models went. */
  models: string;
}

/** The settings panel of the client. */
export interface Panel {
  /** What the panel shows of the client itself. */
  readonly state: PanelState;
  /**
   * Shows what is synchronised with the server, for the owner to see.
   *
   * @param {PlayerReadout} readout - What the owner reads.
   */
  readonly showReadout: (readout: PlayerReadout) => void;
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

/**
 * Creates the settings panel, which starts with nothing synchronised yet.
 *
 * @returns {Panel} The panel.
 */
export function createPanel(): Panel {
  const state: PanelState = { server: 'connecting', models: 'loading' };
  const shown: Record<keyof PlayerReadout, string> = {
    ...describeSnapshot(null, null),
  };
  const gui = new GUI({ title: 'Clovervale' });
  gui.add(state, 'server').name('Server').disable().listen();
  gui.add(state, 'models').name('Models').disable().listen();
  const folder: GUI = gui.addFolder('Latest snapshot');
  for (const [key, name] of READOUT_NAMES) {
    folder.add(shown, key).name(name).disable().listen();
  }

  const showReadout = (readout: PlayerReadout): void => {
    Object.assign(shown, readout);
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
  return { state, showReadout, listProblems };
}
