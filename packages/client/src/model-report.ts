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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/17
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/model-report Telling the owner how showing the models went.
 */

import type { Translator } from './translator.ts';

/** A model that cannot be shown, and why. */
export type ModelProblem =
  | {
      /** The file name of the model. */
      readonly file: string;
      /** Why the model cannot be shown: it is missing. */
      readonly reason: 'missing';
    }
  | {
      /** The file name of the model. */
      readonly file: string;
      /** Why the model cannot be shown: it failed to load. */
      readonly reason: 'failed';
      /** What the failure tells of itself, which may be nothing. */
      readonly detail: string;
    };

/**
 * Sums up how showing the models went, in a few words, in the language of
 * the page.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {number} shownCount - The number of models that are shown.
 * @param {readonly ModelProblem[]} problems - The models that cannot be
 *   shown.
 * @returns {string} The summary.
 */
export function summariseModels(
  translator: Translator,
  shownCount: number,
  problems: readonly ModelProblem[],
): string {
  const shown = String(shownCount);
  if (problems.length === 0) {
    return translator.translate('models.shown', { shown });
  }
  const count = String(problems.length);
  return problems.length === 1
    ? translator.translate('models.shownWithProblem', {
        shown,
        problems: count,
      })
    : translator.translate('models.shownWithProblems', {
        shown,
        problems: count,
      });
}

/**
 * Reports a model that failed to load.
 *
 * @param {string} file - The file name of the model.
 * @param {unknown} error - What was thrown when it failed.
 * @returns {ModelProblem} The problem, with the message of the error, or
 *   whatever else was thrown, as its detail.
 */
export function reportFailure(file: string, error: unknown): ModelProblem {
  const detail: string = error instanceof Error ? error.message : String(error);
  return { file, reason: 'failed', detail: detail.trim() };
}

/**
 * Explains why a model cannot be shown, for the owner to read, in the
 * language of the page.
 *
 * @param {Translator} translator - The translator of the text of the page.
 * @param {ModelProblem} problem - The model that cannot be shown.
 * @returns {string} The explanation.
 */
export function explainProblem(
  translator: Translator,
  problem: ModelProblem,
): string {
  if (problem.reason === 'missing') {
    return translator.translate('model.missing');
  }
  const { detail } = problem;
  return detail === ''
    ? translator.translate('model.failed')
    : translator.translate('model.failedWithDetail', { detail });
}
