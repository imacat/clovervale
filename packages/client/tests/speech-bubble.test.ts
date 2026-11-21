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

import { VILLAGERS, findPlacement, findTobyPose } from '@clovervale/shared';
import type { Placement, TobyPose, Villager } from '@clovervale/shared';

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
 * Finds a villager.
 *
 * @param {string} file - The file name of the model of the villager.
 * @returns {Villager} The villager.
 * @throws {Error} If there is no such villager.
 */
function findVillagerOf(file: string): Villager {
  const found: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.file === file,
  );
  if (found === undefined) {
    throw new Error(`${file} is not among the villagers.`);
  }
  return found;
}

/** Nancy the villager. */
const NANCY: Villager = findVillagerOf('npc-nancy.glb');

/** Martha the village chief, who has two lines. */
const MARTHA: Villager = findVillagerOf('npc-martha.glb');

/** What Martha says, in English, in order. */
const MARTHA_LINES: readonly string[] = [
  "Welcome to Clovervale. I'm Martha, the village chief. If you need " +
    'anything, just come and see me.',
  'That well dried up long ago, so I boarded it up to keep the children ' +
    'from falling in.',
];

/** What Martha says, in Traditional Chinese, in order. */
const MARTHA_LINES_ZH_TW: readonly string[] = [
  '歡迎來到四葉谷，我是村長瑪莎，有事儘管來找我。',
  '那口井早就乾了，我就封起來了，免得小孩掉下去。',
];

/** Emma the blacksmith, who has two lines. */
const EMMA: Villager = findVillagerOf('npc-emma.glb');

/** What Emma says, in English. */
const EMMA_LINES: readonly string[] = [
  'Just a moment, let me finish this blade first.',
  "Don't stand too close, the sparks will catch you.",
];

/** What Emma says, in Traditional Chinese. */
const EMMA_LINES_ZH_TW: readonly string[] = [
  '等一下，我先打完這把刀。',
  '別站太近，火星會噴到你。',
];

/** Toby, the child who goes about by the gate, who has three lines. */
const TOBY: Villager = findVillagerOf('npc-toby.glb');

/** What Toby says, in English. */
const TOBY_LINES: readonly string[] = [
  "Mummy says I mustn't go outside. There are wild dogs out there.",
  'If you want something, go and see the village chief. She lives in the ' +
    'biggest house!',
  "I'm looking for a four-leaf one! If you find one, you'll have good luck.",
];

/** What Toby says, in Traditional Chinese. */
const TOBY_LINES_ZH_TW: readonly string[] = [
  '媽媽說不可以出去，外面有野狗。',
  '有事要找村長喔，她住在最大的那間房子。',
  '我在找四葉的！找到就會有好運喔。',
];

/** What Nancy says, in English. */
const NANCY_LINE =
  'There are wild dogs at the village gate, and no one can go out. What ' +
  'are we going to do?';

/** What Nancy says, in Traditional Chinese. */
const NANCY_LINE_ZH_TW = '村口有野狗，大家都沒辦法出門，怎麼辦？';

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
 * @param {() => number} [random] - The source of random numbers in [0, 1)
 *   the bubble picks lines by, `Math.random` by default.
 * @returns {{ parent: Object3D, bubble: SpeechBubble, painted: SpeechWords[] }}
 *   The parent, the bubble, and what it was told to draw, in order.
 */
function createBubble(
  translator: Translator = new Translator(),
  random: () => number = Math.random,
): {
  parent: Object3D;
  bubble: SpeechBubble;
  painted: SpeechWords[];
} {
  const parent = new Object3D();
  const painted: SpeechWords[] = [];
  const bubble = new SpeechBubble(
    parent,
    translator,
    (words: SpeechWords) => {
      painted.push(words);
      return new Sprite();
    },
    random,
  );
  return { parent, bubble, painted };
}

/**
 * Makes a source of random numbers that gives the same numbers, in turn,
 * over and over.
 *
 * @param {readonly number[]} numbers - The numbers, each in [0, 1).
 * @returns {() => number} The source.
 */
