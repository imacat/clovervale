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
 * @module client/clip-choice Choosing the animation clip a model plays.
 */

import type { ModelKind } from './model-catalogue.ts';

/** The animations the owner can choose from. */
export const CLIP_CHOICES = ['Idle', 'Walk', 'Attack', 'Die'] as const;

/** An animation the owner can choose. */
export type ClipChoice = (typeof CLIP_CHOICES)[number];

/**
 * How a clip is played: in a loop, once before going back to idling, or once
 * before holding its last pose.
 */
export type Playback = 'loop' | 'once' | 'hold';

/** A clip for a model to play. */
export interface ClipPlan {
  /** The name of the clip. */
  readonly name: string;
  /** How the clip is played. */
  readonly playback: Playback;
}

/** The name of the clip every animated model plays by default. */
export const IDLE_CLIP = 'Idle';

/** The clip each kind of model attacks with. */
const ATTACK_CLIPS: Readonly<Partial<Record<ModelKind, string>>> = {
  character: 'Slash',
  monster: 'Attack',
};

/** How the clips that do not loop are played. */
const PLAYBACKS: Readonly<Record<string, Playback>> = {
  Slash: 'once',
  Attack: 'once',
  Die: 'hold',
};

/**
 * Chooses the clip a model plays for the animation the owner chose.
 *
 * Only the characters and the monster follow the choice, each with its own
 * clip for the attack.  Everything else idles, and so does a model that
 * lacks the clip for the choice.
 *
 * @param {ModelKind} kind - The kind of the model.
 * @param {ClipChoice} choice - The animation the owner chose.
 * @param {readonly string[]} clipNames - The names of the clips of the model.
 * @returns {ClipPlan | null} The clip to play, or `null` if the model has
 *   nothing to play.
 */
export function chooseClip(
  kind: ModelKind,
  choice: ClipChoice,
  clipNames: readonly string[],
): ClipPlan | null {
  const attackClip: string | undefined = ATTACK_CLIPS[kind];
  let name: string = IDLE_CLIP;
  if (attackClip !== undefined) {
    name = choice === 'Attack' ? attackClip : choice;
  }
  if (!clipNames.includes(name)) {
    name = IDLE_CLIP;
  }
  if (!clipNames.includes(name)) {
    return null;
  }
  return { name, playback: PLAYBACKS[name] ?? 'loop' };
}
