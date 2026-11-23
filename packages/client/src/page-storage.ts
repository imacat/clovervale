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
 * @module client/page-storage Where the browser lets the page remember
 *   things from one visit to the next.
 */

/** Where the page remembers things from one visit to the next. */
export interface PageStorage {
  /**
   * Reads an item.
   *
   * @param {string} key - The key of the item.
   * @returns {string | null} The item, or `null` if there is none.
   */
  getItem(key: string): string | null;
  /**
   * Writes an item.
   *
   * @param {string} key - The key of the item.
   * @param {string} value - The item.
   */
  setItem(key: string, value: string): void;
}

/**
 * Finds where the browser lets the page remember things.
 *
 * @returns {PageStorage | null} The local storage of the browser, or `null`
 *   if the browser does not let the page have it.
 */
export function findPageStorage(): PageStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
