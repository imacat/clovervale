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
 * @module client/space-action Working out what the space bar makes the
 *   player of the page do.
 */

import { canInteract, findInteractable, hasRoom } from '@clovervale/shared';
import type {
  ContainerTarget,
  Interactable,
  InteractionInput,
  ItemKindId,
  MapId,
  MonsterState,
  PlayerMotion,
  Villager,
  WorldItems,
} from '@clovervale/shared';

import { MAP_VIEWS } from './map-views.ts';

/**
 * What the space bar makes a player do, and the input it gives the player
 * for that: nothing, as it cannot interact; talk to a villager; drink from
 * the fountain; go down into the cave or climb out of it; slash; open a
 * container whose contents it can take; find a container empty; pick up an
 * item; or find that the item, or what is in the container, does not fit
 * in its inventory.
 */
export type SpaceAction = { readonly input: InteractionInput } & (
  | { readonly type: 'nothing' | 'drink' | 'enter' | 'climb' | 'slash' }
  | { readonly type: 'talk'; readonly villager: Villager }
  | {
      readonly type: 'open' | 'empty' | 'fullContainer';
      readonly container: ContainerTarget;
    }
  | { readonly type: 'pick' | 'full'; readonly item: ItemKindId }
);

/** What tells what the space bar makes a player do. */
export interface SpaceContext {
  /** The motion of the player as predicted. */
  readonly motion: PlayerMotion;
  /**
   * The number of the step of the server an interaction would start at,
   * which tells where Toby would be then.
   */
  readonly step: number;
  /** What there is to pick in the map, as the server last told. */
  readonly world: WorldItems;
  /** What the player carries, as the server last told. */
  readonly inventory: readonly ItemKindId[];
  /** The map the player is in. */
  readonly map: MapId;
  /** The monsters in the map, as the server last told. */
  readonly monsters: readonly MonsterState[];
}

/**
 * Works out what the space bar makes a player do now.
 *
 * @param {SpaceContext} context - What tells what it does.
 * @returns {SpaceAction} What the player does, with what it would use as
 *   {@link findInteractable} tells, silver coins fitting in any inventory.
 */
export function findSpaceAction(context: SpaceContext): SpaceAction {
  const { motion, step, world, inventory, map, monsters } = context;
  if (!canInteract(motion)) {
    return { type: 'nothing', input: 'interact' };
  }
  const target: Interactable | null = findInteractable(motion, step, {
    map,
    monsters,
    items: world,
  });
  return target === null
    ? { type: 'slash', input: 'interact' }
    : findTargetAction(target, hasRoom(inventory));
}

/**
 * Works out what using something makes a player do.
 *
 * @param {Interactable} target - What the player would use.
 * @param {boolean} isRoom - Whether the inventory of the player has room
 *   for another item.
 * @returns {SpaceAction} What the player does, with the input that uses
 *   it, silver coins fitting in any inventory.
 */
function findTargetAction(target: Interactable, isRoom: boolean): SpaceAction {
  const { input } = target;
  switch (target.type) {
    case 'fountain':
      return { type: 'drink', input };
    case 'villager':
      return { type: 'talk', input, villager: target.villager };
    case 'passage':
      return { type: MAP_VIEWS[target.destination].entryPrompt, input };
    case 'patch':
    case 'ground':
      return { type: isRoom ? 'pick' : 'full', input, item: target.kind };
    case 'container':
      // A container that gives no item gives only silver coins, if any,
      // which need no room.
      if (target.kind === null) {
        return {
          type: target.silver > 0 ? 'open' : 'empty',
          input,
          container: target,
        };
      }
      return {
        type: isRoom ? 'open' : 'fullContainer',
        input,
        container: target,
      };
  }
}
