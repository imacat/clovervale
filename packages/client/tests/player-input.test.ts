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
 * @module client/tests/player-input Tests for reading the keys of a player.
 */

import { describe, expect, it } from 'vitest';

import {
  CAVE_CONTAINERS,
  CAVE_PASSAGE,
  CLOVER_PATCHES,
  PLAYER_RADIUS,
  VILLAGERS,
  NO_WORLD_ITEMS,
  createMotion,
  findPlacement,
  locateVillager,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GroundVector,
  MonsterState,
  PlayerMotion,
} from '@clovervale/shared';
import { CAVE_ROPE } from '../../shared/src/cave.ts';
import { killMotion } from '../../shared/src/player-motion.ts';

import { findSpaceAction } from '../src/space-action.ts';
import type { SpaceAction, SpaceContext } from '../src/space-action.ts';
import {
  MoveKeys,
  chooseSpaceInput,
  findKeyCommand,
} from '../src/player-input.ts';

/** The heading of a camera that looks toward -Z, in degrees. */
const NORTHWARD = 180;

/**
 * Works out what the space bar makes a player do, at the first step, with
 * nothing to pick and nothing carried, in the village and without monsters,
 * unless told otherwise.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {Partial<SpaceContext>} [context] - What differs from that.
 * @returns {SpaceAction} What the player does.
 */
function findAction(
  motion: PlayerMotion,
  context: Partial<SpaceContext> = {},
): SpaceAction {
  return findSpaceAction({
    step: 0,
    world: NO_WORLD_ITEMS,
    inventory: [],
    map: 'village',
    monsters: [],
    ...context,
    motion,
  });
}

/**
 * Resolves the direction a set of keys moves the player in.
 *
 * @param {string[]} codes - The codes of the keys held down.
 * @param {number} heading - The heading of the camera, in degrees.
 * @returns {{ x: number, z: number }} The direction.
 */
function resolveKeys(
  codes: string[],
  heading: number,
): { x: number; z: number } {
  const keys = new MoveKeys();
  for (const code of codes) {
    keys.pressKey(code);
  }
  return keys.resolveDirection(heading);
}

describe('findKeyCommand', () => {
  it('knows the keys that move the player', () => {
    expect(findKeyCommand('KeyW')).toBe('forward');
    expect(findKeyCommand('KeyS')).toBe('backward');
    expect(findKeyCommand('KeyA')).toBe('left');
    expect(findKeyCommand('KeyD')).toBe('right');
  });

  it('knows the key the player interacts with', () => {
    expect(findKeyCommand('Space')).toBe('interact');
  });

  it('does not know the keys the game does not use', () => {
    expect(findKeyCommand('KeyQ')).toBeNull();
    expect(findKeyCommand('KeyI')).toBeNull();
    expect(findKeyCommand('Enter')).toBeNull();
  });

  it('leaves the arrow keys to the camera', () => {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(findKeyCommand(code)).toBeNull();
    }
  });
});

describe('chooseSpaceInput', () => {
  /** Where the patch of clover east of the fountain is. */
  const PATCH: GroundVector = CLOVER_PATCHES[6] ?? { x: NaN, z: NaN };

  /** A player south of that patch, facing it. */
  const BY_PATCH: PlayerMotion = createMotion(
    { x: PATCH.x, z: PATCH.z + 1 },
    180,
  );

  it('picks while the clover of the patch is within reach', () => {
    const world = { clovers: [6], items: [] };
    expect(chooseSpaceInput(findAction(BY_PATCH, { world }))).toEqual({
      type: 'pick',
    });
  });

  it('interacts while there is nothing to pick within reach', () => {
    expect(chooseSpaceInput(findAction(BY_PATCH))).toEqual({
      type: 'interact',
    });
  });

  it('interacts while the player cannot interact', () => {
    const world = { clovers: [6], items: [] };
    expect(
      chooseSpaceInput(findAction(killMotion(BY_PATCH), { world })),
    ).toEqual({
      type: 'interact',
    });
  });

  it('picks before the porch of Martha while she is away', () => {
    const porch: GroundVector = findPlacement('martha');
    const martha: MonsterState = {
      id: 2,
      kind: 'martha',
      x: porch.x,
      z: porch.z + 5,
      yaw: 0,
      action: 'Idle',
      actionCount: 0,
      health: 100,
      mode: 'chase',
    };
    const item = { id: 7, kind: 'clover' as const, x: porch.x, z: porch.z };
    const world = { clovers: [], items: [item] };
    const pose: PlayerMotion = createMotion(
      { x: porch.x, z: porch.z + 0.8 },
      180,
    );
    expect(
      chooseSpaceInput(findAction(pose, { world, monsters: [martha] })),
    ).toEqual({
      type: 'pick',
    });
  });
});

