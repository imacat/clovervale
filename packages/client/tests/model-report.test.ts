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
 * @module client/tests/model-report Tests for reporting on the models.
 */

import { describe, expect, it } from 'vitest';

import {
  explainProblem,
  reportFailure,
  summarizeModels,
} from '../src/model-report.ts';
import type { ModelProblem } from '../src/model-report.ts';
import { Translator } from '../src/translator.ts';

/** A translator of the text into English. */
const EN = new Translator();

/** A model that is missing. */
const MISSING: ModelProblem = { file: 'npc-nancy.glb', reason: 'missing' };

/**
 * Makes a translator of the text into a language.
 *
 * @param {'zh-TW' | 'ja' | 'es'} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(
  code: 'zh-TW' | 'ja' | 'es',
): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

describe('summarizeModels', () => {
  it('counts the models when all of them are shown', () => {
    expect(summarizeModels(EN, 20, [])).toBe('20 shown');
  });

  it('counts the problems too', () => {
    expect(summarizeModels(EN, 11, [MISSING])).toBe('11 shown, 1 problem');
    expect(summarizeModels(EN, 0, [MISSING, MISSING])).toBe(
      '0 shown, 2 problems',
    );
  });

  it('counts them in the language of the page', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    expect(summarizeModels(zhTw, 20, [])).toBe('已顯示 20 個');
    expect(summarizeModels(zhTw, 11, [MISSING])).toBe(
      '已顯示 11 個，1 個問題',
    );
    const es: Translator = await createTranslator('es');
    expect(summarizeModels(es, 1, [])).toBe('Mostrados: 1');
    expect(summarizeModels(es, 11, [MISSING])).toBe(
      'Mostrados: 11; problemas: 1',
    );
  });
});

describe('explainProblem', () => {
  it('tells that a model is missing', () => {
    expect(explainProblem(EN, MISSING)).toBe('missing');
  });

  it('gives the message of an error', () => {
    const problem: ModelProblem = reportFailure(
      'fountain.glb',
      new Error('the file is cut short'),
    );
    expect(problem.file).toBe('fountain.glb');
    expect(explainProblem(EN, problem)).toBe(
      'failed to load: the file is cut short',
    );
  });

  it('gives whatever else was thrown', () => {
    const problem: ModelProblem = reportFailure('fountain.glb', '404');
    expect(explainProblem(EN, problem)).toBe('failed to load: 404');
  });

  it('does without a reason when there is none', () => {
    const problem: ModelProblem = reportFailure(
      'fountain.glb',
      new Error(''),
    );
    expect(explainProblem(EN, problem)).toBe('failed to load');
  });

  it('tells it in the language of the page', async () => {
    const ja: Translator = await createTranslator('ja');
    expect(explainProblem(ja, MISSING)).toBe('ファイルなし');
    expect(explainProblem(ja, reportFailure('fountain.glb', '404'))).toBe(
      '読み込み失敗：404',
    );
  });
});
