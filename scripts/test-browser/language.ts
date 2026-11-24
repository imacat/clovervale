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
 * @module scripts/test-browser/language Checks the language the page speaks.
 */

import type { SpeechView } from '../../packages/client/src/speech-bubble.ts';

import type { BidiSession } from './bidi.ts';
import {
  ACTION_TIMEOUT,
  EN_NAME,
  LANGUAGE_CONTROL,
  NANCY_WELCOME,
  PAGE_LANGUAGE,
  SPEECH_TIMEOUT,
  TALK_KEY,
  TALK_PROMPT,
  ZH_TW_LANGUAGE_CONTROL,
  ZH_TW_NAME,
} from './constants.ts';
import { evaluateInPage, tapKey, waitFor } from './page.ts';

/** What a page shows in words, in the language it speaks. */
interface LanguageLook {
  /** The language of the page, as its document tells. */
  readonly lang: string;
  /** The title of the page. */
  readonly title: string;
  /** The titles of the panel and of its folders, in order. */
  readonly titles: readonly string[];
  /** The values the panel displays, by their names. */
  readonly panel: Readonly<Record<string, string>>;
  /** The languages the language control of the panel offers. */
  readonly offered: readonly string[];
  /** The prompt the page shows, or `null` if it shows none. */
  readonly prompt: string | null;
  /** The bubble the page shows, or `null` if it shows none. */
  readonly speech: SpeechView | null;
}

/** What Nancy says, either line of hers. */
const NANCY_LINES: ReadonlySet<string> = new Set([
  NANCY_WELCOME,
  'There are wild dogs at the village gate, and no one can go out. What ' +
    'are we going to do?',
]);
/**
 * The languages the language control offers, by their own names, in the
 * code point order of those names.
 */
const LANGUAGE_NAMES: readonly string[] = [
  'English',
  'Español',
  '日本語',
  '正體中文',
  '简体中文',
];
/** The title of the page and of the panel in Traditional Chinese. */
const ZH_TW_TITLE = '四葉谷';
/** The title of the folder of the latest snapshot in the panel. */
const SNAPSHOT_FOLDER = 'Latest snapshot';
/** That title in Traditional Chinese. */
const ZH_TW_SNAPSHOT_FOLDER = '最新快照';
/** The name of the space bar readout of the panel in Traditional Chinese. */
const ZH_TW_SPACE_KEY = '空白鍵';
/** What that readout tells by Nancy, facing her, in Traditional Chinese. */
const ZH_TW_TALK_KEY = '與南茜交談';
/** The prompt by Nancy, facing her, in Traditional Chinese. */
const ZH_TW_TALK_PROMPT = '按空白鍵與南茜交談';
/** The name of the server status of the panel in Traditional Chinese. */
const ZH_TW_SERVER = '伺服器';
/** The start of the status of a connected page in Traditional Chinese. */
const ZH_TW_CONNECTED = '已連線';
/** The name of Nancy in Traditional Chinese. */
const ZH_TW_NANCY = '南茜';
/** What Nancy says in Traditional Chinese, either line of hers. */
const ZH_TW_NANCY_LINES: ReadonlySet<string> = new Set([
  '歡迎來到四葉谷！有事可以找村長，她住在後面最大的那間房子。',
  '村口有野狗，大家都沒辦法出門，怎麼辦？',
]);

/** Reads what a page shows in words, as JSON. */
const LANGUAGE_LOOK_EXPRESSION = `(() => {
  const panel = {};
  for (const input of document.querySelectorAll('input[aria-labelledby]')) {
    const labelId = input.getAttribute('aria-labelledby');
    const label = document.getElementById(labelId)?.textContent;
    if (label) {
      panel[label] = input.value;
    }
  }
  let offered = [];
  for (const select of document.querySelectorAll('select')) {
    const texts = [...select.options].map((option) => option.text);
    if (texts.includes('English')) {
      offered = texts;
    }
  }
  const prompt = document.querySelector('.interaction-prompt');
  return JSON.stringify({
    lang: document.documentElement.lang,
    title: document.title,
    titles: [...document.querySelectorAll('.panel-title, .panel-folder-title')]
      .map((title) => title.textContent),
    panel,
    offered,
    prompt: prompt === null || prompt.hidden ? null : prompt.textContent,
    speech: window.clovervale.describeSpeech(),
  });
})()`;

/**
 * Makes the expression that chooses a language in the language control of
 * the panel, and gives the language chosen afterward, or `missing`.
 *
 * @param {string} control - The name of the language control, in the
 *   language the page speaks.
 * @param {string} choice - The name of the language to choose.
 * @returns {string} The expression.
 */
function createLanguageExpression(control: string, choice: string): string {
  return `(() => {
    const control = ${JSON.stringify(control)};
    for (const select of document.querySelectorAll('select')) {
      const labelId = select.getAttribute('aria-labelledby');
      if (document.getElementById(labelId)?.textContent === control) {
        const offered = [...select.options].map((option) => option.text);
        const index = offered.indexOf(${JSON.stringify(choice)});
        if (index >= 0) {
          select.selectedIndex = index;
          select.dispatchEvent(new Event('change'));
        }
        return select.selectedOptions[0]?.text ?? 'missing';
      }
    }
    return 'missing';
  })()`;
}

/**
 * Reads what a page shows in words.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<LanguageLook>} What the page shows.
 */
async function readLanguageLook(
  session: BidiSession,
  context: string,
): Promise<LanguageLook> {
  return JSON.parse(
    await evaluateInPage(session, context, LANGUAGE_LOOK_EXPRESSION),
  ) as LanguageLook;
}

