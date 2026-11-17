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
 * @module client/tests/player-figures Tests for showing the players.
 */

import { AnimationClip, NumberKeyframeTrack, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { createMotion, createSnapshotMessage } from '@clovervale/shared';
import type { InputProgress, PlayerState } from '@clovervale/shared';

import { SnapshotTimeline } from '../src/interpolation.ts';
import { PlayerFigures } from '../src/player-figures.ts';
import type { Figure, FigureView } from '../src/player-figures.ts';

/** A player to put in snapshots. */
const PLAYER: PlayerState = {
  id: 5,
  appearance: 2,
  x: 1.5,
  z: -3,
  yaw: 90,
  action: 'Idle',
  actionCount: 0,
};

/** What the snapshots tell the page of its own player. */
const OWN: InputProgress = {
  sequence: 0,
  steps: 0,
  motion: createMotion(PLAYER, PLAYER.yaw),
};

/**
 * Creates a clip that raises the arm of a model.
 *
 * @param {string} name - The name of the clip.
 * @param {number[]} times - The times of the key frames, in seconds.
 * @param {number[]} heights - The height of the arm at each key frame.
 * @returns {AnimationClip} The clip.
 */
function createClip(
  name: string,
  times: number[],
  heights: number[],
): AnimationClip {
  const track = new NumberKeyframeTrack('arm.position[y]', times, heights);
  return new AnimationClip(name, -1, [track]);
}

/**
 * Creates a model with an arm, which is down when idling, goes up to 1 and
 * back when walking a one-second stride, and rises to 6 within 0.6 seconds
 * when slashing.
 *
 * @param {number} appearance - The number of the appearance of the model.
 * @returns {Figure} The model, named after its appearance.
 */
function createFigure(appearance: number): Figure {
  const root = new Object3D();
  root.name = `appearance ${String(appearance)}`;
  const arm = new Object3D();
  arm.name = 'arm';
  root.add(arm);
  const clips: AnimationClip[] = [
    createClip('Idle', [0, 1], [0, 0]),
    createClip('Walk', [0, 0.5, 1], [0, 1, 0]),
    createClip('Slash', [0, 0.6], [0, 6]),
  ];
  return { root, clips };
}

/**
 * Measures how high a player that is shown holds its arm.
 *
 * @param {Object3D} scene - What the players are shown in.
 * @param {number} index - The position of the player among those shown.
 * @returns {number} The height of the arm.
 */
function measureArm(scene: Object3D, index = 0): number {
  return scene.children[index]?.children[0]?.position.y ?? NaN;
}

/**
 * Finds the only player that is shown.
 *
 * @param {PlayerFigures} figures - The players that are shown.
 * @returns {FigureView} The player.
 * @throws {Error} If there is not exactly one.
 */
function findOnly(figures: PlayerFigures): FigureView {
  const views: FigureView[] = figures.describeFigures();
  const [only] = views;
  if (only === undefined || views.length !== 1) {
    throw new Error(`${String(views.length)} players are shown.`);
  }
  return only;
}

describe('PlayerFigures', () => {
  it('shows nobody before the first snapshot', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    expect(figures.describeFigures()).toEqual([]);
    expect(scene.children).toEqual([]);
  });

  it('shows a player where the snapshot tells, as it tells', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    figures.showPlayers([PLAYER]);
    const view: FigureView = findOnly(figures);
    expect(view).toMatchObject({ id: 5, appearance: 2, x: 1.5, z: -3 });
    expect(view.yaw).toBeCloseTo(90);
    expect(view.clip).toBe('Idle');
    const [root] = scene.children;
    expect(scene.children).toHaveLength(1);
    expect(root?.name).toBe('appearance 2');
    expect(root?.position.toArray()).toEqual([1.5, 0, -3]);
    expect(root?.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('shows every player with a model of its own', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    const twin: PlayerState = { ...PLAYER, id: 6, x: 4 };
    const other: PlayerState = { ...PLAYER, id: 7, appearance: 8, x: 6 };
    figures.showPlayers([PLAYER, twin, other]);
    expect(
      figures.describeFigures().map((view: FigureView) => view.appearance),
    ).toEqual([2, 2, 8]);
    expect(scene.children.map((root: Object3D) => root.position.x)).toEqual(
      [1.5, 4, 6],
    );
  });

  it('puts a player exactly where the latest snapshot tells', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    figures.showPlayers([PLAYER]);
    figures.update(0.03);
    figures.showPlayers([{ ...PLAYER, x: 9, z: 2, yaw: -45 }]);
    figures.update(0.03);
    const view: FigureView = findOnly(figures);
    expect(view.x).toBe(9);
    expect(view.z).toBe(2);
    expect(view.yaw).toBeCloseTo(-45);
    expect(scene.children).toHaveLength(1);
  });

  it('stops showing a player that is gone from the snapshot', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    const other: PlayerState = { ...PLAYER, id: 6, appearance: 3 };
    figures.showPlayers([PLAYER, other]);
    figures.showPlayers([other]);
    expect(findOnly(figures).id).toBe(6);
    expect(scene.children.map((root: Object3D) => root.name)).toEqual(
      ['appearance 3'],
    );
    figures.showPlayers([]);
    expect(scene.children).toEqual([]);
  });

  it('plays the clip of the action the snapshot tells', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    figures.showPlayers([{ ...PLAYER, action: 'Walk', actionCount: 3 }]);
    figures.update(0.5);
    expect(findOnly(figures).clip).toBe('Walk');
    expect(measureArm(scene)).toBeCloseTo(1);
    figures.showPlayers([{ ...PLAYER, action: 'Idle', actionCount: 4 }]);
    figures.update(0.5);
    expect(findOnly(figures).clip).toBe('Idle');
    expect(measureArm(scene)).toBeCloseTo(0);
  });

  it('lets a clip go on while the action count stays the same', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    const walking: PlayerState = { ...PLAYER, action: 'Walk', actionCount: 1 };
    figures.showPlayers([walking]);
    figures.update(0.25);
    figures.showPlayers([{ ...walking, x: 2 }]);
    figures.update(0.25);
    expect(measureArm(scene)).toBeCloseTo(1);
  });

  it('plays a slash once and holds until the snapshot tells otherwise', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    const slashing: PlayerState = {
      ...PLAYER,
      action: 'Slash',
      actionCount: 1,
    };
    figures.showPlayers([slashing]);
    figures.update(0.3);
    expect(measureArm(scene)).toBeCloseTo(3);
    figures.showPlayers([slashing]);
    figures.update(0.5);
    figures.showPlayers([slashing]);
    figures.update(0.5);
    expect(findOnly(figures).clip).toBe('Slash');
    expect(measureArm(scene)).toBeCloseTo(6);
    figures.showPlayers([{ ...PLAYER, action: 'Idle', actionCount: 2 }]);
    figures.update(0.1);
    expect(findOnly(figures).clip).toBe('Idle');
    expect(measureArm(scene)).toBeCloseTo(0);
  });

  it('starts a slash over when the action count changes', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    figures.showPlayers([{ ...PLAYER, action: 'Slash', actionCount: 1 }]);
    figures.update(0.6);
    expect(measureArm(scene)).toBeCloseTo(6);
    figures.showPlayers([{ ...PLAYER, action: 'Slash', actionCount: 3 }]);
    figures.update(0.1);
    expect(findOnly(figures).clip).toBe('Slash');
    expect(measureArm(scene)).toBeCloseTo(1);
  });

  it('starts the clip of one player over without the others', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    const first: PlayerState = { ...PLAYER, action: 'Slash', actionCount: 1 };
    const second: PlayerState = { ...first, id: 6 };
    figures.showPlayers([first, second]);
    figures.update(0.6);
    figures.showPlayers([first, { ...second, actionCount: 3 }]);
    figures.update(0.1);
    expect(measureArm(scene, 0)).toBeCloseTo(6);
    expect(measureArm(scene, 1)).toBeCloseTo(1);
  });

  it('shows a player once there is a model to show it with', () => {
    const scene = new Object3D();
    let isLoaded = false;
    const figures = new PlayerFigures(scene, (appearance: number) =>
      isLoaded ? createFigure(appearance) : null,
    );
    const walking: PlayerState = { ...PLAYER, action: 'Walk', actionCount: 2 };
    figures.showPlayers([walking]);
    expect(figures.describeFigures()).toEqual([]);
    isLoaded = true;
    figures.showPlayers([walking]);
    expect(findOnly(figures)).toMatchObject({ id: 5, clip: 'Walk' });
  });

  it('plays every slash of the past from its start, once', () => {
    const scene = new Object3D();
    const figures = new PlayerFigures(scene, createFigure);
    const timeline = new SnapshotTimeline();
    // A walk, then two slashes in a row with an idle step no snapshot has.
    const states: [number, Partial<PlayerState>][] = [
      [0, { x: 1.2, action: 'Walk', actionCount: 1 }],
      [2, { x: 1.35, action: 'Walk', actionCount: 1 }],
      [4, { action: 'Slash', actionCount: 2 }],
      [6, { action: 'Slash', actionCount: 2 }],
      [8, { action: 'Slash', actionCount: 2 }],
      [10, { action: 'Slash', actionCount: 2 }],
      [12, { action: 'Slash', actionCount: 2 }],
      [14, { action: 'Slash', actionCount: 2 }],
      [16, { action: 'Slash', actionCount: 4 }],
      [18, { action: 'Slash', actionCount: 4 }],
      [20, { action: 'Idle', actionCount: 5 }],
    ];
    for (const [step, state] of states) {
      const snapshot = createSnapshotMessage(
        step,
        [{ ...PLAYER, ...state }],
        OWN,
      );
      timeline.addSnapshot(snapshot, step * 50);
    }
    // The page shows what was 200 milliseconds ago, 50 times a second.
    const showUntil = (from: number, to: number): void => {
      for (let time = from; time <= to; time += 20) {
        figures.showPlayers(timeline.readPast(time + 200, 200).players);
        figures.update(0.02);
      }
    };
    showUntil(0, 180);
    expect(findOnly(figures).clip).toBe('Walk');
    expect(findOnly(figures).x).toBeLessThan(1.5);
    showUntil(200, 200);
    expect(findOnly(figures)).toMatchObject({ clip: 'Slash', x: 1.5 });
    expect(measureArm(scene)).toBeCloseTo(0.2);
    showUntil(220, 480);
    expect(measureArm(scene)).toBeCloseTo(3);
    showUntil(500, 780);
    expect(measureArm(scene)).toBeCloseTo(6);
    showUntil(800, 800);
    expect(findOnly(figures).clip).toBe('Slash');
    expect(measureArm(scene)).toBeCloseTo(0.2);
    showUntil(820, 980);
    expect(measureArm(scene)).toBeCloseTo(2);
    showUntil(1000, 1000);
    expect(findOnly(figures).clip).toBe('Idle');
  });
});
