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
  BufferGeometry,
  Group,
  Material,
  Object3D,
  PerspectiveCamera,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Camera } from 'three';
import { describe, expect, it } from 'vitest';

import {
  createPhrasedMessage,
  createSaidMessage,
  findPlacement,
  findTobyPose,
  getVillager,
} from '@clovervale/shared';
import type {
  PhraseCode,
  Placement,
  TobyPose,
  Villager,
} from '@clovervale/shared';

import type { SpeechScreen } from '../src/bubble-sprite.ts';
import { readSaying } from '../src/chat-channels.ts';
import type { PlayerSaying } from '../src/chat-channels.ts';
import { SpeechBubble } from '../src/speech-bubble.ts';
import type { SaidView } from '../src/speech-bubble.ts';
import type { SpeechWords } from '../src/speech-lines.ts';
import { measureSpeechDuration } from '../src/speech-text.ts';
import { Translator } from '../src/translator.ts';

/** Nancy the villager. */
const NANCY: Villager = getVillager('nancy');

/** Martha the village chief, who has two lines. */
const MARTHA: Villager = getVillager('martha');

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

/** Toby, the child who goes about by the gate, who has three lines. */
const TOBY: Villager = getVillager('toby');

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

/** Where Nancy stands. */
const SPOT: Placement = findPlacement('nancy');

/** The top of the head of Nancy. */
const HEAD = new Vector3(SPOT.x, 1.6, SPOT.z);

/**
 * Tells what a player says by a line it typed, as the page reads it from
 * the server.
 *
 * @param {number} player - The identifier of the player.
 * @param {string} text - The line it typed.
 * @returns {PlayerSaying} What the player says.
 */
function createTyped(player: number, text: string): PlayerSaying {
  return readSaying(createSaidMessage(player, text));
}

/**
 * Tells what a player says by a phrase it picked, as the page reads it
 * from the server.
 *
 * @param {number} player - The identifier of the player.
 * @param {PhraseCode} code - The code of the phrase.
 * @returns {PlayerSaying} What the player says.
 */
function createPhrased(player: number, code: PhraseCode): PlayerSaying {
  return readSaying(createPhrasedMessage(player, code));
}

/**
 * Has the bubbles in a parent drawn, as far as each bubble takes part in
 * it itself.
 *
 * @param {Object3D} parent - The parent.
 * @param {Camera} camera - The camera they are drawn for.
 */
function drawBubbles(parent: Object3D, camera: Camera): void {
  const renderer = Object.create(WebGLRenderer.prototype) as WebGLRenderer;
  for (const sprite of parent.children) {
    sprite.onBeforeRender(
      renderer,
      new Scene(),
      camera,
      new BufferGeometry(),
      new Material(),
      new Group(),
    );
  }
}

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
 * Makes a translator of the text into a language.
 *
 * @param {'zh-TW' | 'zh-CN' | 'ja' | 'es'} code - The language.
 * @returns {Promise<Translator>} The translator.
 */
async function createTranslator(
  code: 'zh-TW' | 'zh-CN' | 'ja' | 'es',
): Promise<Translator> {
  const translator = new Translator();
  await translator.choose(code);
  return translator;
}

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

