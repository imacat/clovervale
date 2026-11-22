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
 *   shows what it says, and the bubbles above the heads of the players
 *   that show what they say.
 */

import {
  Box3,
  CanvasTexture,
  MathUtils,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Camera, Object3D } from 'three';

import { locateVillager } from '@clovervale/shared';
import type {
  MonsterState,
  PhraseCode,
  Villager,
  VillagerId,
} from '@clovervale/shared';

import { findLanguage } from './language.ts';
import type { LanguageCode } from './language.ts';
import type { PlainMessageId } from './messages/en.ts';
import type { Translator } from './translator.ts';
import { describeVillager } from './villager-words.ts';

/** How fast a line is taken to be read, in words per second. */
export const READING_SPEED = 3;
/**
 * How fast a line of Chinese or Japanese is taken to be read, in
 * characters per second.
 */
export const CHARACTER_READING_SPEED = 6;
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
/** The colour of a bubble. */
const BUBBLE_COLOUR = '#fffdf4';
/** The colour of the outline of a bubble. */
const OUTLINE_COLOUR = '#4a3a28';
/** The colour of the name of the one who speaks. */
const NAME_COLOUR = '#9a4a12';
/** The colour of the words. */
const TEXT_COLOUR = '#1e1e1e';

/**
 * A character of Chinese or Japanese, or of the punctuation that goes with
 * them, which a line may break before or after without a space.
 */
const WIDE_PATTERN = new RegExp(
  '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}' +
    '\\p{Script=Bopomofo}\\u3000-\\u303f\\u30fb\\u30fc\\uff00-\\uffef]',
  'u',
);
/**
 * The characters a line must not start with: closing punctuation, and the
 * small kana and the marks of Japanese that belong to what comes before.
 */
const CLOSING_CHARACTERS =
  '、。，．・：；？！）」』】〕〉》〗〙｝］’”…‥〜～' +
  'ーぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ々ゝゞヽヾ' +
  '!),.:;?]}';
/** The characters a line must not end with: opening punctuation. */
const OPENING_CHARACTERS = '（「『【〔〈《〖〘｛［‘“([{';
/** A character of Chinese or Japanese read one by one. */
const READ_CHARACTER_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
/**
 * A character of Chinese or Japanese, or of the punctuation that goes with
 * them, which is not read as part of a word.
 */
const WIDE_CHARACTERS_PATTERN = new RegExp(WIDE_PATTERN.source, 'gu');

/** What a bubble is to show. */
export interface SpeechWords {
  /**
   * The name of the villager who speaks, or nothing for a player, who goes
   * by no name.
   */
  readonly name: string;
  /** What the villager or the player says. */
  readonly line: string;
  /** The language of the words. */
  readonly language: LanguageCode;
}

/** A piece of text that a line does not break inside. */
interface TextPiece {
  /** The text. */
  text: string;
  /** Whether a space comes before the piece. */
  readonly isSpaced: boolean;
}

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
  /**
   * The size of the words on the screen, in CSS pixels, or `null` before
   * the bubble is told the view.
   */
  readonly textSize: number | null;
  /**
   * Where the bubble is on the screen as it was last drawn, or `null`
   * before it is drawn in a view it was told, or while the one who speaks
   * is behind the camera, where it is not seen.
   */
  readonly screen: SpeechScreen | null;
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

/** What the bubble of a player shows, and where. */
export interface SaidView {
  /** The identifier of the player who speaks. */
  readonly player: number;
  /** What the player says. */
  readonly line: string;
  /** The position of the foot of the bubble along the X axis, in metres. */
  readonly x: number;
  /** The height of the foot of the bubble, in metres. */
  readonly y: number;
  /** The position of the foot of the bubble along the Z axis, in metres. */
  readonly z: number;
  /**
   * Whether the bubble is to be seen, which it is not while the player is
   * off the screen.
   */
  readonly isShown: boolean;
  /**
   * Where the bubble is on the screen as it was last drawn, or `null`
   * before it is drawn in a view it was told, or while it is not seen.
   */
  readonly screen: SpeechScreen | null;
}

