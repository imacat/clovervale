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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/21
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/toby-finds Tests for what the page makes of the
 *   four-leaf clovers Toby takes.
 */

import { describe, expect, it } from 'vitest';

import { TOBY_LOOP_STEPS, findTobyGrab } from '@clovervale/shared';
import type { TobyGrab, WorldItems } from '@clovervale/shared';

import { findShownItems, hasTobyFound } from '../src/toby-finds.ts';
import type { WorldNews } from '../src/toby-finds.ts';

/** A grab of Toby's, some loops in. */
const GRAB: TobyGrab = findTobyGrab(5 * TOBY_LOOP_STEPS);

/** The grab after it, at the other end of his run. */
const NEXT: TobyGrab = findTobyGrab(GRAB.step + TOBY_LOOP_STEPS / 2);

/** Every patch with its clover. */
const FULL: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Makes up what the page has heard from the server.
 *
 * @param {number} step - The step of the snapshot.
 * @param {readonly number[]} clovers - The patches that have their clover.
 * @param {number | null} tobyFind - The latest step he took a clover at.
 * @returns {WorldNews} What the page heard.
 */
function hear(
  step: number,
  clovers: readonly number[],
  tobyFind: number | null,
): WorldNews {
  return { step, items: { clovers, items: [], looted: [], tobyFind } };
}

/**
 * Lists the patches but one.
 *
 * @param {number} patch - The patch to leave out.
 * @returns {number[]} The other patches.
 */
function without(patch: number): number[] {
  return FULL.filter((other: number) => other !== patch);
}

describe('hasTobyFound', () => {
  it('tells what the server told of a grab it has taken', () => {
    expect(
      hasTobyFound(GRAB, hear(GRAB.step, without(GRAB.patch), GRAB.step)),
    ).toBe(true);
    expect(
      hasTobyFound(GRAB, hear(GRAB.step + 5, without(GRAB.patch), null)),
    ).toBe(false);
    // A player took the clover first, and he took one earlier on.
    expect(
      hasTobyFound(
        GRAB,
        hear(GRAB.step + 5, without(GRAB.patch), GRAB.step - 100),
      ),
    ).toBe(false);
  });

  it('foresees a grab to come by whether the patch has its clover', () => {
    expect(hasTobyFound(GRAB, hear(GRAB.step - 6, FULL, null))).toBe(true);
    expect(
      hasTobyFound(GRAB, hear(GRAB.step - 6, without(GRAB.patch), null)),
    ).toBe(false);
  });

  it('finds nothing before the page has heard anything', () => {
    expect(hasTobyFound(GRAB, null)).toBe(false);
  });
});

describe('findShownItems', () => {
  it('takes the clover from the patch as his hand grabs, ahead of the news', () => {
    const news: WorldNews = hear(GRAB.step - 6, FULL, null);
    expect(findShownItems(news, GRAB.step - 0.5).clovers).toEqual(FULL);
    expect(findShownItems(news, GRAB.step).clovers).toEqual(
      without(GRAB.patch),
    );
    expect(findShownItems(news, GRAB.step + 3).tobyFind).toBe(null);
  });

  it('leaves the clover to the news once it tells of the grab', () => {
    const taken: WorldNews = hear(
      GRAB.step + 2,
      without(GRAB.patch),
      GRAB.step,
    );
    expect(findShownItems(taken, GRAB.step + 4).clovers).toEqual(
      without(GRAB.patch),
    );
    // Someone else took it, not he.
    const gone: WorldNews = hear(GRAB.step + 2, without(GRAB.patch), null);
    expect(findShownItems(gone, GRAB.step + 4).clovers).toEqual(
      without(GRAB.patch),
    );
  });

  it('shows the clover in the patch until his hand grabs, behind the news', () => {
    const news: WorldNews = hear(
      NEXT.step + 3,
      without(NEXT.patch),
      NEXT.step,
    );
    expect(findShownItems(news, NEXT.step - 2).clovers).toEqual(FULL);
    expect(findShownItems(news, NEXT.step).clovers).toEqual(
      without(NEXT.patch),
    );
    // A patch he did not take from stays as the news tells.
    const other: WorldNews = hear(NEXT.step + 3, without(NEXT.patch), null);
    expect(findShownItems(other, NEXT.step - 2).clovers).toEqual(
      without(NEXT.patch),
    );
  });

  it('keeps what else there is to pick', () => {
    const world: WorldItems = {
      clovers: FULL,
      items: [{ id: 3, kind: 'sword', x: 1, z: 2 }],
      looted: [],
      tobyFind: null,
    };
    expect(
      findShownItems({ step: GRAB.step - 6, items: world }, GRAB.step),
    ).toEqual({ ...world, clovers: without(GRAB.patch) });
  });
});
