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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/dialogue-words Wording what is said in a dialogue, in the
 *   language of the page.
 */

import { isMessageId } from './translator.ts';
import type { Translator } from './translator.ts';

/**
 * Words a message of a dialogue, as the server names it, in the language of
 * the page.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {string} id - The name of the message.
 * @returns {string} The message, or nothing if the page has no such
 *   message, or it takes a value.
 */
export function wordDialogueText(translator: Translator, id: string): string {
  return isMessageId(id) ? translator.translate(id) : '';
}
