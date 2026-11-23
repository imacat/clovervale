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
 * @module client/story-figures The villagers as the story has them shown,
 *   each by its figure, and what they say, and when.
 */

import type { Scene, Vector3 } from 'three';

import { VILLAGERS, getVillager, hasServerWords } from '@clovervale/shared';
import type {
  MapId,
  MonsterState,
  Villager,
  VillagerId,
} from '@clovervale/shared';

import type { FigureFrame, FigureSet } from './figure-set.ts';
import { TalkWatch } from './talk-watch.ts';
import { isMessageId } from './translator.ts';
import type { Translator } from './translator.ts';
import { StandingFigure } from './villager-figure.ts';
import type { FigureContext, VillagerFigure } from './villager-figure.ts';
import { describeVillager } from './villager-words.ts';

/**
 * The villagers as the story has them shown, each by its figure, as
 * {@link VillagerFigure} tells, and the bubbles of what they say, as a set
 * of figures, as {@link FigureSet} tells.
 */
export class StoryFigures implements FigureSet {
  /** What the figures are shown with. */
  readonly #context: FigureContext;
  /** The translator of what the villagers say. */
  readonly #translator: Translator;
  /** The figure of each villager. */
  readonly #figures: ReadonlyMap<VillagerId, VillagerFigure>;
  /** What notices each talk of the player of the page to a villager. */
  readonly #talks = new TalkWatch();
  /** The monsters as they were last shown, none since the last clearing. */
  #shownMonsters: readonly MonsterState[] = [];

  /**
   * Starts before the models are loaded.
   *
   * @param {FigureContext} context - What the figures are shown with.
   * @param {Translator} translator - The translator of what the villagers
   *   say.
   * @param {readonly VillagerFigure[]} figures - The figures of the
   *   villagers who have something of their own to show; every other
   *   villager is shown as a {@link StandingFigure}.
   */
  constructor(
    context: FigureContext,
    translator: Translator,
    figures: readonly VillagerFigure[],
  ) {
    this.#context = context;
    this.#translator = translator;
    this.#figures = new Map(
      VILLAGERS.map((villager: Villager): [VillagerId, VillagerFigure] => [
        villager.id,
        figures.find(
          (figure: VillagerFigure) => figure.villager.id === villager.id,
        ) ?? new StandingFigure(villager, context),
      ]),
    );
  }

  /**
   * Shows what each figure has of its own, as far as the models have been
   * loaded, as {@link VillagerFigure.useModels} tells.
   *
   * @param {Scene} scene - The village.
   */
  useModels(scene: Scene): void {
    for (const figure of this.#figures.values()) {
      figure.useModels(scene);
    }
  }

  /**
   * Shows the villagers at a frame, as the players are shown, as
   * {@link VillagerFigure.show} tells, with what a villager says once the
   * player of the page starts to talk to it, and the bubbles of the
   * villagers who go about their maps kept above their heads.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  show(frame: FigureFrame): void {
    this.#shownMonsters = frame.view.monsters;
    for (const figure of this.#figures.values()) {
      figure.show(frame);
    }
    this.#showTalk(frame);
    this.#followHeads(frame.shownStep);
  }

  /**
   * Has the villagers go on by the time since the last frame, once
   * everything else of the frame is shown, as
   * {@link VillagerFigure.update} tells.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  update(seconds: number, frame: FigureFrame): void {
    for (const figure of this.#figures.values()) {
      figure.update(seconds, frame);
    }
  }

  /**
   * Has the figures of the villagers of the map the page leaves forget what
   * was shown of them there, as {@link VillagerFigure.clear} tells, and
   * forgets the monsters shown.
   *
   * @param {MapId} map - The map left.
   */
  clear(map: MapId): void {
    for (const figure of this.#figures.values()) {
      if (figure.villager.map === map) {
        figure.clear(map);
      }
    }
    this.#shownMonsters = [];
  }

  /**
   * Shows what a villager says above its head once the player of the page
   * starts to talk to it, as predicted, if the villager chatters: one of
   * its lines, unless the server chooses what it says, as
   * {@link hasServerWords} tells.
   *
   * @param {FigureFrame} frame - How things are shown at the frame: the
   *   motion of the player of the page as predicted, the step of the server
   *   the motion is after, the monsters in the map as the server last told,
   *   and the step the villager is shown at.
   */
  #showTalk(frame: FigureFrame): void {
    const { speech, record } = this.#context;
    const villager: Villager | null = this.#talks.noticeTalk(
      frame.ownMotion,
      frame.ownStep,
      frame.map,
      frame.latestMonsters ?? [],
    );
    // A villager whose words the server chooses says what the server tells
    // it to, and any other with lines of its own one of them.
    if (
      villager !== null &&
      !hasServerWords(villager, record.quests) &&
      describeVillager(this.#translator, villager).lines.length > 0
    ) {
      const head: Vector3 | null = this.#findFigure(villager).findHeadTop(
        frame.shownStep ?? 0,
        this.#shownMonsters,
      );
      if (head !== null) {
        speech.say(villager, head);
      }
    }
  }

  /**
   * Keeps the bubbles of the villagers who go about their maps above their
   * heads, as {@link VillagerFigure.goesAbout} tells, as far as their
   * figures find their heads.
   *
   * @param {number | null} shownStep - The step the page shows, or `null`
   *   while it shows none.
   */
  #followHeads(shownStep: number | null): void {
    for (const figure of this.#figures.values()) {
      const head: Vector3 | null = figure.goesAbout
        ? figure.findHeadTop(shownStep, this.#shownMonsters)
        : null;
      if (head !== null) {
        this.#context.speech.follow(figure.villager, head);
      }
    }
  }

  /**
   * Shows a line a villager says to the player of the page, as the server
   * tells of it, in a bubble above the head of the villager, if the
   * villager is in the map shown, the player is not in a dialogue, and the
   * figure of the villager has it say the line, as
   * {@link VillagerFigure.canSay} tells.
   *
   * @param {VillagerId} id - The villager.
   * @param {string} line - The message of the line.
   * @param {number} step - The step of the server the villager is shown at.
   * @param {MapId} map - The map the page shows.
   */
  showSpeech(id: VillagerId, line: string, step: number, map: MapId): void {
    const villager: Villager = getVillager(id);
    const { speech, isInDialogue } = this.#context;
    if (!isMessageId(line) || villager.map !== map || isInDialogue()) {
      return;
    }
    const figure: VillagerFigure = this.#findFigure(villager);
    if (!figure.canSay(line)) {
      return;
    }
    const head: Vector3 | null = figure.findHeadTop(step, this.#shownMonsters);
    if (head !== null) {
      speech.say(villager, head, line);
    }
  }

  /**
   * Finds the figure of a villager.
   *
   * @param {Villager} villager - The villager.
   * @returns {VillagerFigure} Its figure.
   * @throws {Error} If the villager has no figure.
   */
  #findFigure(villager: Villager): VillagerFigure {
    const figure: VillagerFigure | undefined = this.#figures.get(villager.id);
    if (figure === undefined) {
      throw new Error(`The villager ${villager.id} has no figure.`);
    }
    return figure;
  }
}
