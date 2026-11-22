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
 * @module client/player-figures Showing the players in the village.
 */

import type { AnimationClip, Object3D } from 'three';

import { PLAYER_HEALTH } from '@clovervale/shared';
import type { PlayerState } from '@clovervale/shared';

import { Actor } from './actor.ts';
import { HealthBar } from './health-bar.ts';

/** The colour of the health bars of the players. */
const HEALTH_COLOUR = '#4fd04a';

/** A model to show a player with. */
export interface Figure {
  /** The root of the model, which no other player is shown with. */
  readonly root: Object3D;
  /** The animation clips of the model. */
  readonly clips: readonly AnimationClip[];
}

/**
 * Makes the model to show a player with.
 *
 * @param {number} appearance - The number of the appearance of the player.
 * @returns {Figure | null} The model, or `null` if there is none to show the
 *   appearance with for now.
 */
export type FigureSource = (appearance: number) => Figure | null;

/** A player as it is shown. */
export interface FigureView {
  /** The identifier of the player. */
  readonly id: number;
  /** The number of the appearance the player is shown with. */
  readonly appearance: number;
  /** The position along the X axis, in metres. */
  readonly x: number;
  /** The position along the Z axis, in metres. */
  readonly z: number;
  /** The turn around the Y axis from facing +Z towards +X, in degrees. */
  readonly yaw: number;
  /** The name of the clip the player plays, or `null` if it has none. */
  readonly clip: string | null;
  /** How much of the health bar of the player is filled, from 0 to 1. */
  readonly health: number;
}

/** A player that is shown. */
interface ShownPlayer {
  /** The number of the appearance the player is shown with. */
  readonly appearance: number;
  /** The root of the model of the player. */
  readonly root: Object3D;
  /** The model of the player, playing its clips. */
  readonly actor: Actor;
  /** The health bar above the player. */
  readonly bar: HealthBar;
  /** The action count of the action the model is playing the clip of. */
  actionCount: number;
}

/** The players, shown exactly as they are told from moment to moment. */
export class PlayerFigures {
  readonly #parent: Object3D;
  readonly #createFigure: FigureSource;
  readonly #shown = new Map<number, ShownPlayer>();

  /**
   * Starts without players.
   *
   * @param {Object3D} parent - What the models of the players are added to.
   * @param {FigureSource} createFigure - Makes the model to show a player
   *   with.
   */
  constructor(parent: Object3D, createFigure: FigureSource) {
    this.#parent = parent;
    this.#createFigure = createFigure;
  }

  /**
   * Shows the given players, and no others.
   *
   * Each player stands where its state tells, facing the way it tells, and
   * plays the clip of the action it tells, which starts over whenever the
   * action count of the player changes, with a health bar above it that
   * shows its health.  A player without a model to show it with is left
   * out.
   *
   * @param {readonly PlayerState[]} players - The players as they are to be
   *   shown, whether a snapshot tells them so or they lie between two.
   */
  showPlayers(players: readonly PlayerState[]): void {
    const ids = new Set<number>(
      players.map((player: PlayerState) => player.id),
    );
    for (const [id, shown] of this.#shown) {
      if (!ids.has(id)) {
        this.#parent.remove(shown.root);
        this.#shown.delete(id);
      }
    }
    for (const player of players) {
      const shown: ShownPlayer | null =
        this.#shown.get(player.id) ?? this.#addPlayer(player);
      if (shown === null) {
        continue;
      }
      shown.root.position.set(player.x, 0, player.z);
      shown.root.rotation.y = (player.yaw * Math.PI) / 180;
      shown.bar.show(player.health, PLAYER_HEALTH);
      if (shown.actionCount !== player.actionCount) {
        shown.actionCount = player.actionCount;
        shown.actor.play(player.action);
      }
    }
  }

  /**
   * Moves the animations of the players forward in time.
   *
   * @param {number} seconds - The time that has passed, in seconds.
   */
  update(seconds: number): void {
    for (const shown of this.#shown.values()) {
      shown.actor.update(seconds);
    }
  }

  /**
   * Finds the model a player is shown with.
   *
   * @param {number} id - The identifier of the player.
   * @returns {Object3D | null} The root of the model, where the player
   *   stands, or `null` if the player is not shown.
   */
  findFigure(id: number): Object3D | null {
    return this.#shown.get(id)?.root ?? null;
  }

  /**
   * Describes the players as they are shown now.
   *
   * @returns {FigureView[]} The players, in the order they were first shown.
   */
  describeFigures(): FigureView[] {
    return [...this.#shown].map(([id, shown]: [number, ShownPlayer]) => ({
      id,
      appearance: shown.appearance,
      x: shown.root.position.x,
      z: shown.root.position.z,
      yaw: (shown.root.rotation.y * 180) / Math.PI,
      clip: shown.actor.clipName,
      health: shown.bar.fraction,
    }));
  }

  /**
   * Starts showing a player, playing the clip of its action.
   *
   * @param {PlayerState} player - The player.
   * @returns {ShownPlayer | null} The player as shown, or `null` if there is
   *   no model to show it with.
   */
  #addPlayer(player: PlayerState): ShownPlayer | null {
    const figure: Figure | null = this.#createFigure(player.appearance);
    if (figure === null) {
      return null;
    }
    const shown: ShownPlayer = {
      appearance: player.appearance,
      root: figure.root,
      actor: new Actor(figure.root, figure.clips),
      bar: new HealthBar(figure.root, HEALTH_COLOUR),
      actionCount: player.actionCount,
    };
    shown.actor.play(player.action);
    this.#parent.add(figure.root);
    this.#shown.set(player.id, shown);
    return shown;
  }
}
