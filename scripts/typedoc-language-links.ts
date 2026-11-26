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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/26
// AI assistance: Claude Code (Anthropic)

/**
 * @module scripts/typedoc-language-links A TypeDoc plugin that links each
 *   page to the same page in the copy in the other language.
 */

import { Application, JSX, ParameterType } from 'typedoc';
import type { DefaultThemeRenderContext } from 'typedoc';

/** The copy of the documentation in the other language. */
interface OtherLanguage {
  /** The name of the language, as the text of the links to the copy. */
  readonly name: string;
  /** The root of the copy, relative to the root of this copy. */
  readonly root: string;
  /**
   * The URLs of the pages of the copy, relative to its root, by the URLs
   * of the same pages in this copy, for the pages whose URLs differ.
   */
  readonly pages: Readonly<Record<string, string>>;
}

/** The option that describes the copy in the other language. */
const OPTION_NAME = 'otherLanguage';

/**
 * Tells whether a value describes a copy in the other language.
 *
 * @param {unknown} value - The value of the option.
 * @returns {boolean} Whether the value describes a copy.
 */
function isOtherLanguage(value: unknown): value is OtherLanguage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { name, root, pages } = value as Partial<
    Record<keyof OtherLanguage, unknown>
  >;
  return (
    typeof name === 'string' &&
    typeof root === 'string' &&
    typeof pages === 'object' &&
    pages !== null &&
    Object.values(pages).every((url: unknown) => typeof url === 'string')
  );
}

/**
 * Draws the link to the same page in the other copy.
 *
 * @param {DefaultThemeRenderContext} context - The page being rendered.
 * @param {OtherLanguage} other - The copy in the other language.
 * @returns {JSX.Element} The link.
 */
function drawLanguageLink(
  context: DefaultThemeRenderContext,
  other: OtherLanguage,
): JSX.Element {
  const { url } = context.page;
  const otherUrl: string = other.pages[url] ?? url;
  return JSX.createElement(
    'p',
    null,
    JSX.createElement(
      'a',
      { href: context.relativeURL(other.root + otherUrl) },
      other.name,
    ),
  );
}

/**
 * Registers the plugin with TypeDoc.
 *
 * @param {Application} app - The TypeDoc application.
 */
export function load(app: Application): void {
  app.options.addDeclaration({
    name: OPTION_NAME,
    help: 'The copy of the documentation in the other language.',
    type: ParameterType.Mixed,
    validate: (value: unknown) => {
      if (value !== undefined && !isOtherLanguage(value)) {
        throw new Error(
          `${OPTION_NAME} must have a name, a root, and the URLs of pages.`,
        );
      }
    },
  });
  app.renderer.hooks.on(
    'content.begin',
    (context: DefaultThemeRenderContext) => {
      const other: unknown = app.options.getValue(OPTION_NAME);
      return isOtherLanguage(other)
        ? drawLanguageLink(context, other)
        : JSX.createElement(JSX.Fragment, null);
    },
  );
}
