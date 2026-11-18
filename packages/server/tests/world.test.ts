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
  DEATH_DURATION,
  MONSTER_HEALTH,
  PLAYER_HEALTH,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  SLASH_DAMAGE,
  SLASH_DURATION,
  SLASH_REACH,
  SPAWN_POINT_COUNT,
  WALK_SPEED,
  createInteractMessage,
  createMoveMessage,
  findSpawnPoint,
  findVillagePath,
  isWithinStrike,
} from '@clovervale/shared';
import type {
  GameEvent,
  GroundVector,
  MonsterState,
  PlayerState,
} from '@clovervale/shared';

import {
  MONSTER_APPROACH_DISTANCE,
  MONSTER_ATTACK_DAMAGE,
  MONSTER_ID,
} from '../src/monster.ts';
import { LAG_COMPENSATION_LIMIT, World } from '../src/world.ts';

/** The number of simulation steps a dead player lies where it fell. */
const DEATH_STEPS: number = DEATH_DURATION * SIMULATION_RATE;

/** The number of simulation steps a slash lasts. */
const SLASH_STEPS: number = Math.round(SLASH_DURATION * SIMULATION_RATE);

/** How long one step of the simulation lasts, in milliseconds. */
const STEP_MILLISECONDS: number = 1000 / SIMULATION_RATE;

/** A world that records a snapshot after every step, as a server would. */
class RecordingWorld extends World {
  /** The number of steps the world has taken. */
  stepCount = 0;

  /**
   * The time of the latest step on the clock of the server.
   *
   * @returns {number} The time, in milliseconds.
   */
  get time(): number {
    return this.stepCount * STEP_MILLISECONDS;
  }

  /** Moves the world one step forward, and records a snapshot. */
  override step(): void {
    super.step();
    this.stepCount++;
    this.recordSnapshot();
  }
}

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
 * @param {number | null} [viewTime] - The time on the clock of the server
 *   to judge the interaction on, or `null` for none, by default.
 * @returns {boolean} Whether the world accepted the input.
 */
