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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/panel-readouts What the settings panel reads out of the
 *   play of the page, in the language of the page.
 */

import type { MonsterState, PlayerState } from '@clovervale/shared';

import { listCameraChoices } from './camera-choice.ts';
import type { FigureFrame } from './figure-set.ts';
import { summariseModels } from './model-report.ts';
import type { ModelProblem } from './model-report.ts';
import type { Panel } from './panel.ts';
import {
  describeDisplay,
  describeMonster,
  describePrediction,
  describeSlash,
  describeSnapshot,
  describeTimeOfDay,
} from './player-readout.ts';
import type { PlayerRecord } from './player-record.ts';
import type { PlayerPrediction } from './prediction.ts';
import type { SpaceAction } from './space-action.ts';
import { describeSpaceKey } from './space-words.ts';
import type { Translator } from './translator.ts';

/**
 * What the settings panel reads out of the play of the page: how the
 * connection to the server stands, how showing the models went, the time
 * of day of the world, what the server has told of the player of the page
 * and of the world, how the player is shown and predicted, and what the
 * space bar makes it do, in the language of the page.
 */
export class PanelReadouts {
  /** The settings panel. */
  readonly #panel: Panel;
  /** The translator of the text of the page. */
  readonly #translator: Translator;
  /** What the server has told the page of its player and of the world. */
  readonly #record: PlayerRecord;
  /**
   * Words how the connection to the server stands.
   *
   * @returns {string} How it stands, in the language of the page.
   */
  #describeServer: () => string;
  /**
   * Words how showing the models went.
   *
   * @returns {string} How it went, in the language of the page.
   */
  #describeModels: () => string;

  /**
   * Starts with the page connecting, and the models loading.
   *
   * @param {Panel} panel - The settings panel.
   * @param {Translator} translator - The translator of the text of the page.
   * @param {PlayerRecord} record - What the server has told the page of its
   *   player and of the world.
   */
  constructor(panel: Panel, translator: Translator, record: PlayerRecord) {
    this.#panel = panel;
    this.#translator = translator;
    this.#record = record;
    this.#describeServer = (): string =>
      translator.translate('server.connecting');
    this.#describeModels = (): string =>
      translator.translate('models.loading');
  }

  /**
   * Shows how the connection to the server stands, in the language of the
   * page, now and in each language the page comes to speak.
   *
   * @param {() => string} describe - Words how it stands.
   */
  showServer(describe: () => string): void {
    this.#describeServer = describe;
    this.#panel.state.server = describe();
  }

  /**
   * Shows how showing the models went, now and in each language the page
   * comes to speak, and lists the models that cannot be shown.
   *
   * @param {number} shownCount - How many models are shown.
   * @param {readonly ModelProblem[]} problems - The models that cannot be
   *   shown, and why.
   */
  showModels(shownCount: number, problems: readonly ModelProblem[]): void {
    const translator: Translator = this.#translator;
    this.#describeModels = (): string =>
      summariseModels(translator, shownCount, problems);
    this.#panel.state.models = this.#describeModels();
    this.#panel.listProblems(problems);
  }

  /**
   * Shows the player of the page as the server has just welcomed it, before
   * any snapshot.
   */
  showWelcome(): void {
    this.#panel.showReadout(
      describeSnapshot(this.#translator, this.#record.playerId, null),
    );
  }

  /**
   * Shows what the server has told of the player of the page and of the
   * world: the players the camera can follow, what is synchronised, the
   * monster, and how the latest slash of the player was judged.
   *
   * @param {(readonly PlayerState[]) | null} players - The players in the
   *   latest snapshot, or `null` without one.
   * @param {(readonly MonsterState[]) | null} monsters - The monsters in the
   *   latest snapshot, or `null` without one.
   */
  showSnapshot(
    players: readonly PlayerState[] | null,
    monsters: readonly MonsterState[] | null,
  ): void {
    const translator: Translator = this.#translator;
    const { playerId, slash } = this.#record;
    this.#panel.offerCameraChoices(
      listCameraChoices(translator, playerId, players),
    );
    this.#panel.showReadout(describeSnapshot(translator, playerId, players));
    this.#panel.showMonster(describeMonster(translator, monsters));
    this.#panel.showSlash(describeSlash(translator, slash));
  }

  /**
   * Shows how the player of the page is shown at a frame, and what is
   * predicted of it.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   * @param {(readonly PlayerState[]) | null} latest - The players in the
   *   latest snapshot, or `null` without one.
   * @param {PlayerPrediction | null} prediction - The prediction of the
   *   player, or `null` while there is none.
   */
  showFrame(
    frame: FigureFrame,
    latest: readonly PlayerState[] | null,
    prediction: PlayerPrediction | null,
  ): void {
    this.#panel.showDisplay(describeDisplay(frame.ownId, latest, frame.view));
    this.#panel.showPrediction(
      describePrediction(this.#translator, prediction),
    );
  }

  /**
   * Shows what the space bar makes the player of the page do.
   *
   * @param {SpaceAction | null} action - What it makes the player do, or
   *   `null` for nothing.
   */
  showSpaceKey(action: SpaceAction | null): void {
    this.#panel.showInteraction(
      describeSpaceKey(this.#translator, action, this.#record.acquaintances),
    );
  }

  /**
   * Shows the time of day of the world.
   *
   * @param {number | null} time - The time of day, from 0 up to 1, or
   *   `null` while the page does not know it.
   */
  showTimeOfDay(time: number | null): void {
    this.#panel.state.timeOfDay = describeTimeOfDay(this.#translator, time);
  }

  /**
   * Words every readout in the language the page speaks now, outside those
   * worded afresh at every frame.
   *
   * @param {(readonly PlayerState[]) | null} players - The players in the
   *   latest snapshot, or `null` without one.
   * @param {(readonly MonsterState[]) | null} monsters - The monsters in the
   *   latest snapshot, or `null` without one.
   */
  relabel(
    players: readonly PlayerState[] | null,
    monsters: readonly MonsterState[] | null,
  ): void {
    this.#panel.state.server = this.#describeServer();
    this.#panel.state.models = this.#describeModels();
    this.showSnapshot(players, monsters);
  }
}
