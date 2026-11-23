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
 * @module client/settings The settings the client runs by, which the owner
 *   changes in the panel and the game reads at every frame.
 */

import { DEFAULT_MUSIC_VOLUME } from './background-music.ts';
import type { MusicSettings } from './background-music.ts';
import type { SmoothingSettings } from './correction-smoothing.ts';
import type { TimePreviewSettings } from './day-clock.ts';
import { DEFAULT_DELAY } from './interpolation.ts';
import type { PredictionSettings } from './prediction.ts';
import type { PushForecastSettings } from './push-forecast.ts';
import type { NetworkSettings } from './server-link.ts';
import { DEFAULT_TRAILING_CAMERA } from './trailing-camera.ts';
import type { TrailingCameraSettings } from './trailing-camera.ts';

/** How the owner has the players shown. */
export interface InterpolationSettings {
  /**
   * Whether the players are shown moving smoothly, slightly in the past,
   * rather than exactly as the latest snapshot tells them.
   */
  isEnabled: boolean;
  /** How far in the past the players are then shown, in milliseconds. */
  delay: number;
}

/** How the owner has the slashes of the player of the page judged. */
export interface CompensationSettings {
  /**
   * Whether the page asks the server to judge each slash of its player on
   * the world as the page showed it when the slash started, rather than on
   * the world as it is when the slash starts on the server.
   */
  isEnabled: boolean;
}

/** What the owner has drawn to see what the rules of the game use. */
export interface ObstacleSettings {
  /**
   * Whether the outlines of the obstacles and of the boundary of the
   * village are drawn on the ground.
   */
  isShown: boolean;
}

/** Where the owner has the camera. */
export interface CameraSettings {
  /**
   * The identifier of the player the camera follows, or `null` for the
   * player of the page.
   */
  followedId: number | null;
}

/**
 * The settings the client runs by, each of which the owner may change at
 * any time, and which the game reads afresh whenever it needs them.
 */
export interface ClientSettings {
  /** How the owner has the players shown. */
  readonly interpolation: InterpolationSettings;
  /** How the owner has the player of the page shown. */
  readonly prediction: PredictionSettings;
  /** How the owner has the corrections of the player of the page drawn. */
  readonly smoothing: SmoothingSettings;
  /**
   * Whether the owner has the player of the page drawn pushed out of the way
   * of Toby before the server tells of it.
   */
  readonly pushForecast: PushForecastSettings;
  /** The connection the page pretends to have. */
  readonly network: NetworkSettings;
  /** How the owner has the slashes judged. */
  readonly compensation: CompensationSettings;
  /** What the owner has drawn of the obstacles. */
  readonly obstacles: ObstacleSettings;
  /** The time of day the owner previews. */
  readonly timePreview: TimePreviewSettings;
  /**
   * Where the owner has the camera, which the page changes when the player
   * it follows is gone.
   */
  readonly camera: CameraSettings;
  /** How the owner has the camera turn after the player it follows. */
  readonly trailingCamera: TrailingCameraSettings;
  /** How the owner has the music played. */
  readonly music: MusicSettings;
}

/**
 * Creates the settings the client starts with: the player of the page
 * shown as predicted, gliding over its corrections, pushed out of the way
 * of Toby before the server tells of it, the other players smoothly, by the
 * default delay, no message held back, the slashes judged on the world as
 * the page showed it, the camera on the player of the page, trailing gently
 * behind the way it goes, no outlines of the obstacles, the time of day of
 * the world, with midnight ready to preview, and the music on at its
 * default volume.
 *
 * @returns {ClientSettings} The settings.
 */
export function createSettings(): ClientSettings {
  return {
    interpolation: { isEnabled: true, delay: DEFAULT_DELAY },
    prediction: { isEnabled: true },
    smoothing: { isEnabled: true },
    pushForecast: { isEnabled: true },
    network: { delay: 0 },
    compensation: { isEnabled: true },
    obstacles: { isShown: false },
    timePreview: { isEnabled: false, hour: 0 },
    camera: { followedId: null },
    trailingCamera: { ...DEFAULT_TRAILING_CAMERA },
    music: { isEnabled: true, volume: DEFAULT_MUSIC_VOLUME },
  };
}
