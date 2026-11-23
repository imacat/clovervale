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
 * @module client/edwin-figure Edwin, the prisoner of the cave, who calls
 *   out for help on his own.
 */

import type { Object3D, Vector3 } from 'three';

import { getVillager } from '@clovervale/shared';
import type { MonsterState, Villager } from '@clovervale/shared';

import { EdwinCall, areDogsDead } from './edwin-call.ts';
import type { FigureFrame } from './figure-set.ts';
import { MODEL_FILES } from './model-catalog.ts';
import { isOnScreen } from './on-screen.ts';
import { findStandingHead } from './villager-figure.ts';
import type { FigureContext, VillagerFigure } from './villager-figure.ts';

/** Edwin, the prisoner of the cave, as a villager. */
const EDWIN_VILLAGER: Villager = getVillager('edwin');

/**
 * The figure of Edwin, the prisoner of the cave, who calls out for help in
 * a bubble above his head whenever {@link EdwinCall} tells he does, while
 * the player of the page is in the cave: once both dogs of the cave are
 * dead, as long as he is on the screen, not hidden by the rock of the cave,
 * before he has told the player who he is, and while the player is not in
 * a dialogue.
 */
export class EdwinFigure implements VillagerFigure {
  /** Whether Edwin moves around his map, which he does not. */
  readonly movesAround = false;
  /** What the figure is shown with. */
  readonly #context: FigureContext;
  /** What tells when Edwin calls out for help. */
  #call = new EdwinCall();

  /**
   * Makes the figure of Edwin.
   *
   * @param {FigureContext} context - What the figure is shown with.
   */
  constructor(context: FigureContext) {
    this.#context = context;
  }

  /**
   * Edwin, as a villager.
   *
   * @returns {Villager} The villager.
   */
  get villager(): Villager {
    return EDWIN_VILLAGER;
  }

  /** Shows nothing of his own: the models of the cave show him. */
  useModels(): void {
    // The models of the cave show Edwin.
  }

  /** Shows nothing of his own at a frame. */
  show(): void {
    // The models of the cave show Edwin.
  }

  /**
   * Has Edwin call out for help if he does at this frame, while the page
   * shows his map.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {FigureFrame} frame - How things are shown at the frame, Edwin
   *   at the step of the server the prediction of the player of the page is
   *   after.
   */
  update(seconds: number, frame: FigureFrame): void {
    const { models, speech, record, readViewport, isInDialogue } =
      this.#context;
    if (frame.map !== this.villager.map) {
      return;
    }
    const figure: Object3D | null = models.findRoot(MODEL_FILES.edwin);
    const isCalling: boolean = this.#call.update(seconds, {
      areDogsDead:
        record.playerId !== null && areDogsDead(frame.latestMonsters),
      isAcquainted: record.acquaintances.includes(this.villager.id),
      isInDialogue: isInDialogue(),
      isOnScreen: () =>
        figure !== null &&
        isOnScreen(
          readViewport().getCamera(),
          figure,
          models.findRoot(MODEL_FILES.cave),
        ),
    });
    if (isCalling) {
      speech.say(
        this.villager,
        this.findHeadTop(frame.ownStep, frame.view.monsters),
        'villager.edwin.call',
      );
    }
  }

  /** Forgets how long the dogs have been dead and when Edwin last called. */
  clear(): void {
    this.#call = new EdwinCall();
  }

  /**
   * Finds the top of the head of Edwin, as {@link findStandingHead} tells.
   *
   * @param {number | null} step - The step of the server he is shown at,
   *   or `null` while the page shows none.
   * @param {readonly MonsterState[]} monsters - The monsters as they are
   *   shown.
   * @returns {Vector3} The top of his head.
   */
  findHeadTop(
    step: number | null,
    monsters: readonly MonsterState[],
  ): Vector3 {
    return findStandingHead(
      EDWIN_VILLAGER,
      this.#context.models,
      step,
      monsters,
    );
  }

  /**
   * Tells whether Edwin is to say a line the server tells of.
   *
   * @returns {boolean} Always.
   */
  canSay(): boolean {
    return true;
  }
}
