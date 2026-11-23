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
 * @module client/own-player The player of the page as the page draws it:
 *   predicted, gliding over its corrections, and pushed out of the way of
 *   the pushers as foreseen.
 */

import type { MapId, PlayerMotion, SnapshotMessage } from '@clovervale/shared';

import {
  CorrectionSmoothing,
  reconcileSmoothly,
} from './correction-smoothing.ts';
import type { SmoothingSettings } from './correction-smoothing.ts';
import { DrawnPusherStep } from './drawn-pusher-step.ts';
import { PlayerPrediction } from './prediction.ts';
import type { PredictionSettings } from './prediction.ts';
import { PushForecast } from './push-forecast.ts';
import type { PushForecastSettings } from './push-forecast.ts';

/** How the panel has the player of the page drawn, as set at every frame. */
export interface OwnPlayerSettings {
  /** Whether the player is predicted. */
  readonly prediction: Readonly<PredictionSettings>;
  /** How the player glides over its corrections. */
  readonly smoothing: Readonly<SmoothingSettings>;
  /** How the pushes of the pushers are foreseen. */
  readonly pushForecast: Readonly<PushForecastSettings>;
}

/**
 * The player of the page as predicted, once the server has told where it
 * starts, with what draws it gliding over its corrections and pushed out
 * of the way of the pushers while it rests, both of which start afresh in
 * every map.
 */
export class OwnPlayer {
  /** How the panel has the player drawn. */
  readonly #settings: OwnPlayerSettings;
  /** The player as predicted, once the server has told where it starts. */
  #prediction: PlayerPrediction | null = null;
  /** The step the pushers are drawn at beside the predicted player. */
  #pusherStep: DrawnPusherStep | null = null;
  /** What draws the player gliding over its corrections. */
  #smoothing: CorrectionSmoothing;
  /** What draws the player pushed out of the way of the pushers. */
  #forecast: PushForecast;

  /**
   * Starts with no player.
   *
   * @param {OwnPlayerSettings} settings - How the panel has the player
   *   drawn, as set at every frame.
   */
  constructor(settings: OwnPlayerSettings) {
    this.#settings = settings;
    this.#smoothing = this.#createSmoothing();
    this.#forecast = this.#createForecast();
  }

  /**
   * The player of the page as predicted, or `null` while the server has not
   * told where it starts since the page connected.
   *
   * @returns {PlayerPrediction | null} The prediction.
   */
  get prediction(): PlayerPrediction | null {
    return this.#prediction;
  }

  /**
   * The step of the server the pushers are drawn at beside the player of
   * the page, or `null` while there is no prediction.
   *
   * @returns {DrawnPusherStep | null} The step the pushers are drawn at.
   */
  get pusherStep(): DrawnPusherStep | null {
    return this.#pusherStep;
  }

  /**
   * Takes note of a snapshot: the first one starts the prediction, the
   * first one of another map moves the player into it there, and any
   * other sets the prediction right, gliding over the correction.  The
   * monsters of the snapshot tell the prediction whether the player slashes
   * rather than talks.  In another map, the glide and the push start
   * afresh.
   *
   * @param {SnapshotMessage} message - The snapshot.
   * @param {MapId | null} map - The map the player has gone into, if this
   *   is the first snapshot there, or `null` otherwise.
   * @param {MapId} shownMap - The map the page shows until now.
   * @param {number} now - The time of the page the snapshot came at, in
   *   milliseconds.
   */
  noteSnapshot(
    message: SnapshotMessage,
    map: MapId | null,
    shownMap: MapId,
    now: number,
  ): void {
    this.#prediction?.noteMonsters(message.monsters);
    if (this.#prediction === null) {
      this.#prediction = new PlayerPrediction(
        message.own.motion,
        message.step,
        now,
        map ?? shownMap,
      );
      this.#prediction.noteMonsters(message.monsters);
      this.#pusherStep = new DrawnPusherStep(this.#prediction);
    } else if (map !== null) {
      this.#prediction.enterMap(map, message.own, message.step, now);
    } else {
      reconcileSmoothly(
        this.#prediction,
        this.#smoothing,
        message.own,
        message.step,
        now,
      );
    }
    if (map !== null) {
      this.#smoothing = this.#createSmoothing();
      this.#forecast = this.#createForecast();
    }
  }

  /**
   * Finds the motion the player of the page is drawn with now, gliding and
   * pushed as the panel has it set; told at every frame, so that a glide or
   * a push ends as soon as prediction is switched off.
   *
   * @param {number} now - The time of the page now, in milliseconds.
   * @param {MapId} map - The map the page shows.
   * @param {number | null} shownStep - The step of the server the villagers
   *   are shown at, or `null` while they are not shown.
   * @returns {PlayerMotion | null} The motion, or `null` while there is no
   *   prediction.
   */
  readDrawn(
    now: number,
    map: MapId,
    shownStep: number | null,
  ): PlayerMotion | null {
    return this.#prediction === null
      ? null
      : this.#forecast.advance(
          this.#prediction,
          this.#smoothing,
          now,
          map,
          shownStep,
        );
  }

  /** Forgets the player, as the page disconnects. */
  forget(): void {
    this.#prediction = null;
    this.#pusherStep = null;
  }

  /**
   * Makes what draws the player gliding over its corrections afresh.
   *
   * @returns {CorrectionSmoothing} The new smoothing.
   */
  #createSmoothing(): CorrectionSmoothing {
    return new CorrectionSmoothing(
      this.#settings.smoothing,
      this.#settings.prediction,
    );
  }

  /**
   * Makes what draws the player pushed out of the way of the pushers
   * afresh.
   *
   * @returns {PushForecast} The new forecast.
   */
  #createForecast(): PushForecast {
    return new PushForecast(
      this.#settings.pushForecast,
      this.#settings.smoothing,
      this.#settings.prediction,
    );
  }
}
