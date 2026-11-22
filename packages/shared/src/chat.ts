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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/22
// AI assistance: Claude Code (Anthropic)

/**
 * @module shared/chat What a player says to the players nearby.
 */

/** How far what a player says carries, in metres. */
export const SAY_RANGE = 8;

/**
 * The most characters a line a player says has, counted as the browser
 * counts the length of what is typed in a line of text: in UTF-16 code
 * units, so that a character beyond the basic plane, as most emoji are,
 * counts as two.
 */
export const SAY_LENGTH_LIMIT = 100;

/** The least time from one line of a player to its next, in seconds. */
export const SAY_INTERVAL = 2;

/** The most line breaks a line a player says has, which make its rows. */
export const SAY_BREAK_LIMIT = 3;

/** Half a character, left over without its other half. */
const LONE_SURROGATE_PATTERN = /[\uD800-\uDFFF]/gu;

/** A line break of any kind. */
const BREAK_PATTERN = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/g;

/** A control character other than the line break. */
const CONTROL_PATTERN = /[^\P{Cc}\n]/gu;

/** The first half of a character, left at the end without its second. */
const CUT_SURROGATE_PATTERN = /[\uD800-\uDBFF]$/;

/**
 * Makes the line a player says of a text it typed: plain text without
 * control characters, each of which becomes a space, but for its line
 * breaks.  A line break of any kind is kept as one line feed; a run of
 * them, with any spaces around and between them, is a single one; the
 * line starts and ends with none; and it has {@link SAY_BREAK_LIMIT} at
 * most, any further ones being spaces.  The line has no spaces at its ends
 * and is no longer than {@link SAY_LENGTH_LIMIT} characters as the browser
 * counts them, its line breaks among them, what comes after them being
 * left out, with no character cut in half.
 *
 * @param {string} text - The text.
 * @returns {string | null} The line, or `null` if nothing is left to say.
 */
export function cleanSayText(text: string): string | null {
  const rows: string[] = text
    .replace(LONE_SURROGATE_PATTERN, '')
    .replace(BREAK_PATTERN, '\n')
    .replace(CONTROL_PATTERN, ' ')
    .split('\n')
    .map((row: string) => row.trim())
    .filter((row: string) => row !== '');
  // The rows beyond those a line may have go on in its last row.
  const line: string = [
    ...rows.slice(0, SAY_BREAK_LIMIT),
    rows.slice(SAY_BREAK_LIMIT).join(' '),
  ]
    .join('\n')
    .slice(0, SAY_LENGTH_LIMIT)
    .replace(CUT_SURROGATE_PATTERN, '')
    .trim();
  return line === '' ? null : line;
}

/**
 * Tells whether a decoded value is a line a player says, as
 * {@link cleanSayText} makes them.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether it is.
 */
export function isSayText(value: unknown): value is string {
  return typeof value === 'string' && cleanSayText(value) === value;
}
