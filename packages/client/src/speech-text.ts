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
 * @module client/speech-text How the text of a speech bubble is broken into
 *   lines, Chinese and Japanese among it, and how long it takes to read.
 */

/** How fast a line is taken to be read, in words per second. */
export const READING_SPEED = 3;
/**
 * How fast a line of Chinese or Japanese is taken to be read, in
 * characters per second.
 */
export const CHARACTER_READING_SPEED = 6;
/** How long it takes to notice a bubble before reading it, in seconds. */
const NOTICE_DURATION = 1.5;

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

/** A piece of text that a line does not break inside. */
interface TextPiece {
  /** The text. */
  text: string;
  /** Whether a space comes before the piece. */
  readonly isSpaced: boolean;
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