/** The view the bubbles are seen in. */
interface ViewSize {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
  /** The field of view of the camera, from top to bottom, in degrees. */
  readonly fieldOfView: number;
}

/** A bubble being shown. */
interface ShownSpeech {
  /** The villager who speaks, or `null` for a player. */
  readonly villager: Villager | null;
  /** The position of the line the villager says among its lines. */
  readonly lineIndex: number;
  /**
   * The message of the line the villager says, if it was given, in place of
   * one of its lines, or the message of the phrase a player says, if it
   * says one.
   */
  readonly lineId: PlainMessageId | null;
  /** What the bubble shows. */
  words: SpeechWords;
  /** The bubble, drawn on a sprite. */
  sprite: Sprite;
  /** The width and height of the bubble as it was drawn. */
  painted: readonly [number, number];
  /** The widest the bubble was laid out to be, in pixels. */
  widest: number;
  /** Where the bubble is on the screen, or `null` where it is not. */
  screen: SpeechScreen | null;
  /** How long it is shown for, in seconds. */
  readonly duration: number;
  /** How long it has been shown, in seconds. */
  age: number;
  /**
   * How far above the other bubbles it is drawn: 0 for the bubble of a
   * villager, and a higher number for each later bubble of a player.
   */
  readonly layer: number;
}

/**
 * Cuts a text into the pieces a line does not break inside: words between
 * spaces, and single characters of Chinese and Japanese, each with any
 * punctuation that must not start a line, such as a closing bracket,
 * attached after it, and any punctuation that must not end a line, such as
 * an opening bracket, attached before it.
 *
 * @param {string} text - The text.
 * @returns {TextPiece[]} The pieces, in order.
 */
function cutText(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  let isSpaced = false;
  let isOpen = false;
  for (const character of text) {
    if (/\s/u.test(character)) {
      isSpaced = pieces.length > 0;
      continue;
    }
    const last: TextPiece | undefined = pieces.at(-1);
    const isWide: boolean = WIDE_PATTERN.test(character);
    const joins: boolean =
      !isSpaced &&
      (isOpen ||
        CLOSING_CHARACTERS.includes(character) ||
        (!isWide && !WIDE_PATTERN.test(last?.text.at(-1) ?? '')));
    if (last !== undefined && joins) {
      last.text += character;
    } else {
      pieces.push({ text: character, isSpaced });
    }
    isSpaced = false;
    isOpen = OPENING_CHARACTERS.includes(character);
  }
  return pieces;
}

/**
 * Breaks a text into lines at its line breaks, and each of the rows they
 * make between its words, and between the characters of Chinese and
 * Japanese, which have no spaces between words, never starting a line
 * with closing punctuation or ending one with opening punctuation.
 *
 * @param {string} text - The text.
 * @param {number} width - The widest a line may be.
 * @param {(text: string) => number} measure - Measures the width of a
 *   text.
 * @returns {string[]} The lines, each as wide as it may be at most, unless
 *   it is a single word, or a character with its punctuation, that is
 *   wider.
 */
export function wrapText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  return text
    .split('\n')
    .flatMap((row: string) => wrapRow(row, width, measure));
}

/**
 * Breaks a row of text without line breaks into lines, as {@link wrapText}
 * tells.
 *
 * @param {string} text - The row.
 * @param {number} width - The widest a line may be.
 * @param {(text: string) => number} measure - Measures the width of a
 *   text.
 * @returns {string[]} The lines.
 */
