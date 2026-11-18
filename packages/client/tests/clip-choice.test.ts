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
 * @module client/tests/clip-choice Tests for choosing the clip to play.
 */

import { describe, expect, it } from 'vitest';

import { chooseClip } from '../src/clip-choice.ts';

/** The names of the clips of a character. */
const CHARACTER_CLIPS: readonly string[] = ['Idle', 'Walk', 'Slash', 'Die'];

describe('chooseClip', () => {
  it('loops the clips of idling and of walking', () => {
    expect(chooseClip('Idle', CHARACTER_CLIPS)).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
    expect(chooseClip('Walk', CHARACTER_CLIPS)).toEqual({
      name: 'Walk',
      playback: 'loop',
    });
  });

  it('plays the clip of a slash once and holds its last pose', () => {
    expect(chooseClip('Slash', CHARACTER_CLIPS)).toEqual({
      name: 'Slash',
      playback: 'hold',
    });
  });

  it('plays the clips of an attack and of a death once and holds them', () => {
    const monsterClips: readonly string[] = ['Idle', 'Walk', 'Attack', 'Die'];
    expect(chooseClip('Attack', monsterClips)).toEqual({
      name: 'Attack',
      playback: 'hold',
    });
    expect(chooseClip('Die', monsterClips)).toEqual({
      name: 'Die',
      playback: 'hold',
    });
  });

  it('loops the clip of a drink, which the characters lack', () => {
    expect(chooseClip('Drink', [...CHARACTER_CLIPS, 'Drink'])).toEqual({
      name: 'Drink',
      playback: 'loop',
    });
    expect(chooseClip('Drink', CHARACTER_CLIPS)).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
  });

  it('idles when the model lacks the clip', () => {
    expect(chooseClip('Slash', ['Idle', 'Talk'])).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
  });

  it('plays nothing when the model cannot even idle', () => {
    expect(chooseClip('Walk', [])).toBeNull();
    expect(chooseClip('Idle', ['Spin'])).toBeNull();
  });
});
