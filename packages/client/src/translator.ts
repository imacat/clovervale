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
 * @module client/translator Wording the text of the page in the language
 *   it speaks.
 */

import { assertNever } from '@clovervale/shared';

import { DEFAULT_LANGUAGE } from './language.ts';
import type { LanguageCode } from './language.ts';
import { EN_MESSAGES, EN_OPTIONAL_MESSAGES } from './messages/en.ts';
import type {
  MessageId,
  MessageTable,
  MessageValues,
  OptionalMessageId,
  PlainMessageId,
} from './messages/en.ts';

/** The text of the page in English, by message. */
const EN_TABLE: MessageTable = { ...EN_MESSAGES, ...EN_OPTIONAL_MESSAGES };

/** A language whose text is loaded: any but the default one. */
export type LoadedLanguageCode = Exclude<LanguageCode, typeof DEFAULT_LANGUAGE>;

/**
 * Loads the text of the page in a language.
 *
 * @param {LoadedLanguageCode} code - The language.
 * @returns {Promise<MessageTable>} The text, by message.
 */
export type MessageLoader = (code: LoadedLanguageCode) => Promise<MessageTable>;

/**
 * Loads the text of the page in a language, when it is asked for.
 *
 * @param {LoadedLanguageCode} code - The language.
 * @returns {Promise<MessageTable>} The text, by message.
 */
export async function loadMessages(
  code: LoadedLanguageCode,
): Promise<MessageTable> {
  switch (code) {
    case 'zh-TW':
      return (await import('./messages/zh-tw.ts')).ZH_TW_MESSAGES;
    case 'zh-CN':
      return (await import('./messages/zh-cn.ts')).ZH_CN_MESSAGES;
    case 'ja':
      return (await import('./messages/ja.ts')).JA_MESSAGES;
    case 'es':
      return (await import('./messages/es.ts')).ES_MESSAGES;
    default:
      return assertNever(code);
  }
}

/**
 * Tells whether a name, as the server may give it, is that of a message of
 * the page that takes no value.
 *
 * @param {string} id - The name.
 * @returns {boolean} Whether the page has such a message.
 */
export function isMessageId(id: string): id is PlainMessageId {
  return (
    Object.hasOwn(EN_MESSAGES, id) &&
    !/\{\w+\}/u.test(EN_MESSAGES[id as MessageId])
  );
}

/** A translator of the text of the page into the language it speaks. */
export class Translator {
  readonly #load: MessageLoader;
  readonly #listeners: (() => void)[] = [];
  #language: LanguageCode = DEFAULT_LANGUAGE;
  #messages: MessageTable = EN_TABLE;
  /** How many languages have been chosen so far. */
  #choiceCount = 0;

  /**
   * Starts in English.
   *
   * @param {MessageLoader} [load] - Loads the text of the page in a
   *   language, as {@link loadMessages} does by default.
   */
  constructor(load: MessageLoader = loadMessages) {
    this.#load = load;
  }

  /**
   * The language the page speaks now.
   *
   * @returns {LanguageCode} The language.
   */
  get language(): LanguageCode {
    return this.#language;
  }

  /**
   * Words a message in the language the page speaks now.
   *
   * @param {Id} id - The message.
   * @param {MessageValues<Id>} values - The values the message takes, by
   *   their names, if it takes any.
   * @returns {string} The message, with the values in their places.
   * @template Id
   */
  translate<Id extends MessageId>(
    id: Id,
    ...values: MessageValues<Id>
  ): string {
    const message: string = this.#messages[id];
    const [named] = values;
    if (named === undefined) {
      return message;
    }
    const lookUp: Readonly<Record<string, string>> = named;
    return message.replace(
      /\{(\w+)\}/g,
      (placeholder: string, name: string) => lookUp[name] ?? placeholder,
    );
  }

  /**
   * Words a message a language may leave out in the language the page
   * speaks now.
   *
   * @param {OptionalMessageId} id - The message.
   * @returns {string | null} The message, or `null` if the language
   *   leaves it out.
   */
  translateOptional(id: OptionalMessageId): string | null {
    return this.#messages[id] ?? null;
  }

  /**
   * Speaks a language from now on, once its text is loaded, unless
   * another is chosen meanwhile, and then tells the listeners if the
   * language has changed.
   *
   * @param {LanguageCode} code - The language.
   * @returns {Promise<boolean>} Whether the page speaks the language now,
   *   which it does not if another was chosen meanwhile or its text cannot
   *   be loaded.
   */
  async choose(code: LanguageCode): Promise<boolean> {
    const choice: number = ++this.#choiceCount;
    let messages: MessageTable;
    if (code === DEFAULT_LANGUAGE) {
      messages = EN_TABLE;
    } else {
      try {
        messages = await this.#load(code);
      } catch (error: unknown) {
        console.error(`The text in ${code} cannot be loaded.`, error);
        return false;
      }
    }
    if (choice !== this.#choiceCount) {
      return false;
    }
    if (code === this.#language) {
      return true;
    }
    this.#language = code;
    this.#messages = messages;
    for (const listener of this.#listeners) {
      listener();
    }
    return true;
  }

  /**
   * Has a listener told each time the page speaks another language.
   *
   * @param {() => void} listener - The listener.
   */
  addListener(listener: () => void): void {
    this.#listeners.push(listener);
  }
}
