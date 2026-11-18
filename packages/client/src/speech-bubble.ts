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
 * @module client/speech-bubble The bubble above the head of a villager that
 *   shows what it says.
 */

import {
  Box3,
  CanvasTexture,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Object3D } from 'three';

import { findPlacement } from '@clovervale/shared';
import type { Villager } from '@clovervale/shared';

/** How fast a line is taken to be read, in words per second. */
export const READING_SPEED = 3;
/** How long it takes to notice a bubble before reading it, in seconds. */
const NOTICE_DURATION = 1.5;
/** How long a bubble takes to fade away at its end, in seconds. */
const FADE_DURATION = 0.5;
/** The height of the top of a villager whose model is missing, in metres. */
const DEFAULT_HEAD_TOP = 1.8;
/** The room between the top of the head and the bubble, in metres. */
const BUBBLE_MARGIN = 0.15;
/** The order the bubbles are drawn in, after the models and the numbers. */
const BUBBLE_RENDER_ORDER = 30;

/**
 * How many pixels the picture of a bubble has across for each pixel the
 * bubble is laid out in, for a sharp picture on a dense screen.
 */
const PIXEL_RATIO = 2;
/**
 * How big each pixel a bubble is laid out in is drawn, in metres at one
 * metre from the camera, whatever the distance of the bubble.
 */
const LAYOUT_PIXEL_SIZE = 0.001;
/** The widest the words of a bubble can be, in pixels. */
const TEXT_WIDTH = 320;
/** The size of the words, in pixels. */
const FONT_SIZE = 20;
/** The height of each line of the words, in pixels. */
const LINE_HEIGHT = 26;
/** The room between the edge of a bubble and its words, in pixels. */
const PADDING = 14;
/** The radius of the corners of a bubble, in pixels. */
const CORNER_RADIUS = 12;
/**
 * How far down the tail of a bubble reaches, and half its width, in pixels.
 */
const TAIL_SIZE = 12;
/** The width of the outline of a bubble, in pixels. */
const OUTLINE_WIDTH = 2;
/** The colour of a bubble. */
const BUBBLE_COLOUR = '#fffdf4';
/** The colour of the outline of a bubble. */
const OUTLINE_COLOUR = '#4a3a28';
/** The colour of the name of the one who speaks. */
const NAME_COLOUR = '#9a4a12';
/** The colour of the words. */
const TEXT_COLOUR = '#1e1e1e';

/** What a bubble shows, and where. */
export interface SpeechView {
  /** The name of the villager who speaks. */
  readonly name: string;
  /** What the villager says. */
  readonly line: string;
  /** The position of the foot of the bubble along the X axis, in metres. */
  readonly x: number;
  /** The height of the foot of the bubble, in metres. */
  readonly y: number;
  /** The position of the foot of the bubble along the Z axis, in metres. */
  readonly z: number;
}

/** A bubble being shown. */
interface ShownSpeech {
  /** The villager who speaks. */
  readonly villager: Villager;
  /** The bubble, drawn on a sprite. */
  readonly sprite: Sprite;
  /** How long it is shown for, in seconds. */
  readonly duration: number;
  /** How long it has been shown, in seconds. */
  age: number;
}

/**
 * Breaks a text into lines between its words.
 *
 * @param {string} text - The text.
 * @param {number} width - The widest a line may be.
 * @param {(text: string) => number} measure - Measures the width of a
 *   text.
 * @returns {string[]} The lines, each as wide as it may be at most, unless
 *   it is a single word that is wider.
 */
