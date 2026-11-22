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
 * @module client/tests/speech-bubble Tests for the bubbles that show what
 *   a villager and the players say.
 */

import {
  BoxGeometry,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Sprite,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import { VILLAGERS, findPlacement, findTobyPose } from '@clovervale/shared';
import type { Placement, TobyPose, Villager } from '@clovervale/shared';

import {
  CHARACTER_READING_SPEED,
  SpeechBubble,
  findFigureTop,
  findHeadTop,
  measureSpeechDuration,
  wrapText,
} from '../src/speech-bubble.ts';
import type {
  SaidView,
  SpeechScreen,
  SpeechView,
  SpeechWords,
} from '../src/speech-bubble.ts';
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

/** What Nancy says first, to welcome a player, in English. */
const NANCY_WELCOME =
  'Welcome to Clovervale! If you need anything, go and see the village ' +
  'chief. She lives in the biggest house, right at the back.';

/** What Nancy says first, to welcome a player, in Traditional Chinese. */
const NANCY_WELCOME_ZH_TW =
  '歡迎來到四葉谷！有事可以找村長，她住在後面最大的那間房子。';

/** What Nancy says of the wild dogs, in English. */
const NANCY_DOGS_LINE =
  'There are wild dogs at the village gate, and no one can go out. What ' +
  'are we going to do?';

/** What Nancy says of the wild dogs, in Traditional Chinese. */
const NANCY_DOGS_LINE_ZH_TW = '村口有野狗，大家都沒辦法出門，怎麼辦？';

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

  it('starts a new line at a line break, and wraps each row', () => {
    expect(wrapText('one two\nthree', 20, measure)).toEqual([
      'one two',
      'three',
    ]);
    expect(wrapText('one two three\nfour five six', 9, measure)).toEqual([
      'one two',
      'three',
      'four five',
      'six',
    ]);
  });

  it('leaves a word wider than told on a line of its own', () => {
    expect(wrapText('abcdefgh ij', 4, measure)).toEqual(['abcdefgh', 'ij']);
  });

  it('breaks Chinese between characters, not before punctuation', () => {
    expect(wrapText(NANCY_DOGS_LINE_ZH_TW, 6, measure)).toEqual([
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
    const words: number = NANCY_DOGS_LINE.split(' ').length;
    expect(measureSpeechDuration(NANCY_DOGS_LINE)).toBeGreaterThanOrEqual(
      words / 3,
    );
  });

  it('shows a longer line for longer', () => {
    expect(measureSpeechDuration('Hello there, and welcome.')).toBeGreaterThan(
      measureSpeechDuration('Hello.'),
    );
  });

  it('leaves time to read Chinese and Japanese by their characters', () => {
    expect(measureSpeechDuration(NANCY_DOGS_LINE_ZH_TW)).toBeGreaterThanOrEqual(
      20 / CHARACTER_READING_SPEED,
    );
    expect(measureSpeechDuration(NANCY_DOGS_LINE_ZH_TW)).toBeGreaterThan(
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
      line: NANCY_WELCOME,
      x: HEAD.x,
      y,
      z: HEAD.z,
      textSize: null,
      screen: null,
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
    const duration: number = measureSpeechDuration(NANCY_WELCOME);
    bubble.say(NANCY, HEAD);
    bubble.update(1);
    await translator.choose('zh-TW');
    bubble.relabel();
    expect(parent.children).toHaveLength(1);
    expect(bubble.describe()).toMatchObject({
      name: '南茜',
      line: NANCY_WELCOME_ZH_TW,
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
    const duration: number = measureSpeechDuration(NANCY_WELCOME);
    bubble.say(NANCY, HEAD);
    bubble.update(duration - 0.1);
    expect(bubble.describe()?.name).toBe('Nancy');
    bubble.update(0.2);
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toEqual([]);
  });

  it('starts again when the villager is talked to again', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    bubble.update(measureSpeechDuration(NANCY_WELCOME) - 1);
    bubble.say(NANCY, HEAD);
    expect(parent.children).toHaveLength(1);
    bubble.update(measureSpeechDuration(NANCY_DOGS_LINE) - 0.1);
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

  it('has Nancy welcome a player the first time, whatever the chance', () => {
    for (const numbers of [SPREAD, [0], [0.5], [0.99]]) {
      const { bubble } = createBubble(undefined, createSequence(numbers));
      expect(talkRepeatedly(bubble, NANCY, 1)).toEqual([NANCY_WELCOME]);
    }
  });

  it('has Nancy welcome a player first in the language of the page', async () => {
    const zhTw: Translator = await createTranslator('zh-TW');
    const { bubble } = createBubble(zhTw, createSequence([0.99]));
    expect(talkRepeatedly(bubble, NANCY, 1)).toEqual([NANCY_WELCOME_ZH_TW]);
  });

  it('has Nancy say each of her lines in time after her welcome', () => {
    for (const numbers of [SPREAD, [0], [0.99]]) {
      const { bubble } = createBubble(undefined, createSequence(numbers));
      const lines: string[] = talkRepeatedly(bubble, NANCY, 11);
      expect(new Set(lines.slice(1))).toEqual(
        new Set([NANCY_WELCOME, NANCY_DOGS_LINE]),
      );
      lines.slice(1).forEach((line: string, index: number) => {
        expect(line).not.toBe(lines[index]);
      });
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

describe('SpeechBubble in views of different heights', () => {
  /** The field of view of the camera, from top to bottom, in degrees. */
  const FIELD_OF_VIEW = 40;
  /** The width of the view of a desktop window, in CSS pixels. */
  const DESKTOP_WIDTH = 1280;
  /** The height of the view of a desktop window, in CSS pixels. */
  const DESKTOP_HEIGHT = 800;
  /** The width of the view of a phone held on its side, in CSS pixels. */
  const LANDSCAPE_WIDTH = 832;
  /** The height of the view of a phone held on its side, in CSS pixels. */
  const LANDSCAPE_HEIGHT = 384;

  /**
   * Finds the bubble drawn in a parent.
   *
   * @param {Object3D} parent - The parent.
   * @returns {Object3D} The bubble.
   * @throws {Error} If the parent has no bubble.
   */
  const findSprite = (parent: Object3D): Object3D => {
    const sprite: Object3D | undefined = parent.children[0];
    if (sprite === undefined) {
      throw new Error('No bubble is drawn.');
    }
    return sprite;
  };

  it('tells no size of the words before it is told the view', () => {
    const { bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    expect(bubble.describe()?.textSize).toBeNull();
  });

  it('draws a bubble as painted in a view as tall as a desktop window', () => {
    const { parent, bubble } = createBubble();
    bubble.fitView(DESKTOP_WIDTH, DESKTOP_HEIGHT, FIELD_OF_VIEW);
    bubble.say(NANCY, HEAD);
    expect(findSprite(parent).scale.x).toBeCloseTo(1);
    expect(findSprite(parent).scale.y).toBeCloseTo(1);
    const size: number = bubble.describe()?.textSize ?? 0;
    bubble.fitView(DESKTOP_WIDTH, DESKTOP_HEIGHT * 1.25, FIELD_OF_VIEW);
    expect(bubble.describe()?.textSize).toBeCloseTo(size * 1.25);
  });

  it('keeps its words legible on a phone held on its side', () => {
    const { parent, bubble } = createBubble();
    bubble.fitView(LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, FIELD_OF_VIEW);
    bubble.say(NANCY, HEAD);
    expect(findSprite(parent).scale.y).toBeGreaterThan(1);
    expect(findSprite(parent).scale.x).toBeCloseTo(
      findSprite(parent).scale.y,
    );
    expect(bubble.describe()?.textSize).toBeGreaterThanOrEqual(15);
    expect(bubble.describe()?.textSize).toBeLessThanOrEqual(20);
  });

  it('resizes the bubble shown once the view changes', async () => {
    const translator = new Translator();
    const { parent, bubble } = createBubble(translator);
    bubble.fitView(DESKTOP_WIDTH, DESKTOP_HEIGHT, FIELD_OF_VIEW);
    bubble.say(NANCY, HEAD);
    bubble.fitView(LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, FIELD_OF_VIEW);
    const scale: number = findSprite(parent).scale.y;
    expect(scale).toBeGreaterThan(1);
    expect(bubble.describe()?.textSize).toBeGreaterThanOrEqual(15);
    await translator.choose('zh-TW');
    bubble.relabel();
    expect(findSprite(parent).scale.y).toBeCloseTo(scale);
    bubble.fitView(DESKTOP_WIDTH, DESKTOP_HEIGHT, FIELD_OF_VIEW);
    expect(findSprite(parent).scale.y).toBeCloseTo(1);
  });
});

/** The size of a view. */
interface ViewArea {
  /** The width of the view, in CSS pixels. */
  readonly width: number;
  /** The height of the view, in CSS pixels. */
  readonly height: number;
}

describe('SpeechBubble on the screen', () => {
  /** The field of view of the camera, from top to bottom, in degrees. */
  const FIELD_OF_VIEW = 40;
  /** The view of a phone held upright, in CSS pixels. */
  const PORTRAIT: ViewArea = { width: 384, height: 832 };
  /** The view of a desktop window, in CSS pixels. */
  const DESKTOP: ViewArea = { width: 1280, height: 800 };
  /** The height of a bubble as it is drawn, in metres at one metre. */
  const PAINTED_HEIGHT = 0.15;

  /**
   * Makes a bubble that draws each bubble as wide as it may be, and
   * remembers how wide that was.
   *
   * @returns {{ bubble: SpeechBubble, widths: number[] }} The bubble, and
   *   how wide each bubble drawn may be, in order.
   */
  const createWideBubble = (): {
    bubble: SpeechBubble;
    widths: number[];
  } => {
    const widths: number[] = [];
    const bubble = new SpeechBubble(
      new Object3D(),
      new Translator(),
      (_words: SpeechWords, widest: number) => {
        widths.push(widest);
        const sprite = new Sprite();
        sprite.scale.set(widest * 0.001, PAINTED_HEIGHT, 1);
        return sprite;
      },
    );
    return { bubble, widths };
  };

  /**
   * Makes a camera that looks across the village for a view.
   *
   * @param {ViewArea} view - The view.
   * @returns {PerspectiveCamera} The camera.
   */
  const createCamera = (view: ViewArea): PerspectiveCamera => {
    const camera = new PerspectiveCamera(
      FIELD_OF_VIEW,
      view.width / view.height,
      0.5,
      600,
    );
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    return camera;
  };

  /**
   * Finds the point ten metres from a camera that it shows at a place in
   * its view.
   *
   * @param {PerspectiveCamera} camera - The camera.
   * @param {ViewArea} view - The view.
   * @param {number} x - The place across the view, in CSS pixels.
   * @param {number} y - The place down the view, in CSS pixels.
   * @returns {Vector3} The point.
   */
  const findPointAt = (
    camera: PerspectiveCamera,
    view: ViewArea,
    x: number,
    y: number,
  ): Vector3 => {
    const direction: Vector3 = new Vector3(
      (x / view.width) * 2 - 1,
      1 - (y / view.height) * 2,
      0.5,
    )
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    return camera.position.clone().addScaledVector(direction, 10);
  };

  /**
   * Finds where the foot of the bubble shown is in a view.
   *
   * @param {SpeechView | null} speech - The bubble.
   * @param {PerspectiveCamera} camera - The camera.
   * @param {ViewArea} view - The view.
   * @returns {[number, number]} The place across and down the view, in CSS
   *   pixels.
   */
  const findFoot = (
    speech: SpeechView | null,
    camera: PerspectiveCamera,
    view: ViewArea,
  ): [number, number] => {
    const foot: Vector3 = new Vector3(
      speech?.x ?? NaN,
      speech?.y ?? NaN,
      speech?.z ?? NaN,
    ).project(camera);
    return [
      ((foot.x + 1) / 2) * view.width,
      ((1 - foot.y) / 2) * view.height,
    ];
  };

  /**
   * Shows Nancy saying her line with the foot of her bubble at a place in
   * a view, and places the bubble on the screen.
   *
   * @param {ViewArea} view - The view.
   * @param {number} x - The place of her head across the view.
   * @param {number} y - The place of her head down the view.
   * @returns {{ speech: SpeechView | null, foot: [number, number] }} The
   *   bubble, and where its foot is in the view.
   */
  const showAt = (
    view: ViewArea,
    x: number,
    y: number,
  ): { speech: SpeechView | null; foot: [number, number] } => {
    const { bubble } = createWideBubble();
    const camera: PerspectiveCamera = createCamera(view);
    bubble.fitView(view.width, view.height, FIELD_OF_VIEW);
    bubble.say(NANCY, findPointAt(camera, view, x, y));
    bubble.place(camera);
    const speech: SpeechView | null = bubble.describe();
    return { speech, foot: findFoot(speech, camera, view) };
  };

  /**
   * Checks that a bubble lies wholly within a view.
   *
   * @param {SpeechScreen | null | undefined} screen - Where the bubble is.
   * @param {ViewArea} view - The view.
   */
  const expectWithin = (
    screen: SpeechScreen | null | undefined,
    view: ViewArea,
  ): void => {
    expect(screen).toBeDefined();
    expect(screen).not.toBeNull();
    expect(screen?.left).toBeGreaterThan(0);
    expect(screen?.top).toBeGreaterThan(0);
    expect(screen?.right).toBeLessThan(view.width);
    expect(screen?.tipY).toBeLessThan(view.height);
    expect(screen?.tipX).toBeGreaterThan(screen?.left ?? NaN);
    expect(screen?.tipX).toBeLessThan(screen?.right ?? NaN);
  };

  it('is no wider than most of the view of a phone held upright', () => {
    const { bubble, widths } = createWideBubble();
    bubble.say(NANCY, HEAD);
    const widest: number | undefined = widths[0];
    bubble.fitView(DESKTOP.width, DESKTOP.height, FIELD_OF_VIEW);
    bubble.say(NANCY, HEAD);
    expect(widths[1]).toBe(widest);
    const { speech } = showAt(PORTRAIT, PORTRAIT.width / 2, 400);
    const width: number = (speech?.screen?.right ?? NaN) -
      (speech?.screen?.left ?? NaN);
    expect(width).toBeLessThanOrEqual(PORTRAIT.width * 0.9);
    expect(width).toBeGreaterThanOrEqual(PORTRAIT.width * 0.75);
  });

  it('is drawn again narrower once the view narrows', () => {
    const { bubble, widths } = createWideBubble();
    bubble.fitView(DESKTOP.width, DESKTOP.height, FIELD_OF_VIEW);
    bubble.say(NANCY, HEAD);
    bubble.fitView(PORTRAIT.width, PORTRAIT.height, FIELD_OF_VIEW);
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeLessThan(widths[0] ?? NaN);
    expect(bubble.describe()?.line).toBe(NANCY_WELCOME);
    bubble.fitView(PORTRAIT.width, PORTRAIT.height, FIELD_OF_VIEW);
    expect(widths).toHaveLength(2);
  });

  it('stands centred above the head of a villager in mid view', () => {
    for (const view of [PORTRAIT, DESKTOP]) {
      const { speech, foot } = showAt(view, view.width / 2, view.height / 2);
      const screen: SpeechScreen | null | undefined = speech?.screen;
      expectWithin(screen, view);
      expect(screen?.tipX).toBeCloseTo(foot[0]);
      expect(screen?.tipY).toBeCloseTo(foot[1]);
      expect(((screen?.left ?? NaN) + (screen?.right ?? NaN)) / 2)
        .toBeCloseTo(foot[0]);
    }
  });

  it('stays on the screen by the edges, pointing at the villager', () => {
    for (const view of [PORTRAIT, DESKTOP]) {
      for (const [x, y] of [
        [40, view.height / 2],
        [view.width - 40, view.height / 2],
        [view.width / 2, 30],
        [40, 30],
        [view.width - 40, view.height - 5],
      ] as const) {
        const { speech, foot } = showAt(view, x, y);
        expectWithin(speech?.screen, view);
        expect(speech?.screen?.tipX).toBeCloseTo(foot[0]);
      }
    }
  });

  it('stays at the edge of the screen for a villager beyond it', () => {
    for (const x of [-200, PORTRAIT.width + 200]) {
      const { speech, foot } = showAt(PORTRAIT, x, 400);
      const screen: SpeechScreen | null | undefined = speech?.screen;
      expectWithin(screen, PORTRAIT);
      expect(Math.abs((screen?.tipX ?? NaN) - foot[0])).toBeLessThan(250);
    }
  });

  it('is not placed for a villager behind the camera', () => {
    const { bubble } = createWideBubble();
    const camera: PerspectiveCamera = createCamera(PORTRAIT);
    bubble.fitView(PORTRAIT.width, PORTRAIT.height, FIELD_OF_VIEW);
    bubble.say(NANCY, new Vector3(0, 8, 30));
    bubble.place(camera);
    expect(bubble.describe()?.screen).toBeNull();
  });

  it('moves smoothly as the villager walks out of the view', () => {
    let last: SpeechScreen | null | undefined;
    for (let x = 100; x >= -100; x--) {
      const screen: SpeechScreen | null | undefined = showAt(PORTRAIT, x, 400)
        .speech?.screen;
      expectWithin(screen, PORTRAIT);
      if (last != null && screen != null) {
        expect(Math.abs(screen.left - last.left)).toBeLessThan(1.5);
        expect(Math.abs(screen.tipX - last.tipX)).toBeLessThan(1.5);
      }
      last = screen;
    }
  });
});

describe('findFigureTop', () => {
  it('finds the top of the model of a player where it stands', () => {
    const root = new Object3D();
    const body = new Mesh(new BoxGeometry(0.6, 1.7, 0.4));
    body.position.y = 0.85;
    root.add(body);
    root.position.set(3, 0, -2);
    const top: Vector3 = findFigureTop(root);
    expect(top.x).toBe(3);
    expect(top.y).toBeCloseTo(1.7);
    expect(top.z).toBe(-2);
  });

  it('takes a usual height for a model without a height', () => {
    const root = new Object3D();
    root.position.set(3, 0, -2);
    expect(findFigureTop(root).toArray()).toEqual([3, 1.8, -2]);
  });
});

describe('SpeechBubble with players who speak', () => {
  /** The top of the head of a player. */
  const PLAYER_HEAD = new Vector3(2, 1.7, 3);
  /** The top of the head of another player. */
  const OTHER_HEAD = new Vector3(-4, 1.7, 1);

  /**
   * Lists what the bubbles of the players say.
   *
   * @param {SpeechBubble} bubble - The bubbles.
   * @returns {[number, string][]} The player and the line of each.
   */
  const listLines = (bubble: SpeechBubble): [number, string][] =>
    bubble
      .describeSaid()
      .map(({ player, line }: SaidView): [number, string] => [player, line]);

  it('shows what a player says above its head, under no name', () => {
    const { parent, bubble, painted } = createBubble();
    bubble.sayAs(7, 'Hello there!', PLAYER_HEAD);
    expect(parent.children).toHaveLength(1);
    const y: number | undefined = parent.children[0]?.position.y;
    expect(y).toBeGreaterThan(PLAYER_HEAD.y);
    expect(bubble.describeSaid()).toEqual([
      {
        player: 7,
        line: 'Hello there!',
        x: PLAYER_HEAD.x,
        y,
        z: PLAYER_HEAD.z,
        isShown: true,
        screen: null,
      },
    ]);
    expect(painted).toEqual([
      { name: '', line: 'Hello there!', language: 'en' },
    ]);
  });

  it('shows a line as it was typed, in whatever language', async () => {
    const translator: Translator = await createTranslator('ja');
    const { bubble, painted } = createBubble(translator);
    bubble.sayAs(7, '<b>大家好</b> & hello', PLAYER_HEAD);
    expect(listLines(bubble)).toEqual([[7, '<b>大家好</b> & hello']]);
    await translator.choose('zh-TW');
    bubble.relabel();
    expect(listLines(bubble)).toEqual([[7, '<b>大家好</b> & hello']]);
    expect(painted.at(-1)).toEqual({
      name: '',
      line: '<b>大家好</b> & hello',
      language: 'zh-TW',
    });
  });

  it('replaces the line of a player with its next one', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.sayAs(7, 'Two.', PLAYER_HEAD);
    expect(listLines(bubble)).toEqual([[7, 'Two.']]);
    expect(parent.children).toHaveLength(1);
  });

  it('shows the lines of different players at the same time', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.sayAs(8, 'Two.', OTHER_HEAD);
    expect(listLines(bubble)).toEqual([
      [7, 'One.'],
      [8, 'Two.'],
    ]);
    expect(bubble.listSpeakers()).toEqual([7, 8]);
    expect(parent.children).toHaveLength(2);
  });

  it('draws a later bubble over the earlier ones', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.sayAs(8, 'Two.', PLAYER_HEAD);
    bubble.sayAs(7, 'Three.', PLAYER_HEAD);
    const [second, third] = parent.children;
    expect(second?.renderOrder).toBeLessThan(third?.renderOrder ?? NaN);
  });

  it('leaves the bubble of a villager as it is, and is left by it', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    bubble.sayAs(7, 'Hello, Nancy!', PLAYER_HEAD);
    expect(bubble.describe()?.line).toBe(NANCY_WELCOME);
    bubble.say(NANCY, HEAD);
    expect(listLines(bubble)).toEqual([[7, 'Hello, Nancy!']]);
    expect(parent.children).toHaveLength(2);
    bubble.hushVillagers();
    expect(bubble.describe()).toBeNull();
    expect(listLines(bubble)).toEqual([[7, 'Hello, Nancy!']]);
  });

  it('lasts as long as the bubble of a villager with the same line', () => {
    const { parent, bubble } = createBubble();
    const duration: number = measureSpeechDuration(NANCY_WELCOME);
    bubble.sayAs(7, NANCY_WELCOME, PLAYER_HEAD);
    bubble.sayAs(8, 'Hi.', OTHER_HEAD);
    bubble.update(measureSpeechDuration('Hi.') + 0.1);
    expect(bubble.listSpeakers()).toEqual([7]);
    bubble.update(duration - measureSpeechDuration('Hi.') - 0.2);
    expect(bubble.listSpeakers()).toEqual([7]);
    bubble.update(0.2);
    expect(bubble.listSpeakers()).toEqual([]);
    expect(parent.children).toEqual([]);
  });

  it('follows its player as it goes about', () => {
    const { bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.sayAs(8, 'Two.', OTHER_HEAD);
    bubble.followPlayer(7, new Vector3(5, 1.7, 6));
    const [first, second] = bubble.describeSaid();
    expect([first?.x, first?.z]).toEqual([5, 6]);
    expect(first?.y).toBeGreaterThan(1.7);
    expect([second?.x, second?.z]).toEqual([OTHER_HEAD.x, OTHER_HEAD.z]);
  });

  it('is not seen while its player is off the screen, and again after', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.followPlayer(7, null);
    expect(bubble.describeSaid()[0]?.isShown).toBe(false);
    expect(parent.children[0]?.visible).toBe(false);
    bubble.followPlayer(7, PLAYER_HEAD);
    expect(bubble.describeSaid()[0]?.isShown).toBe(true);
    expect(parent.children[0]?.visible).toBe(true);
  });

  it('goes on ageing while it is not seen', () => {
    const { bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.followPlayer(7, null);
    bubble.update(measureSpeechDuration('One.') + 0.1);
    expect(bubble.listSpeakers()).toEqual([]);
  });

  it('takes the bubble of a player away, and only that', () => {
    const { bubble } = createBubble();
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.sayAs(8, 'Two.', OTHER_HEAD);
    bubble.hushPlayer(7);
    expect(bubble.listSpeakers()).toEqual([8]);
    bubble.followPlayer(7, PLAYER_HEAD);
    expect(bubble.listSpeakers()).toEqual([8]);
  });

  it('takes every bubble away when cleared', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    bubble.sayAs(7, 'One.', PLAYER_HEAD);
    bubble.sayAs(8, 'Two.', OTHER_HEAD);
    bubble.clear();
    expect(bubble.describe()).toBeNull();
    expect(bubble.describeSaid()).toEqual([]);
    expect(parent.children).toEqual([]);
  });

  it('keeps each bubble within the view by the edge of the screen', () => {
    const view = { width: 1280, height: 800 };
    const bubble = new SpeechBubble(new Object3D(), new Translator(), () => {
      const sprite = new Sprite();
      sprite.scale.set(0.3, 0.15, 1);
      return sprite;
    });
    const aspect: number = view.width / view.height;
    const camera = new PerspectiveCamera(40, aspect, 0.5, 600);
    camera.position.set(0, 8, 14);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const findPoint = (x: number, y: number): Vector3 => {
      const direction: Vector3 = new Vector3(
        (x / view.width) * 2 - 1,
        1 - (y / view.height) * 2,
        0.5,
      )
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      return camera.position.clone().addScaledVector(direction, 10);
    };
    bubble.fitView(view.width, view.height, 40);
    bubble.sayAs(7, 'One.', findPoint(5, 400));
    bubble.sayAs(8, 'Two.', findPoint(view.width - 5, 10));
    bubble.place(camera);
    const [left, right] = bubble.describeSaid();
    // Each bubble is shifted inwards from above the head of its player.
    expect(left?.screen?.left).toBeGreaterThan(0);
    expect(left?.screen?.footX).toBeLessThan(left?.screen?.left ?? NaN);
    expect(right?.screen?.right).toBeLessThan(view.width);
    expect(right?.screen?.top).toBeGreaterThan(0);
    expect(right?.screen?.footX).toBeGreaterThan(right?.screen?.right ?? NaN);
  });
});
