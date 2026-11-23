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
 * @module client/figure-registry Every set of figures shown wherever the
 *   player of the page is: the items, the players, the monsters, and any
 *   other set given.
 */

import type { Object3D } from 'three';

import type { MapId } from '@clovervale/shared';

import type { FigureFrame, FigureSet } from './figure-set.ts';
import { ItemFigures } from './item-figures.ts';
import type { ItemsView } from './item-figures.ts';
import type { LoadedModel } from './model-loader.ts';
import { MonsterFigures } from './monster-figures.ts';
import type { MonsterSource, MonsterView } from './monster-figures.ts';
import { PlayerFigures } from './player-figures.ts';
import type { FigureSource, FigureView } from './player-figures.ts';

/**
 * Every set of figures shown, the items, the players and the monsters
 * first, and then the others, in the order they were given, each shown,
 * moved on and cleared as {@link FigureSet} tells.
 */
export class FigureRegistry {
  /** The figures of the players. */
  readonly #players: PlayerFigures;
  /** The figures of the monsters. */
  readonly #monsters: MonsterFigures;
  /** The figures of the items there are to pick. */
  readonly #items: ItemFigures;
  /** Every set of figures, in the order they are shown. */
  readonly #sets: readonly FigureSet[];

  /**
   * Sets the figures of the items, the players and the monsters up, none
   * shown yet, along with the other sets of figures.
   *
   * @param {Object3D} parent - What the figures stand on.
   * @param {FigureSource} createPlayer - Makes the figure of a player.
   * @param {MonsterSource} createMonster - Makes the figure of a monster.
   * @param {readonly FigureSet[]} others - The other sets of figures, in
   *   the order they are shown.
   */
  constructor(
    parent: Object3D,
    createPlayer: FigureSource,
    createMonster: MonsterSource,
    others: readonly FigureSet[],
  ) {
    this.#items = new ItemFigures(parent);
    this.#players = new PlayerFigures(parent, createPlayer);
    this.#monsters = new MonsterFigures(parent, createMonster);
    this.#sets = [this.#items, this.#players, this.#monsters, ...others];
  }

  /**
   * Shows every set of figures as things are at a frame, as
   * {@link FigureSet.show} tells.
   *
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  show(frame: FigureFrame): void {
    for (const figures of this.#sets) {
      figures.show(frame);
    }
  }

  /**
   * Moves every set of figures on, as {@link FigureSet.update} tells.
   *
   * @param {number} seconds - The time since the last frame, in seconds.
   * @param {FigureFrame} frame - How things are shown at the frame.
   */
  update(seconds: number, frame: FigureFrame): void {
    for (const figures of this.#sets) {
      figures.update(seconds, frame);
    }
  }

  /**
   * Clears every set of figures, as {@link FigureSet.clear} tells.
   *
   * @param {MapId} map - The map left.
   */
  clear(map: MapId): void {
    for (const figures of this.#sets) {
      figures.clear(map);
    }
  }

  /**
   * Finds the figure of a player, if it is shown.
   *
   * @param {number} player - The identifier of the player.
   * @returns {Object3D | null} The figure, or `null` if it is not shown.
   */
  findPlayer(player: number): Object3D | null {
    return this.#players.findFigure(player);
  }

  /**
   * Shows the items there are to pick with the models of the items, as far
   * as they have been loaded.
   *
   * @param {readonly LoadedModel[]} models - The models loaded.
   */
  useItemModels(models: readonly LoadedModel[]): void {
    this.#items.useModels(models);
  }

  /**
   * Describes the figures of the players as they are shown, for looking at.
   *
   * @returns {FigureView[]} How each is shown.
   */
  describePlayers(): FigureView[] {
    return this.#players.describeFigures();
  }

  /**
   * Describes the figures of the monsters as they are shown, for looking
   * at.
   *
   * @returns {MonsterView[]} How each is shown.
   */
  describeMonsters(): MonsterView[] {
    return this.#monsters.describeMonsters();
  }

  /**
   * Describes the items as they are shown, for looking at.
   *
   * @returns {ItemsView} What is shown of the items.
   */
  describeItems(): ItemsView {
    return this.#items.describe();
  }
}