describe('chooseSpaceInput by the ways into and out of the cave', () => {
  /** The middle of the burrow of the wild dog. */
  const BURROW: GroundVector = findPlacement('spawn-stones');

  /** A player in the burrow, facing north. */
  const IN_BURROW: PlayerMotion = createMotion(BURROW, 180);

  /**
   * Makes the wild dog, a meter from the burrow.
   *
   * @param {number} z - How far south of the burrow it stands, in meters.
   * @param {boolean} isDead - Whether it lies dead.
   * @returns {MonsterState} The dog.
   */
  function placeDog(z: number, isDead: boolean): MonsterState {
    return {
      id: 1,
      kind: 'village-dog',
      x: BURROW.x,
      z: BURROW.z + z,
      yaw: 0,
      action: isDead ? 'Die' : 'Idle',
      actionCount: 0,
      health: isDead ? 0 : 60,
      mode: isDead ? 'dead' : 'idle',
    };
  }

  it('goes down the burrow, with no dog about', () => {
    expect(chooseSpaceInput(findAction(IN_BURROW))).toEqual({ type: 'travel' });
  });

  it('goes down the burrow, with the living dog behind the player', () => {
    const dog: MonsterState = placeDog(1, false);
    expect(
      chooseSpaceInput(findAction(IN_BURROW, { monsters: [dog] })),
    ).toEqual({ type: 'travel' });
  });

  it('slashes at the living dog in front of the player', () => {
    const dog: MonsterState = placeDog(-1, false);
    expect(
      chooseSpaceInput(findAction(IN_BURROW, { monsters: [dog] })),
    ).toEqual({ type: 'interact' });
  });

  it('goes down the burrow by the dead dog in front of the player', () => {
    const dog: MonsterState = placeDog(-1, true);
    expect(
      chooseSpaceInput(findAction(IN_BURROW, { monsters: [dog] })),
    ).toEqual({ type: 'travel' });
  });

  it('climbs up the rope in the cave, facing it', () => {
    const byRope: PlayerMotion = createMotion(
      { x: CAVE_ROPE.x + 0.8, z: CAVE_ROPE.z },
      -90,
    );
    expect(chooseSpaceInput(findAction(byRope, { map: 'cave' }))).toEqual({
      type: 'travel',
    });
    expect(chooseSpaceInput(findAction(byRope))).toEqual({ type: 'interact' });
  });

  it('does nothing of the kind while the player cannot interact', () => {
    expect(
      chooseSpaceInput(findAction(killMotion(IN_BURROW))),
    ).toEqual({ type: 'interact' });
  });
});

