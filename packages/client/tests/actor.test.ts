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
 * @module client/tests/actor Tests for playing the clips of a model.
 */

import { AnimationClip, NumberKeyframeTrack, Object3D } from 'three';
import { describe, expect, it } from 'vitest';

import { Actor } from '../src/actor.ts';

/** The time between two frames, in seconds. */
const FRAME = 0.05;

/**
 * Creates a clip that moves a model along the X axis.
 *
 * @param {string} name - The name of the clip.
 * @param {number[]} times - The times of the key frames, in seconds.
 * @param {number[]} positions - The position at each key frame, in meters.
 * @returns {AnimationClip} The clip.
 */
function createClip(
  name: string,
  times: number[],
  positions: number[],
): AnimationClip {
  const track = new NumberKeyframeTrack('.position[x]', times, positions);
  return new AnimationClip(name, -1, [track]);
}

/**
 * Creates the clips of a character: idling at 0, walking between 1 and 2,
 * and slashing out to 5 and back to 3 within half a second.
 *
 * @returns {AnimationClip[]} The clips.
 */
function createCharacterClips(): AnimationClip[] {
  return [
    createClip('Idle', [0, 1], [0, 0]),
    createClip('Walk', [0, 0.5, 1], [1, 2, 1]),
    createClip('Slash', [0, 0.25, 0.5], [0, 5, 3]),
  ];
}

/**
 * Moves the animation of a model forward, frame by frame.
 *
 * @param {Actor} actor - The model.
 * @param {number} seconds - How long to move it forward, in seconds.
 */
function advance(actor: Actor, seconds: number): void {
  for (let frame = 0; frame < Math.round(seconds / FRAME); frame++) {
    actor.update(FRAME);
  }
}

describe('Actor', () => {
  it('idles by default', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips());
    advance(actor, 2.5);
    expect(actor.clipName).toBe('Idle');
    expect(root.position.x).toBe(0);
  });

  it('works in a loop by default, if the model has a clip for that', () => {
    const root = new Object3D();
    const clips: AnimationClip[] = [
      createClip('Idle', [0, 1], [0, 0]),
      createClip('Work', [0, 0.5, 1], [1, 2, 1]),
    ];
    const actor = new Actor(root, clips);
    advance(actor, 3.5);
    expect(actor.clipName).toBe('Work');
    expect(root.position.x).toBeCloseTo(2);
  });

  it('keeps walking in a loop', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips());
    actor.play('Walk');
    advance(actor, 3.5);
    expect(actor.clipName).toBe('Walk');
    expect(root.position.x).toBeCloseTo(2);
  });

  it('slashes once and holds the last pose', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips());
    actor.play('Slash');
    advance(actor, 0.25);
    expect(actor.clipName).toBe('Slash');
    expect(root.position.x).toBeCloseTo(5);
    advance(actor, 3);
    expect(actor.clipName).toBe('Slash');
    expect(root.position.x).toBeCloseTo(3);
  });

  it('goes back to idling when told to', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips());
    actor.play('Slash');
    advance(actor, 1);
    actor.play('Idle');
    advance(actor, 0.5);
    expect(actor.clipName).toBe('Idle');
    expect(root.position.x).toBeCloseTo(0);
  });

  it('starts a clip over from its beginning when told to play it', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips());
    actor.play('Slash');
    advance(actor, 2);
    actor.play('Slash');
    advance(actor, 0.25);
    expect(root.position.x).toBeCloseTo(5);
  });

  it('idles in place of a clip the model lacks', () => {
    const root = new Object3D();
    const clips: AnimationClip[] = [createClip('Idle', [0, 1], [7, 7])];
    const actor = new Actor(root, clips);
    actor.play('Walk');
    advance(actor, 0.5);
    expect(actor.clipName).toBe('Idle');
    expect(root.position.x).toBeCloseTo(7);
  });

  it('leaves a model without clips alone', () => {
    const root = new Object3D();
    const actor = new Actor(root, []);
    actor.play('Walk');
    advance(actor, 1);
    expect(actor.clipName).toBeNull();
    expect(root.position.x).toBe(0);
  });
});
