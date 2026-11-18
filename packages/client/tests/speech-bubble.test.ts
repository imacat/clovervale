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
 * @module client/tests/speech-bubble Tests for the bubble that shows what
 *   a villager says.
 */

import { BoxGeometry, Mesh, Object3D, Sprite, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { VILLAGERS, findPlacement } from '@clovervale/shared';
import type { Placement, Villager } from '@clovervale/shared';

import {
  CHARACTER_READING_SPEED,
  SpeechBubble,
  findHeadTop,
  measureSpeechDuration,
  wrapText,
} from '../src/speech-bubble.ts';
import type { SpeechWords } from '../src/speech-bubble.ts';
import { Translator } from '../src/translator.ts';

/**
 * Finds Nancy the villager.
 *
 * @returns {Villager} Nancy.
 * @throws {Error} If there is no Nancy among the villagers.
 */
function findNancy(): Villager {
  const found: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.file === 'npc-nancy.glb',
  );
  if (found === undefined) {
    throw new Error('Nancy is not among the villagers.');
  }
  return found;
}

/** Nancy the villager. */
const NANCY: Villager = findNancy();

/** What Nancy says, in English. */
const NANCY_LINE =
  'Wild dogs prowl outside the village, and no one dares to go out any ' +
  'more. What are we to do?';

/** What Nancy says, in Traditional Chinese. */
const NANCY_LINE_ZH_TW = '村口有野狗出沒，村裏的人都無法外出了，怎麼辦？';

/** Where Nancy stands. */
const SPOT: Placement = findPlacement(NANCY.file);

/** The top of the head of Nancy. */
const HEAD = new Vector3(SPOT.x, 1.6, SPOT.z);

/**
 * Makes a bubble that draws nothing, in a parent of its own, and remembers
 * what it is told to draw.
 *
 * @param {Translator} [translator] - The translator of the text of the page,
 *   in English by default.
 * @returns {{ parent: Object3D, bubble: SpeechBubble, painted: SpeechWords[] }}
 *   The parent, the bubble, and what it was told to draw, in order.
 */
function createBubble(translator: Translator = new Translator()): {
  parent: Object3D;
  bubble: SpeechBubble;
  painted: SpeechWords[];
} {
  const parent = new Object3D();
  const painted: SpeechWords[] = [];
  const bubble = new SpeechBubble(parent, translator, (words: SpeechWords) => {
    painted.push(words);
    return new Sprite();
  });
  return { parent, bubble, painted };
}

/**
 * Makes a translator of the text into a language.
 *
 * @param {'zh-TW' | 'zh-CN' | 'ja'} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(
  code: 'zh-TW' | 'zh-CN' | 'ja',
): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

describe('wrapText', () => {
  /**
   * Measures a text by its number of characters.
   *
   * @param {string} text - The text.
   * @returns {number} The width.
   */
  const measure = (text: string): number => text.length;

  it('breaks a text between words into lines no wider than told', () => {
    expect(wrapText('a bb ccc dddd', 6, measure)).toEqual([
      'a bb',
      'ccc',
      'dddd',
    ]);
  });

  it('leaves a word wider than told on a line of its own', () => {
    expect(wrapText('abcdefgh ij', 4, measure)).toEqual(['abcdefgh', 'ij']);
  });

  it('breaks Chinese between characters, not before punctuation', () => {
    expect(wrapText(NANCY_LINE_ZH_TW, 6, measure)).toEqual([
      '村口有野狗出',
      '沒，村裏的人',
      '都無法外出',
      '了，怎麼辦？',
    ]);
  });

  it('breaks Japanese, not before small kana or punctuation', () => {
    expect(wrapText('なっちゃったの。どうしよう……', 4, measure)).toEqual([
      'なっ',
      'ちゃった',
      'の。どう',
      'しよ',
      'う……',
    ]);
  });

  it('does not break after an opening bracket', () => {
    expect(wrapText('她說「快走」了', 3, measure)).toEqual([
      '她說',
      '「快',
      '走」了',
    ]);
  });

  it('keeps words of letters whole among Chinese characters', () => {
    expect(wrapText('按Space鍵', 3, measure)).toEqual(['按', 'Space', '鍵']);
  });
});

