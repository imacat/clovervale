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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/health-bar A bar above a player or a monster that shows
 *   how much health it has.
 */

import { Box3, Group, Sprite, SpriteMaterial } from 'three';
import type { Object3D } from 'three';

/** The width of a full bar, in metres. */
const BAR_WIDTH = 0.8;
/** The height of a bar, in metres. */
const BAR_HEIGHT = 0.09;
/** The room between the top of a model and its bar, in metres. */
const BAR_MARGIN = 0.25;
/** The height of the bar of a model whose size cannot be told, in metres. */
const DEFAULT_TOP = 1.8;
/** The colour of the part of a bar for the health lost. */
const BACK_COLOUR = '#3a1414';
/** The order the bars are drawn in, after the models. */
const BAR_RENDER_ORDER = 10;

/**
 * Makes one part of a bar, which is drawn over everything, facing the
 * camera.
 *
 * @param {string} colour - The colour.
 * @returns {Sprite} The part.
 */
function createPart(colour: string): Sprite {
  const sprite = new Sprite(
    new SpriteMaterial({ color: colour, depthTest: false }),
  );
  sprite.renderOrder = BAR_RENDER_ORDER;
  sprite.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
  return sprite;
}

/** A bar that floats above a model, and shows how much health it has. */
export class HealthBar {
  readonly #group = new Group();
  readonly #fill: Sprite;
  #fraction = 1;

  /**
   * Floats a full bar above a model.
   *
   * @param {Object3D} root - The root of the model, which the bar is added
   *   to.
   * @param {string} colour - The colour of the part of the bar for the
   *   health that is left.
   */
  constructor(root: Object3D, colour: string) {
    const top: number = new Box3().setFromObject(root).max.y;
    this.#group.position.y =
      (Number.isFinite(top) ? top : DEFAULT_TOP) + BAR_MARGIN;
    this.#fill = createPart(colour);
    this.#fill.renderOrder = BAR_RENDER_ORDER + 1;
    this.#group.add(createPart(BACK_COLOUR), this.#fill);
    root.add(this.#group);
  }

  /**
   * How much of the bar is filled, from 0 to 1.
   *
   * @returns {number} The fraction.
   */
  get fraction(): number {
    return this.#fraction;
  }

  /**
   * Whether the bar is to be seen.
   *
   * @returns {boolean} Whether it is.
   */
  get isVisible(): boolean {
    return this.#group.visible;
  }

  /**
   * Shows or hides the bar.
   *
   * @param {boolean} isVisible - Whether the bar is to be seen.
   */
  set isVisible(isVisible: boolean) {
    this.#group.visible = isVisible;
  }

  /**
   * Fills the bar for how much health the model has.
   *
   * @param {number} health - The health of the model.
   * @param {number} fullHealth - Its health at full health.
   */
  show(health: number, fullHealth: number): void {
    this.#fraction = Math.min(Math.max(health / fullHealth, 0), 1);
    this.#fill.visible = this.#fraction > 0;
    if (this.#fraction > 0) {
      // Each part is placed by its centre, so the filled part is moved to
      // start where the whole bar does, whichever way the camera looks.
      this.#fill.scale.x = BAR_WIDTH * this.#fraction;
      this.#fill.center.x = 0.5 / this.#fraction;
    }
  }
}
