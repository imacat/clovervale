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
 * @module client/villager-figure The figure of a villager, as the page
 *   shows it, and what it shows it from.
 */

import type { Scene, Vector3 } from 'three';

import type { MonsterState, Villager } from '@clovervale/shared';

import type { FigureSet } from './figure-set.ts';
import { findHeadTop } from './head-top.ts';
import type { PlainMessageId } from './messages/en.ts';
import { MODEL_FILES } from './model-catalog.ts';
import type { ModelLibrary } from './model-library.ts';
import type { PlayerRecord } from './player-record.ts';
import type { SpeechView } from './speech-bubble.ts';
import type { Viewport } from './viewport.ts';

/** The bubble the villagers say their lines in. */
export interface VillagerSpeech {
  /**
   * Shows what a villager says in a bubble just above its head, in place
   * of any bubble of a villager shown before.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   * @param {PlainMessageId | null} [lineId] - The message of the line it
   *   says, or `null` for one of its own lines, which it is by default.
   */
  say(villager: Villager, head: Vector3, lineId?: PlainMessageId | null): void;

  /**
   * Keeps the bubble of a villager above its head, if the bubble is that of
   * the villager.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   */
  follow(villager: Villager, head: Vector3): void;

  /**
   * Describes the bubble of a villager shown.
   *
   * @returns {SpeechView | null} The bubble, or `null` while none is shown.
   */
  describe(): SpeechView | null;
}

/** What the figures of the villagers are shown with. */
export interface FigureContext {
  /** The models the page shows. */
  readonly models: ModelLibrary;
  /** The bubble the villagers say their lines in. */
  readonly speech: VillagerSpeech;
  /** What the server has told of the player of the page. */
  readonly record: PlayerRecord;
  /**
   * Gives the view the page shows, which is asked for only once it is
   * shown.
   *
   * @returns {Viewport} The view.
   */
  readonly readViewport: () => Viewport;
  /**
   * Tells whether the player of the page is in a dialogue.
   *
   * @returns {boolean} Whether it is.
   */
  readonly isInDialogue: () => boolean;
}

/**
 * The figure of a villager, as the page shows it: shown at each frame, as
 * the players are, while the player of the page is in any map, moved on
 * once everything else of the frame is shown, and cleared as the page
 * leaves the map of the villager, as {@link FigureSet} tells.
 */
export interface VillagerFigure extends FigureSet {
  /** The villager. */
  readonly villager: Villager;
  /**
   * Whether the villager moves around its map, so that its bubble is to be
   * kept above its head.
   */
  readonly movesAround: boolean;

  /**
   * Shows what the figure has of its own in a map, as far as the models
   * have been loaded.
   *
   * @param {Scene} scene - The village.
   */
  useModels(scene: Scene): void;

  /**
   * Finds the top of the head of the villager as it is shown.
   *
   * @param {number | null} step - The step of the server the villager is
   *   shown at, which may fall between two, or `null` while the page shows
   *   none.
   * @param {readonly MonsterState[]} monsters - The monsters as they are
   *   shown, among whom a villager who fights as one stands.
   * @returns {Vector3 | null} The top of its head, or `null` if it is to
   *   be left where it is.
   */
  findHeadTop(
    step: number | null,
    monsters: readonly MonsterState[],
  ): Vector3 | null;

  /**
   * Tells whether the villager is to say a line the server tells of, as
   * far as the villager goes.
   *
   * @param {string} line - The message of the line.
   * @returns {boolean} Whether it is.
   */
  canSay(line: string): boolean;
}

/**
 * Finds the top of the head of a villager, where it stands in its map, as
 * {@link findHeadTop} tells.
 *
 * @param {Villager} villager - The villager.
 * @param {ModelLibrary} models - The models the page shows.
 * @param {number | null} step - The step of the server the villager is
 *   shown at, which may fall between two, or `null` for the first.
 * @param {readonly MonsterState[]} monsters - The monsters as they are
 *   shown.
 * @returns {Vector3} The top of its head.
 */
export function findStandingHead(
  villager: Villager,
  models: ModelLibrary,
  step: number | null,
  monsters: readonly MonsterState[],
): Vector3 {
  return findHeadTop(
    villager,
    models.findRoot(MODEL_FILES[villager.id]),
    step ?? 0,
    monsters,
  );
}

/**
 * The figure of a villager who has nothing to show of its own: it stands
 * as the models of its map have it, or among the monsters if it fights as
 * one, and says any line it is told to.
 */
export class StandingFigure implements VillagerFigure {
  readonly #villager: Villager;
  readonly #context: FigureContext;

  /**
   * Makes the figure of a villager.
   *
   * @param {Villager} villager - The villager.
   * @param {FigureContext} context - What the figure is shown with.
   */
  constructor(villager: Villager, context: FigureContext) {
    this.#villager = villager;
    this.#context = context;
  }

  /**
   * The villager.
   *
   * @returns {Villager} The villager.
   */
  get villager(): Villager {
    return this.#villager;
  }

  /**
   * Whether the villager moves around its map.
   *
   * @returns {boolean} Whether it does, which a villager who fights as a
   *   monster does.
   */
  get movesAround(): boolean {
    return this.#villager.fighter !== undefined;
  }

  /** Shows nothing of its own. */
  useModels(): void {
    // The models of its map show the villager.
  }

  /** Shows nothing of its own at a frame. */
  show(): void {
    // The models of its map show the villager.
  }

  /** Does nothing over time. */
  update(): void {
    // The villager does nothing over time.
  }

  /** Has nothing to forget. */
  clear(): void {
    // The figure shows nothing of its own.
  }

  /**
   * Finds the top of the head of the villager, as
   * {@link findStandingHead} tells.
   *
   * @param {number | null} step - The step of the server the villager is
   *   shown at, which may fall between two, or `null` for the first.
   * @param {readonly MonsterState[]} monsters - The monsters as they are
   *   shown.
   * @returns {Vector3} The top of its head.
   */
  findHeadTop(
    step: number | null,
    monsters: readonly MonsterState[],
  ): Vector3 {
    return findStandingHead(
      this.#villager,
      this.#context.models,
      step,
      monsters,
    );
  }

  /**
   * Tells whether the villager is to say a line the server tells of.
   *
   * @returns {boolean} Always.
   */
  canSay(): boolean {
    return true;
  }
}
