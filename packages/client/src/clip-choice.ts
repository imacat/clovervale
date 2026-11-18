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

import type { ActionState, MonsterAction } from '@clovervale/shared';

/**
 * How a clip is played: in a loop, or once before holding its last pose.
 */
export type Playback = 'loop' | 'hold';

/** A clip for a model to play. */
export interface ClipPlan {
  /** The name of the clip. */
  readonly name: string;
  /** How the clip is played. */
  readonly playback: Playback;
}

/** The name of the clip every animated model plays by default. */
export const IDLE_CLIP = 'Idle';

/**
 * How the clip of each action of a player or the monster is played.  The
 * clips are named after them.
 */
const PLAYBACKS: Readonly<Record<ActionState | MonsterAction, Playback>> = {
  Idle: 'loop',
  Walk: 'loop',
  Slash: 'hold',
  Attack: 'hold',
  Die: 'hold',
};

/**
 * Chooses the clip a model plays for what it is doing.
 *
 * A model that lacks the clip for it idles instead.
 *
 * @param {ActionState | MonsterAction} action - What the model is doing.
 * @param {readonly string[]} clipNames - The names of the clips of the model.
 * @returns {ClipPlan | null} The clip to play, or `null` if the model has
 *   nothing to play.
 */
export function chooseClip(
  action: ActionState | MonsterAction,
  clipNames: readonly string[],
): ClipPlan | null {
  if (clipNames.includes(action)) {
    return { name: action, playback: PLAYBACKS[action] };
  }
  if (clipNames.includes(IDLE_CLIP)) {
    return { name: IDLE_CLIP, playback: PLAYBACKS.Idle };
  }
  return null;
}
