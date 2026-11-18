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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/tests/background-music Tests for playing the music of
 *   the village.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { BackgroundMusic } from '../src/background-music.ts';
import type { MusicPlayer, MusicSettings } from '../src/background-music.ts';

/** A player that remembers whether it plays, and can refuse to. */
class FakePlayer implements MusicPlayer {
  loop = false;
  volume = 1;
  /** Whether the sound is playing. */
  isPlaying = false;
  /** How many times the sound was asked to play. */
  plays = 0;
  /** Whether the browser refuses to play the sound. */
  isRefused = false;

  /**
   * Starts the sound, unless refused.
   *
   * @returns {Promise<void>} A promise rejected if refused.
   */
  play(): Promise<void> {
    this.plays += 1;
    if (this.isRefused) {
      return Promise.reject(new Error('Not allowed.'));
    }
    this.isPlaying = true;
    return Promise.resolve();
  }

  /** Pauses the sound. */
  pause(): void {
    this.isPlaying = false;
  }
}

describe('the background music', () => {
  let player: FakePlayer;
  let music: BackgroundMusic;
  const on: MusicSettings = { isEnabled: true, volume: 0.3 };
  const off: MusicSettings = { isEnabled: false, volume: 0.3 };

  beforeEach(() => {
    player = new FakePlayer();
    music = new BackgroundMusic(player);
  });

  it('plays over and over', () => {
    expect(player.loop).toBe(true);
  });

  it('stays silent before it is allowed', () => {
    music.update(on);
    expect(player.plays).toBe(0);
  });

  it('plays once allowed, if on', () => {
    music.allow(on);
    expect(player.isPlaying).toBe(true);
    music.update(on);
    expect(player.plays).toBe(1);
  });

  it('stays silent once allowed, if off, until turned on', () => {
    music.allow(off);
    expect(player.plays).toBe(0);
    music.update(on);
    expect(player.isPlaying).toBe(true);
  });

  it('pauses when turned off, and resumes when turned on again', () => {
    music.allow(on);
    music.update(off);
    expect(player.isPlaying).toBe(false);
    music.update(on);
    expect(player.isPlaying).toBe(true);
    expect(player.plays).toBe(2);
  });

  it('plays at the volume set', () => {
    music.update({ isEnabled: true, volume: 0.6 });
    expect(player.volume).toBe(0.6);
  });

  it('waits to be allowed again once the browser refuses it', async () => {
    player.isRefused = true;
    music.allow(on);
    await Promise.resolve();
    music.update(on);
    expect(player.plays).toBe(1);
    player.isRefused = false;
    music.allow(on);
    expect(player.isPlaying).toBe(true);
  });

  it('pauses while the page is hidden, and resumes once shown', () => {
    music.allow(on);
    music.hide();
    expect(player.isPlaying).toBe(false);
    music.update(on);
    expect(player.isPlaying).toBe(false);
    music.show(on);
    expect(player.isPlaying).toBe(true);
    expect(player.plays).toBe(2);
  });

  it('stays silent while the page is hidden, even once allowed', () => {
    music.hide();
    music.allow(on);
    expect(player.plays).toBe(0);
    music.show(on);
    expect(player.isPlaying).toBe(true);
  });

  it('stays silent once shown, if off', () => {
    music.allow(on);
    music.hide();
    music.show(off);
    expect(player.isPlaying).toBe(false);
  });

  it('stays silent once shown, before it is allowed', () => {
    music.hide();
    music.show(on);
    expect(player.plays).toBe(0);
  });
});