function wrapRow(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const piece of cutText(text)) {
    const longer: string =
      line === ''
        ? piece.text
        : `${line}${piece.isSpaced ? ' ' : ''}${piece.text}`;
    if (line !== '' && measure(longer) > width) {
      lines.push(line);
      line = piece.text;
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
 * @returns {number} Time enough to notice the bubble and to read the line,
 *   its words at {@link READING_SPEED} words a second, and its characters
 *   of Chinese and Japanese at {@link CHARACTER_READING_SPEED} characters a
 *   second, in seconds.
 */
export function measureSpeechDuration(line: string): number {
  const characters: number = line.match(READ_CHARACTER_PATTERN)?.length ?? 0;
  const words: number = line
    .replace(WIDE_CHARACTERS_PATTERN, ' ')
    .split(/\s+/u)
    .filter(Boolean).length;
  return (
    NOTICE_DURATION +
    words / READING_SPEED +
    characters / CHARACTER_READING_SPEED
  );
}

/**
 * Finds the top of the head of a villager, where it stands in its map at a
 * step of the simulation.
 *
 * @param {Villager} villager - The villager.
 * @param {Object3D | null} root - The root of the model of the villager,
 *   as it stands in its map, or `null` if it has no model.
 * @param {number} step - The number of the step, which may fall between
 *   two steps.
 * @param {readonly MonsterState[]} monsters - The monsters of its map, as
 *   they are shown, which tell where a villager who fights as a monster
 *   stands.
 * @returns {Vector3} The point above where the villager stands at the
 *   height of the top of its model, or at a usual height without one.
 */
export function findHeadTop(
  villager: Villager,
  root: Object3D | null,
  step: number,
  monsters: readonly MonsterState[],
): Vector3 {
  const { x, z } = locateVillager(villager, step, monsters);
  const top: number =
    root === null ? NaN : new Box3().setFromObject(root).max.y;
  return new Vector3(x, Number.isFinite(top) ? top : DEFAULT_HEAD_TOP, z);
}

/**
 * Finds the top of the head of a player as it is shown.
 *
 * @param {Object3D} root - The root of the model of the player, where it
 *   stands.
 * @returns {Vector3} The point above where the player stands at the height
 *   of the top of its model, with whatever is shown above it.
 */
export function findFigureTop(root: Object3D): Vector3 {
  return new Vector3(
    root.position.x,
    new Box3().setFromObject(root).max.y,
    root.position.z,
  );
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
    context.fillStyle = BUBBLE_COLOUR;
    context.fill();
    context.beginPath();
    context.moveTo(middle + TAIL_SIZE, edge);
    context.lineTo(middle, tip);
    context.lineTo(middle - TAIL_SIZE, edge);
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE_COLOUR;
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
function paintSpeech(words: SpeechWords, widest: number): Sprite {
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
    context.fillStyle = BUBBLE_COLOUR;
    context.fill();
    context.lineWidth = OUTLINE_WIDTH;
    context.strokeStyle = OUTLINE_COLOUR;
    context.stroke();
    context.textBaseline = 'middle';
    context.font = nameFont;
    context.fillStyle = NAME_COLOUR;
    context.fillText(words.name, PADDING, PADDING + LINE_HEIGHT / 2);
    context.font = textFont;
    context.fillStyle = TEXT_COLOUR;
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
 * Sets how opaque a bubble and its tail are.
 *
 * @param {Sprite} sprite - The bubble.
 * @param {number} opacity - How opaque, from 0 to 1.
 */
function setOpacity(sprite: Sprite, opacity: number): void {
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
function stackBubble(sprite: Sprite, layer: number): void {
  sprite.renderOrder = BUBBLE_RENDER_ORDER + layer * 2;
  for (const part of sprite.children) {
    part.renderOrder = sprite.renderOrder + 1;
  }
}

/**
 * The bubble that shows what the villager last talked to says, and a
 * bubble for each player that shows what it last said.
 */
export class SpeechBubble {
  readonly #parent: Object3D;
  readonly #translator: Translator;
  readonly #paint: (words: SpeechWords, widest: number) => Sprite;
  readonly #random: () => number;
  #shown: ShownSpeech | null = null;
  /** The bubbles of the players, by the identifiers of the players. */
  readonly #said = new Map<number, ShownSpeech>();
  /** The number of bubbles of players shown so far. */
  #saidCount = 0;
  /** The position of the line each villager said last, by villager. */
  readonly #lastLines = new Map<VillagerId, number>();
  /** The villagers who have told the player of the page who they are. */
  #acquaintances: readonly VillagerId[] = [];
  /** The view the bubbles are seen in, or `null` until it is told. */
  #view: ViewSize | null = null;

  /**
   * Starts without a bubble.
   *
   * @param {Object3D} parent - What the bubble is added to.
   * @param {Translator} translator - The translator of the text of the page.
   * @param {(words: SpeechWords, widest: number) => Sprite} [paint] - Draws
   *   a bubble no wider than told, in pixels, unless its name or a single
   *   word is wider, with the tip of its tail at its position, and its tail,
   *   if it has one of its own, as a sprite added to it, as a readable
   *   bubble with the name of the villager and what it says by default.
   * @param {() => number} [random] - Gives a random number in [0, 1) each
   *   time it is called, to pick the line a villager says by, as
   *   `Math.random` does by default.
   */
  constructor(
    parent: Object3D,
    translator: Translator,
    paint: (words: SpeechWords, widest: number) => Sprite = paintSpeech,
    random: () => number = Math.random,
  ) {
    this.#parent = parent;
    this.#translator = translator;
    this.#paint = paint;
    this.#random = random;
  }

  /**
   * Shows what a villager says, in the language of the page, in a bubble
   * just above its head, for as long as {@link measureSpeechDuration}
   * tells, in place of any bubble of a villager shown before.  The
   * bubbles of the players stay as they are.
   *
   * A villager says the line it is given, or else, with several lines, one
   * of them, picked at random, but never the line it said the time before,
   * save that one who greets first says its first line the first time.
   * It is called by the name it goes by once it has told the player of the
   * page who it is, if it has, as {@link noticeAcquaintances} was last told.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   * @param {PlainMessageId | null} [lineId] - The message of the line it says,
   *   or `null` for one of its own lines, which it is by default.
   */
  say(
    villager: Villager,
    head: Vector3,
    lineId: PlainMessageId | null = null,
  ): void {
    this.#hide();
    const lineIndex: number = lineId === null ? this.#pickLine(villager) : 0;
    const words: SpeechWords = this.#describe(villager, lineIndex, lineId);
    const widest: number = this.#findWidest();
    const [sprite, painted] = this.#prepare(words, widest);
    sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    this.#parent.add(sprite);
    this.#shown = {
      villager,
      lineIndex,
      lineId,
      words,
      sprite,
      painted,
      widest,
      screen: null,
      duration: measureSpeechDuration(words.line),
      age: 0,
      layer: 0,
    };
  }

  /**
   * Shows what a player says, as it typed it, in a bubble of its own just
   * above its head, for as long as {@link measureSpeechDuration} tells, in
   * place of the bubble of that player shown before, if any.  The bubbles
   * of the other players and that of a villager stay as they are, and a
   * later bubble is drawn over the earlier ones where they overlap.
   *
   * @param {number} player - The identifier of the player.
   * @param {string} line - What the player says, shown as plain text.
   * @param {Vector3} head - The top of the head of the player.
   */
  sayAs(player: number, line: string, head: Vector3): void {
    this.#showSaid(player, line, null, head);
  }

  /**
   * Shows a phrase a player says, in the language of the page, in the
   * bubble of that player, as {@link sayAs} shows a line it typed.
   *
   * @param {number} player - The identifier of the player.
   * @param {PhraseCode} code - The code of the phrase the player says.
   * @param {Vector3} head - The top of the head of the player.
   */
  sayPhraseAs(player: number, code: PhraseCode, head: Vector3): void {
    const lineId: PlainMessageId = `phrase.${code}`;
    this.#showSaid(player, this.#translator.translate(lineId), lineId, head);
  }

  /**
   * Shows what a player says in a bubble of its own, in place of the
   * bubble of that player shown before, if any.
   *
   * @param {number} player - The identifier of the player.
   * @param {string} line - What the player says, shown as plain text.
   * @param {PlainMessageId | null} lineId - The message of the phrase it
   *   says, or `null` for a line it typed.
   * @param {Vector3} head - The top of the head of the player.
   */
  #showSaid(
    player: number,
    line: string,
    lineId: PlainMessageId | null,
    head: Vector3,
  ): void {
    this.hushPlayer(player);
    const words: SpeechWords = {
      name: '',
      line,
      language: this.#translator.language,
    };
    const widest: number = this.#findWidest();
    const layer: number = ++this.#saidCount;
    const [sprite, painted] = this.#prepare(words, widest);
    stackBubble(sprite, layer);
    sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    this.#parent.add(sprite);
    this.#said.set(player, {
      villager: null,
      lineIndex: 0,
      lineId,
      words,
      sprite,
      painted,
      widest,
      screen: null,
      duration: measureSpeechDuration(line),
      age: 0,
      layer,
    });
  }

  /**
   * Moves the bubble of a player, if it has one, to just above its head,
   * where the head is now, as it goes on speaking while it goes about, or
   * keeps the bubble from being seen while the player is off the screen.
   * The bubble goes on ageing unseen.
   *
   * @param {number} player - The identifier of the player.
   * @param {Vector3 | null} head - The top of the head of the player, or
   *   `null` while the player is off the screen.
   */
  followPlayer(player: number, head: Vector3 | null): void {
    const shown: ShownSpeech | undefined = this.#said.get(player);
    if (shown === undefined) {
      return;
    }
    shown.sprite.visible = head !== null;
    if (head === null) {
      shown.screen = null;
    } else {
      shown.sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    }
  }

  /**
   * Takes the bubble of a player away at once, if it has one.
   *
   * @param {number} player - The identifier of the player.
   */
  hushPlayer(player: number): void {
    const shown: ShownSpeech | undefined = this.#said.get(player);
    if (shown !== undefined) {
      this.#dispose(shown.sprite);
      this.#said.delete(player);
    }
  }

  /**
   * Lists the players who have a bubble now.
   *
   * @returns {number[]} The identifiers of the players, in the order they
   *   spoke.
   */
  listSpeakers(): number[] {
    return [...this.#said.keys()];
  }

  /**
   * Takes in the view the bubbles are seen in, and draws the bubbles shown,
   * if any, and those to come, at the size for it: as painted in a view at
   * least 600 pixels tall, and as large as in a view that tall in a shorter
   * one, as on a phone held on its side.  In a narrow view, as on a phone
   * held upright, a bubble is no wider than 85% of the view, unless a
   * single word is, its words wrapped onto more lines instead.
   *
   * @param {number} width - The width of the view, in CSS pixels.
   * @param {number} height - The height of the view, in CSS pixels.
   * @param {number} fieldOfView - The field of view of the camera, from top
   *   to bottom, in degrees.
   */
  fitView(width: number, height: number, fieldOfView: number): void {
    this.#view = { width, height, fieldOfView };
    for (const shown of this.#listShown()) {
      if (shown.widest === this.#findWidest()) {
        this.#enlarge(shown.sprite, shown.painted);
      } else {
        this.#repaint(shown, shown.words);
      }
    }
  }

  /**
   * Places a bubble on the screen as a camera shows it, as each bubble
   * does by itself each time it is drawn.
   *
   * A bubble stands above the head of the one who speaks, but shifts
   * inwards as far as it must to stay wholly within the view, at least 8
   * pixels from its edges, its top kept in view
   * before its foot in a view too short for it.  Its tail hangs from its
   * foot, under the one who speaks as far as it reaches along the foot,
   * which it does to within the round corners.  Once the one who speaks is
   * beyond the edge of the view, the bubble stays at that edge, its tail
   * towards it.  Once the one who speaks is behind the camera, the bubble
   * is not seen, and is not placed.  Nothing is placed before the bubble
   * is told the view.
   *
   * @param {ShownSpeech} shown - The bubble.
   * @param {Camera} camera - The camera, its matrices up to date.
   */
  #placeBubble(shown: ShownSpeech, camera: Camera): void {
    const view: ViewSize | null = this.#view;
    if (view === null) {
      return;
    }
    shown.screen = null;
    const { sprite } = shown;
    sprite.updateWorldMatrix(true, false);
    const foot: Vector3 = new Vector3()
      .setFromMatrixPosition(sprite.matrixWorld)
      .applyMatrix4(camera.matrixWorldInverse);
    if (foot.z >= 0) {
      return;
    }
    foot.applyMatrix4(camera.projectionMatrix);
    const x: number = ((foot.x + 1) / 2) * view.width;
    const y: number = ((1 - foot.y) / 2) * view.height;
    // How many CSS pixels a metre at one metre from the camera is drawn.
    const scale: number =
      view.height / (2 * Math.tan(MathUtils.degToRad(view.fieldOfView) / 2));
    const width: number = sprite.scale.x * scale;
    const height: number = sprite.scale.y * scale;
    const pixel: number = this.#findPixelSize();
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
    shown.screen = {
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

  /**
   * Takes in which villagers have told the player of the page who they are,
   * for the bubbles to come to call them by the names they then go by.
   *
   * @param {readonly VillagerId[]} acquaintances - The villagers.
   */
  noticeAcquaintances(acquaintances: readonly VillagerId[]): void {
    this.#acquaintances = [...acquaintances];
  }

  /**
   * Moves the bubble of a villager to just above its head, where the head
   * is now, if the bubble being shown is that of the villager, as it goes
   * on speaking while it goes about.
   *
   * @param {Villager} villager - The villager.
   * @param {Vector3} head - The top of the head of the villager.
   */
  follow(villager: Villager, head: Vector3): void {
    if (this.#shown?.villager?.id !== villager.id) {
      return;
    }
    this.#shown.sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
  }

  /**
   * Shows the bubble of a villager being shown, if any, and the phrases
   * the players say, in the language of the page now, in the same place,
   * until the same end.  What the players typed stays as they typed it,
   * drawn in the fonts of that language.
   */
  relabel(): void {
    const { language } = this.#translator;
    for (const shown of this.#listShown()) {
      const { villager, lineId, words } = shown;
      let relabelled: SpeechWords;
      if (villager !== null) {
        relabelled = this.#describe(villager, shown.lineIndex, lineId);
      } else if (lineId !== null) {
        const line: string = this.#translator.translate(lineId);
        relabelled = { ...words, line, language };
      } else {
        relabelled = { ...words, language };
      }
      this.#repaint(shown, relabelled);
    }
  }

  /**
   * Lets the bubbles age, fading each away at its end and taking it away
   * once it is over.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    const shown: ShownSpeech | null = this.#shown;
    if (shown !== null && !this.#age(shown, seconds)) {
      this.#hide();
    }
    for (const [player, said] of [...this.#said]) {
      if (!this.#age(said, seconds)) {
        this.hushPlayer(player);
      }
    }
  }

  /**
   * Takes every bubble away at once, that of a villager and those of the
   * players.
   */
  clear(): void {
    this.#hide();
    for (const player of this.listSpeakers()) {
      this.hushPlayer(player);
    }
  }

  /**
   * Takes the bubble of a villager away at once, if there is one, and
   * leaves those of the players.
   */
  hushVillagers(): void {
    this.#hide();
  }

  /**
   * Describes the bubble of a villager as it is shown now.
   *
   * @returns {SpeechView | null} What the bubble shows and where, or `null`
   *   while there is none.
   */
  describe(): SpeechView | null {
    if (this.#shown === null) {
      return null;
    }
    const { words, sprite, screen } = this.#shown;
    const { x, y, z } = sprite.position;
    const textSize: number | null =
      this.#view === null ? null : FONT_SIZE * this.#findPixelSize();
    return { name: words.name, line: words.line, x, y, z, textSize, screen };
  }

  /**
   * Describes the bubbles of the players as they are shown now.
   *
   * @returns {SaidView[]} What each bubble shows and where, in the order
   *   the players spoke.
   */
  describeSaid(): SaidView[] {
    return [...this.#said].map(
      ([player, { words, sprite, screen }]: [number, ShownSpeech]) => ({
        player,
        line: words.line,
        x: sprite.position.x,
        y: sprite.position.y,
        z: sprite.position.z,
        isShown: sprite.visible,
        screen,
      }),
    );
  }

  /**
   * Lists every bubble shown now.
   *
   * @returns {ShownSpeech[]} The bubble of a villager, if any, and then
   *   those of the players.
   */
  #listShown(): ShownSpeech[] {
    const said: ShownSpeech[] = [...this.#said.values()];
    return this.#shown === null ? said : [this.#shown, ...said];
  }

  /**
   * Lets a bubble age, fading it away at its end.
   *
   * @param {ShownSpeech} shown - The bubble.
   * @param {number} seconds - The time that has passed, in seconds.
   * @returns {boolean} Whether the bubble is still to be shown.
   */
  #age(shown: ShownSpeech, seconds: number): boolean {
    shown.age += seconds;
    const left: number = shown.duration - shown.age;
    if (left <= 0) {
      return false;
    }
    setOpacity(shown.sprite, Math.min(left / FADE_DURATION, 1));
    return true;
  }

  /**
   * Tells how large each pixel a bubble is laid out in is drawn in the
   * view it is seen in.
   *
   * @returns {number} The size, in CSS pixels, or 1 before the bubble is
   *   told the view.
   */
  #findPixelSize(): number {
    const view: ViewSize | null = this.#view;
    return view === null
      ? 1
      : (LAYOUT_PIXEL_SIZE * this.#findEnlargement() * view.height) /
          (2 * Math.tan(MathUtils.degToRad(view.fieldOfView) / 2));
  }

  /**
   * Tells the widest a bubble may be laid out to be in the view it is seen
   * in.
   *
   * @returns {number} The width, in pixels: {@link BUBBLE_WIDTH}, or less
   *   in a view too narrow for a bubble that wide, but never less than
   *   {@link LEAST_BUBBLE_WIDTH}.
   */
  #findWidest(): number {
    if (this.#view === null) {
      return BUBBLE_WIDTH;
    }
    const fitting: number = Math.floor(
      (this.#view.width * MOST_VIEW_SHARE) / this.#findPixelSize(),
    );
    return MathUtils.clamp(fitting, LEAST_BUBBLE_WIDTH, BUBBLE_WIDTH);
  }

  /**
   * Draws a bubble at the size for the view it is seen in, to be placed on
   * the screen each time it is drawn.
   *
   * @param {SpeechWords} words - What it shows.
   * @param {number} widest - The widest it may be, in pixels.
   * @returns {[Sprite, [number, number]]} The bubble, and its width and
   *   height as it was drawn.
   */
  #prepare(
    words: SpeechWords,
    widest: number,
  ): [Sprite, [number, number]] {
    const sprite: Sprite = this.#paint(words, widest);
    const painted: [number, number] = [sprite.scale.x, sprite.scale.y];
    this.#enlarge(sprite, painted);
    // It is kept on the screen even when the one who speaks is not.
    sprite.frustumCulled = false;
    sprite.onBeforeRender = (
      ...args: Parameters<Sprite['onBeforeRender']>
    ): void => {
      const shown: ShownSpeech | undefined = this.#listShown().find(
        (candidate: ShownSpeech) => candidate.sprite === sprite,
      );
      if (shown !== undefined) {
        this.#placeBubble(shown, args[2]);
      }
    };
    return [sprite, painted];
  }

  /**
   * Draws the bubble shown again with what it shows now, laid out for the
   * view it is seen in, in the same place, as faded as it was, until the
   * same end.
   *
   * @param {ShownSpeech} shown - The bubble shown.
   * @param {SpeechWords} words - What it shows now.
   */
  #repaint(shown: ShownSpeech, words: SpeechWords): void {
    const widest: number = this.#findWidest();
    const [sprite, painted] = this.#prepare(words, widest);
    sprite.position.copy(shown.sprite.position);
    sprite.visible = shown.sprite.visible;
    if (shown.layer > 0) {
      stackBubble(sprite, shown.layer);
    }
    setOpacity(sprite, shown.sprite.material.opacity);
    this.#dispose(shown.sprite);
    this.#parent.add(sprite);
    shown.words = words;
    shown.sprite = sprite;
    shown.painted = painted;
    shown.widest = widest;
    shown.screen = null;
  }

  /**
   * Tells how many times as large as painted the bubbles are drawn in the
   * view they are seen in.
   *
   * @returns {number} How many times as large, at least 1.
   */
  #findEnlargement(): number {
    return this.#view === null
      ? 1
      : Math.max(1, LEAST_VIEW_HEIGHT / this.#view.height);
  }

  /**
   * Draws a bubble at the size for the view it is seen in.
   *
   * @param {Sprite} sprite - The bubble.
   * @param {readonly [number, number]} painted - The width and height of
   *   the bubble as it was drawn.
   */
  #enlarge(sprite: Sprite, painted: readonly [number, number]): void {
    const enlargement: number = this.#findEnlargement();
    sprite.scale.set(painted[0] * enlargement, painted[1] * enlargement, 1);
  }

  /** Takes the bubble of a villager away, if there is one. */
  #hide(): void {
    if (this.#shown === null) {
      return;
    }
    this.#dispose(this.#shown.sprite);
    this.#shown = null;
  }

  /**
   * Takes a bubble away.
   *
   * @param {Sprite} sprite - The bubble.
   */
  #dispose(sprite: Sprite): void {
    this.#parent.remove(sprite);
    sprite.traverse((part: Object3D) => {
      if (part instanceof Sprite) {
        part.material.map?.dispose();
        part.material.dispose();
      }
    });
  }

  /**
   * Picks the line a villager says this time: its first line, the first
   * time a villager who greets first says one, or else at random among its
   * lines, other than the one it said last, if it has more than one.
   *
   * @param {Villager} villager - The villager.
   * @returns {number} The position of the line among its lines.
   */
  #pickLine(villager: Villager): number {
    const count: number = describeVillager(this.#translator, villager).lines
      .length;
    if (count <= 1) {
      return 0;
    }
    const last: number | undefined = this.#lastLines.get(villager.id);
    if (last === undefined && villager.greetsFirst === true) {
      this.#lastLines.set(villager.id, 0);
      return 0;
    }
    const choices: number = last === undefined ? count : count - 1;
    let index: number = Math.floor(this.#random() * choices);
    if (last !== undefined && index >= last) {
      index++;
    }
    this.#lastLines.set(villager.id, index);
    return index;
  }

  /**
   * Tells what a bubble of a villager shows, in the language of the page.
   *
   * @param {Villager} villager - The villager.
   * @param {number} lineIndex - The position of the line it says among its
   *   lines.
   * @param {PlainMessageId | null} lineId - The message of the line it says, if
   *   it was given one, in place of its own lines.
   * @returns {SpeechWords} The name of the villager, what it says, and
   *   their language.
   */
  #describe(
    villager: Villager,
    lineIndex: number,
    lineId: PlainMessageId | null,
  ): SpeechWords {
    const { name, lines } = describeVillager(
      this.#translator,
      villager,
      this.#acquaintances,
    );
    return {
      name,
      line:
        lineId === null
          ? (lines[lineIndex] ?? '')
          : this.#translator.translate(lineId),
      language: this.#translator.language,
    };
  }
}
