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
 * @module client/martha-figure Martha, the village chief, who fights as a
 *   monster, with her pitchfork where she leaves it.
 */

import type { Object3D, Scene, Vector3 } from 'three';

import { getVillager } from '@clovervale/shared';
import type { MonsterState, Villager } from '@clovervale/shared';

import type { FigureFrame } from './figure-set.ts';
import { LYING_PITCHFORK_FILE, MODEL_FILES } from './model-catalogue.ts';
import { findStandingHead } from './villager-figure.ts';
import type { FigureContext, VillagerFigure } from './villager-figure.ts';

/** Martha, the village chief, who fights as a monster, as a villager. */
const MARTHA_VILLAGER: Villager = getVillager('martha');

/**
 * How far to her right Martha's pitchfork lies from her middle once she
 * has dropped it, beaten, in metres.
 */
const DROPPED_PITCHFORK_ASIDE = 0.6;

/** Where Martha's pitchfork is shown, for looking at. */
export interface PitchforkView {
  /**
   * Whether it leans against the wall of her house, or `null` before its
   * model has been loaded.
   */
  readonly isOnWall: boolean | null;
  /**
   * Whether it lies on the ground where she has dropped it, or `null`
   * before its model has been loaded.
   */
  readonly isOnGround: boolean | null;
}

/**
 * The figure of Martha, the village chief, who is shown among the
 * monsters, with her pitchfork where it is when she does not hold it: on
 * the ground at her right, lying the way she faces, while she sits beaten,
 * and against the wall of her house otherwise, as it is while the page
 * shows another map.
 */
export class MarthaFigure implements VillagerFigure {
  /** What the figure is shown with. */
  readonly #context: FigureContext;
  /** Whether Martha goes about her map, which she does. */
  readonly goesAbout = true;
  /**
   * Martha's pitchfork as it leans against the wall of her house, once its
   * model has been loaded.
   */
  #wallPitchfork: Object3D | null = null;
  /**
   * Martha's pitchfork as it lies on the ground where she has dropped it,
   * once its model has been loaded.
   */
  #lyingPitchfork: Object3D | null = null;

  /**
   * Makes the figure of Martha, without her pitchfork until its models are
   * loaded.
   *
   * @param {FigureContext} context - What the figure is shown with.
   */
  constructor(context: FigureContext) {
    this.#context = context;
  }

  /**
   * Martha, as a villager.
   *
   * @returns {Villager} The villager.
   */
  get villager(): Villager {
    return MARTHA_VILLAGER;
  }

  /**
   * Shows Martha's lying pitchfork in the village, as far as its model has
   * been loaded, hidden until she drops it.
   *
   * @param {Scene} scene - The village.
   */
  useModels(scene: Scene): void {
    const { models } = this.#context;
    this.#wallPitchfork = models.findRoot(MODEL_FILES.pitchfork);
    const lying: Object3D | null = models.findRoot(LYING_PITCHFORK_FILE);
    this.#lyingPitchfork = lying;
    if (lying !== null) {
      lying.visible = false;
      lying.traverse((node: Object3D) => {
        node.castShadow = true;
      });
      scene.add(lying);
    }
  }

  /**
   * Shows Martha's pitchfork where it is when she does not hold it, while
   * the page shows her map.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  show({ map, view }: FigureFrame): void {
    if (map === this.villager.map) {
      this.#showPitchfork(
        view.monsters.find(
          (monster: MonsterState) => monster.kind === this.villager.fighter,
        ),
      );
    }
  }

  /**
   * Leans Martha's pitchfork against the wall of her house as the page
   * leaves her map.
   */
  clear(): void {
    this.#showPitchfork(undefined);
  }

  /** Does nothing over time. */
  update(): void {
    // Martha is shown among the monsters.
  }

  /**
   * Finds the top of the head of Martha where she is shown among the
   * monsters, as {@link findStandingHead} tells.
   *
   * @param {number | null} step - The step of the server she is shown at,
   *   or `null` while the page shows none.
   * @param {readonly MonsterState[]} monsters - The monsters as they are
   *   shown.
   * @returns {Vector3} The top of her head.
   */
  findHeadTop(
    step: number | null,
    monsters: readonly MonsterState[],
  ): Vector3 {
    return findStandingHead(
      MARTHA_VILLAGER,
      this.#context.models,
      step,
      monsters,
    );
  }

  /**
   * Tells whether Martha is to say a line the server tells of.
   *
   * @returns {boolean} Always.
   */
  canSay(): boolean {
    return true;
  }

  /**
   * Describes where Martha's pitchfork is shown, for looking at.
   *
   * @returns {PitchforkView} Where it is shown.
   */
  describe(): PitchforkView {
    return {
      isOnWall: this.#wallPitchfork?.visible ?? null,
      isOnGround: this.#lyingPitchfork?.visible ?? null,
    };
  }

  /**
   * Shows Martha's pitchfork where it is when she does not hold it.
   *
   * @param {MonsterState | undefined} martha - Martha as she is shown, or
   *   `undefined` if she is not.
   */
  #showPitchfork(martha: MonsterState | undefined): void {
    const isArmed: boolean = martha?.isArmed === true;
    const isDropped: boolean = martha?.mode === 'sit' && !isArmed;
    if (this.#wallPitchfork !== null) {
      this.#wallPitchfork.visible = !isArmed && !isDropped;
    }
    const lying: Object3D | null = this.#lyingPitchfork;
    if (lying === null) {
      return;
    }
    lying.visible = isDropped;
    if (martha !== undefined && isDropped) {
      const yaw: number = (martha.yaw * Math.PI) / 180;
      lying.position.set(
        martha.x - Math.cos(yaw) * DROPPED_PITCHFORK_ASIDE,
        0,
        martha.z + Math.sin(yaw) * DROPPED_PITCHFORK_ASIDE,
      );
      lying.rotation.y = yaw;
    }
  }
}
