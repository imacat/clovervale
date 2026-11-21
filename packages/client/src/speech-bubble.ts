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

import { locateVillager } from '@clovervale/shared';
import type {
  MonsterState,
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
  /** The name of the villager who speaks. */
  readonly name: string;
  /** What the villager says. */
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
}

/** A bubble being shown. */
interface ShownSpeech {
  /** The villager who speaks. */
  readonly villager: Villager;
  /** The position of the line the villager says among its lines. */
  readonly lineIndex: number;
  /**
   * The message of the line the villager says, if it was given, in place of
   * one of its lines.
   */
  readonly lineId: PlainMessageId | null;
  /** What the bubble shows. */
  words: SpeechWords;
  /** The bubble, drawn on a sprite. */
  sprite: Sprite;
  /** How long it is shown for, in seconds. */
  readonly duration: number;
  /** How long it has been shown, in seconds. */
  age: number;
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
 * Breaks a text into lines between its words, and between the characters
 * of Chinese and Japanese, which have no spaces between words, never
 * starting a line with closing punctuation or ending one with opening
 * punctuation.
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
 * @param {readonly MonsterState[]} [monsters] - The monsters of its map,
 *   as they are shown, which tell where a villager who fights as a monster
 *   stands, none by default.
 * @returns {Vector3} The point above where the villager stands at the
 *   height of the top of its model, or at a usual height without one.
 */
export function findHeadTop(
  villager: Villager,
  root: Object3D | null,
  step: number,
  monsters: readonly MonsterState[] = [],
): Vector3 {
  const { x, z } = locateVillager(villager, step, monsters);
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
 * size on the screen however far it is, over everything else, in the
 * fonts of their language.
 *
 * @param {SpeechWords} words - The name and what it says.
 * @returns {Sprite} The bubble, with the tip of its tail at its position.
 */
function paintSpeech(words: SpeechWords): Sprite {
  const canvas: HTMLCanvasElement = document.createElement('canvas');
  canvas.lang = words.language;
  const context: CanvasRenderingContext2D | null = canvas.getContext('2d');
  const { fontFamily } = findLanguage(words.language);
  const nameFont = `bold ${String(FONT_SIZE)}px ${fontFamily}`;
  const textFont = `${String(FONT_SIZE)}px ${fontFamily}`;
  let lines: string[] = [words.line];
  let width: number = TEXT_WIDTH;
  if (context !== null) {
    context.font = textFont;
    const measure = (text: string): number => context.measureText(text).width;
    lines = wrapText(words.line, TEXT_WIDTH, measure);
    const textWidth: number = Math.max(...lines.map(measure));
    context.font = nameFont;
    width = Math.max(textWidth, measure(words.name));
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
    context.fillText(words.name, PADDING, PADDING + LINE_HEIGHT / 2);
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
  readonly #translator: Translator;
  readonly #paint: (words: SpeechWords) => Sprite;
  readonly #random: () => number;
  #shown: ShownSpeech | null = null;
  /** The position of the line each villager said last, by villager. */
  readonly #lastLines = new Map<VillagerId, number>();
  /** The villagers who have told the player of the page who they are. */
  #acquaintances: readonly VillagerId[] = [];

  /**
   * Starts without a bubble.
   *
   * @param {Object3D} parent - What the bubble is added to.
   * @param {Translator} translator - The translator of the text of the page.
   * @param {(words: SpeechWords) => Sprite} [paint] - Draws a bubble, with
   *   the tip of its tail at its position, as a readable bubble with the
   *   name of the villager and what it says by default.
   * @param {() => number} [random] - Gives a random number in [0, 1) each
   *   time it is called, to pick the line a villager says by, as
   *   `Math.random` does by default.
   */
  constructor(
    parent: Object3D,
    translator: Translator,
    paint: (words: SpeechWords) => Sprite = paintSpeech,
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
   * tells, in place of any bubble shown before.
   *
   * A villager says the line it is given, or else, with several lines, one
   * of them, picked at random, but never the line it said the time before.
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
    const sprite: Sprite = this.#paint(words);
    sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
    this.#parent.add(sprite);
    this.#shown = {
      villager,
      lineIndex,
      lineId,
      words,
      sprite,
      duration: measureSpeechDuration(words.line),
      age: 0,
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
    if (this.#shown?.villager.id !== villager.id) {
      return;
    }
    this.#shown.sprite.position.set(head.x, head.y + BUBBLE_MARGIN, head.z);
  }

  /**
   * Shows the bubble being shown, if any, in the language of the page now,
   * in the same place, until the same end.
   */
  relabel(): void {
    const shown: ShownSpeech | null = this.#shown;
    if (shown === null) {
      return;
    }
    const words: SpeechWords = this.#describe(
      shown.villager,
      shown.lineIndex,
      shown.lineId,
    );
    const sprite: Sprite = this.#paint(words);
    sprite.position.copy(shown.sprite.position);
    sprite.material.opacity = shown.sprite.material.opacity;
    this.#dispose(shown.sprite);
    this.#parent.add(sprite);
    shown.words = words;
    shown.sprite = sprite;
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

  /** Takes the bubble away at once, if there is one. */
  clear(): void {
    this.#hide();
  }

  /**
   * Takes the bubble away at once, if it is that of a villager, as the
   * villager takes back what it said.
   *
   * @param {Villager} villager - The villager.
   */
  hush(villager: Villager): void {
    if (this.#shown?.villager.id === villager.id) {
      this.#hide();
    }
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
    const { words, sprite } = this.#shown;
    const { x, y, z } = sprite.position;
    return { name: words.name, line: words.line, x, y, z };
  }

  /** Takes the bubble away, if there is one. */
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
    sprite.material.map?.dispose();
    sprite.material.dispose();
  }

  /**
   * Picks the line a villager says this time: at random among its lines,
   * other than the one it said last, if it has more than one.
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
    const choices: number = last === undefined ? count : count - 1;
    let index: number = Math.min(
      Math.floor(this.#random() * choices),
      choices - 1,
    );
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
