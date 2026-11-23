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
 * @module client/bubble-sprite A single speech bubble as it is drawn: its
 *   picture with its tail, its size for the view it is seen in, and its
 *   place on the screen.
 */

import {
  CanvasTexture,
  MathUtils,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Camera, Object3D } from 'three';

import { findLanguage } from './language.ts';
import type { SpeechWords } from './speech-lines.ts';
import { wrapText } from './speech-text.ts';

/** The order the bubbles are drawn in, after the models and the numbers. */
const BUBBLE_RENDER_ORDER = 30;
/**
 * How many pixels the picture of a bubble has across for each pixel the
 * bubble is laid out in, for a sharp picture on a dense screen.
 */
const PIXEL_RATIO = 2;
/**
 * How big each pixel a bubble is laid out in is drawn, in meters at one
 * meter from the camera, whatever the distance of the bubble.
 */
const LAYOUT_PIXEL_SIZE = 0.001;
/**
 * The least height of the view a bubble is drawn for, in CSS pixels: in a
 * shorter view, as on a phone held on its side, a bubble is drawn as large
 * as in a view this tall, for its words to stay legible.
 */
const LEAST_VIEW_HEIGHT = 600;
/** The widest the words of a bubble can be, in pixels. */
const TEXT_WIDTH = 320;
/** The size of the words, in pixels. */
const FONT_SIZE = 20;
/** The height of each line of the words, in pixels. */
const LINE_HEIGHT = 26;
/** The room between the edge of a bubble and its words, in pixels. */
const PADDING = 14;
/** The widest a bubble can be, in pixels. */
const BUBBLE_WIDTH: number = TEXT_WIDTH + PADDING * 2;
/**
 * The least width a bubble is laid out to fit in, however narrow the view,
 * in pixels.
 */
const LEAST_BUBBLE_WIDTH = 160;
/** The share of the width of the view a bubble may take at most. */
const MOST_VIEW_SHARE = 0.85;
/** The least room between a bubble and the edge of the view, in CSS pixels. */
const SCREEN_MARGIN = 8;
/** The radius of the corners of a bubble, in pixels. */
const CORNER_RADIUS = 12;
/**
 * How far down the tail of a bubble reaches, and half its width, in pixels.
 */
const TAIL_SIZE = 12;
/** The width of the outline of a bubble, in pixels. */
const OUTLINE_WIDTH = 2;
/** The color of a bubble. */
const BUBBLE_COLOR = '#fffdf4';
/** The color of the outline of a bubble. */
const OUTLINE_COLOR = '#4a3a28';
/** The color of the name of the one who speaks. */
const NAME_COLOR = '#9a4a12';
/** The color of the words. */
const TEXT_COLOR = '#1e1e1e';

/** The view the bubbles are seen in. */
export interface ViewSize {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** The field of view of the camera, from top to bottom, in degrees. */
  readonly fieldOfView: number;
}

/**
 * Where a bubble is on the screen, in CSS pixels from the top left corner
 * of the view.
 */
export interface SpeechScreen {
  /** The left edge of the bubble. */
  readonly left: number;
  /** The top edge of the bubble. */
  readonly top: number;
  /** The right edge of the bubble. */
  readonly right: number;
  /** The bottom edge of the bubble, above its tail. */
  readonly bottom: number;
  /** Where the tip of its tail is across the view. */
  readonly tipX: number;
  /** Where the tip of its tail is down the view. */
  readonly tipY: number;
  /**
   * Where the foot of the bubble would be across the view, just above the
   * head of the one who speaks, were the bubble not shifted.
   */
  readonly footX: number;
  /**
   * Where the foot of the bubble would be down the view, were the bubble
   * not shifted.
   */
  readonly footY: number;
}