function createSequence(numbers: readonly number[]): () => number {
  let index = 0;
  return (): number => numbers[index++ % numbers.length] ?? 0;
}

/**
 * Talks to a villager over and over, and notes what it says each time.
 *
 * @param {SpeechBubble} bubble - The bubble.
 * @param {Villager} villager - The villager.
 * @param {number} count - How many times to talk to it.
 * @returns {string[]} What it says, in order.
 */
function talkRepeatedly(
  bubble: SpeechBubble,
  villager: Villager,
  count: number,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    bubble.say(villager, HEAD);
    lines.push(bubble.describe()?.line ?? '');
  }
  return lines;
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
      '村口有野狗，',
      '大家都沒辦法',
      '出門，怎麼',
      '辦？',
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
    const top: Vector3 = findHeadTop(NANCY, root, 0);
    expect(top.x).toBeCloseTo(SPOT.x);
    expect(top.y).toBeCloseTo(1.6);
    expect(top.z).toBeCloseTo(SPOT.z);
  });

  it('finds the top of Toby where he is at the step', () => {
    const root = new Object3D();
    const body = new Mesh(new BoxGeometry(0.4, 1.1, 0.4));
    body.position.y = 0.55;
    root.add(body);
    const toby: TobyPose = findTobyPose(150);
    root.position.set(toby.x, 0, toby.z);
    const top: Vector3 = findHeadTop(TOBY, root, 150);
    expect(top.x).toBeCloseTo(toby.x);
    expect(top.y).toBeCloseTo(1.1);
    expect(top.z).toBeCloseTo(toby.z);
  });

  it('takes a usual height where the villager stands without its model', () => {
    const top: Vector3 = findHeadTop(NANCY, null, 0);
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

describe('SpeechBubble with a villager who has several lines', () => {
  /** Numbers in [0, 1) spread over the whole of it, in no order. */
  const SPREAD: readonly number[] = [0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.9];

  it('says each of the lines in time', () => {
    for (const numbers of [SPREAD, [0], [0.99]]) {
      const { bubble } = createBubble(undefined, createSequence(numbers));
      expect(new Set(talkRepeatedly(bubble, MARTHA, 10))).toEqual(
        new Set(MARTHA_LINES),
      );
    }
  });

  it('never says the same line twice running', () => {
    for (const numbers of [SPREAD, [0], [0.5], [0.99]]) {
      const { bubble } = createBubble(undefined, createSequence(numbers));
      const lines: string[] = talkRepeatedly(bubble, MARTHA, 20);
      lines.slice(1).forEach((line: string, index: number) => {
        expect(line).not.toBe(lines[index]);
      });
    }
  });

  it('always says the one line of a villager who has one', () => {
    for (const numbers of [SPREAD, [0], [0.99]]) {
      const { bubble } = createBubble(undefined, createSequence(numbers));
      expect(new Set(talkRepeatedly(bubble, NANCY, 10))).toEqual(
        new Set([NANCY_LINE]),
      );
    }
  });

  it('puts her name in the line that names her', () => {
    const { bubble } = createBubble(undefined, createSequence([0]));
    bubble.say(MARTHA, HEAD);
    expect(bubble.describe()).toMatchObject({
      name: 'Chief Martha',
      line: MARTHA_LINES[0],
    });
  });

  it('keeps to the line shown when shown in another language', async () => {
    const translator = new Translator();
    const { bubble } = createBubble(translator, createSequence([0.99]));
    bubble.say(MARTHA, HEAD);
    const index: number = MARTHA_LINES.indexOf(bubble.describe()?.line ?? '');
    expect(index).toBeGreaterThanOrEqual(0);
    await translator.choose('zh-TW');
    bubble.relabel();
    expect(bubble.describe()).toMatchObject({
      name: '村長瑪莎',
      line: MARTHA_LINES_ZH_TW[index],
    });
  });
});

describe('SpeechBubble with Emma', () => {
  it('says each of her lines, in English and in Traditional Chinese', async () => {
    const numbers: readonly number[] = [0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.9];
    const { bubble } = createBubble(undefined, createSequence(numbers));
    expect(new Set(talkRepeatedly(bubble, EMMA, 10))).toEqual(
      new Set(EMMA_LINES),
    );
    expect(bubble.describe()?.name).toBe('Blacksmith Emma');
    const zhTw: Translator = await createTranslator('zh-TW');
    const chinese = createBubble(zhTw, createSequence(numbers));
    expect(new Set(talkRepeatedly(chinese.bubble, EMMA, 10))).toEqual(
      new Set(EMMA_LINES_ZH_TW),
    );
    expect(chinese.bubble.describe()?.name).toBe('鐵匠艾瑪');
  });
});

describe('SpeechBubble with Toby', () => {
  it('says each of his lines, in English and in Traditional Chinese', async () => {
    const numbers: readonly number[] = [0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.9];
    const { bubble } = createBubble(undefined, createSequence(numbers));
    expect(new Set(talkRepeatedly(bubble, TOBY, 12))).toEqual(
      new Set(TOBY_LINES),
    );
    const zhTw: Translator = await createTranslator('zh-TW');
    const chinese = createBubble(zhTw, createSequence(numbers));
    expect(new Set(talkRepeatedly(chinese.bubble, TOBY, 12))).toEqual(
      new Set(TOBY_LINES_ZH_TW),
    );
    expect(chinese.bubble.describe()?.name).toBe('托比');
  });

  it('follows him as he runs on while he speaks', () => {
    const { parent, bubble } = createBubble();
    const start: TobyPose = findTobyPose(120);
    const later: TobyPose = findTobyPose(130);
    expect([start.activity, later.activity]).toEqual(['Run', 'Run']);
    bubble.say(TOBY, new Vector3(start.x, 1.1, start.z));
    const before: number | undefined = bubble.describe()?.y;
    bubble.follow(TOBY, new Vector3(later.x, 1.1, later.z));
    expect(bubble.describe()).toMatchObject({
      x: later.x,
      y: before,
      z: later.z,
    });
    expect(parent.children).toHaveLength(1);
    // Another villager does not take his bubble with her.
    bubble.follow(NANCY, HEAD);
    expect(bubble.describe()).toMatchObject({ x: later.x, z: later.z });
  });

  it('follows nobody once the bubble is over', () => {
    const { bubble } = createBubble();
    bubble.follow(TOBY, new Vector3(-10.5, 1.1, -0.2));
    expect(bubble.describe()).toBeNull();
  });

  it('exclaims as he finds a four-leaved clover, in every language', async () => {
    const found: readonly [Translator, string][] = [
      [new Translator(), 'Found one!'],
      [await createTranslator('zh-TW'), '找到了！'],
      [await createTranslator('zh-CN'), '找到啦！'],
      [await createTranslator('ja'), 'あった！'],
    ];
    for (const [translator, line] of found) {
      const { bubble } = createBubble(translator);
      bubble.say(TOBY, new Vector3(-8, 0.8, 0), 'villager.toby.found');
      expect(bubble.describe()?.line).toBe(line);
    }
  });

  it('gives a clover with a line of his own, in every language', async () => {
    const gift: readonly [Translator, string][] = [
      [new Translator(), "Here, this one's for you! It brings good luck."],
      [await createTranslator('zh-TW'), '這個給你！會有好運喔。'],
      [await createTranslator('zh-CN'), '这个给你！会有好运哦。'],
      [await createTranslator('ja'), 'これ、あげる！いいことがあるよ。'],
    ];
    for (const [translator, line] of gift) {
      const { bubble } = createBubble(translator);
      bubble.say(TOBY, new Vector3(-8, 0.8, 0), 'villager.toby.gift');
      expect(bubble.describe()?.line).toBe(line);
    }
  });

  it('takes back what he said, and only what he said', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    bubble.hush(TOBY);
    expect(bubble.describe()?.name).toBe('Nancy');
    bubble.say(TOBY, new Vector3(-8, 0.8, 0), 'villager.toby.found');
    bubble.hush(TOBY);
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toHaveLength(0);
  });
});
