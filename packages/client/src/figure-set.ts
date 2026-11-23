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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/23
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/figure-set What every set of figures the page shows goes
 *   by: shown as things are at each frame, moved on over time, and cleared
 *   as the player of the page leaves its map.
 */

import type {
  MapId,
  MonsterState,
  PlayerMotion,
  WorldItems,
} from '@clovervale/shared';

import type { PlayersView } from './interpolation.ts';

/** How things are shown at a frame. */
export interface FigureFrame {
  /** The map the player of the page is in, as the page shows it. */
  readonly map: MapId;
  /**
   * The identifier of the player of the page, or `null` while the server
   * has not told it.
   */
  readonly ownId: number | null;
  /**
   * The players and the monsters as they are shown, the player of the page
   * among them as it is drawn.
   */
  readonly view: PlayersView;
  /**
   * The monsters in the map as the latest snapshot tells them, or `null`
   * without one.
   */
  readonly latestMonsters: readonly MonsterState[] | null;
  /** The step of the server the page shows, or `null` while it shows none. */
  readonly shownStep: number | null;
  /**
   * What there is to pick in the world as it is shown, or `null` while the
   * server has not told it.
   */
  readonly items: WorldItems | null;
  /**
   * The motion of the player of the page as predicted, or `null` while
   * there is no prediction.
   */
  readonly ownMotion: PlayerMotion | null;
  /**
   * The step of the server the prediction of the player of the page is
   * after, or 0 while there is no prediction.
   */
  readonly ownStep: number;
  /** Whether the monsters stand still, as the server holds them. */
  readonly areMonstersPaused: boolean;
}

/** A set of figures the page shows. */
export interface FigureSet {
  /**
   * Shows the figures as things are at a frame.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  show(frame: FigureFrame): void;

  /**
   * Moves the figures on by the time since the last frame, once everything
   * of the frame is shown.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  update(seconds: number, frame: FigureFrame): void;

  /**
   * Forgets what was shown of the map the player of the page leaves, before
   * anything of the map it goes into is shown.
   *
   * @param {MapId} map - The map left.
   */
  clear(map: MapId): void;
}