describe('MoveKeys', () => {
  it('stands still without keys', () => {
    expect(resolveKeys([], NORTHWARD)).toEqual({ x: 0, z: 0 });
  });

  it('moves away from the camera with the forward keys', () => {
    expect(resolveKeys(['KeyW'], NORTHWARD)).toEqual({ x: 0, z: -1 });
  });

  it('moves toward the camera with the backward keys', () => {
    expect(resolveKeys(['KeyS'], NORTHWARD)).toEqual({ x: 0, z: 1 });
  });

  it('moves to the sides of the view with the side keys', () => {
    expect(resolveKeys(['KeyA'], NORTHWARD)).toEqual({ x: -1, z: 0 });
    expect(resolveKeys(['KeyD'], NORTHWARD)).toEqual({ x: 1, z: 0 });
  });

  it('follows the heading of the camera', () => {
    // A camera that looks toward +X has +Z on its right.
    expect(resolveKeys(['KeyW'], 90)).toEqual({ x: 1, z: 0 });
    expect(resolveKeys(['KeyD'], 90)).toEqual({ x: 0, z: 1 });
    expect(resolveKeys(['KeyW'], 0)).toEqual({ x: 0, z: 1 });
    expect(resolveKeys(['KeyD'], 0)).toEqual({ x: -1, z: 0 });
  });

  it('moves diagonally, one meter long, with two keys', () => {
    const direction = resolveKeys(['KeyW', 'KeyD'], NORTHWARD);
    expect(direction).toEqual({ x: 0.707, z: -0.707 });
  });

  it('cancels opposite keys out', () => {
    expect(resolveKeys(['KeyW', 'KeyS'], NORTHWARD)).toEqual({
      x: 0,
      z: 0,
    });
    expect(resolveKeys(['KeyA', 'KeyD', 'KeyS'], NORTHWARD)).toEqual({
      x: 0,
      z: 1,
    });
  });

  it('stands still once all keys are released at once', () => {
    const keys = new MoveKeys();
    keys.pressKey('KeyW');
    keys.pressKey('KeyD');
    keys.releaseAllKeys();
    expect(keys.resolveDirection(NORTHWARD)).toEqual({ x: 0, z: 0 });
  });

  it('is not moved by the other keys', () => {
    expect(resolveKeys(['Space', 'KeyQ'], NORTHWARD)).toEqual({ x: 0, z: 0 });
    expect(
      resolveKeys(['ArrowUp', 'ArrowLeft', 'ArrowDown'], NORTHWARD),
    ).toEqual({ x: 0, z: 0 });
  });

  it('gives the same direction for headings that barely differ', () => {
    const direction = resolveKeys(['KeyW'], 37);
    expect(resolveKeys(['KeyW'], 37 + 1e-9)).toEqual(direction);
  });
});

describe('chooseSpaceInput in the cave', () => {
  /**
   * Makes a player in front of a container, close by it, facing it.
   *
   * @param {CaveContainer} container - The container.
   * @returns {PlayerMotion} The player.
   */
  function standBefore(container: CaveContainer): PlayerMotion {
    const yaw: number = (container.yaw * Math.PI) / 180;
    return createMotion(
      {
        x: container.x + Math.sin(yaw) * 0.75,
        z: container.z + Math.cos(yaw) * 0.75,
      },
      container.yaw + 180,
    );
  }

  it('interacts before the prisoner, to talk to him through his bars', () => {
    const edwin = VILLAGERS.find(({ id }) => id === 'edwin');
    const at: GroundVector =
      edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0, []);
    const before: PlayerMotion = createMotion(
      { x: at.x, z: CAVE_PASSAGE.north + PLAYER_RADIUS + 0.1 },
      180,
    );
    expect(chooseSpaceInput(findAction(before, { map: 'cave' }))).toEqual({
      type: 'interact',
    });
  });

  it('picks before a container, full or not', () => {
    const looted: number[] = CAVE_CONTAINERS.map((_, id: number) => id);
    for (const container of CAVE_CONTAINERS) {
      const motion: PlayerMotion = standBefore(container);
      expect(chooseSpaceInput(findAction(motion, { map: 'cave' }))).toEqual({
        type: 'pick',
      });
      expect(
        chooseSpaceInput(
          findAction(motion, {
            world: { ...NO_WORLD_ITEMS, looted },
            map: 'cave',
          }),
        ),
      ).toEqual({ type: 'pick' });
    }
  });
});
