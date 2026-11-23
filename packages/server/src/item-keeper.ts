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
 * @module server/item-keeper What there is to pick in a world: its patches
 *   of clover, the items on its ground and its containers, and what goes
 *   between them and the players.
 */

import {
  CLOVER_REGROW_DURATION,
  GROUND_ITEM_DURATION,
  WORLD_MAPS,
  countSteps,
} from '@clovervale/shared';
import type {
  GroundItem,
  ItemKindId,
  MapId,
  PickTarget,
  WorldItems,
} from '@clovervale/shared';

import type { Player } from './player.ts';

/** The number of simulation steps a picked patch of clover takes to regrow. */
const REGROW_STEPS: number = countSteps(CLOVER_REGROW_DURATION);

/** The number of simulation steps an item put down lies on the ground. */
const GROUND_ITEM_STEPS: number = countSteps(GROUND_ITEM_DURATION);

/** The number of decimal places the place of an item put down keeps. */
const ITEM_PLACE_PRECISION = 2;

/** An item that lies on the ground, and until when. */
interface LyingItem {
  /** The item. */
  readonly item: GroundItem;
  /** The number of the step at which the item is gone. */
  readonly goneStep: number;
}

/**
 * What there is to pick in a world: in the village, its patches of clover
 * and what Toby has taken of them, in a cave, its chests and barrels, and
 * anywhere, the items put down on its ground.
 */
export class ItemKeeper {
  /** Gives the number of the current step of the world. */
  readonly #getStep: () => number;
  /**
   * The number of the step at which each patch of clover has its clover
   * again, by the number of the patch, which is no later than the current
   * step while it has it.
   */
  readonly #regrowSteps: number[];
  #lyingItems: LyingItem[] = [];
  #lastItemId = 0;
  /** The numbers of the containers of the cave that have been looted. */
  readonly #looted = new Set<number>();
  /**
   * Takes what a player picks away from where it is, by where it is, which
   * takes the number of the patch of clover, the identifier of the item on
   * the ground, or the number of the container.
   */
  readonly #takers: Readonly<Record<PickTarget['type'], (id: number) => void>> =
    {
      patch: (patch: number): void => {
        this.#regrowSteps[patch] = this.#getStep() + REGROW_STEPS;
      },
      ground: (id: number): void => {
        this.#lyingItems = this.#lyingItems.filter(
          (lying: LyingItem) => lying.item.id !== id,
        );
      },
      container: (id: number): void => {
        this.#looted.add(id);
      },
    };

  /**
   * Starts with nothing on the ground: in the village, with a four-leaf
   * clover in every patch of clover, and in a cave, with every chest and
   * barrel holding what it holds.
   *
   * @param {MapId} map - The map of the world.
   * @param {() => number} getStep - Gives the number of the current step
   *   of the world.
   */
  constructor(map: MapId, getStep: () => number) {
    this.#getStep = getStep;
    this.#regrowSteps = WORLD_MAPS[map].cloverPatches.map(() => 0);
  }

  /**
   * Takes away the items that have lain on the ground for as long as an
   * item put down lies there, by the current step.
   */
  removeExpired(): void {
    const step: number = this.#getStep();
    this.#lyingItems = this.#lyingItems.filter(
      (lying: LyingItem) => lying.goneStep > step,
    );
  }

  /**
   * Describes what there is to pick as it is now.
   *
   * @returns {WorldItems} The patches of clover that have their clover, the
   *   items on the ground, in the order they were put down, and the
   *   containers that have been looted, in ascending order.
   */
  describe(): WorldItems {
    const step: number = this.#getStep();
    const clovers: number[] = [];
    this.#regrowSteps.forEach((regrowStep: number, patch: number) => {
      if (regrowStep <= step) {
        clovers.push(patch);
      }
    });
    const items: GroundItem[] = this.#lyingItems.map(
      (lying: LyingItem) => lying.item,
    );
    const looted: number[] = [...this.#looted].sort(
      (a: number, b: number) => a - b,
    );
    return { clovers, items, looted };
  }

  /**
   * Takes the four-leaf clover of a patch of clover for a villager, if
   * the patch has its clover, which is then gone from the patch until it
   * regrows {@link CLOVER_REGROW_DURATION} seconds later.
   *
   * @param {number} patch - The number of the patch.
   * @returns {boolean} Whether the clover was taken.
   */
  takeClover(patch: number): boolean {
    const step: number = this.#getStep();
    const regrowStep: number | undefined = this.#regrowSteps[patch];
    if (regrowStep === undefined || regrowStep > step) {
      return false;
    }
    this.#regrowSteps[patch] = step + REGROW_STEPS;
    return true;
  }

  /**
   * Has a player pick something, if it has room for the item it is to get,
   * if any; silver coins need no room, and come with what else a container
   * holds.  A four-leaf clover so picked is gone from its patch until it
   * regrows {@link CLOVER_REGROW_DURATION} seconds later, an item picked up
   * from the ground is gone from there, and a container so looted holds
   * nothing from then on.  A container that holds nothing gives nothing.
   *
   * @param {Player} player - The player.
   * @param {PickTarget} target - What it picks, as it is now.
   */
  pick(player: Player, target: PickTarget): void {
    const silver: number = target.type === 'container' ? target.silver : 0;
    if (
      (target.kind === null && silver === 0) ||
      (target.kind !== null && !player.hasRoom)
    ) {
      return;
    }
    this.#takers[target.type](target.id);
    if (target.kind !== null) {
      player.addItem(target.kind);
    }
    player.earnSilver(silver);
  }

  /**
   * Has a player put the item of a slot of its inventory down where it
   * stands now, the items after it closing up, if the slot holds one.  The
   * item lies there for {@link GROUND_ITEM_DURATION} seconds.
   *
   * @param {Player} player - The player.
   * @param {number} slot - The number of the slot, from 0.
   */
  drop(player: Player, slot: number): void {
    const kind: ItemKindId | undefined = player.takeSlot(slot);
    if (kind === undefined) {
      return;
    }
    this.#lay(player, kind);
  }

  /**
   * Gives a player an item, which is laid at its feet as if put down if
   * its inventory has no room for it.
   *
   * @param {Player} player - The player.
   * @param {ItemKindId} kind - The kind of the item.
   */
  give(player: Player, kind: ItemKindId): void {
    if (!player.addItem(kind)) {
      this.#lay(player, kind);
    }
  }

  /**
   * Lays an item on the ground where a player stands now, for as long as an
   * item put down lies there.
   *
   * @param {Player} player - The player.
   * @param {ItemKindId} kind - The kind of the item.
   */
  #lay(player: Player, kind: ItemKindId): void {
    const { x, z } = player.mover.motion;
    this.#lyingItems.push({
      item: {
        id: ++this.#lastItemId,
        kind,
        x: roundPlace(x),
        z: roundPlace(z),
      },
      goneStep: this.#getStep() + GROUND_ITEM_STEPS,
    });
  }
}

/**
 * Rounds where an item is put down along an axis, so that it takes few
 * digits to tell.
 *
 * @param {number} value - The position along the axis, in meters.
 * @returns {number} The rounded position.
 */
function roundPlace(value: number): number {
  const scale: number = 10 ** ITEM_PLACE_PRECISION;
  // Adding zero turns a negative zero into a plain one.
  return Math.round(value * scale) / scale + 0;
}
