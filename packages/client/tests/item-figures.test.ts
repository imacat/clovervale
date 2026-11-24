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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/item-figures Tests for showing the clovers of the
 *   patches and the items on the ground.
 */

import { Scene } from 'three';
import { describe, expect, it } from 'vitest';

import type { GroundItem, WorldItems } from '@clovervale/shared';

import type { FigureFrame } from '../src/figure-set.ts';
import { ItemFigures } from '../src/item-figures.ts';

/** An item on the ground. */
const ITEM: GroundItem = { id: 3, kind: 'clover', x: 2.5, z: -9.25 };

/**
 * Makes a frame that shows what there is to pick, or nothing.
 *
 * @param {WorldItems | null} items - What there is to pick, or nothing.
 * @returns {FigureFrame} The frame.
 */
function makeItemFrame(items: WorldItems | null): FigureFrame {
  return {
    map: 'village',
    ownId: null,
    view: { players: [], monsters: [], lag: 0, time: null },
    latestMonsters: null,
    shownStep: null,
    items,
    ownMotion: null,
    ownStep: 0,
    areMonstersPaused: false,
  };
}

describe('ItemFigures', () => {
  it('shows nothing before it is told of the world', () => {
    const figures = new ItemFigures(new Scene());
    expect(figures.describe()).toEqual({ clovers: [], items: [] });
  });

  it('shows the clovers of the patches that have them, and the items', () => {
    const figures = new ItemFigures(new Scene());
    figures.show(makeItemFrame({ clovers: [0, 6], items: [ITEM] }));
    expect(figures.describe()).toEqual({ clovers: [0, 6], items: [ITEM] });
  });

  it('shows no more of what is gone', () => {
    const figures = new ItemFigures(new Scene());
    const other: GroundItem = { ...ITEM, id: 4, x: -1 };
    figures.show(makeItemFrame({ clovers: [0, 6], items: [ITEM, other] }));
    figures.show(makeItemFrame({ clovers: [6], items: [other] }));
    expect(figures.describe()).toEqual({ clovers: [6], items: [other] });
    figures.show(makeItemFrame(null));
    expect(figures.describe()).toEqual({ clovers: [], items: [] });
  });

  it('shows an item where it lies now, once its number is that of another', () => {
    const figures = new ItemFigures(new Scene());
    const elsewhere: GroundItem = { ...ITEM, x: 18, z: 0.5 };
    figures.show(makeItemFrame({ clovers: [], items: [ITEM] }));
    figures.show(makeItemFrame({ clovers: [], items: [elsewhere] }));
    expect(figures.describe()).toEqual({ clovers: [], items: [elsewhere] });
  });

  it('takes what it shows out of the scene once it is gone', () => {
    const scene = new Scene();
    const figures = new ItemFigures(scene);
    const before: number = scene.children.length;
    figures.show(makeItemFrame({ clovers: [], items: [ITEM] }));
    expect(scene.children).toHaveLength(before + 1);
    figures.show(makeItemFrame({ clovers: [], items: [] }));
    expect(scene.children).toHaveLength(before);
  });
});