export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ').filter(Boolean)) {
    const longer: string = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measure(longer) > width) {
      lines.push(line);
      line = word;
    } else {
      line = longer;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Measures how long a bubble shows a line for.
 *
 * @param {string} line - The line.
 * @returns {number} Time enough to notice the bubble and to read the line
 *   at {@link READING_SPEED} words a second, in seconds.
 */
export function measureSpeechDuration(line: string): number {
  const words: number = line.split(' ').filter(Boolean).length;
  return NOTICE_DURATION + words / READING_SPEED;
}

/**
 * Finds the top of the head of a villager, where it stands in the village.
 *
 * @param {Villager} villager - The villager.
 * @param {Object3D | null} root - The root of the model of the villager,
 *   as it stands in the village, or `null` if it has no model.
 * @returns {Vector3} The point above where the villager stands at the
 *   height of the top of its model, or at a usual height without one.
 */
export function findHeadTop(
  villager: Villager,
  root: Object3D | null,
): Vector3 {
  const { x, z } = findPlacement(villager.file);
  const top: number =
    root === null ? NaN : new Box3().setFromObject(root).max.y;
  return new Vector3(x, Number.isFinite(top) ? top : DEFAULT_HEAD_TOP, z);
}

/**
 * Traces the outline of a bubble with its tail at the middle of its foot.
 *
 * @param {CanvasRenderingContext2D} context - What to trace it on.
 * @param {number} width - The width of the bubble, in pixels.
 * @param {number} height - The height of the bubble with its tail, in
 *   pixels.
 */
function traceBubble(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const edge: number = OUTLINE_WIDTH / 2;
  const right: number = width - edge;
  const bottom: number = height - TAIL_SIZE - edge;
  const middle: number = width / 2;
  context.beginPath();
  context.moveTo(middle, edge);
  context.arcTo(right, edge, right, bottom, CORNER_RADIUS);
  context.arcTo(right, bottom, edge, bottom, CORNER_RADIUS);
  context.lineTo(middle + TAIL_SIZE, bottom);
  context.lineTo(middle, height - edge);
  context.lineTo(middle - TAIL_SIZE, bottom);
  context.arcTo(edge, bottom, edge, edge, CORNER_RADIUS);
  context.arcTo(edge, edge, right, edge, CORNER_RADIUS);
  context.closePath();
}

/**
 * Draws a bubble with the name of a villager and what it says, the same
 * size on the screen however far it is, over everything else.
 *
 * @param {Villager} villager - The villager.
 * @returns {Sprite} The bubble, with the tip of its tail at its position.
 */
function paintSpeech(villager: Villager): Sprite {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  const nameFont = `bold ${String(FONT_SIZE)}px sans-serif`;
  const textFont = `${String(FONT_SIZE)}px sans-serif`;
  let lines: string[] = [villager.line];
  let width: number = TEXT_WIDTH;
  if (context !== null) {
    context.font = textFont;
    const measure = (text: string): number => context.measureText(text).width;
    lines = wrapText(villager.line, TEXT_WIDTH, measure);
    const textWidth: number = Math.max(...lines.map(measure));
    context.font = nameFont;
    width = Math.max(textWidth, measure(villager.name));
  }
  width = Math.ceil(width) + PADDING * 2;
  const height: number =
    PADDING * 2 + LINE_HEIGHT * (lines.length + 1) + TAIL_SIZE;
  canvas.width = width * PIXEL_RATIO;
  canvas.height = height * PIXEL_RATIO;
  if (context !== null) {
    context.scale(PIXEL_RATIO, PIXEL_RATIO);
    traceBubble(context, width, height);
    context.fillStyle = BUBBLE_COLOUR;
    context.fill();
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE_COLOUR;
    context.stroke();
    context.textBaseline = 'middle';
    context.font = nameFont;
    context.fillStyle = NAME_COLOUR;
    context.fillText(villager.name, PADDING, PADDING + LINE_HEIGHT / 2);
    context.font = textFont;
    context.fillStyle = TEXT_COLOUR;
    lines.forEach((line: string, index: number) => {
      const y: number = PADDING + LINE_HEIGHT * (index + 1.5);
      context.fillText(line, PADDING, y);
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(
    new SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: false,
    }),
  );
  sprite.renderOrder = BUBBLE_RENDER_ORDER;
  sprite.center.set(0.5, 0);
  sprite.scale.set(width * LAYOUT_PIXEL_SIZE, height * LAYOUT_PIXEL_SIZE, 1);
  return sprite;
}

/** The bubble that shows what the villager last talked to says. */
export class SpeechBubble {
  readonly #parent: Object3D;
  readonly #paint: (villager: Villager) => Sprite;
  #shown: ShownSpeech | null = null;

  /**
   * Starts without a bubble.
   *
   * @param {Object3D} parent - What the bubble is added to.
   * @param {(villager: Villager) => Sprite} [paint] - Draws the bubble of a
   *   villager, with the tip of its tail at its position, as a readable
   *   bubble with the name of the villager and what it says by default.
   */
  constructor(
    parent: Object3D,
    paint: (villager: Villager) => Sprite = paintSpeech,
  ) {
    this.#parent = parent;
    this.#paint = paint;
  }

  /**
   * Shows what a villager says, in a bubble just above its head, for as
   * long as {@link measureSpeechDuration} tells, in place of any bubble
   * shown before.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   */
  say(villager: Villager, head: Vector3): void {
    this.#hide();
    const sprite: Sprite = this.#paint(villager);
    sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    this.#parent.add(sprite);
    this.#shown = {
      villager,
      sprite,
      duration: measureSpeechDuration(villager.line),
      age: 0,
    };
  }

  /**
   * Lets the bubble age, fading it away at its end and taking it away
   * once it is over.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    const shown: ShownSpeech | null = this.#shown;
    if (shown === null) {
      return;
    }
    shown.age += seconds;
    const left: number = shown.duration - shown.age;
    if (left <= 0) {
      this.#hide();
      return;
    }
    shown.sprite.material.opacity = Math.min(left / FADE_DURATION, 1);
  }

  /**
   * Describes the bubble as it is shown now.
   *
   * @returns {SpeechView | null} What the bubble shows and where, or `null`
   *   while there is none.
   */
  describe(): SpeechView | null {
    if (this.#shown === null) {
      return null;
    }
    const { villager, sprite } = this.#shown;
    const { x, y, z } = sprite.position;
    return { name: villager.name, line: villager.line, x, y, z };
  }

  /** Takes the bubble away, if there is one. */
  #hide(): void {
    if (this.#shown === null) {
      return;
    }
    const { sprite } = this.#shown;
    this.#parent.remove(sprite);
    sprite.material.map?.dispose();
    sprite.material.dispose();
    this.#shown = null;
  }
}
