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
 * @module scripts/test-browser/panel Checks the panel folded up.
 */

import type { BidiSession } from './bidi.ts';
import { ACTION_TIMEOUT } from './constants.ts';
import { evaluateInPage, waitFor } from './page.ts';
import type { BoxView } from './page.ts';

/** Reads how the panel of a page shows itself, as JSON. */
const PANEL_LOOK_EXPRESSION = `(() => {
  const boxOf = (selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box === undefined || box.width === 0 || box.height === 0
      ? null
      : { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  };
  const children = boxOf('.panel-contents');
  return JSON.stringify({
    isClosed: document.querySelector('.panel') !== null && children === null,
    title: boxOf('.panel-title'),
    children,
    bagIcon: boxOf('.bag-icon'),
    helpButton: boxOf('.help-button'),
  });
})()`;

/** How the panel of a page shows itself. */
interface PanelLook {
  /** Whether the panel is folded up to its title. */
  readonly isClosed: boolean;
  /** The box of its title, or `null` if it is not shown. */
  readonly title: BoxView | null;
  /** The box of what it holds, or `null` if it is not shown. */
  readonly children: BoxView | null;
  /** The box of the icon of the bag, or `null` if it is not shown. */
  readonly bagIcon: BoxView | null;
  /** The box of the help button, or `null` if it is not shown. */
  readonly helpButton: BoxView | null;
}

/**
 * Checks that the panel of a page starts folded up to its title, which is
 * clear of the icon of the bag and of the help button, and that clicking
 * the title opens it and clicking it again folds it up again.  The panel
 * is left folded up.
 *
 * @param {BidiSession} session - The session with the browser.
 * @param {string} context - The browsing context of the page.
 * @returns {Promise<void>} A promise settled once the page has passed.
 * @throws {Error} If the panel does not show itself so.
 */
export async function checkPanelFolded(
  session: BidiSession,
  context: string,
): Promise<void> {
  const look = async (): Promise<PanelLook> =>
    JSON.parse(
      await evaluateInPage(session, context, PANEL_LOOK_EXPRESSION),
    ) as PanelLook;
  const describe = (seen: PanelLook): string => JSON.stringify(seen);
  const overlaps = (one: BoxView | null, other: BoxView | null): boolean =>
    one !== null &&
    other !== null &&
    one.left < other.right &&
    other.left < one.right &&
    one.top < other.bottom &&
    other.top < one.bottom;
  const clickTitle =
    'document.querySelector(".panel-title").click(), ""';
  const first: PanelLook = await look();
  if (
    !first.isClosed ||
    first.title === null ||
    overlaps(first.title, first.bagIcon) ||
    overlaps(first.title, first.helpButton)
  ) {
    throw new Error(
      `Just loaded, the first page shows its panel as ${describe(first)}.`,
    );
  }
  await evaluateInPage(session, context, clickTitle);
  await waitFor(
    look,
    (seen: PanelLook) => !seen.isClosed && seen.children !== null,
    ACTION_TIMEOUT,
    (seen: PanelLook) =>
      `With the title of its panel clicked, the first page shows its ` +
      `panel as ${describe(seen)}.`,
  );
  await evaluateInPage(session, context, clickTitle);
  await waitFor(
    look,
    (seen: PanelLook) => seen.isClosed,
    ACTION_TIMEOUT,
    (seen: PanelLook) =>
      `With the title of its panel clicked again, the first page shows ` +
      `its panel as ${describe(seen)}.`,
  );
}
