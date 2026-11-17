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

import { Actor, REPEAT_DELAY } from '../src/actor.ts';

/** The time between two frames, in seconds. */
const FRAME = 0.05;

/**
 * Creates a clip that moves a model along the X axis.
 *
 * @param {string} name - The name of the clip.
 * @param {number[]} times - The times of the key frames, in seconds.
 * @param {number[]} positions - The position at each key frame, in metres.
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
 * slashing out to 5 and back within half a second, and dying over to 9
 * within a second.
 *
 * @returns {AnimationClip[]} The clips.
 */
function createCharacterClips(): AnimationClip[] {
  return [
    createClip('Idle', [0, 1], [0, 0]),
    createClip('Walk', [0, 0.5, 1], [1, 2, 1]),
    createClip('Slash', [0, 0.25, 0.5], [0, 5, 0]),
    createClip('Die', [0, 1], [0, 9]),
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
    const actor = new Actor(root, createCharacterClips(), 'character');
    advance(actor, 2.5);
    expect(actor.clipName).toBe('Idle');
    expect(root.position.x).toBe(0);
  });

  it('keeps walking in a loop', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips(), 'character');
    actor.play('Walk');
    advance(actor, 3.5);
    expect(actor.clipName).toBe('Walk');
    expect(root.position.x).toBeCloseTo(2);
  });

  it('attacks once and goes back to idling', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips(), 'character');
    actor.repeats = false;
    actor.play('Attack');
    advance(actor, 0.25);
    expect(actor.clipName).toBe('Slash');
    expect(root.position.x).toBeCloseTo(5);
    advance(actor, 3);
    expect(actor.clipName).toBe('Idle');
    expect(root.position.x).toBeCloseTo(0);
  });

  it('attacks again after a rest when repeating', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips(), 'character');
    actor.play('Attack');
    advance(actor, 0.5 + REPEAT_DELAY / 2);
    expect(actor.clipName).toBe('Idle');
    advance(actor, REPEAT_DELAY / 2 + 0.35);
    expect(actor.clipName).toBe('Slash');
    expect(root.position.x).toBeGreaterThan(1);
  });

  it('dies once and stays down', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips(), 'character');
    actor.repeats = false;
    actor.play('Die');
    advance(actor, 5);
    expect(actor.clipName).toBe('Die');
    expect(root.position.x).toBeCloseTo(9);
  });

  it('dies again after a rest when repeating', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips(), 'character');
    actor.play('Die');
    advance(actor, 1 + REPEAT_DELAY / 2);
    expect(root.position.x).toBeCloseTo(9);
    advance(actor, REPEAT_DELAY / 2 + 0.5);
    expect(root.position.x).toBeGreaterThan(1);
    expect(root.position.x).toBeLessThan(8);
  });

  it('plays the attack of the monster under its own name', () => {
    const clips: AnimationClip[] = [
      createClip('Idle', [0, 1], [0, 0]),
      createClip('Attack', [0, 0.25, 0.5], [0, 5, 0]),
    ];
    const actor = new Actor(new Object3D(), clips, 'monster');
    actor.play('Attack');
    advance(actor, 0.25);
    expect(actor.clipName).toBe('Attack');
  });

  it('starts a chosen clip over from its beginning', () => {
    const root = new Object3D();
    const actor = new Actor(root, createCharacterClips(), 'character');
    actor.repeats = false;
    actor.play('Die');
    advance(actor, 5);
    actor.play('Die');
    advance(actor, 0.5);
    expect(root.position.x).toBeCloseTo(4.5);
  });

  it('leaves a model without clips alone', () => {
    const root = new Object3D();
    const actor = new Actor(root, [], 'prop');
    actor.play('Walk');
    advance(actor, 1);
    expect(actor.clipName).toBeNull();
    expect(root.position.x).toBe(0);
  });
});
