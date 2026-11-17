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
 * @module client/tests/clip-choice Tests for choosing the animation clips.
 */

import { describe, expect, it } from 'vitest';

import { chooseClip } from '../src/clip-choice.ts';

const CHARACTER_CLIPS = ['Idle', 'Walk', 'Slash', 'Die'];
const MONSTER_CLIPS = ['Idle', 'Walk', 'Attack', 'Die'];

describe('chooseClip', () => {
  it('loops the idling and the walking', () => {
    expect(chooseClip('character', 'Idle', CHARACTER_CLIPS)).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
    expect(chooseClip('monster', 'Walk', MONSTER_CLIPS)).toEqual({
      name: 'Walk',
      playback: 'loop',
    });
  });

  it('attacks once, with the clip of each kind of model', () => {
    expect(chooseClip('character', 'Attack', CHARACTER_CLIPS)).toEqual({
      name: 'Slash',
      playback: 'once',
    });
    expect(chooseClip('monster', 'Attack', MONSTER_CLIPS)).toEqual({
      name: 'Attack',
      playback: 'once',
    });
  });

  it('holds the last pose of the dying', () => {
    expect(chooseClip('character', 'Die', CHARACTER_CLIPS)).toEqual({
      name: 'Die',
      playback: 'hold',
    });
  });

  it('keeps everything but the characters and the monster idling', () => {
    expect(chooseClip('npc', 'Walk', ['Idle', 'Walk'])).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
    expect(chooseClip('building', 'Die', ['Idle', 'Die'])).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
  });

  it('idles a model that lacks the chosen clip', () => {
    expect(chooseClip('monster', 'Attack', ['Idle', 'Slash'])).toEqual({
      name: 'Idle',
      playback: 'loop',
    });
  });

  it('plays nothing on a model that cannot idle', () => {
    expect(chooseClip('prop', 'Idle', [])).toBeNull();
    expect(chooseClip('character', 'Walk', ['Slash'])).toBeNull();
  });
});
