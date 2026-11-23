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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/19
// AI assistance: Claude Code (Anthropic)

/**
 * @module client/correction-smoothing Drawing the corrections of the
 *   player of the page smoothly.
 */

import type { InputProgress, PlayerMotion } from '@clovervale/shared';

import type { PlayerPrediction, PredictionSettings } from './prediction.ts';

/**
 * How long the player of the page takes to glide over a correction, in
 * milliseconds: half as long again as the time between two snapshots, so
 * that the glide over one correction runs into the glide over the next when
 * the server pushes the player snapshot after snapshot, even when a
 * snapshot comes a frame or two late, while the player is drawn where it
 * truly is soon after the last.
 */
export const SMOOTHING_DURATION = 150;

/**
 * How far the player of the page may be drawn from where it truly is, in
 * meters, which it never reaches.  A correction that moves the player this
 * far or farther is drawn as a jump, whatever is left of the glide before,
 * and so is one that would leave it drawn this far or farther from where
 * it truly is: either is far more than a villager pushes a player between two
 * snapshots, and a glide over it would be quicker than anything moves in
 * the village.
 */
export const SMOOTHING_LIMIT = 1;

/** How the owner has the corrections of the player of the page drawn. */
export interface SmoothingSettings {
  /**
   * Whether the player of the page glides over its corrections, rather than
   * jumping to where they put it.
   */
  isEnabled: boolean;
}

/**
 * Draws the player of the page gliding over its corrections.
 *
 * When a correction moves the player, it is drawn where it was drawn just
 * before, and glides at an even pace to where it truly is, which it
 * reaches {@link SMOOTHING_DURATION} after the correction, moving all the
 * while as the player truly moves as well.  A correction that comes as it
 * glides takes it on from where it is drawn then.  The player is drawn
 * where it truly is at once when it comes back from death, when a
 * correction moves it {@link SMOOTHING_LIMIT} or farther, whatever is left
 * of the glide before, and when a correction would leave it drawn that far
 * or farther from where it truly is.  It is drawn where it truly is, too,
 * while the owner has it shown without prediction or without this
 * smoothing, and nothing is left to glide over when the owner switches
 * either back on, as long as the player is drawn or corrected in between.
 * Only where the player is drawn glides: it is drawn facing the way it
 * truly faces, doing what it truly does.
 */
export class CorrectionSmoothing {
  readonly #settings: Readonly<SmoothingSettings>;
  readonly #prediction: Readonly<PredictionSettings>;
  #offsetX = 0;
  #offsetZ = 0;
  #startTime = 0;

  /**
   * Starts with the player drawn where it truly is.
   *
   * @param {Readonly<SmoothingSettings>} settings - How the owner has the
   *   corrections drawn, as set at any time.
   * @param {Readonly<PredictionSettings>} prediction - How the owner has the
   *   player of the page shown, as set at any time.
   */
  constructor(
    settings: Readonly<SmoothingSettings>,
    prediction: Readonly<PredictionSettings>,
  ) {
    this.#settings = settings;
    this.#prediction = prediction;
  }

  /**
   * Takes note of a correction, which moves the player at once from where
   * it was to be drawn to where it is to be drawn.
   *
   * @param {PlayerMotion} before - The player as it was to be drawn just
   *   before, without this smoothing.
   * @param {PlayerMotion} after - The player as it is to be drawn after, at
   *   the same time, without this smoothing.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   */
  noticeCorrection(
    before: PlayerMotion,
    after: PlayerMotion,
    time: number,
  ): void {
    const shiftX: number = before.x - after.x;
    const shiftZ: number = before.z - after.z;
    if (shiftX === 0 && shiftZ === 0) {
      return;
    }
    const share: number = this.#findShare(time);
    const offsetX: number = this.#offsetX * share + shiftX;
    const offsetZ: number = this.#offsetZ * share + shiftZ;
    const isJump: boolean =
      !this.#isSmoothing() ||
      (before.action === 'Die' && after.action !== 'Die') ||
      Math.hypot(shiftX, shiftZ) >= SMOOTHING_LIMIT ||
      Math.hypot(offsetX, offsetZ) >= SMOOTHING_LIMIT;
    this.#offsetX = isJump ? 0 : offsetX;
    this.#offsetZ = isJump ? 0 : offsetZ;
    this.#startTime = time;
  }

  /**
   * Tells the player as it is to be drawn at a time.
   *
   * @param {PlayerMotion} motion - The player as it is to be drawn then,
   *   without this smoothing.
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds, which is no earlier than any time told before.
   * @returns {PlayerMotion} The player as it is to be drawn: the very motion
   *   given, unless it glides over a correction then.
   */
  readDrawn(motion: PlayerMotion, time: number): PlayerMotion {
    if (!this.#isSmoothing()) {
      this.#offsetX = 0;
      this.#offsetZ = 0;
    }
    const share: number = this.#findShare(time);
    if (share === 0) {
      return motion;
    }
    return {
      ...motion,
      x: motion.x + this.#offsetX * share,
      z: motion.z + this.#offsetZ * share,
    };
  }

  /**
   * Tells whether the owner has the player shown as predicted and its
   * corrections drawn as glides.
   *
   * @returns {boolean} Whether the owner has both switched on.
   */
  #isSmoothing(): boolean {
    return this.#settings.isEnabled && this.#prediction.isEnabled;
  }

  /**
   * Finds how much of the offset of the latest correction is left at a
   * time.
   *
   * @param {number} time - The time on the clock of the page, in
   *   milliseconds.
   * @returns {number} The share left, from 0 to 1: 0 once the glide is over,
   *   or when there is nothing to glide over.
   */
  #findShare(time: number): number {
    if (this.#offsetX === 0 && this.#offsetZ === 0) {
      return 0;
    }
    const elapsed: number = time - this.#startTime;
    return Math.max(1 - elapsed / SMOOTHING_DURATION, 0);
  }
}

/**
 * Sets the player of the page right by what the server tells of it, with
 * the correction this makes, if any, drawn smoothly.  The prediction
 * becomes just what it becomes when set right without the smoothing.
 *
 * @param {PlayerPrediction} prediction - The prediction of the player.
 * @param {CorrectionSmoothing} smoothing - The smoothing of its
 *   corrections.
 * @param {InputProgress} progress - How far the server had gotten with
 *   the inputs of the page, and the motion of the player then.
 * @param {number} step - The number of steps the server had taken then.
 * @param {number} time - The time on the clock of the page, in
 *   milliseconds, which is no earlier than any time told before.
 */
export function reconcileSmoothly(
  prediction: PlayerPrediction,
  smoothing: CorrectionSmoothing,
  progress: InputProgress,
  step: number,
  time: number,
): void {
  const before: PlayerMotion = prediction.readDrawn(time);
  prediction.reconcile(progress, step, time);
  smoothing.noticeCorrection(before, prediction.readDrawn(time), time);
}
