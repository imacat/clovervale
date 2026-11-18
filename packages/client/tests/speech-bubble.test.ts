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
  SpeechBubble,
  findHeadTop,
  measureSpeechDuration,
  wrapText,
} from '../src/speech-bubble.ts';

/**
 * Finds Nancy the villager.
 *
 * @returns {Villager} Nancy.
 * @throws {Error} If there is no Nancy among the villagers.
 */
function findNancy(): Villager {
  const found: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.name === 'Nancy',
  );
  if (found === undefined) {
    throw new Error('Nancy is not among the villagers.');
  }
  return found;
}

/** Nancy the villager. */
const NANCY: Villager = findNancy();

/** Where Nancy stands. */
const SPOT: Placement = findPlacement(NANCY.file);

/** The top of the head of Nancy. */
const HEAD = new Vector3(SPOT.x, 1.6, SPOT.z);

/**
 * Makes a bubble that draws nothing, in a parent of its own.
 *
 * @returns {{ parent: Object3D, bubble: SpeechBubble }} The parent and the
 *   bubble.
 */
function createBubble(): { parent: Object3D; bubble: SpeechBubble } {
  const parent = new Object3D();
  const bubble = new SpeechBubble(parent, () => new Sprite());
  return { parent, bubble };
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
});

describe('measureSpeechDuration', () => {
  it('leaves time to read a line at three words a second', () => {
    const words: number = NANCY.line.split(' ').length;
    expect(measureSpeechDuration(NANCY.line)).toBeGreaterThanOrEqual(
      words / 3,
    );
  });

  it('shows a longer line for longer', () => {
    expect(measureSpeechDuration('Hello there, and welcome.')).toBeGreaterThan(
      measureSpeechDuration('Hello.'),
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
      line: NANCY.line,
      x: HEAD.x,
      y,
      z: HEAD.z,
    });
  });

  it('shows it for as long as it takes to read, and then no more', () => {
    const { parent, bubble } = createBubble();
    const duration: number = measureSpeechDuration(NANCY.line);
    bubble.say(NANCY, HEAD);
    bubble.update(duration - 0.1);
    expect(bubble.describe()?.name).toBe('Nancy');
    bubble.update(0.2);
    expect(bubble.describe()).toBeNull();
    expect(parent.children).toEqual([]);
  });

  it('starts again when the villager is talked to again', () => {
    const { parent, bubble } = createBubble();
    const duration: number = measureSpeechDuration(NANCY.line);
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