/**
 * Describes what a page shows in words, for the error messages.
 *
 * @param {LanguageLook} look - What the page shows.
 * @returns {string} The description.
 */
function describeLanguageLook(look: LanguageLook): string {
  const panel: string = Object.entries(look.panel)
    .map(([name, value]: [string, string]) => `${name}: "${value}"`)
    .join(', ');
  const prompt: string =
    look.prompt === null ? 'no prompt' : `the prompt "${look.prompt}"`;
  const bubble: string =
    look.speech === null
      ? 'no bubble'
      : `a bubble of ${look.speech.name} saying "${look.speech.line}"`;
  return (
    `the language "${look.lang}", the title "${look.title}", the panel ` +
    `titles "${look.titles.join('", "')}", the languages ` +
    `"${look.offered.join('", "')}" offered, ${prompt}, ${bubble}, and ` +
    `the panel values ${panel}`
  );
}

/**
 * Chooses a language in the language control of the panel of a page.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @param {string} control - The name of the language control, in the
 *   language the page speaks.
 * @param {string} choice - The name of the language to choose.
 * @returns {Promise<void>} A promise settled once it is chosen.
 * @throws {Error} If the panel has no such control, or it does not offer
 *   the language.
 */
export async function chooseLanguage(
  session: BidiSession,
  context: string,
  control: string,
  choice: string,
): Promise<void> {
  const chosen: string = await evaluateInPage(
    session,
    context,
    createLanguageExpression(control, choice),
  );
  if (chosen !== choice) {
    throw new Error(
      `With "${choice}" chosen in the "${control}" control of its panel, ` +
        `the first page has "${chosen}" chosen.`,
    );
  }
}

/**
 * Checks that a page speaks English at first, and that once Traditional
 * Chinese is chosen in its panel, it words its panel, its title and its
 * prompt in it at once, and that Nancy speaks it when the player talks to
 * her, and that once English is chosen again, it words them all in English
 * again at once, the bubble too while it is shown.
 *
 * The player stands by Nancy, facing her, as {@link checkTalk} leaves it.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the page does not word its text so.
 */
export async function checkLanguage(
  session: BidiSession,
  context: string,
): Promise<void> {
  const look = (): Promise<LanguageLook> => readLanguageLook(session, context);
  const isEnglish = (seen: LanguageLook): boolean =>
    seen.lang === PAGE_LANGUAGE &&
    seen.title === 'Clovervale' &&
    seen.titles[0] === 'Clovervale' &&
    seen.titles.includes(SNAPSHOT_FOLDER) &&
    (seen.panel.Server ?? '').startsWith('connected') &&
    seen.panel['Space key'] === TALK_KEY &&
    seen.prompt === TALK_PROMPT &&
    (seen.speech === null ||
      (seen.speech.name === 'Nancy' && NANCY_LINES.has(seen.speech.line)));
  const before: LanguageLook = await look();
  if (
    !isEnglish(before) ||
    before.offered.join('\n') !== LANGUAGE_NAMES.join('\n')
  ) {
    throw new Error(
      `Standing by Nancy and pinned to English, the first page tells ` +
        `${describeLanguageLook(before)}.`,
    );
  }

  await chooseLanguage(session, context, LANGUAGE_CONTROL, ZH_TW_NAME);
  const isChinese = (seen: LanguageLook): boolean =>
    seen.lang === 'zh-TW' &&
    seen.title === ZH_TW_TITLE &&
    seen.titles[0] === ZH_TW_TITLE &&
    seen.titles.includes(ZH_TW_SNAPSHOT_FOLDER) &&
    (seen.panel[ZH_TW_SERVER] ?? '').startsWith(ZH_TW_CONNECTED) &&
    seen.panel[ZH_TW_SPACE_KEY] === ZH_TW_TALK_KEY &&
    seen.prompt === ZH_TW_TALK_PROMPT;
  await waitFor(
    look,
    isChinese,
    ACTION_TIMEOUT,
    (seen: LanguageLook) =>
      `With "${ZH_TW_NAME}" chosen in its panel by Nancy, the first page ` +
      `tells ${describeLanguageLook(seen)}.`,
  );
  await tapKey(session, context, ' ');
  await waitFor(
    look,
    (seen: LanguageLook) =>
      seen.speech?.name === ZH_TW_NANCY &&
      ZH_TW_NANCY_LINES.has(seen.speech.line),
    ACTION_TIMEOUT,
    (seen: LanguageLook) =>
      `Standing by Nancy, with the space bar pressed in "${ZH_TW_NAME}", ` +
      `the first page tells ${describeLanguageLook(seen)}.`,
  );

  await chooseLanguage(session, context, ZH_TW_LANGUAGE_CONTROL, EN_NAME);
  const after: LanguageLook = await waitFor(
    look,
    isEnglish,
    ACTION_TIMEOUT,
    (seen: LanguageLook) =>
      `With "${EN_NAME}" chosen in its panel again, the first page tells ` +
      `${describeLanguageLook(seen)}.`,
  );
  if (after.speech === null) {
    throw new Error(
      `With "${EN_NAME}" chosen in its panel while Nancy speaks, the first ` +
        `page tells ${describeLanguageLook(after)}.`,
    );
  }
  await waitFor(
    look,
    (seen: LanguageLook) => seen.speech === null,
    SPEECH_TIMEOUT,
    (seen: LanguageLook) =>
      `A while after its player talked to Nancy again, the first page ` +
      `tells ${describeLanguageLook(seen)}.`,
  );
}