/**
 * Traces the outline of a bubble, without its tail, leaving room for the
 * tail below it.
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
  context.arcTo(edge, bottom, edge, edge, CORNER_RADIUS);
  context.arcTo(edge, edge, right, edge, CORNER_RADIUS);
  context.closePath();
}

/**
 * Draws the tail of a bubble, to be laid over the foot of the bubble,
 * covering its outline where the two meet.
 *
 * @param {number} width - The width of the bubble it belongs to, in pixels.
 * @param {number} height - The height of the bubble it belongs to, with
 *   its tail, in pixels.
 * @returns {Sprite} The tail, with its tip at its position, to be added to
 *   the bubble, its scale a share of that of the bubble.
 */
function paintTail(width: number, height: number): Sprite {
  const tailWidth: number = (TAIL_SIZE + OUTLINE_WIDTH) * 2;
  const tailHeight: number = TAIL_SIZE + OUTLINE_WIDTH;
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.width = tailWidth * PIXEL_RATIO;
  canvas.height = tailHeight * PIXEL_RATIO;
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  if (context !== null) {
    const edge: number = OUTLINE_WIDTH / 2;
    const middle: number = tailWidth / 2;
    const tip: number = tailHeight - edge;
    context.scale(PIXEL_RATIO, PIXEL_RATIO);
    context.beginPath();
    context.moveTo(middle - TAIL_SIZE, 0);
    context.lineTo(middle + TAIL_SIZE, 0);
    context.lineTo(middle + TAIL_SIZE, edge);
    context.lineTo(middle, tip);
    context.lineTo(middle - TAIL_SIZE, edge);
    context.closePath();
    context.fillStyle = BUBBLE_COLOR;
    context.fill();
    context.beginPath();
    context.moveTo(middle + TAIL_SIZE, edge);
    context.lineTo(middle, tip);
    context.lineTo(middle - TAIL_SIZE, edge);
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE_COLOR;
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const tail = new Sprite(
    new SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: false,
    }),
  );
  tail.renderOrder = BUBBLE_RENDER_ORDER + 1;
  tail.frustumCulled = false;
  tail.center.set(0.5, 0);
  tail.scale.set(tailWidth / width, tailHeight / height, 1);
  return tail;
}

/**
 * Draws a bubble with the name of a villager and what it says, or with
 * what a player says alone under no name, the same size on the screen
 * however far it is, over everything else, in the fonts of their language.
 * The words are drawn as plain text, whatever they hold, a line break in
 * them starting a new line.
 *
 * @param {SpeechWords} words - The name and what it says.
 * @param {number} widest - The widest the bubble may be, in pixels, its
 *   words wrapped onto as many lines as they need to fit, unless a single
 *   word, or the name, is wider.
 * @returns {Sprite} The bubble, with the tip of its tail at its position,
 *   and its tail as a sprite of its own added to it.
 */
