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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/22
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/credits The credits of the game: its version, what helped
 *   make it, and the work of others it comes with, under their own names
 *   and licences.
 */

import { version } from '../../../package.json';

/** The version of the game, as its package tells. */
export const GAME_VERSION: string = version;

/** The licence of the game project, the music and the libraries aside. */
export const GAME_LICENCE = 'Apache License 2.0';

/** The AI that assisted in making the game, in order. */
export const AI_ASSISTANCE: readonly string[] = [
  'Claude Code (Anthropic)',
  'Gemini (Google)',
];

/** A piece of music the game plays. */
export interface MusicCredit {
  /** The title of the piece. */
  readonly title: string;
  /** Who made it. */
  readonly author: string;
  /** Where it comes from. */
  readonly source: string;
  /** The licence it is under. */
  readonly licence: string;
}

/** A library the client comes with. */
export interface LibraryCredit {
  /** The name of the library. */
  readonly name: string;
  /** The licence it is under. */
  readonly licence: string;
}

/** The music the game plays. */
export const MUSIC_CREDITS: readonly MusicCredit[] = [
  {
    title: 'Embers on the Flagstone',
    author: 'Kaazoom',
    source: 'Pixabay',
    licence: 'Pixabay Content License',
  },
];

/** The libraries the client comes with. */
export const LIBRARY_CREDITS: readonly LibraryCredit[] = [
  { name: 'three.js', licence: 'MIT License' },
  { name: 'lil-gui', licence: 'MIT License' },
];