function interactPlayer(
  world: World,
  id: number,
  viewTime: number | null = null,
): boolean {
  const stamp = { sequence: ++lastSequence, after: 0 };
  return world.receiveInput(id, createInteractMessage(stamp, viewTime));
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
 * Measures how far apart two players, or a player and the monster, stand.
 *
 * @param {GroundVector} a - One of them.
 * @param {GroundVector} b - The other.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** How far a walking player goes in one simulation step, in metres. */
const STEP_DISTANCE: number = WALK_SPEED / SIMULATION_RATE;

/** A point near the home of the monster, where nothing stands. */
const NEAR_MONSTER: GroundVector = { x: 8, z: 9 };

/**
 * Makes a source of random numbers that gives the same numbers every time.
 *
 * @returns {() => number} Gives a number from 0 up to but not including 1.
 */
function createRandom(): () => number {
  let seed = 1;
  return (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

/**
 * Finds the monster in a world as it is now.
 *
 * @param {World} world - The world.
 * @returns {MonsterState} The monster.
 * @throws {Error} If the monster is not to be seen.
 */
function findMonster(world: World): MonsterState {
  const [monster] = world.listMonsters();
  if (monster === undefined) {
    throw new Error('The monster is not to be seen.');
  }
  return monster;
}

/**
 * Walks a player of a world to a point around the obstacles, steering it
 * at every step, and stops it there.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} to - The point.
 * @throws {Error} If the player finds no way there.
 */
function walkPlayer(world: World, id: number, to: GroundVector): void {
  const path: GroundVector[] | null = findVillagePath(
    findPlayer(world, id),
    to,
  );
  if (path === null) {
    throw new Error('The player finds no way.');
  }
  for (const point of path) {
    for (let step = 0; step < 100 * SIMULATION_RATE; step++) {
      const { x, z }: PlayerState = findPlayer(world, id);
      if (Math.hypot(point.x - x, point.z - z) <= STEP_DISTANCE) {
        break;
      }
      steerPlayer(world, id, { x: point.x - x, z: point.z - z });
      world.step();
    }
  }
  steerPlayer(world, id, { x: 0, z: 0 });
  world.step();
}

/**
 * Walks a player of a world near the home of the monster, and waits there
 * until the monster has come to it.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 */
function meetMonster(world: World, id: number): void {
  walkPlayer(world, id, NEAR_MONSTER);
  for (let step = 0; step < 10 * SIMULATION_RATE; step++) {
    if (measureDistance(findPlayer(world, id), findMonster(world)) <= 1.2) {
      return;
    }
    world.step();
  }
}

/**
 * Walks a player of a world near the home of the monster, and waits there
 * until the monster has killed it.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @returns {PlayerState} The player as it was when it died.
 * @throws {Error} If the player does not die.
 */
function killPlayer(world: World, id: number): PlayerState {
  meetMonster(world, id);
  for (let step = 0; step < 30 * SIMULATION_RATE; step++) {
    world.step();
    const player: PlayerState = findPlayer(world, id);
    if (player.health === 0) {
      world.takeEvents();
      return player;
    }
  }
  throw new Error(`Player ${String(id)} does not die.`);
}

/**
 * Turns a player of a world towards a point, with a single step towards
 * it, and stops it.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} point - The point.
 */
function turnPlayer(world: World, id: number, point: GroundVector): void {
  const { x, z }: PlayerState = findPlayer(world, id);
  steerPlayer(world, id, { x: point.x - x, z: point.z - z });
  world.step();
  steerPlayer(world, id, { x: 0, z: 0 });
  world.step();
}

/** The monster at a moment. */
interface MonsterSighting {
  /** The time on the clock of the server, in milliseconds. */
  readonly time: number;
  /** The monster then. */
  readonly monster: MonsterState;
}

/**
 * Has the monster get away from a player that faces it: the monster comes
 * to the player, the player walks away until the monster gives up on it,
 * and then walks a few steps back after the monster as it goes home.
 *
 * @param {RecordingWorld} world - The world, which has no players yet.
 * @returns {{ id: number; viewTime: number }} The identifier of the player,
 *   and the latest time the monster was within reach of its slash, from
 *   where it stands now and facing the way it does.
 * @throws {Error} If the monster does not get away.
 */
function runGetaway(world: RecordingWorld): { id: number; viewTime: number } {
  const { id }: PlayerState = world.addPlayer();
  meetMonster(world, id);
  const sightings: MonsterSighting[] = [];
  const watch = (count: number): void => {
    for (let step = 0; step < count; step++) {
      world.step();
      sightings.push({ time: world.time, monster: findMonster(world) });
    }
  };
  steerPlayer(world, id, { x: -1, z: 0 });
  for (let step = 0; step < 30 * SIMULATION_RATE; step++) {
    if (findMonster(world).mode === 'return') {
      break;
    }
    watch(1);
  }
  steerPlayer(world, id, { x: 1, z: 0 });
  watch(6);
  steerPlayer(world, id, { x: 0, z: 0 });
  watch(1);
  const player: PlayerState = findPlayer(world, id);
  const near: MonsterSighting | undefined = sightings.findLast(
    ({ monster }: MonsterSighting) =>
      isWithinStrike(player, monster, SLASH_REACH),
  );
  if (
    near === undefined ||
    isWithinStrike(player, findMonster(world), SLASH_REACH)
  ) {
    throw new Error('The monster does not get away.');
  }
  return { id, viewTime: near.time };
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

describe('the monster in the world', () => {
  it('is seen at full health from the start', () => {
    expect(new World(createRandom()).listMonsters()).toEqual([
      expect.objectContaining({ id: MONSTER_ID, health: MONSTER_HEALTH }),
    ]);
  });

  it('comes to a player near its home', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    meetMonster(world, id);
    expect(
      measureDistance(findPlayer(world, id), findMonster(world)),
    ).toBeLessThanOrEqual(MONSTER_APPROACH_DISTANCE);
  });
});

describe('a slash', () => {
  it('hurts the monster in front of the player and within reach', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    meetMonster(world, id);
    turnPlayer(world, id, findMonster(world));
    world.takeEvents();
    interactPlayer(world, id);
    world.step();
    const events: GameEvent[] = world.takeEvents();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'hit',
        attacker: { kind: 'player', id },
        target: { kind: 'monster', id: MONSTER_ID },
        damage: SLASH_DAMAGE,
      }),
    );
    expect(findMonster(world).health).toBe(MONSTER_HEALTH - SLASH_DAMAGE);
  });

  it('misses the monster behind the player', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    meetMonster(world, id);
    const player: PlayerState = findPlayer(world, id);
    const monster: MonsterState = findMonster(world);
    turnPlayer(world, id, {
      x: 2 * player.x - monster.x,
      z: 2 * player.z - monster.z,
    });
    interactPlayer(world, id);
    world.step();
    expect(findMonster(world).health).toBe(MONSTER_HEALTH);
  });

  it('misses the monster out of reach', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    turnPlayer(world, id, findMonster(world));
    interactPlayer(world, id);
    stepTimes(world, 2);
    expect(findMonster(world).health).toBe(MONSTER_HEALTH);
    expect(world.takeEvents()).toEqual([]);
  });

  it('does not hurt another player', () => {
    const world = new World(createRandom());
    const first: PlayerState = world.addPlayer();
    const second: PlayerState = world.addPlayer();
    turnPlayer(world, first.id, second);
    expect(
      measureDistance(findPlayer(world, first.id), second),
    ).toBeLessThan(1.6);
    interactPlayer(world, first.id);
    stepTimes(world, 2);
    expect(findPlayer(world, second.id).health).toBe(PLAYER_HEALTH);
    expect(world.takeEvents()).toEqual([]);
  });

  it('can kill the monster, which is then gone for a while', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    meetMonster(world, id);
    let hits = 0;
    for (
      let tries = 0;
      tries < 20 && world.listMonsters().length > 0;
      tries++
    ) {
      const monster: MonsterState = findMonster(world);
      if (monster.mode === 'dead') {
        world.step();
        continue;
      }
      turnPlayer(world, id, monster);
      interactPlayer(world, id);
      stepTimes(world, SLASH_DURATION * SIMULATION_RATE + 1);
      hits = world
        .takeEvents()
        .filter((event: GameEvent) => event.target.kind === 'monster')
        .reduce((count: number) => count + 1, hits);
    }
    expect(hits).toBe(MONSTER_HEALTH / SLASH_DAMAGE);
    stepTimes(world, 5 * SIMULATION_RATE);
    expect(world.listMonsters()).toEqual([]);
  });
});

