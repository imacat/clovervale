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

import { IDLE_CLIP, chooseClip } from './clip-choice.ts';
import type { ClipChoice, ClipPlan } from './clip-choice.ts';
import type { ModelKind } from './model-catalogue.ts';

/** How long a model rests before repeating a clip, in seconds. */
export const REPEAT_DELAY = 1;

/** A model that plays its animation clips. */
export class Actor {
  /**
   * Whether a clip that does not loop is played again, after a short rest.
   */
  repeats = true;
  readonly #kind: ModelKind;
  readonly #clips: ReadonlyMap<string, AnimationClip>;
  readonly #mixer: AnimationMixer;
  #chosen: ClipPlan | null = null;
  #playing: string | null = null;
  #stage: 'playing' | 'finished' | 'resting' = 'playing';
  #restSeconds = 0;

  /**
   * Makes a model idle, if it has a clip for that.
   *
   * @param {Object3D} root - The root of the model.
   * @param {readonly AnimationClip[]} clips - The clips of the model.
   * @param {ModelKind} kind - The kind of the model.
   */
  constructor(
    root: Object3D,
    clips: readonly AnimationClip[],
    kind: ModelKind,
  ) {
    this.#kind = kind;
    this.#clips = new Map(
      clips.map((clip: AnimationClip) => [clip.name, clip]),
    );
    this.#mixer = new AnimationMixer(root);
    this.#mixer.addEventListener('finished', () => {
      this.#stage = 'finished';
    });
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
   * Plays the clip of the model for an animation, from its beginning.
   *
   * A model that lacks the clip idles instead.
   *
   * @param {ClipChoice} choice - The animation to play.
   */
  play(choice: ClipChoice): void {
    this.#chosen = chooseClip(this.#kind, choice, [...this.#clips.keys()]);
    this.#stage = 'playing';
    if (this.#chosen !== null) {
      this.#start(this.#chosen);
    }
  }

  /**
   * Moves the animation of the model forward in time.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    this.#mixer.update(seconds);
    if (this.#chosen === null || this.#stage === 'playing') {
      return;
    }
    if (this.#stage === 'finished') {
      this.#stage = 'resting';
      this.#restSeconds = 0;
      if (this.#chosen.playback === 'once') {
        this.#start({ name: IDLE_CLIP, playback: 'loop' });
      }
      return;
    }
    this.#restSeconds += seconds;
    if (this.repeats && this.#restSeconds >= REPEAT_DELAY) {
      this.#stage = 'playing';
      this.#start(this.#chosen);
    }
  }

  /**
   * Starts a clip from its beginning, in place of the one playing.
   *
   * @param {ClipPlan} plan - The clip to start.
   */
  #start(plan: ClipPlan): void {
    const clip: AnimationClip | undefined = this.#clips.get(plan.name);
    if (clip === undefined) {
      return;
    }
    this.#mixer.stopAllAction();
    const action: AnimationAction = this.#mixer.clipAction(clip);
    action.reset();
    action.setLoop(plan.playback === 'loop' ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.play();
    this.#playing = plan.name;
  }
}