describe('SpeechBubble with Toby', () => {
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

/**
 * Where a bubble and its tail are drawn in a view, in CSS pixels from the
 * top left corner of the view.
 */
interface DrawnBubble {
  /** The left edge of the bubble. */
  readonly left: number;
  /** The top edge of the bubble. */
  readonly top: number;
  /** The right edge of the bubble. */
  readonly right: number;
  /** The bottom edge of the bubble, with the room for its tail. */
  readonly bottom: number;
  /** Where the tip of its tail is across the view. */
  readonly tipX: number;
  /** Where the tip of its tail is down the view. */
  readonly tipY: number;
  /** Where the one who speaks is across the view. */
  readonly footX: number;
  /** Where the one who speaks is down the view. */
  readonly footY: number;
}

/**
 * Makes a blank bubble as the page draws one: as large on the screen
 * however far away it is, its foot at its position, with a tail as a
 * sprite of its own added to it, the tip of the tail at its position.
 *
 * @param {number} width - The width of the bubble, in metres at one metre.
 * @param {number} height - The height of the bubble, in metres at one
 *   metre.
 * @returns {Sprite} The bubble.
 */
function makeBlankBubble(width: number, height: number): Sprite {
  const sprite = new Sprite(new SpriteMaterial({ sizeAttenuation: false }));
  sprite.center.set(0.5, 0);
  sprite.scale.set(width, height, 1);
  const tail = new Sprite(new SpriteMaterial({ sizeAttenuation: false }));
  tail.center.set(0.5, 0);
  tail.scale.set(0.1, 0.25, 1);
  sprite.add(tail);
  return sprite;
}

/**
 * Finds where a point of a sprite is drawn in a view, as three.js draws a
 * sprite that is as large on the screen however far away it is: about
 * where its position is seen, by its scale and its centre.
 *
 * @param {Object3D} sprite - The sprite.
 * @param {PerspectiveCamera} camera - The camera, its matrices up to date.
 * @param {ViewArea} view - The view.
 * @param {number} across - How far across the sprite the point is, from 0
 *   at its left edge to 1 at its right edge.
 * @param {number} up - How far up the sprite the point is, from 0 at its
 *   bottom edge to 1 at its top edge.
 * @returns {[number, number]} The place across and down the view, in CSS
 *   pixels.
 */
function findDrawnPoint(
  sprite: Object3D,
  camera: PerspectiveCamera,
  view: ViewArea,
  across: number,
  up: number,
): [number, number] {
  if (!(sprite instanceof Sprite)) {
    throw new Error('A bubble is drawn as a sprite.');
  }
  sprite.updateWorldMatrix(true, false);
  const point: Vector3 = new Vector3()
    .setFromMatrixPosition(sprite.matrixWorld)
    .applyMatrix4(camera.matrixWorldInverse);
  const scale: Vector3 = new Vector3().setFromMatrixScale(sprite.matrixWorld);
  const depth: number = -point.z;
  point.x += (across - sprite.center.x) * scale.x * depth;
  point.y += (up - sprite.center.y) * scale.y * depth;
  point.applyMatrix4(camera.projectionMatrix);
  return [((point.x + 1) / 2) * view.width, ((1 - point.y) / 2) * view.height];
}

/**
 * Finds where a bubble and its tail are drawn in a view.
 *
 * @param {Object3D | undefined} sprite - The bubble, with its tail.
 * @param {PerspectiveCamera} camera - The camera, its matrices up to date.
 * @param {ViewArea} view - The view.
 * @returns {DrawnBubble} Where they are drawn.
 */
function measureDrawn(
  sprite: Object3D | undefined,
  camera: PerspectiveCamera,
  view: ViewArea,
): DrawnBubble {
  const [tail] = sprite?.children ?? [];
  if (sprite === undefined || tail === undefined) {
    throw new Error('There is no bubble with a tail.');
  }
  const [left, bottom] = findDrawnPoint(sprite, camera, view, 0, 0);
  const [right, top] = findDrawnPoint(sprite, camera, view, 1, 1);
  const [tipX, tipY] = findDrawnPoint(tail, camera, view, 0.5, 0);
  const foot: Vector3 = sprite.getWorldPosition(new Vector3()).project(camera);
  return {
    left,
    top,
    right,
    bottom,
    tipX,
    tipY,
    footX: ((foot.x + 1) / 2) * view.width,
    footY: ((1 - foot.y) / 2) * view.height,
  };
}

/**
 * Makes a camera that looks across the village for a view.
 *
 * @param {ViewArea} view - The view.
 * @param {number} fieldOfView - The field of view of the camera, from top
 *   to bottom, in degrees.
 * @returns {PerspectiveCamera} The camera.
 */
function createCamera(view: ViewArea, fieldOfView: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    fieldOfView,
    view.width / view.height,
    0.5,
    600,
  );
  camera.position.set(0, 8, 14);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  return camera;
}

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
function findPointAt(
  camera: PerspectiveCamera,
  view: ViewArea,
  x: number,
  y: number,
): Vector3 {
  const direction: Vector3 = new Vector3(
    (x / view.width) * 2 - 1,
    1 - (y / view.height) * 2,
    0.5,
  )
    .unproject(camera)
    .sub(camera.position)
    .normalize();
  return camera.position.clone().addScaledVector(direction, 10);
}

/**
 * Checks that the page tells where a bubble is on the screen as it is
 * drawn there.
 *
 * @param {SpeechScreen | null | undefined} screen - Where the page tells
 *   the bubble is.
 * @param {DrawnBubble} drawn - Where the bubble and its tail are drawn.
 */
function expectToldAsDrawn(
  screen: SpeechScreen | null | undefined,
  drawn: DrawnBubble,
): void {
  expect(screen?.left).toBeCloseTo(drawn.left, 6);
  expect(screen?.top).toBeCloseTo(drawn.top, 6);
  expect(screen?.right).toBeCloseTo(drawn.right, 6);
  expect(screen?.tipX).toBeCloseTo(drawn.tipX, 6);
  expect(screen?.tipY).toBeCloseTo(drawn.tipY, 6);
  expect(screen?.footX).toBeCloseTo(drawn.footX, 6);
  expect(screen?.footY).toBeCloseTo(drawn.footY, 6);
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
   * @returns {{ parent: Object3D, bubble: SpeechBubble, widths: number[] }}
   *   The parent, the bubble, and how wide each bubble drawn may be, in
   *   order.
   */
  const createWideBubble = (): {
    parent: Object3D;
    bubble: SpeechBubble;
    widths: number[];
  } => {
    const parent = new Object3D();
    const widths: number[] = [];
    const bubble = new SpeechBubble(
      parent,
      new Translator(),
      (_words: SpeechWords, widest: number) => {
        widths.push(widest);
        return makeBlankBubble(widest * 0.001, PAINTED_HEIGHT);
      },
    );
    return { parent, bubble, widths };
  };

  /**
   * Shows Nancy saying her line with her head at a place in a view, and
   * has the bubble drawn.
   *
   * @param {ViewArea} view - The view.
   * @param {number} x - The place of her head across the view.
   * @param {number} y - The place of her head down the view.
   * @returns {DrawnBubble} Where the bubble and its tail are drawn, which
   *   is where the page tells the bubble is.
   */
  const showAt = (view: ViewArea, x: number, y: number): DrawnBubble => {
    const { parent, bubble } = createWideBubble();
    const camera: PerspectiveCamera = createCamera(view, FIELD_OF_VIEW);
    bubble.fitView(view.width, view.height, FIELD_OF_VIEW);
    bubble.say(NANCY, findPointAt(camera, view, x, y));
    drawBubbles(parent, camera);
    const drawn: DrawnBubble = measureDrawn(parent.children[0], camera, view);
    expectToldAsDrawn(bubble.describe()?.screen, drawn);
    return drawn;
  };

  /**
   * Checks that a bubble is drawn wholly within a view, its tail hanging
   * from its foot.
   *
   * @param {DrawnBubble} drawn - Where the bubble and its tail are drawn.
   * @param {ViewArea} view - The view.
   */
  const expectWithin = (drawn: DrawnBubble, view: ViewArea): void => {
    expect(drawn.left).toBeGreaterThan(0);
    expect(drawn.top).toBeGreaterThan(0);
    expect(drawn.right).toBeLessThan(view.width);
    expect(drawn.bottom).toBeLessThan(view.height);
    expect(drawn.top).toBeLessThan(drawn.bottom);
    expect(drawn.tipY).toBeCloseTo(drawn.bottom, 6);
    expect(drawn.tipX).toBeGreaterThan(drawn.left);
    expect(drawn.tipX).toBeLessThan(drawn.right);
  };

  it('is no wider than most of the view of a phone held upright', () => {
    const { bubble, widths } = createWideBubble();
    bubble.say(NANCY, HEAD);
    const widest: number | undefined = widths[0];
    bubble.fitView(DESKTOP.width, DESKTOP.height, FIELD_OF_VIEW);
    bubble.say(NANCY, HEAD);
    expect(widths[1]).toBe(widest);
    const drawn: DrawnBubble = showAt(PORTRAIT, PORTRAIT.width / 2, 400);
    const width: number = drawn.right - drawn.left;
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
      const drawn: DrawnBubble = showAt(view, view.width / 2, view.height / 2);
      expectWithin(drawn, view);
      expect(drawn.tipX).toBeCloseTo(drawn.footX);
      expect(drawn.tipY).toBeCloseTo(drawn.footY);
      expect((drawn.left + drawn.right) / 2).toBeCloseTo(drawn.footX);
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
        const drawn: DrawnBubble = showAt(view, x, y);
        expectWithin(drawn, view);
        expect(drawn.tipX).toBeCloseTo(drawn.footX);
      }
    }
  });

  it('stays at the edge of the screen for a villager beyond it', () => {
    for (const x of [-200, PORTRAIT.width + 200]) {
      const drawn: DrawnBubble = showAt(PORTRAIT, x, 400);
      expectWithin(drawn, PORTRAIT);
      expect(Math.abs(drawn.tipX - drawn.footX)).toBeLessThan(250);
    }
  });

  it('is not placed for a villager behind the camera', () => {
    const { parent, bubble } = createWideBubble();
    const camera: PerspectiveCamera = createCamera(PORTRAIT, FIELD_OF_VIEW);
    bubble.fitView(PORTRAIT.width, PORTRAIT.height, FIELD_OF_VIEW);
    bubble.say(NANCY, new Vector3(0, 8, 30));
    drawBubbles(parent, camera);
    expect(bubble.describe()?.screen).toBeNull();
  });

  it('moves smoothly as the villager walks out of the view', () => {
    let last: DrawnBubble | null = null;
    for (let x = 100; x >= -100; x--) {
      const drawn: DrawnBubble = showAt(PORTRAIT, x, 400);
      expectWithin(drawn, PORTRAIT);
      if (last !== null) {
        expect(Math.abs(drawn.left - last.left)).toBeLessThan(1.5);
        expect(Math.abs(drawn.tipX - last.tipX)).toBeLessThan(1.5);
      }
      last = drawn;
    }
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
    bubble.sayAs(createTyped(7, 'Hello there!'), PLAYER_HEAD);
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
    bubble.sayAs(createTyped(7, '<b>大家好</b> & hello'), PLAYER_HEAD);
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

  it('shows a phrase a player says in the language of the page', async () => {
    const translator: Translator = await createTranslator('zh-TW');
    const { parent, bubble, painted } = createBubble(translator);
    bubble.sayAs(createPhrased(7, 'askInn'), PLAYER_HEAD);
    expect(parent.children).toHaveLength(1);
    expect(bubble.describeSaid()).toEqual([
      {
        player: 7,
        line: '這附近有旅店可以休息嗎？',
        x: PLAYER_HEAD.x,
        y: parent.children[0]?.position.y,
        z: PLAYER_HEAD.z,
        isShown: true,
        screen: null,
      },
    ]);
    expect(painted).toEqual([
      { name: '', line: '這附近有旅店可以休息嗎？', language: 'zh-TW' },
    ]);
  });

  it('shows a phrase in another language once told to', async () => {
    const translator = new Translator();
    const { parent, bubble, painted } = createBubble(translator);
    bubble.sayAs(createPhrased(7, 'swordPrice'), PLAYER_HEAD);
    expect(listLines(bubble)).toEqual([[7, 'How much for this sword?']]);
    await translator.choose('zh-TW');
    bubble.relabel();
    expect(parent.children).toHaveLength(1);
    expect(listLines(bubble)).toEqual([[7, '這把劍怎麼賣？']]);
    expect(painted.at(-1)).toEqual({
      name: '',
      line: '這把劍怎麼賣？',
      language: 'zh-TW',
    });
  });

  it('shows a phrase and a line typed in the one bubble of a player', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createPhrased(7, 'swordPrice'), PLAYER_HEAD);
    expect(listLines(bubble)).toEqual([[7, 'How much for this sword?']]);
    bubble.sayAs(createTyped(7, 'Two.'), PLAYER_HEAD);
    expect(listLines(bubble)).toEqual([[7, 'Two.']]);
    expect(parent.children).toHaveLength(1);
  });

  it('replaces the line of a player with its next one', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(7, 'Two.'), PLAYER_HEAD);
    expect(listLines(bubble)).toEqual([[7, 'Two.']]);
    expect(parent.children).toHaveLength(1);
  });

  it('shows the lines of different players at the same time', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(8, 'Two.'), OTHER_HEAD);
    expect(listLines(bubble)).toEqual([
      [7, 'One.'],
      [8, 'Two.'],
    ]);
    expect(bubble.listSpeakers()).toEqual([7, 8]);
    expect(parent.children).toHaveLength(2);
  });

  it('draws a later bubble over the earlier ones', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(8, 'Two.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(7, 'Three.'), PLAYER_HEAD);
    const [second, third] = parent.children;
    expect(second?.renderOrder).toBeLessThan(third?.renderOrder ?? NaN);
  });

  it('leaves the bubble of a villager as it is, and is left by it', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    bubble.sayAs(createTyped(7, 'Hello, Nancy!'), PLAYER_HEAD);
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
    bubble.sayAs(createTyped(7, NANCY_WELCOME), PLAYER_HEAD);
    bubble.sayAs(createTyped(8, 'Hi.'), OTHER_HEAD);
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
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(8, 'Two.'), OTHER_HEAD);
    bubble.followPlayer(7, new Vector3(5, 1.7, 6));
    const [first, second] = bubble.describeSaid();
    expect([first?.x, first?.z]).toEqual([5, 6]);
    expect(first?.y).toBeGreaterThan(1.7);
    expect([second?.x, second?.z]).toEqual([OTHER_HEAD.x, OTHER_HEAD.z]);
  });

  it('is not seen while its player is off the screen, and again after', () => {
    const { parent, bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.followPlayer(7, null);
    expect(bubble.describeSaid()[0]?.isShown).toBe(false);
    expect(parent.children[0]?.visible).toBe(false);
    bubble.followPlayer(7, PLAYER_HEAD);
    expect(bubble.describeSaid()[0]?.isShown).toBe(true);
    expect(parent.children[0]?.visible).toBe(true);
  });

  it('goes on ageing while it is not seen', () => {
    const { bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.followPlayer(7, null);
    bubble.update(measureSpeechDuration('One.') + 0.1);
    expect(bubble.listSpeakers()).toEqual([]);
  });

  it('takes the bubble of a player away, and only that', () => {
    const { bubble } = createBubble();
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(8, 'Two.'), OTHER_HEAD);
    bubble.hushPlayer(7);
    expect(bubble.listSpeakers()).toEqual([8]);
    bubble.followPlayer(7, PLAYER_HEAD);
    expect(bubble.listSpeakers()).toEqual([8]);
  });

  it('takes every bubble away when cleared', () => {
    const { parent, bubble } = createBubble();
    bubble.say(NANCY, HEAD);
    bubble.sayAs(createTyped(7, 'One.'), PLAYER_HEAD);
    bubble.sayAs(createTyped(8, 'Two.'), OTHER_HEAD);
    bubble.clear();
    expect(bubble.describe()).toBeNull();
    expect(bubble.describeSaid()).toEqual([]);
    expect(parent.children).toEqual([]);
  });

  it('keeps each bubble within the view by the edge of the screen', () => {
    const view: ViewArea = { width: 1280, height: 800 };
    const parent = new Object3D();
    const bubble = new SpeechBubble(parent, new Translator(), () =>
      makeBlankBubble(0.3, 0.15),
    );
    const camera: PerspectiveCamera = createCamera(view, 40);
    bubble.fitView(view.width, view.height, 40);
    bubble.sayAs(createTyped(7, 'One.'), findPointAt(camera, view, 5, 400));
    bubble.sayAs(
      createTyped(8, 'Two.'),
      findPointAt(camera, view, view.width - 5, 10),
    );
    drawBubbles(parent, camera);
    const [left, right] = parent.children.map((sprite: Object3D) =>
      measureDrawn(sprite, camera, view),
    );
    if (left === undefined || right === undefined) {
      throw new Error('There are no two bubbles.');
    }
    const told: SaidView[] = bubble.describeSaid();
    expectToldAsDrawn(told[0]?.screen, left);
    expectToldAsDrawn(told[1]?.screen, right);
    // Each bubble is shifted inwards from above the head of its player.
    expect(left.left).toBeGreaterThan(0);
    expect(left.footX).toBeLessThan(left.left);
    expect(right.right).toBeLessThan(view.width);
    expect(right.top).toBeGreaterThan(0);
    expect(right.footX).toBeGreaterThan(right.right);
  });
});
