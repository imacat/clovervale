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
 * @module shared/parse Parsing decoded values received from the wire, which
 *   are rejected unless they are well formed.
 */

/** What a parse function throws for a value that is not well formed. */
export class MalformedValueError extends Error {}

/**
 * Checks whether a decoded value is an object with named members.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is such an object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks whether a decoded value is a count: a whole number from 0.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a count.
 */
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Rejects a decoded value that is not well formed.
 *
 * @returns {never} Never; it always throws.
 * @throws {MalformedValueError} Always.
 */
export function rejectValue(): never {
  throw new MalformedValueError('The value is malformed.');
}

/**
 * Parses a decoded value that a predicate takes.
 *
 * @template T - What the predicate takes.
 * @param {unknown} value - The value to parse.
 * @param {(value: unknown) => boolean} isValid - The predicate.
 * @returns {T} The value.
 * @throws {Error} If the predicate does not take the value.
 */
export function parseGuarded<T>(
  value: unknown,
  isValid: (value: unknown) => value is T,
): T {
  if (!isValid(value)) {
    rejectValue();
  }
  return value;
}

/**
 * Parses a decoded value that is one of a list of members.
 *
 * @template T - The type of the members.
 * @param {unknown} value - The value to parse.
 * @param {readonly T[]} members - The members.
 * @returns {T} The member the value is.
 * @throws {Error} If the value is none of the members.
 */
export function parseMember<T>(value: unknown, members: readonly T[]): T {
  const member: T | undefined = members.find(
    (candidate: T) => candidate === value,
  );
  if (member === undefined) {
    rejectValue();
  }
  return member;
}

/**
 * Parses a decoded value that is an object with named members.
 *
 * @param {unknown} value - The value to parse.
 * @returns {Record<string, unknown>} The object.
 * @throws {Error} If the value is no such object.
 */
export function parseRecord(value: unknown): Record<string, unknown> {
  return parseGuarded(value, isRecord);
}

/**
 * Parses a decoded value that is a whole number.
 *
 * @param {unknown} value - The value to parse.
 * @returns {number} The number.
 * @throws {Error} If the value is no whole number.
 */
export function parseInteger(value: unknown): number {
  if (!Number.isInteger(value)) {
    rejectValue();
  }
  return value as number;
}

/**
 * Parses a decoded value that is a count: a whole number from 0.
 *
 * @param {unknown} value - The value to parse.
 * @returns {number} The count.
 * @throws {Error} If the value is no count.
 */
export function parseCount(value: unknown): number {
  return parseGuarded(value, isCount);
}

/**
 * Parses a decoded value that is a finite number.
 *
 * @param {unknown} value - The value to parse.
 * @returns {number} The number.
 * @throws {Error} If the value is no finite number.
 */
export function parseFinite(value: unknown): number {
  if (!Number.isFinite(value)) {
    rejectValue();
  }
  return value as number;
}

/**
 * Parses a decoded value that is a boolean.
 *
 * @param {unknown} value - The value to parse.
 * @returns {boolean} The boolean.
 * @throws {Error} If the value is no boolean.
 */
export function parseBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    rejectValue();
  }
  return value;
}

/**
 * Parses a decoded value that is either `null` or what a parse function
 * takes.
 *
 * @template T - What the parse function returns.
 * @param {unknown} value - The value to parse.
 * @param {(value: unknown) => T} parse - The parse function.
 * @returns {T | null} `null`, or what the parse function returns.
 * @throws {Error} If the value is neither.
 */
export function parseNullable<T>(
  value: unknown,
  parse: (value: unknown) => T,
): T | null {
  return value === null ? null : parse(value);
}

/**
 * Parses a decoded value that is a list of what a parse function takes.
 *
 * @template T - What the parse function returns.
 * @param {unknown} value - The value to parse.
 * @param {(item: unknown) => T} parse - The parse function for each item.
 * @returns {T[]} A new list of what the parse function returns.
 * @throws {Error} If the value is no list, or an item is not taken.
 */
export function parseList<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) {
    rejectValue();
  }
  return value.map((item: unknown) => parse(item));
}
