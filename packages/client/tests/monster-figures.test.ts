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
 * @module client/tests/monster-figures Tests for showing the monsters.
 */

import { AnimationClip, NumberKeyframeTrack, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { MONSTER_HEALTH } from '@clovervale/shared';
import type { MonsterState } from '@clovervale/shared';

import { MonsterFigures } from '../src/monster-figures.ts';
import type { MonsterView } from '../src/monster-figures.ts';
import type { Figure } from '../src/player-figures.ts';

/** A monster to show. */
const MONSTER: MonsterState = {
  id: 1,
  x: 10,
  z: 8,
  yaw: -90,
  action: 'Idle',
  actionCount: 0,
  health: MONSTER_HEALTH,
  mode: 'idle',
};

/**
 * Creates a model of the monster, with the clips the monster has.
 *
 * @returns {Figure} The model.
 */
function createFigure(): Figure {
  const root = new Object3D();
  const jaw = new Object3D();
  jaw.name = 'jaw';
  root.add(jaw);
  const clips: AnimationClip[] = ['Idle', 'Walk', 'Attack', 'Die'].map(
    (name: string) =>
      new AnimationClip(name, -1, [
        new NumberKeyframeTrack('jaw.position[y]', [0, 0.6], [0, 1]),
      ]),
  );
  return { root, clips };
}

/**
 * Finds the only monster that is shown.
 *
 * @param {MonsterFigures} figures - The monsters that are shown.
 * @returns {MonsterView} The monster.
 * @throws {Error} If there is not exactly one.
 */
function findOnly(figures: MonsterFigures): MonsterView {
  const views: MonsterView[] = figures.describeMonsters();
  const [only] = views;
  if (only === undefined || views.length !== 1) {
    throw new Error(`${String(views.length)} monsters are shown.`);
  }
  return only;
}

describe('MonsterFigures', () => {
  it('shows a monster where it is told, as it is told', () => {
    const scene = new Object3D();
    const figures = new MonsterFigures(scene, createFigure);
    figures.showMonsters([MONSTER]);
    const view: MonsterView = findOnly(figures);
    expect(view).toMatchObject({ id: 1, x: 10, z: 8, clip: 'Idle' });
    expect(view.yaw).toBeCloseTo(-90);
    expect(view.health).toBe(1);
    expect(scene.children).toHaveLength(1);
  });

  it('plays the clip of a new action, and shows its health', () => {
    const scene = new Object3D();
    const figures = new MonsterFigures(scene, createFigure);
    figures.showMonsters([MONSTER]);
    figures.showMonsters([
      { ...MONSTER, action: 'Attack', actionCount: 1, health: 30 },
    ]);
    expect(findOnly(figures)).toMatchObject({ clip: 'Attack', health: 0.5 });
    figures.showMonsters([
      { ...MONSTER, action: 'Die', actionCount: 2, health: 0, mode: 'dead' },
    ]);
    expect(findOnly(figures)).toMatchObject({ clip: 'Die', health: 0 });
  });

  it('takes a monster away once it is gone', () => {
    const scene = new Object3D();
    const figures = new MonsterFigures(scene, createFigure);
    figures.showMonsters([MONSTER]);
    figures.showMonsters([]);
    expect(figures.describeMonsters()).toEqual([]);
    expect(scene.children).toEqual([]);
  });

  it('leaves out a monster while there is no model to show it with', () => {
    const scene = new Object3D();
    let figure: Figure | null = null;
    const figures = new MonsterFigures(scene, () => figure);
    figures.showMonsters([MONSTER]);
    expect(figures.describeMonsters()).toEqual([]);
    figure = createFigure();
    figures.showMonsters([MONSTER]);
    expect(findOnly(figures).clip).toBe('Idle');
  });
});
