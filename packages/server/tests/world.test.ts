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
 * @module server/tests/world Tests for the world and its players.
 */

import { describe, expect, it } from 'vitest';

import {
  APPEARANCE_COUNT,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  SLASH_DURATION,
  WALK_SPEED,
  createInteractMessage,
  createMoveMessage,
} from '@clovervale/shared';
import type { GroundVector, PlayerState } from '@clovervale/shared';

import { World } from '../src/world.ts';

/** The number of simulation steps a slash lasts. */
const SLASH_STEPS: number = Math.round(SLASH_DURATION * SIMULATION_RATE);

/**
 * Moves a world several steps of the simulation forward.
 *
 * @param {World} world - The world.
 * @param {number} count - The number of steps.
 */
function stepTimes(world: World, count: number): void {
  for (let step = 0; step < count; step++) {
    world.step();
  }
}

/** The number of the last input a test has given a world. */
let lastSequence = 0;

/**
 * Tells a world, as the next input of a player, which way the player wants
 * to move from the next step on.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} direction - The direction to move in.
 * @returns {boolean} Whether the world accepted the input.
 */
function steerPlayer(
  world: World,
  id: number,
  direction: GroundVector,
): boolean {
  const stamp = { sequence: ++lastSequence, after: 0 };
  return world.receiveInput(id, createMoveMessage(stamp, direction));
}

/**
 * Tells a world, as the next input of a player, that the player interacts
 * at the next step.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @returns {boolean} Whether the world accepted the input.
 */
function interactPlayer(world: World, id: number): boolean {
  const stamp = { sequence: ++lastSequence, after: 0 };
  return world.receiveInput(id, createInteractMessage(stamp));
}

/**
 * Finds a player in a world as it is now.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @returns {PlayerState} The player.
 * @throws {Error} If the player is not in the world.
 */
function findPlayer(world: World, id: number): PlayerState {
  const player: PlayerState | undefined = world
    .listPlayers()
    .find((candidate: PlayerState) => candidate.id === id);
  if (player === undefined) {
    throw new Error(`Player ${String(id)} is not in the world.`);
  }
  return player;
}