describe('measureSpeechDuration', () => {
  it('leaves time to read a line at three words a second', () => {
    const words: number = NANCY_LINE.split(' ').length;
    expect(measureSpeechDuration(NANCY_LINE)).toBeGreaterThanOrEqual(
      words / 3,
    );
  });

  it('shows a longer line for longer', () => {
    expect(measureSpeechDuration('Hello there, and welcome.')).toBeGreaterThan(
      measureSpeechDuration('Hello.'),
    );
  });

  it('leaves time to read Chinese and Japanese by their characters', () => {
    expect(measureSpeechDuration(NANCY_LINE_ZH_TW)).toBeGreaterThanOrEqual(
      20 / CHARACTER_READING_SPEED,
    );
    expect(measureSpeechDuration(NANCY_LINE_ZH_TW)).toBeGreaterThan(
      measureSpeechDuration('怎麼辦？'),
    );
    expect(measureSpeechDuration('どうしようかな。')).toBeGreaterThan(
      measureSpeechDuration('どうも。'),
    );
  });
});

describe('findHeadTop', () => {
  it('finds the top of the model of a villager where it stands', () => {
    const root = new Object3D();
    const body = new Mesh(new BoxGeometry(0.6, 1.6, 0.6));
    body.position.y = 0.8;
    root.add(body);
    root.position.set(SPOT.x, 0, SPOT.z);
    const top: Vector3 = findHeadTop(NANCY, root);
    expect(top.x).toBeCloseTo(SPOT.x);
    expect(top.y).toBeCloseTo(1.6);
    expect(top.z).toBeCloseTo(SPOT.z);
  });

  it('takes a usual height where the villager stands without its model', () => {
    const top: Vector3 = findHeadTop(NANCY, null);
    expect(top.x).toBeCloseTo(SPOT.x);
    expect(top.y).toBeGreaterThan(1);
    expect(top.z).toBeCloseTo(SPOT.z);
  });
});

describe('SpeechBubble', () => {
  it('shows nothing at first', () => {
    const { parent, bubble } = createBubble();
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toEqual([]);
  });

  it('shows what a villager says above its head', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    expect(parent.children).toHaveLength(1);
    const y: number | undefined = parent.children[0]?.position.y;
    expect(y).toBeGreaterThan(HEAD.y);
    expect(bubble.describe()).toEqual({
      name: 'Nancy',
      line: NANCY_LINE,
      x: HEAD.x,
      y,
      z: HEAD.z,
    });
  });

  it('shows what a villager says in the language of the page', async () => {
    const { bubble, painted } = createBubble(await createTranslator('ja'));
    bubble.say(NANCY, HEAD);
    expect(bubble.describe()?.name).toBe('ナンシー');
    expect(painted.map((words: SpeechWords) => words.language)).toEqual([
      'ja',
    ]);
  });

  it('shows the bubble shown in another language once told to', async () => {
    const translator = new Translator();
    const { parent, bubble, painted } = createBubble(translator);
    const duration: number = measureSpeechDuration(NANCY_LINE);
    bubble.say(NANCY, HEAD);
    bubble.update(1);
    await translator.choose('zh-TW');
    bubble.relabel();
    expect(parent.children).toHaveLength(1);
    expect(bubble.describe()).toMatchObject({
      name: '南茜',
      line: NANCY_LINE_ZH_TW,
      x: HEAD.x,
      z: HEAD.z,
    });
    expect(painted.map((words: SpeechWords) => words.language)).toEqual([
      'en',
      'zh-TW',
    ]);
    bubble.update(duration - 1.1);
    expect(bubble.describe()?.name).toBe('南茜');
    bubble.update(0.2);
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toEqual([]);
  });

  it('has nothing to show in another language without a bubble', () => {
    const { bubble, painted } = createBubble();
    bubble.relabel();
    expect(bubble.describe()).toBeNull();
    expect(painted).toEqual([]);
  });

  it('shows it for as long as it takes to read, and then no more', () => {
    const { parent, bubble } = createBubble();
    const duration: number = measureSpeechDuration(NANCY_LINE);
    bubble.say(NANCY, HEAD);
    bubble.update(duration - 0.1);
    expect(bubble.describe()?.name).toBe('Nancy');
    bubble.update(0.2);
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toEqual([]);
  });

  it('starts again when the villager is talked to again', () => {
    const { parent, bubble } = createBubble();
    const duration: number = measureSpeechDuration(NANCY_LINE);
    bubble.say(NANCY, HEAD);
    bubble.update(duration - 1);
    bubble.say(NANCY, HEAD);
    expect(parent.children).toHaveLength(1);
    bubble.update(duration - 0.1);
    expect(bubble.describe()?.name).toBe('Nancy');
    bubble.update(0.2);
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toEqual([]);
  });
});
