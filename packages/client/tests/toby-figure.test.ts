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
 * @module client/tests/toby-figure Tests for showing Toby as his course
 *   has him.
 */

import {
  AnimationClip,
  BoxGeometry,
  Mesh,
  Object3D,
  VectorKeyframeTrack,
} from 'three';
import { describe, expect, it } from 'vitest';

import {
  SIMULATION_RATE,
  TOBY_GRAB_STEPS,
  TOBY_LOOP_STEPS,
  TOBY_STOW_STEPS,
  findTobyPose,
} from '@clovervale/shared';
import type { TobyActivity, TobyPose } from '@clovervale/shared';

import { TobyModel } from '../src/toby-figure.ts';

/** How long each clip of the made-up model of Toby lasts, in seconds. */
const DURATIONS: Readonly<Record<string, number>> = {
  Idle: 2,
  Squat: 0.5,
  Pick: 2,
  Find: 4,
  Rise: 0.5,
  Turn: 0.6,
  Run: 0.35,
};

/**
 * Makes up a model of Toby with a right hand and every clip of his, whose
 * clips each raise a bone of their own from zero at their start by a
 * meter a second, which tells how far into each clip it is.
 *
 * @returns {{ root: Object3D; hand: Object3D; clips: AnimationClip[] }} The
 *   root of the model, the bone of its right hand, and its clips.
 */
function makeModel(): {
  root: Object3D;
  hand: Object3D;
  clips: AnimationClip[];
} {
  const root = new Object3D();
  const hand = new Object3D();
  hand.name = 'HandR';
  root.add(hand);
  const clips: AnimationClip[] = Object.keys(DURATIONS).map((name: string) => {
    const bone = new Object3D();
    bone.name = name;
    root.add(bone);
    const duration: number = DURATIONS[name] ?? 1;
    return new AnimationClip(name, duration, [
      new VectorKeyframeTrack(
        `${name}.position`,
        [0, duration],
        [0, 0, 0, 0, duration, 0],
      ),
    ]);
  });
  return { root, hand, clips };
}

/**
 * Tells how far into a clip a made-up model is.
 *
 * @param {Object3D} root - The root of the model.
 * @param {string} name - The name of the clip.
 * @returns {number} The time into the clip, in seconds.
 */
function readClipTime(root: Object3D, name: string): number {
  return root.getObjectByName(name)?.position.y ?? Number.NaN;
}

/**
 * Finds a step at which Toby does something, some time after he starts.
 *
 * @param {TobyActivity} activity - What he does.
 * @param {number} elapsed - How long after he starts, in seconds.
 * @returns {number} The step.
 */
function findStep(activity: TobyActivity, elapsed: number): number {
  for (let step = 0; step < TOBY_LOOP_STEPS; step++) {
    const pose: TobyPose = findTobyPose(step);
    if (pose.activity === activity && pose.elapsed === 0) {
      return step + elapsed * SIMULATION_RATE;
    }
  }
  throw new Error(`Toby never does ${activity}.`);
}

