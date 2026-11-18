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
 * @module client/actor Playing the animation clips of a model.
 */

import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';
import type { AnimationAction, AnimationClip, Object3D } from 'three';

import type { ActionState, MonsterAction } from '@clovervale/shared';

import { chooseClip } from './clip-choice.ts';
import type { ClipPlan } from './clip-choice.ts';

/** A model that plays its animation clips. */
export class Actor {
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  readonly #mixer: AnimationMixer;
  #playing: string | null = null;

  /**
   * Makes a model idle, if it has a clip for that.
   *
   * @param {Object3D} root - The root of the model.
   * @param {readonly AnimationClip[]} clips - The clips of the model.
   */
  constructor(root: Object3D, clips: readonly AnimationClip[]) {
    this.#clips = new Map(
      clips.map((clip: AnimationClip) => [clip.name, clip]),
    );
    this.#mixer = new AnimationMixer(root);
    this.play('Idle');
  }

  /**
   * The name of the clip the model is playing, or `null` if it has none.
   *
   * @returns {string | null} The name of the clip.
   */
  get clipName(): string | null {
    return this.#playing;
  }

  /**
   * Plays the clip of the model for what it is doing, from its beginning.
   *
   * Idling, walking and drinking go on in a loop, and a slash, an attack or
   * a death is played once, after which the model holds its last pose.  A
   * model that lacks the clip idles instead.
   *
   * @param {ActionState | MonsterAction} action - What the model is doing.
   */
  play(action: ActionState | MonsterAction): void {
    const plan: ClipPlan | null = chooseClip(action, [...this.#clips.keys()]);
    const clip: AnimationClip | undefined = this.#clips.get(plan?.name ?? '');
    if (plan === null || clip === undefined) {
      return;
    }
    this.#mixer.stopAllAction();
    const animation: AnimationAction = this.#mixer.clipAction(clip);
    animation.reset();
    const isLooping: boolean = plan.playback === 'loop';
    animation.setLoop(isLooping ? LoopRepeat : LoopOnce, Infinity);
    animation.clampWhenFinished = true;
    animation.play();
    this.#playing = plan.name;
  }

  /**
   * Moves the animation of the model forward in time.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    this.#mixer.update(seconds);
  }
}