describe('a slash that names the time its peer showed', () => {
  it('hits the monster that was within reach then', () => {
    const world = new RecordingWorld(createRandom());
    const { id, viewTime } = runGetaway(world);
    world.takeEvents();
    interactPlayer(world, id, viewTime);
    world.step();
    expect(world.takeEvents()).toContainEqual(
      expect.objectContaining({
        attacker: { kind: 'player', id },
        target: { kind: 'monster', id: MONSTER_ID },
      }),
    );
    expect(world.findSlash(id)).toEqual({
      step: world.stepCount,
      rewind: world.time - viewTime,
      isHit: true,
    });
  });

  it('misses that monster when it names no time', () => {
    const world = new RecordingWorld(createRandom());
    const { id } = runGetaway(world);
    world.takeEvents();
    interactPlayer(world, id);
    world.step();
    expect(world.takeEvents()).not.toContainEqual(
      expect.objectContaining({ attacker: { kind: 'player', id } }),
    );
    expect(world.findSlash(id)).toEqual({
      step: world.stepCount,
      rewind: 0,
      isHit: false,
    });
  });

  it('is judged on the world as it is when it names a later time', () => {
    const world = new RecordingWorld(createRandom());
    const { id } = runGetaway(world);
    interactPlayer(world, id, world.time + 1000);
    world.step();
    expect(world.findSlash(id)).toMatchObject({ rewind: 0, isHit: false });
  });

  it('is judged no further back than the limit', () => {
    const world = new RecordingWorld(createRandom());
    const { id } = runGetaway(world);
    interactPlayer(world, id, 0);
    world.step();
    expect(world.findSlash(id)).toMatchObject({
      rewind: LAG_COMPENSATION_LIMIT,
    });
  });

  it('misses the monster that was within reach longer ago than that', () => {
    const world = new RecordingWorld(createRandom());
    const { id, viewTime } = runGetaway(world);
    stepTimes(world, LAG_COMPENSATION_LIMIT / STEP_MILLISECONDS);
    interactPlayer(world, id, viewTime);
    world.step();
    expect(world.findSlash(id)).toMatchObject({
      rewind: LAG_COMPENSATION_LIMIT,
      isHit: false,
    });
  });
});

describe('the judgement of the slashes of a player', () => {
  it('is not there before the first slash', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    world.step();
    expect(world.findSlash(id)).toBeNull();
  });

  it('is not there for a player not in the world', () => {
    expect(new World(createRandom()).findSlash(1)).toBeNull();
  });
});