describe('TobyModel', () => {
  it('stands Toby where his course has him, facing his way', () => {
    const { root, clips } = makeModel();
    const figure = new TobyModel(root, clips, new Object3D());
    expect(root.visible).toBe(false);
    expect(figure.describe()).toBeNull();
    for (const step of [0, 37, 120.5, 140.25, 300]) {
      figure.show(step);
      const pose: TobyPose = findTobyPose(step);
      expect(root.visible).toBe(true);
      expect(root.position.x).toBe(pose.x);
      expect(root.position.y).toBe(0);
      expect(root.position.z).toBe(pose.z);
      expect(root.rotation.y).toBeCloseTo((pose.yaw * Math.PI) / 180, 12);
    }
  });

  it('plays the clip of what he does, from when he started it', () => {
    const { root, clips } = makeModel();
    const figure = new TobyModel(root, clips, new Object3D());
    figure.show(findStep('Squat', 0.25));
    expect(figure.describe()).toMatchObject({ activity: 'Squat' });
    expect(figure.describe()?.clip).toBe('Squat');
    expect(readClipTime(root, 'Squat')).toBeCloseTo(0.25, 9);
    figure.show(findStep('Turn', 0.3));
    expect(figure.describe()?.clip).toBe('Turn');
    expect(readClipTime(root, 'Turn')).toBeCloseTo(0.3, 9);
  });

  it('picks at the clover over and over while he squats there', () => {
    const { root, clips } = makeModel();
    const figure = new TobyModel(root, clips, new Object3D());
    figure.show(findStep('Pick', 2.5));
    expect(figure.describe()?.clip).toBe('Pick');
    expect(readClipTime(root, 'Pick')).toBeCloseTo(0.5, 9);
  });

  it('holds a clover he finds in his hand from his grab until he puts it away', () => {
    const { root, hand, clips } = makeModel();
    const clover = new Object3D();
    const figure = new TobyModel(root, clips, clover);
    expect(clover.parent).toBe(hand);
    const grab: number = findStep('Pick', TOBY_GRAB_STEPS / SIMULATION_RATE);
    const hold: number = TOBY_STOW_STEPS - TOBY_GRAB_STEPS;
    figure.show(grab - 0.5, true);
    expect(figure.describe()).toMatchObject({ clip: 'Pick', isHolding: false });
    expect(clover.visible).toBe(false);
    figure.show(grab, true);
    expect(figure.describe()).toMatchObject({ clip: 'Find', isHolding: true });
    expect(clover.visible).toBe(true);
    expect(readClipTime(root, 'Find')).toBeCloseTo(
      TOBY_GRAB_STEPS / SIMULATION_RATE,
      9,
    );
    figure.show(grab + hold - 0.5, true);
    expect(figure.describe()).toMatchObject({ clip: 'Find', isHolding: true });
    figure.show(grab + hold, true);
    expect(figure.describe()).toMatchObject({ clip: 'Find', isHolding: false });
    expect(clover.visible).toBe(false);
    expect(readClipTime(root, 'Find')).toBeCloseTo(
      TOBY_STOW_STEPS / SIMULATION_RATE,
      9,
    );
    figure.show(findStep('Rise', 0.1), true);
    expect(figure.describe()).toMatchObject({ clip: 'Rise', isHolding: false });
  });

  it('holds nothing at a grab that finds nothing', () => {
    const { root, clips } = makeModel();
    const clover = new Object3D();
    const figure = new TobyModel(root, clips, clover);
    const grab: number = findStep('Pick', TOBY_GRAB_STEPS / SIMULATION_RATE);
    figure.show(grab + 5, false);
    expect(figure.describe()).toMatchObject({ clip: 'Pick', isHolding: false });
    expect(clover.visible).toBe(false);
    figure.show(grab + 5);
    expect(figure.describe()).toMatchObject({ clip: 'Pick', isHolding: false });
  });

  it('runs his clip on in step with the ground he covers', () => {
    const { root, clips } = makeModel();
    const figure = new TobyModel(root, clips, new Object3D());
    figure.show(findStep('Run', 1));
    expect(figure.describe()?.clip).toBe('Run');
    expect(readClipTime(root, 'Run')).toBeCloseTo(0.3, 9);
    figure.show(findStep('Run', 1.1));
    expect(readClipTime(root, 'Run')).toBeCloseTo(0.05, 9);
  });

  it('tells where he is shown and what he does', () => {
    const { root, clips } = makeModel();
    const figure = new TobyModel(root, clips, new Object3D());
    const step: number = findStep('Run', 1);
    figure.show(step);
    const pose: TobyPose = findTobyPose(step);
    expect(figure.describe()).toEqual({
      step,
      x: pose.x,
      z: pose.z,
      yaw: pose.yaw,
      activity: 'Run',
      clip: 'Run',
      isHolding: false,
    });
  });

  it('tells where the top of his head is, lower as he squats', () => {
    // A head 0.85 m up, with hair to 0.3 m above it, which he runs with,
    // and which he lowers by 0.4 m as he squats down.
    const root = new Object3D();
    const hand = new Object3D();
    hand.name = 'HandR';
    const head = new Object3D();
    head.name = 'Head';
    head.position.y = 0.85;
    root.add(hand, head);
    const hair = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
    hair.position.y = 0.2;
    head.add(hair);
    const clips: AnimationClip[] = [
      new AnimationClip('Run', 2, [
        new VectorKeyframeTrack(
          'Head.position',
          [0, 2],
          [0, 0.85, 0, 0, 0.85, 0],
        ),
      ]),
      new AnimationClip('Squat', 0.5, [
        new VectorKeyframeTrack(
          'Head.position',
          [0, 0.5],
          [0, 0.85, 0, 0, 0.45, 0],
        ),
      ]),
    ];
    const figure = new TobyModel(root, clips, new Object3D());
    expect(figure.findHeadTop()).toBeNull();
    const running: number = findStep('Run', 0.5);
    figure.show(running);
    const standing: TobyPose = findTobyPose(running);
    expect(figure.findHeadTop()?.toArray()).toEqual([
      standing.x,
      expect.closeTo(1.15, 6),
      standing.z,
    ]);
    const squatting: number = findStep('Squat', 0.25);
    figure.show(squatting);
    const squat: TobyPose = findTobyPose(squatting);
    expect(figure.findHeadTop()?.toArray()).toEqual([
      squat.x,
      expect.closeTo(0.95, 6),
      squat.z,
    ]);
  });
});