export function paintSpeech(words: SpeechWords, widest: number): Sprite {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.lang = words.language;
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  const { fontFamily } = findLanguage(words.language);
  const nameFont = `bold ${String(FONT_SIZE)}px ${fontFamily}`;
  const textFont = `${String(FONT_SIZE)}px ${fontFamily}`;
  let lines: string[] = [words.line];
  const textWidth: number = widest - PADDING * 2;
  let width: number = textWidth;
  if (context !== null) {
    context.font = textFont;
    const measure = (text: string): number => context.measureText(text).width;
    lines = wrapText(words.line, textWidth, measure);
    const linesWidth: number = Math.max(...lines.map(measure));
    context.font = nameFont;
    width = Math.max(linesWidth, measure(words.name));
  }
  width = Math.ceil(width) + PADDING * 2;
  const nameLines: number = words.name === '' ? 0 : 1;
  const height: number =
    PADDING * 2 + LINE_HEIGHT * (lines.length + nameLines) + TAIL_SIZE;
  canvas.width = width * PIXEL_RATIO;
  canvas.height = height * PIXEL_RATIO;
  if (context !== null) {
    context.scale(PIXEL_RATIO, PIXEL_RATIO);
    traceBubble(context, width, height);
    context.fillStyle = BUBBLE_COLOR;
    context.fill();
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE_COLOR;
    context.stroke();
    context.textBaseline = 'middle';
    context.font = nameFont;
    context.fillStyle = NAME_COLOR;
    context.fillText(words.name, PADDING, PADDING + LINE_HEIGHT / 2);
    context.font = textFont;
    context.fillStyle = TEXT_COLOR;
    lines.forEach((line: string, index: number) => {
      const y: number = PADDING + LINE_HEIGHT * (index + nameLines + 0.5);
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
  sprite.add(paintTail(width, height));
  return sprite;
}

/**
 * Sets how opaque a bubble and its tail are.
 *
 * @param {Sprite} sprite - The bubble.
 * @param {number} opacity - How opaque, from 0 to 1.
 */
export function setOpacity(sprite: Sprite, opacity: number): void {
  sprite.traverse((part: Object3D) => {
    if (part instanceof Sprite) {
      part.material.opacity = opacity;
    }
  });
}

/**
 * Draws a bubble and its tail above the bubbles of the layers below.
 *
 * @param {Sprite} sprite - The bubble.
 * @param {number} layer - How far above the other bubbles it is drawn,
 *   from 0.
 */
export function stackBubble(sprite: Sprite, layer: number): void {
  sprite.renderOrder = BUBBLE_RENDER_ORDER + layer * 2;
  for (const part of sprite.children) {
    part.renderOrder = sprite.renderOrder + 1;
  }
}

/**
 * Frees what a bubble and its tail were drawn with, once the bubble is
 * taken away.
 *
 * @param {Sprite} sprite - The bubble.
 */
export function disposeBubble(sprite: Sprite): void {
  sprite.traverse((part: Object3D) => {
    if (part instanceof Sprite) {
      part.material.map?.dispose();
      part.material.dispose();
    }
  });
}

/**
 * Tells how many times as large as painted the bubbles are drawn in a
 * view.
 *
 * @param {ViewSize | null} view - The view, or `null` while it is not
 *   known.
 * @returns {number} How many times as large, at least 1.
 */
function findEnlargement(view: ViewSize | null): number {
  return view === null ? 1 : Math.max(1, LEAST_VIEW_HEIGHT / view.height);
}

/**
 * Tells how large each pixel a bubble is laid out in is drawn in a view.
 *
 * @param {ViewSize | null} view - The view, or `null` while it is not
 *   known.
 * @returns {number} The size, in CSS pixels, or 1 without a view.
 */
function findPixelSize(view: ViewSize | null): number {
  return view === null
    ? 1
    : (LAYOUT_PIXEL_SIZE * findEnlargement(view) * view.height) /
        (2 * Math.tan(MathUtils.degToRad(view.fieldOfView) / 2));
}

/**
 * Tells the widest a bubble may be laid out to be in a view.
 *
 * @param {ViewSize | null} view - The view, or `null` while it is not
 *   known.
 * @returns {number} The width, in pixels: the widest a bubble can be, or
 *   less in a view too narrow for a bubble that wide, but never less than
 *   the least width a bubble is laid out to fit in.
 */
export function findWidest(view: ViewSize | null): number {
  if (view === null) {
    return BUBBLE_WIDTH;
  }
  const fitting: number = Math.floor(
    (view.width * MOST_VIEW_SHARE) / findPixelSize(view),
  );
  return MathUtils.clamp(fitting, LEAST_BUBBLE_WIDTH, BUBBLE_WIDTH);
}

/**
 * Tells how large the words of a bubble are drawn in a view.
 *
 * @param {ViewSize} view - The view.
 * @returns {number} The size of the words, in CSS pixels.
 */
export function findTextSize(view: ViewSize): number {
  return FONT_SIZE * findPixelSize(view);
}

/**
 * Draws a bubble at the size for a view.
 *
 * @param {Sprite} sprite - The bubble.
 * @param {readonly [number, number]} painted - The width and height of
 *   the bubble as it was drawn.
 * @param {ViewSize | null} view - The view, or `null` while it is not
 *   known, for the bubble to be drawn as painted.
 */
export function enlargeBubble(
  sprite: Sprite,
  painted: readonly [number, number],
  view: ViewSize | null,
): void {
  const enlargement: number = findEnlargement(view);
  sprite.scale.set(painted[0] * enlargement, painted[1] * enlargement, 1);
}

/**
 * Fits a bubble within a length of the view along one of its axes.
 *
 * @param {number} start - Where the bubble would start, in CSS pixels.
 * @param {number} size - The size of the bubble along the axis.
 * @param {number} room - The length of the view along the axis.
 * @returns {number} Where the bubble starts, as near where it would as
 *   leaves {@link SCREEN_MARGIN} on either side of it, or the margin
 *   before it alone where the view is too short for both.
 */
function fitWithin(start: number, size: number, room: number): number {
  return Math.max(Math.min(start, room - SCREEN_MARGIN - size), SCREEN_MARGIN);
}

/**
 * Places a bubble on the screen as a camera shows it in a view.
 *
 * A bubble stands above the head of the one who speaks, but shifts
 * inward as far as it must to stay wholly within the view, at least 8
 * pixels from its edges, its top kept in view before its foot in a view
 * too short for it.  Its tail hangs from its foot, under the one who
 * speaks as far as it reaches along the foot, which it does to within the
 * round corners.  Once the one who speaks is beyond the edge of the view,
 * the bubble stays at that edge, its tail toward it.  Once the one who
 * speaks is behind the camera, the bubble is not seen, and is not placed.
 *
 * @param {Sprite} sprite - The bubble, its foot at its position, drawn at
 *   the size for the view.
 * @param {ViewSize} view - The view.
 * @param {Camera} camera - The camera, its matrices up to date.
 * @returns {SpeechScreen | null} Where the bubble is on the screen, or
 *   `null` while the one who speaks is behind the camera.
 */
export function placeBubble(
  sprite: Sprite,
  view: ViewSize,
  camera: Camera,
): SpeechScreen | null {
  sprite.updateWorldMatrix(true, false);
  const foot: Vector3 = new Vector3()
    .setFromMatrixPosition(sprite.matrixWorld)
    .applyMatrix4(camera.matrixWorldInverse);
  if (foot.z >= 0) {
    return null;
  }
  foot.applyMatrix4(camera.projectionMatrix);
  const x: number = ((foot.x + 1) / 2) * view.width;
  const y: number = ((1 - foot.y) / 2) * view.height;
  // How many CSS pixels a meter at one meter from the camera is drawn.
  const scale: number =
    view.height / (2 * Math.tan(MathUtils.degToRad(view.fieldOfView) / 2));
  const width: number = sprite.scale.x * scale;
  const height: number = sprite.scale.y * scale;
  const pixel: number = findPixelSize(view);
  const left: number = fitWithin(x - width / 2, width, view.width);
  const top: number = fitWithin(y - height, height, view.height);
  const reach: number = (CORNER_RADIUS + TAIL_SIZE) * pixel;
  const tipX: number =
    width > reach * 2
      ? MathUtils.clamp(x, left + reach, left + width - reach)
      : left + width / 2;
  // How far the bubble is shifted right and down from above the head.
  const right: number = left - (x - width / 2);
  const down: number = top - (y - height);
  sprite.center.set(0.5 - right / width, down / height);
  const tail: Sprite | undefined = sprite.children.find(
    (child: Object3D): child is Sprite => child instanceof Sprite,
  );
  if (tail !== undefined) {
    tail.center.set(
      0.5 - (tipX - x) / (tail.scale.x * width),
      down / (tail.scale.y * height),
    );
  }
  return {
    left,
    top,
    right: left + width,
    bottom: top + height - TAIL_SIZE * pixel,
    tipX,
    tipY: top + height,
    footX: x,
    footY: y,
  };
}
