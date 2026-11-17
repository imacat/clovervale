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

import { CLIP_CHOICES } from './clip-choice.ts';
import type { ClipChoice } from './clip-choice.ts';
import type { ModelProblem } from './model-report.ts';

/** What the panel shows, and what the owner has set in it. */
export interface PanelState {
  /** The status of the connection to the server. */
  server: string;
  /** How showing the models went. */
  models: string;
  /** The animation the characters and the monster play. */
  animation: ClipChoice;
  /** Whether an animation that does not loop is played again and again. */
  repeats: boolean;
}

/** The settings panel of the client. */
export interface Panel {
  /** What the panel shows, and what the owner has set in it. */
  readonly state: PanelState;
  /**
   * Lists the models that cannot be shown, for the owner to see.
   *
   * @param {readonly ModelProblem[]} problems - The models that cannot be
   *   shown.
   */
  readonly listProblems: (problems: readonly ModelProblem[]) => void;
}

/**
 * Creates the settings panel.
 *
 * @param {() => void} playAnimation - Called to play the animation set in
 *   the panel from its beginning, whenever the owner changes how the
 *   animation plays or asks for it again.
 * @returns {Panel} The panel.
 */
export function createPanel(playAnimation: () => void): Panel {
  const state: PanelState = {
    server: 'connecting',
    models: 'loading',
    animation: 'Idle',
    repeats: true,
  };
  const gui = new GUI({ title: 'Clovervale' });
  gui.add(state, 'server').name('Server').disable().listen();
  gui.add(state, 'models').name('Models').disable().listen();
  gui
    .add(state, 'animation', CLIP_CHOICES)
    .name('Animation')
    .onChange(playAnimation);
  gui.add(state, 'repeats').name('Repeat').onChange(playAnimation);
  gui.add({ playAnimation }, 'playAnimation').name('Play again');

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
  return { state, listProblems };
}
