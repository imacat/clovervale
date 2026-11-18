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
 * @module client/background-music Playing the music of the village over
 *   and over, once the browser lets the page make sound.
 */

/**
 * The file name of the music of the village, "Embers on the Flagstone" by
 * Kaazoom, from Pixabay (https://pixabay.com/), under the Pixabay Content
 * License (https://pixabay.com/service/license-summary/).
 */
export const MUSIC_FILE = 'embers-on-the-flagstone.mp3';

/** The volume of the music unless the owner sets another, from 0 to 1. */
export const DEFAULT_MUSIC_VOLUME = 0.3;

/** How the owner has the music played. */
export interface MusicSettings {
  /** Whether the music is played. */
  isEnabled: boolean;
  /** How loud the music is played, from 0 for silent to 1 for full. */
  volume: number;
}

/** What plays the sound of the music, as an audio element does. */
export interface MusicPlayer {
  /** Whether the sound starts again from the beginning once it ends. */
  loop: boolean;
  /** How loud the sound is played, from 0 to 1. */
  volume: number;
  /**
   * Starts or resumes the sound.
   *
   * @returns {Promise<void>} A promise rejected if the sound cannot play.
   */
  play: () => Promise<void>;
  /** Pauses the sound where it is. */
  pause: () => void;
}

/**
 * The music of the village, which plays over and over as the owner has it
 * set, once the page is allowed to make sound.
 */
export class BackgroundMusic {
  readonly #player: MusicPlayer;
  #isAllowed = false;
  #isPlaying = false;
  #attempt = 0;

  /**
   * Starts silent, with the sound set to start again once it ends.
   *
   * @param {MusicPlayer} player - What plays the sound of the music.
   */
  constructor(player: MusicPlayer) {
    this.#player = player;
    player.loop = true;
  }

  /**
   * Records that the user has interacted with the page, so that the browser
   * lets it make sound, and plays the music if the owner has it on.
   *
   * @param {Readonly<MusicSettings>} settings - How the owner has the
   *   music played.
   */
  allow(settings: Readonly<MusicSettings>): void {
    this.#isAllowed = true;
    this.update(settings);
  }

  /**
   * Plays or pauses the music, and sets its volume, as the owner has it
   * set.  The music does not start before it is allowed, nor again after
   * the browser has refused it, until it is allowed again.
   *
   * @param {Readonly<MusicSettings>} settings - How the owner has the
   *   music played.
   */
  update(settings: Readonly<MusicSettings>): void {
    this.#player.volume = Math.min(Math.max(settings.volume, 0), 1);
    if (settings.isEnabled && this.#isAllowed && !this.#isPlaying) {
      this.#isPlaying = true;
      this.#attempt += 1;
      const attempt: number = this.#attempt;
      this.#player.play().catch(() => {
        // A pause cancels the play before it, which is not a refusal.
        if (attempt === this.#attempt) {
          this.#isPlaying = false;
          this.#isAllowed = false;
        }
      });
    } else if (!settings.isEnabled && this.#isPlaying) {
      this.#isPlaying = false;
      this.#attempt += 1;
      this.#player.pause();
    }
  }
}