describe('the attack of the monster', () => {
  it('hurts the player until it dies', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    meetMonster(world, id);
    world.takeEvents();
    const { health }: PlayerState = findPlayer(world, id);
    const hits: GameEvent[] = [];
    for (let step = 0; step < 30 * SIMULATION_RATE; step++) {
      world.step();
      hits.push(...world.takeEvents());
      if (findPlayer(world, id).health === 0) {
        break;
      }
    }
    expect(hits.length).toBe(Math.ceil(health / MONSTER_ATTACK_DAMAGE));
    for (const hit of hits) {
      expect(hit).toMatchObject({
        attacker: { kind: 'monster', id: MONSTER_ID },
        target: { kind: 'player', id },
      });
    }
    expect(
      hits.reduce((total: number, hit: GameEvent) => total + hit.damage, 0),
    ).toBe(health);
    expect(findPlayer(world, id).action).toBe('Die');
  });
});

describe('a dead player', () => {
  it('lies where it fell for as long as a death lasts', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    const fallen: PlayerState = killPlayer(world, id);
    expect(fallen).toMatchObject({ action: 'Die', health: 0 });
    stepTimes(world, DEATH_STEPS - 1);
    expect(findPlayer(world, id)).toEqual(fallen);
  });

  it('then comes back at a spawn point, idling at full health', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    const fallen: PlayerState = killPlayer(world, id);
    stepTimes(world, DEATH_STEPS);
    const player: PlayerState = findPlayer(world, id);
    expect(player).toMatchObject({
      action: 'Idle',
      actionCount: fallen.actionCount + 1,
      health: PLAYER_HEALTH,
    });
    const isSpawnPoint: boolean = Array.from(
      { length: SPAWN_POINT_COUNT },
      (_, index: number) => findSpawnPoint(index),
    ).some(
      (point: GroundVector) => point.x === player.x && point.z === player.z,
    );
    expect(isSpawnPoint).toBe(true);
  });

  it('neither moves, turns nor slashes', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    const fallen: PlayerState = killPlayer(world, id);
    steerPlayer(world, id, { x: fallen.x, z: fallen.z });
    interactPlayer(world, id);
    stepTimes(world, DEATH_STEPS - 1);
    expect(findPlayer(world, id)).toEqual(fallen);
    expect(
      world
        .takeEvents()
        .filter((event: GameEvent) => event.attacker.kind === 'player'),
    ).toEqual([]);
  });

  it('is neither hurt nor chased by the monster', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    killPlayer(world, id);
    const modes = new Set<string>();
    for (let step = 1; step < DEATH_STEPS; step++) {
      world.step();
      modes.add(findMonster(world).mode);
    }
    expect(world.takeEvents()).toEqual([]);
    expect(findMonster(world).mode).not.toBe('chase');
    expect(modes.has('return')).toBe(true);
  });

  it('comes back walking the way it was last told to move', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    killPlayer(world, id);
    steerPlayer(world, id, { x: 1, z: 0 });
    stepTimes(world, DEATH_STEPS);
    const back: PlayerState = findPlayer(world, id);
    world.step();
    expect(findPlayer(world, id)).toMatchObject({ yaw: 90, action: 'Walk' });
    expect(findPlayer(world, id).x).toBeCloseTo(back.x + STEP_DISTANCE);
  });

  it('comes back without the slash it was asked for', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    killPlayer(world, id);
    interactPlayer(world, id);
    stepTimes(world, DEATH_STEPS + 1);
    expect(findPlayer(world, id).action).toBe('Idle');
  });
});

describe('the events of the world', () => {
  it('are taken once each, numbered upwards, with their steps', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    meetMonster(world, id);
    const events: GameEvent[] = [];
    for (let step = 1; step <= 10 * SIMULATION_RATE; step++) {
      world.step();
      const taken: GameEvent[] = world.takeEvents();
      expect(world.takeEvents()).toEqual([]);
      events.push(...taken);
    }
    expect(events.length).toBeGreaterThan(1);
    events.forEach((event: GameEvent, index: number) => {
      expect(event.id).toBe((events[0]?.id ?? 0) + index);
    });
    const steps: number[] = events.map((event: GameEvent) => event.step);
    expect(steps).toEqual([...steps].sort((a: number, b: number) => a - b));
  });
});
