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
 * @module client/hit-markers Numbers that float up from whatever is hit or
 *   healed.
 */

import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import type { Object3D } from 'three';

import type { GroundVector } from '@clovervale/shared';

/** How long a number floats, in seconds. */
const MARKER_DURATION = 1;
/** How high above the ground a number starts by default, in metres. */
const START_HEIGHT = 2.3;
/** How fast a number rises, in metres per second. */
const RISE_SPEED = 0.8;
/** The height of a number, in metres. */
const MARKER_HEIGHT = 0.45;
/** The width of the picture a number is drawn on, in pixels. */
const CANVAS_WIDTH = 128;
/** The height of the picture a number is drawn on, in pixels. */
const CANVAS_HEIGHT = 64;
/** The order the numbers are drawn in, after the models and the bars. */
const MARKER_RENDER_ORDER = 20;

/** A number that floats. */
interface Marker {
  /** The number, drawn on a sprite. */
  readonly sprite: Sprite;
  /** How long it has floated, in seconds. */
  age: number;
}

/** The numbers that float up from whatever is hit or healed. */
export class HitMarkers {
  readonly #parent: Object3D;
  readonly #markers: Marker[] = [];

  /**
   * Starts without numbers.
   *
   * @param {Object3D} parent - What the numbers are added to.
   */
  constructor(parent: Object3D) {
    this.#parent = parent;
  }

  /**
   * Floats a number up from where something was hit or healed, fading away.
   *
   * @param {GroundVector} position - Where the one hit or healed stands.
   * @param {string} text - The number, with its sign.
   * @param {string} colour - The colour of the number.
   * @param {number} [height] - How high above the ground the number starts,
   *   in metres.
   */
  show(
    position: GroundVector,
    text: string,
    colour: string,
    height = START_HEIGHT,
  ): void {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
    if (context !== null) {
      context.font = `bold ${String(CANVAS_HEIGHT * 0.8)}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = 6;
      context.strokeStyle = '#000000';
      context.fillStyle = colour;
      context.strokeText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      context.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const sprite = new Sprite(
      new SpriteMaterial({ map: texture, depthTest: false }),
    );
    sprite.renderOrder = MARKER_RENDER_ORDER;
    sprite.scale.set(
      (MARKER_HEIGHT * CANVAS_WIDTH) / CANVAS_HEIGHT,
      MARKER_HEIGHT,
      1,
    );
    sprite.position.set(position.x, height, position.z);
    this.#parent.add(sprite);
    this.#markers.push({ sprite, age: 0 });
  }

  /**
   * Floats the numbers up, and takes away those that have faded.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    for (const marker of [...this.#markers]) {
      marker.age += seconds;
      const { sprite } = marker;
      if (marker.age >= MARKER_DURATION) {
        this.#removeMarker(marker);
        continue;
      }
      sprite.position.y += RISE_SPEED * seconds;
      sprite.material.opacity = 1 - marker.age / MARKER_DURATION;
    }
  }

  /** Takes every number away at once, however far it has floated. */
  clear(): void {
    for (const marker of [...this.#markers]) {
      this.#removeMarker(marker);
    }
  }

  /**
   * Takes a number away.
   *
   * @param {Marker} marker - The number.
   */
  #removeMarker(marker: Marker): void {
    const { sprite } = marker;
    this.#parent.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
    this.#markers.splice(this.#markers.indexOf(marker), 1);
  }
}