/**
 * Measures how far apart two players stand.
 *
 * @param {PlayerState} a - One player.
 * @param {PlayerState} b - The other player.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: PlayerState, b: PlayerState): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('a player coming into the world', () => {
  it('gets an identifier of its own', () => {
    const world = new World();
    const first: PlayerState = world.addPlayer();
    world.removePlayer(first.id);
    const second: PlayerState = world.addPlayer();
    const third: PlayerState = world.addPlayer();
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  });

  it('gets the lowest appearance not in use', () => {
    const world = new World();
    const players: PlayerState[] = [1, 2, 3, 4].map(() => world.addPlayer());
    expect(players.map((player: PlayerState) => player.appearance)).toEqual(
      [1, 2, 3, 4],
    );
    world.removePlayer(players[1]?.id ?? 0);
    expect(world.addPlayer().appearance).toBe(2);
    expect(world.addPlayer().appearance).toBe(5);
  });

  it('shares an appearance once all are in use', () => {
    const world = new World();
    const appearances: number[] = Array.from(
      { length: APPEARANCE_COUNT * 2 + 1 },
      () => world.addPlayer().appearance,
    );
    const all: number[] = Array.from(
      { length: APPEARANCE_COUNT },
      (_: unknown, index: number) => index + 1,
    );
    expect(appearances).toEqual([...all, ...all, 1]);
  });

  it('idles on the plaza in front of the fountain, facing it', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    expect(player.action).toBe('Idle');
    expect(player.z).toBeGreaterThan(PLAZA_CENTRE.z);
    expect(Math.hypot(player.x - PLAZA_CENTRE.x, player.z - PLAZA_CENTRE.z))
      .toBeLessThan(8);
    expect(player.yaw).toBe(180);
  });

  it('stands clear of everyone else', () => {
    const world = new World();
    const players: PlayerState[] = Array.from({ length: 20 }, () =>
      world.addPlayer(),
    );
    players.forEach((player: PlayerState, index: number) => {
      for (const other of players.slice(index + 1)) {
        expect(measureDistance(player, other)).toBeGreaterThan(1);
      }
    });
  });

  it('takes the place of a player who has left', () => {
    const world = new World();
    const first: PlayerState = world.addPlayer();
    world.addPlayer();
    world.removePlayer(first.id);
    const third: PlayerState = world.addPlayer();
    expect({ x: third.x, z: third.z }).toEqual({ x: first.x, z: first.z });
  });

  it('keeps away from a player who has walked to where it would stand', () => {
    const world = new World();
    const first: PlayerState = world.addPlayer();
    const second: PlayerState = world.addPlayer();
    world.removePlayer(first.id);
    // The second player walks to where the first one stood.
    steerPlayer(world, second.id, { x: first.x - second.x, z: 0 });
    const steps: number =
      (measureDistance(first, second) / WALK_SPEED) * SIMULATION_RATE;
    stepTimes(world, Math.round(steps));
    const third: PlayerState = world.addPlayer();
    expect(measureDistance(third, findPlayer(world, second.id)))
      .toBeGreaterThan(1);
  });
});

describe('the players in the world', () => {
  it('are all listed, until they leave', () => {
    const world = new World();
    const first: PlayerState = world.addPlayer();
    const second: PlayerState = world.addPlayer();
    expect(world.listPlayers()).toEqual([first, second]);
    world.removePlayer(first.id);
    expect(world.listPlayers()).toEqual([second]);
  });

  it('stay as they are without input', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    stepTimes(world, SIMULATION_RATE);
    expect(findPlayer(world, player.id)).toEqual(player);
  });
});

describe('a player who wants to move', () => {
  it('stays put until the next step', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    steerPlayer(world, player.id, { x: 1, z: 0 });
    expect(findPlayer(world, player.id)).toEqual(player);
  });

  it('walks at walking speed, facing the way it goes', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    steerPlayer(world, start.id, { x: 1, z: 0 });
    stepTimes(world, SIMULATION_RATE * 2);
    const player: PlayerState = findPlayer(world, start.id);
    expect(player.x).toBeCloseTo(start.x + WALK_SPEED * 2);
    expect(player.z).toBeCloseTo(start.z);
    expect(player.yaw).toBeCloseTo(90);
    expect(player.action).toBe('Walk');
  });

  it('walks no faster for a longer direction', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    steerPlayer(world, start.id, { x: -30, z: 40 });
    stepTimes(world, SIMULATION_RATE);
    const player: PlayerState = findPlayer(world, start.id);
    expect(measureDistance(player, start)).toBeCloseTo(WALK_SPEED);
    expect(player.x).toBeLessThan(start.x);
    expect(player.z).toBeGreaterThan(start.z);
  });

  it('turns when its direction changes', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    steerPlayer(world, start.id, { x: 1, z: 0 });
    stepTimes(world, 3);
    steerPlayer(world, start.id, { x: 0, z: 1 });
    world.step();
    expect(findPlayer(world, start.id).yaw).toBeCloseTo(0);
  });

  it('stops where it is, facing the same way, and idles', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    steerPlayer(world, start.id, { x: 1, z: 0 });
    stepTimes(world, 5);
    const walking: PlayerState = findPlayer(world, start.id);
    steerPlayer(world, start.id, { x: 0, z: 0 });
    stepTimes(world, 5);
    const player: PlayerState = findPlayer(world, start.id);
    expect(player.action).toBe('Idle');
    expect(player.x).toBe(walking.x);
    expect(player.yaw).toBe(walking.yaw);
  });

  it('moves alone', () => {
    const world = new World();
    const mover: PlayerState = world.addPlayer();
    const other: PlayerState = world.addPlayer();
    steerPlayer(world, mover.id, { x: 0, z: 1 });
    stepTimes(world, 5);
    expect(findPlayer(world, other.id)).toEqual(other);
  });

  it('is ignored once it has left', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    world.removePlayer(player.id);
    expect(steerPlayer(world, player.id, { x: 0, z: 1 })).toBe(false);
    expect(interactPlayer(world, player.id)).toBe(false);
    world.step();
    expect(world.listPlayers()).toEqual([]);
    expect(world.findProgress(player.id)).toBeNull();
  });
});

describe('a player who interacts', () => {
  it('slashes from the next step, for as long as a slash lasts', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    interactPlayer(world, player.id);
    expect(findPlayer(world, player.id).action).toBe('Idle');
    world.step();
    expect(findPlayer(world, player.id).action).toBe('Slash');
    stepTimes(world, SLASH_STEPS - 1);
    expect(findPlayer(world, player.id).action).toBe('Slash');
    world.step();
    expect(findPlayer(world, player.id).action).toBe('Idle');
  });

  it('slashes once for every request', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    interactPlayer(world, player.id);
    stepTimes(world, SLASH_STEPS + 1);
    stepTimes(world, SIMULATION_RATE);
    expect(findPlayer(world, player.id).action).toBe('Idle');
  });

  it('carries on with its slash alone when asked again during it', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    interactPlayer(world, player.id);
    stepTimes(world, SLASH_STEPS / 2);
    const slashing: PlayerState = findPlayer(world, player.id);
    interactPlayer(world, player.id);
    stepTimes(world, SLASH_STEPS / 2);
    expect(findPlayer(world, player.id)).toEqual(slashing);
    world.step();
    expect(findPlayer(world, player.id).action).toBe('Idle');
    stepTimes(world, SLASH_STEPS);
    expect(findPlayer(world, player.id).action).toBe('Idle');
  });

  it('stands still without turning while it slashes', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    steerPlayer(world, start.id, { x: 1, z: 0 });
    stepTimes(world, 4);
    const walking: PlayerState = findPlayer(world, start.id);
    interactPlayer(world, start.id);
    steerPlayer(world, start.id, { x: 0, z: 1 });
    stepTimes(world, SLASH_STEPS);
    const player: PlayerState = findPlayer(world, start.id);
    expect(player.action).toBe('Slash');
    expect({ x: player.x, z: player.z }).toEqual({
      x: walking.x,
      z: walking.z,
    });
    expect(player.yaw).toBe(walking.yaw);
  });

  it('walks on after the slash the way it wants to move by then', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    interactPlayer(world, start.id);
    world.step();
    steerPlayer(world, start.id, { x: 1, z: 0 });
    stepTimes(world, 3);
    steerPlayer(world, start.id, { x: 0, z: 1 });
    stepTimes(world, SLASH_STEPS - 3);
    const player: PlayerState = findPlayer(world, start.id);
    expect(player.action).toBe('Walk');
    expect(player.yaw).toBeCloseTo(0);
    expect(player.x).toBeCloseTo(start.x);
    expect(player.z).toBeCloseTo(start.z + WALK_SPEED / SIMULATION_RATE);
  });

  it('idles after the slash if it has stopped wanting to move', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    steerPlayer(world, start.id, { x: 1, z: 0 });
    world.step();
    interactPlayer(world, start.id);
    world.step();
    steerPlayer(world, start.id, { x: 0, z: 0 });
    stepTimes(world, SLASH_STEPS);
    expect(findPlayer(world, start.id).action).toBe('Idle');
  });

  it('can slash again as soon as the slash is over', () => {
    const world = new World();
    const player: PlayerState = world.addPlayer();
    interactPlayer(world, player.id);
    stepTimes(world, SLASH_STEPS + 1);
    interactPlayer(world, player.id);
    world.step();
    expect(findPlayer(world, player.id).action).toBe('Slash');
  });
});

describe('the action count of a player', () => {
  it('goes up whenever the player starts an action', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    const counts: number[] = [start.actionCount];
    const record = (): void => {
      counts.push(findPlayer(world, start.id).actionCount - (counts[0] ?? 0));
    };
    steerPlayer(world, start.id, { x: 1, z: 0 });
    world.step();
    record();
    interactPlayer(world, start.id);
    world.step();
    record();
    steerPlayer(world, start.id, { x: 0, z: 0 });
    stepTimes(world, SLASH_STEPS);
    record();
    expect(counts.slice(1)).toEqual([1, 2, 3]);
  });

  it('stays the same while the player carries on with an action', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    stepTimes(world, 5);
    expect(findPlayer(world, start.id).actionCount).toBe(start.actionCount);
    steerPlayer(world, start.id, { x: 1, z: 0 });
    world.step();
    const walking: PlayerState = findPlayer(world, start.id);
    steerPlayer(world, start.id, { x: 0, z: 1 });
    stepTimes(world, 5);
    expect(findPlayer(world, start.id).actionCount).toBe(walking.actionCount);
    interactPlayer(world, start.id);
    world.step();
    const slashing: PlayerState = findPlayer(world, start.id);
    interactPlayer(world, start.id);
    stepTimes(world, SLASH_STEPS - 1);
    expect(findPlayer(world, start.id).actionCount).toBe(
      slashing.actionCount,
    );
  });

  it('tells two slashes in a row apart', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    interactPlayer(world, start.id);
    world.step();
    const first: PlayerState = findPlayer(world, start.id);
    stepTimes(world, SLASH_STEPS);
    interactPlayer(world, start.id);
    world.step();
    const second: PlayerState = findPlayer(world, start.id);
    expect(second.action).toBe('Slash');
    expect(second.actionCount).toBeGreaterThan(first.actionCount);
  });
});

describe('the inputs of a player', () => {
  it('come into effect in turn, as far apart as they tell', () => {
    const world = new World();
    const start: PlayerState = world.addPlayer();
    const east = createMoveMessage({ sequence: 1, after: 0 }, { x: 1, z: 0 });
    const stop = createMoveMessage({ sequence: 2, after: 3 }, { x: 0, z: 0 });
    expect(world.receiveInput(start.id, east)).toBe(true);
    expect(world.receiveInput(start.id, stop)).toBe(true);
    stepTimes(world, 10);
    const player: PlayerState = findPlayer(world, start.id);
    expect(player.action).toBe('Idle');
    expect(player.x).toBeCloseTo(start.x + (WALK_SPEED * 3) / SIMULATION_RATE);
  });

  it('are told with how far the player has got with them', () => {
    const world = new World();
    const { id }: PlayerState = world.addPlayer();
    stepTimes(world, 2);
    expect(world.findProgress(id)).toMatchObject({ sequence: 0, steps: 2 });
    world.receiveInput(
      id,
      createMoveMessage({ sequence: 1, after: 0 }, { x: 0, z: 1 }),
    );
    expect(world.findProgress(id)).toMatchObject({ sequence: 0, steps: 2 });
    stepTimes(world, 3);
    const player: PlayerState = findPlayer(world, id);
    expect(world.findProgress(id)).toEqual({
      sequence: 1,
      steps: 3,
      motion: {
        x: player.x,
        z: player.z,
        yaw: player.yaw,
        action: 'Walk',
        actionCount: player.actionCount,
        direction: { x: 0, z: 1 },
        isInteracting: false,
        slashSteps: 0,
      },
    });
  });

  it('are refused when they are not numbered upwards', () => {
    const world = new World();
    const { id }: PlayerState = world.addPlayer();
    const first = createInteractMessage({ sequence: 5, after: 0 });
    expect(world.receiveInput(id, first)).toBe(true);
    expect(world.receiveInput(id, first)).toBe(false);
    const earlier = createInteractMessage({ sequence: 4, after: 0 });
    expect(world.receiveInput(id, earlier)).toBe(false);
  });
});
