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
  AuthoritativePlayer,
  CAVE_CONTAINERS,
  CAVE_DOG_HOMES,
  CAVE_LANDING,
  CAVE_TERRAIN,
  CLOVER_PATCHES,
  CLOVER_REGROW_DURATION,
  DEATH_DURATION,
  DRINK_STEPS,
  FOUNTAIN_HEALING,
  GROUND_ITEM_DURATION,
  HEALING_POTION_PRICE,
  INVENTORY_SIZE,
  MONSTER_KINDS,
  PLAYER_HEALTH,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  SAY_INTERVAL,
  SAY_LENGTH_LIMIT,
  SAY_RANGE,
  SIMULATION_RATE,
  SLASH_DAMAGE,
  SLASH_DURATION,
  SLASH_REACH,
  SPAWN_POINT_COUNT,
  TALK_STEPS,
  TOBY_ACTIVITY_STEPS,
  TOBY_ENDS,
  TOBY_GRAB_STEPS,
  TOBY_LOOP_STEPS,
  TOBY_PATCHES,
  TOBY_RADIUS,
  NavigationGraph,
  VILLAGERS,
  WALK_SPEED,
  PITCHFORK_STAND,
  WELL_STAND,
  createInteractMessage,
  createMotion,
  createMoveMessage,
  findPlacement,
  findSpawnPoint,
  findTobyGrab,
  findTobyPose,
  findInteraction,
  findVillagePath,
  isWithinStrike,
  locateVillager,
  placePoint,
} from '@clovervale/shared';
import type {
  CaveContainer,
  GameEvent,
  GroundItem,
  GroundVector,
  ItemKindId,
  MonsterKind,
  MonsterState,
  Placement,
  PlayerState,
  Pose,
  QuestLog,
  TobyGrab,
  Villager,
} from '@clovervale/shared';

import { MONSTER_APPROACH_DISTANCE } from '../src/monster.ts';
import type { MonsterSpawn } from '../src/monster.ts';
import { LAG_COMPENSATION_LIMIT, World } from '../src/world.ts';
import type { Player, Saying } from '../src/world.ts';

/** The numbers of the wild dog of the village. */
const VILLAGE_DOG: MonsterKind = MONSTER_KINDS['village-dog'];

/** The numbers of a wild dog of the cave. */
const CAVE_DOG: MonsterKind = MONSTER_KINDS['cave-dog'];

/** The identifier of the wild dog of the village. */
const VILLAGE_DOG_ID = 1;

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

/** Where a player stands by the fountain, which it is within reach of. */
const BY_FOUNTAIN: GroundVector = {
  x: PLAZA_CENTRE.x,
  z: PLAZA_CENTRE.z + 2.1,
};

/** Where Nancy the villager stands. */
const NANCY: GroundVector = findPlacement('npc-nancy.glb');

/** Where a player stands by Nancy, whom it is within reach of. */
const BY_NANCY: GroundVector = { x: NANCY.x, z: NANCY.z + 1.2 };

/**
 * Walks a player of a world near the home of the monster, waits there
 * until the monster has hurt it enough, and walks it to the fountain,
 * facing it.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {number} health - The most health the player is to be left with.
 * @returns {PlayerState} The player as it stands by the fountain.
 * @throws {Error} If the monster does not hurt the player enough.
 */
function hurtPlayer(world: World, id: number, health: number): PlayerState {
  meetMonster(world, id);
  for (let step = 0; findPlayer(world, id).health > health; step++) {
    if (step > 30 * SIMULATION_RATE) {
      throw new Error(`Player ${String(id)} is not hurt enough.`);
    }
    world.step();
  }
  walkPlayer(world, id, BY_FOUNTAIN);
  turnPlayer(world, id, PLAZA_CENTRE);
  world.takeEvents();
  return findPlayer(world, id);
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

describe('a player who interacts by the fountain', () => {
  it('drinks from the next step, for as long as a drink lasts', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_FOUNTAIN);
    turnPlayer(world, id, PLAZA_CENTRE);
    const before: PlayerState = findPlayer(world, id);
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id)).toMatchObject({
      x: before.x,
      z: before.z,
      action: 'Drink',
      actionCount: before.actionCount + 1,
    });
    stepTimes(world, DRINK_STEPS - 1);
    expect(findPlayer(world, id).action).toBe('Drink');
    world.step();
    expect(findPlayer(world, id).action).toBe('Idle');
  });

  it('gets health back at once as the drink starts, as an event', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    const hurt: PlayerState = hurtPlayer(
      world,
      id,
      PLAYER_HEALTH - FOUNTAIN_HEALING,
    );
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id).health).toBe(hurt.health + FOUNTAIN_HEALING);
    expect(world.takeEvents()).toEqual([
      expect.objectContaining({
        type: 'heal',
        target: { kind: 'player', id },
        amount: FOUNTAIN_HEALING,
      }),
    ]);
    stepTimes(world, DRINK_STEPS);
    expect(world.takeEvents()).toEqual([]);
  });

  it('gets no more health back than it lacks', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    const hurt: PlayerState = hurtPlayer(world, id, PLAYER_HEALTH - 1);
    const lacking: number = PLAYER_HEALTH - hurt.health;
    interactPlayer(world, id);
    stepTimes(world, DRINK_STEPS + 1);
    interactPlayer(world, id);
    stepTimes(world, DRINK_STEPS + 1);
    const healed: number = world
      .takeEvents()
      .reduce(
        (total: number, event: GameEvent) =>
          total + (event.type === 'heal' ? event.amount : 0),
        0,
      );
    expect(healed).toBe(lacking);
    expect(findPlayer(world, id).health).toBe(PLAYER_HEALTH);
  });

  it('drinks at full health without getting any back', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_FOUNTAIN);
    turnPlayer(world, id, PLAZA_CENTRE);
    world.takeEvents();
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id)).toMatchObject({
      action: 'Drink',
      health: PLAYER_HEALTH,
    });
    expect(world.takeEvents()).toEqual([]);
  });

  it('is not judged as a slash, whatever time it names', () => {
    const world = new RecordingWorld(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_FOUNTAIN);
    turnPlayer(world, id, PLAZA_CENTRE);
    interactPlayer(world, id, world.time - 200);
    world.step();
    expect(findPlayer(world, id).action).toBe('Drink');
    expect(world.findSlash(id)).toBeNull();
  });

  it('slashes facing away from the fountain', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_FOUNTAIN);
    turnPlayer(world, id, { x: BY_FOUNTAIN.x, z: BY_FOUNTAIN.z + 1 });
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id).action).toBe('Slash');
    expect(world.findSlash(id)).toMatchObject({ isHit: false });
  });
});

describe('a player who interacts by Nancy', () => {
  it('talks from the next step, for as long as a talk lasts', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_NANCY);
    turnPlayer(world, id, NANCY);
    const before: PlayerState = findPlayer(world, id);
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id)).toMatchObject({
      x: before.x,
      z: before.z,
      yaw: before.yaw,
      action: 'Talk',
      actionCount: before.actionCount + 1,
      health: before.health,
    });
    stepTimes(world, TALK_STEPS - 1);
    expect(findPlayer(world, id).action).toBe('Talk');
    world.step();
    expect(findPlayer(world, id).action).toBe('Idle');
  });

  it('changes nothing else, and is not judged as a slash', () => {
    const world = new RecordingWorld(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_NANCY);
    turnPlayer(world, id, NANCY);
    world.takeEvents();
    interactPlayer(world, id, world.time - 200);
    world.step();
    expect(findPlayer(world, id).action).toBe('Talk');
    expect(world.findSlash(id)).toBeNull();
    stepTimes(world, TALK_STEPS);
    expect(world.takeEvents()).toEqual([]);
    expect(findPlayer(world, id).health).toBe(PLAYER_HEALTH);
  });

  it('slashes facing away from her', () => {
    const world = new RecordingWorld(createRandom());
    const { id }: PlayerState = world.addPlayer();
    walkPlayer(world, id, BY_NANCY);
    turnPlayer(world, id, { x: BY_NANCY.x, z: BY_NANCY.z + 1 });
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id).action).toBe('Slash');
    expect(world.findSlash(id)).toMatchObject({ isHit: false });
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
        actionSteps: 0,
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
      expect.objectContaining({
        id: VILLAGE_DOG_ID,
        kind: 'village-dog',
        health: VILLAGE_DOG.health,
      }),
      expect.objectContaining({
        kind: 'martha',
        health: MONSTER_KINDS.martha.health,
        mode: 'idle',
      }),
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
        target: { kind: 'monster', id: VILLAGE_DOG_ID },
        damage: SLASH_DAMAGE,
      }),
    );
    expect(findMonster(world).health).toBe(VILLAGE_DOG.health - SLASH_DAMAGE);
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
    expect(findMonster(world).health).toBe(VILLAGE_DOG.health);
  });

  it('misses the monster out of reach', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    turnPlayer(world, id, findMonster(world));
    interactPlayer(world, id);
    stepTimes(world, 2);
    expect(findMonster(world).health).toBe(VILLAGE_DOG.health);
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
      tries < 20 &&
      world
        .listMonsters()
        .some((monster: MonsterState) => monster.kind === 'village-dog');
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
    expect(hits).toBe(VILLAGE_DOG.health / SLASH_DAMAGE);
    stepTimes(world, 5 * SIMULATION_RATE);
    expect(
      world.listMonsters().map((monster: MonsterState) => monster.kind),
    ).toEqual(['martha']);
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
        target: { kind: 'monster', id: VILLAGE_DOG_ID },
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
    expect(hits.length).toBe(Math.ceil(health / VILLAGE_DOG.biteDamage));
    for (const hit of hits) {
      expect(hit).toMatchObject({
        attacker: { kind: 'monster', id: VILLAGE_DOG_ID },
        target: { kind: 'player', id },
      });
    }
    expect(
      hits.reduce(
        (total: number, hit: GameEvent) =>
          total + (hit.type === 'hit' ? hit.damage : 0),
        0,
      ),
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
        .filter(
          (event: GameEvent) =>
            event.type === 'hit' && event.attacker.kind === 'player',
        ),
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

describe('Toby in the world', () => {
  it('pushes a player out of his way as he is at each step', () => {
    const world = new RecordingWorld(createRandom());
    const { id }: PlayerState = world.addPlayer();
    const [first, second] = TOBY_ENDS;
    const middle: GroundVector = {
      x: (first.x + second.x) / 2,
      z: (first.z + second.z) / 2,
    };
    walkPlayer(world, id, middle);
    const stopped: PlayerState = findPlayer(world, id);
    expect(measureDistance(stopped, middle)).toBeLessThan(STEP_DISTANCE);
    for (let step = 0; step < TOBY_LOOP_STEPS; step++) {
      world.step();
      const toby: GroundVector = findTobyPose(world.stepCount);
      expect(measureDistance(findPlayer(world, id), toby)).toBeGreaterThan(
        TOBY_RADIUS + PLAYER_RADIUS - 1e-9,
      );
    }
    const pushed: PlayerState = findPlayer(world, id);
    expect(pushed.action).toBe('Idle');
    // Straight aside, square to his run.
    const along: GroundVector = {
      x: (second.x - first.x) / measureDistance(first, second),
      z: (second.z - first.z) / measureDistance(first, second),
    };
    expect(
      (pushed.x - stopped.x) * along.x + (pushed.z - stopped.z) * along.z,
    ).toBeCloseTo(0, 9);
    expect(measureDistance(pushed, stopped)).toBeGreaterThan(0.2);
  });
});

/** The number of simulation steps a picked patch of clover takes to regrow. */
const REGROW_STEPS: number = CLOVER_REGROW_DURATION * SIMULATION_RATE;

/** The number of simulation steps an item put down lies on the ground. */
const GROUND_ITEM_STEPS: number = GROUND_ITEM_DURATION * SIMULATION_RATE;

/** The patch of clover east of the fountain, by the bushes. */
const PATCH = 6;

/** Where the patch of clover east of the fountain is. */
const PATCH_CENTRE: GroundVector = CLOVER_PATCHES[PATCH] ?? { x: NaN, z: NaN };

/** Where a player stands by that patch, within reach of its clover. */
const BY_PATCH: GroundVector = { x: PATCH_CENTRE.x, z: PATCH_CENTRE.z + 1 };

/**
 * Tells a world, as the next input of a player, that the player picks what
 * is within its reach at the next step.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 */
function pickItem(world: World, id: number): void {
  world.receiveInput(id, { type: 'pick', sequence: ++lastSequence, after: 0 });
}

/**
 * Tells a world, as the next input of a player, that the player puts the
 * item of a slot of its inventory down at the next step.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {number} [slot] - The number of the slot, from 0, which is the
 *   first by default.
 */
function dropItem(world: World, id: number, slot = 0): void {
  world.receiveInput(id, {
    type: 'drop',
    sequence: ++lastSequence,
    after: 0,
    slot,
  });
}

/**
 * Has a player of a world that stands by the patch of clover east of the
 * fountain pick its clover several times, each time once it has regrown.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {number} count - The number of times.
 */
function pickClovers(world: World, id: number, count: number): void {
  for (let picked = 0; picked < count; picked++) {
    pickItem(world, id);
    world.step();
    stepTimes(world, REGROW_STEPS);
  }
}

/**
 * Lets a new player into a world, and walks it to the patch of clover east
 * of the fountain, facing the patch.
 *
 * @param {World} world - The world.
 * @returns {number} The identifier of the player.
 */
function addPicker(world: World): number {
  const { id }: PlayerState = world.addPlayer();
  walkPlayer(world, id, BY_PATCH);
  turnPlayer(world, id, PATCH_CENTRE);
  return id;
}

describe('a player who picks by a patch of clover', () => {
  it('gets its four-leaved clover, which is gone from the patch', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    expect(world.describeItems().clovers).toContain(PATCH);
    const before: PlayerState = findPlayer(world, id);
    const full: readonly number[] = world.describeItems().clovers;
    pickItem(world, id);
    world.step();
    expect(world.findInventory(id)).toEqual(['clover']);
    expect(world.describeItems().clovers).toEqual(
      full.filter((patch: number) => patch !== PATCH),
    );
    // A pick is no slash, and does not move the player.
    expect(findPlayer(world, id)).toEqual(before);
    expect(world.findSlash(id)).toBeNull();
  });

  it('leaves the patch to grow a new clover after a while', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickItem(world, id);
    world.step();
    stepTimes(world, REGROW_STEPS - 1);
    expect(world.describeItems().clovers).not.toContain(PATCH);
    world.step();
    expect(world.describeItems().clovers).toContain(PATCH);
  });

  it('gets nothing once the clover is gone', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickItem(world, id);
    world.step();
    pickItem(world, id);
    world.step();
    expect(world.findInventory(id)).toEqual(['clover']);
  });

  it('gets the clover before another player who picks it at once', () => {
    const world = new World(createRandom());
    const first: number = addPicker(world);
    const second: number = addPicker(world);
    pickItem(world, second);
    pickItem(world, first);
    world.step();
    expect(world.findInventory(first)).toEqual(['clover']);
    expect(world.findInventory(second)).toEqual([]);
  });

  it('gets the clover before another player who picks it a step later', () => {
    const world = new World(createRandom());
    const first: number = addPicker(world);
    const second: number = addPicker(world);
    pickItem(world, second);
    world.step();
    pickItem(world, first);
    world.step();
    expect(world.findInventory(first)).toEqual([]);
    expect(world.findInventory(second)).toEqual(['clover']);
  });

  it('carries no more than its inventory holds', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    for (let count = 1; count <= INVENTORY_SIZE; count++) {
      pickItem(world, id);
      world.step();
      expect(world.findInventory(id)).toHaveLength(count);
      stepTimes(world, REGROW_STEPS);
    }
    pickItem(world, id);
    world.step();
    expect(world.findInventory(id)).toHaveLength(INVENTORY_SIZE);
    expect(world.describeItems().clovers).toContain(PATCH);
  });
});

/**
 * Moves a world on to some steps before the next one at which Toby's hand
 * grabs at a patch of clover, while the patch has its clover.
 *
 * @param {RecordingWorld} world - The world.
 * @param {number} patch - The number of the patch.
 * @param {number} [ahead] - How many steps before, one by default.
 * @returns {number} The number of the step at which his hand is to grab.
 * @throws {Error} If he does not come to grab there within a few loops.
 */
function stepToGrab(world: RecordingWorld, patch: number, ahead = 1): number {
  for (let loop = 0; loop < 4 * TOBY_LOOP_STEPS; loop++) {
    const grab: TobyGrab = findTobyGrab(world.stepCount + ahead);
    if (
      grab.step === world.stepCount + ahead &&
      grab.patch === patch &&
      world.describeItems().clovers.includes(patch)
    ) {
      return grab.step;
    }
    world.step();
  }
  throw new Error(`Toby does not come to grab at patch ${String(patch)}.`);
}

/**
 * Lets a new player into a world, and walks it to the patch of clover by
 * the gate that Toby picks at, on the other side of it from him, facing
 * the patch, within reach of its clover but too far from him to talk to
 * him.
 *
 * @param {World} world - The world.
 * @returns {number} The identifier of the player.
 */
function addRival(world: World): number {
  const patch: GroundVector = CLOVER_PATCHES[TOBY_PATCHES[1]] ?? PLAZA_CENTRE;
  const [first, second] = TOBY_ENDS;
  const away: number = measureDistance(first, second);
  const along: GroundVector = {
    x: (second.x - first.x) / away,
    z: (second.z - first.z) / away,
  };
  const { id }: PlayerState = world.addPlayer();
  walkPlayer(world, id, {
    x: patch.x + along.x * 1.12,
    z: patch.z + along.z * 1.12,
  });
  turnPlayer(world, id, patch);
  return id;
}

describe('Toby picking at a patch of clover', () => {
  it('takes its four-leaved clover as his hand grabs, until it regrows', () => {
    const world = new RecordingWorld(createRandom());
    const [patch] = TOBY_PATCHES;
    expect(world.describeItems().tobyFind).toBeNull();
    const grab: number = stepToGrab(world, patch);
    world.step();
    expect(world.describeItems().clovers).not.toContain(patch);
    expect(world.describeItems().clovers).toHaveLength(
      CLOVER_PATCHES.length - 1,
    );
    expect(world.describeItems().tobyFind).toBe(grab);
    stepTimes(world, REGROW_STEPS - 1);
    expect(world.describeItems().clovers).not.toContain(patch);
    world.step();
    expect(world.describeItems().clovers).toContain(patch);
  });

  it('takes nothing from a patch without its clover', () => {
    const world = new RecordingWorld(createRandom());
    const [patch] = TOBY_PATCHES;
    const first: number = stepToGrab(world, patch);
    world.step();
    // He comes back to the patch before it has regrown.
    const again: number = first + TOBY_LOOP_STEPS;
    expect(again).toBeLessThan(first + REGROW_STEPS);
    stepTimes(world, again - 1 - world.stepCount);
    world.step();
    expect(findTobyGrab(world.stepCount)).toEqual({ step: again, patch });
    expect(world.describeItems().tobyFind).not.toBe(again);
  });

  it('leaves the clover to a player who picks it a step before him', () => {
    const world = new RecordingWorld(createRandom());
    const id: number = addRival(world);
    const grab: number = stepToGrab(world, TOBY_PATCHES[1], 2);
    pickItem(world, id);
    world.step();
    world.step();
    expect(world.stepCount).toBe(grab);
    expect(world.findInventory(id)).toEqual(['clover']);
    expect(world.describeItems().tobyFind).not.toBe(grab);
  });

  it('takes the clover before a player who picks it as his hand grabs', () => {
    const world = new RecordingWorld(createRandom());
    const id: number = addRival(world);
    const grab: number = stepToGrab(world, TOBY_PATCHES[1]);
    pickItem(world, id);
    world.step();
    expect(world.stepCount).toBe(grab);
    expect(world.findInventory(id)).toEqual([]);
    expect(world.describeItems().tobyFind).toBe(grab);
  });

  it('picks nothing in a cave', () => {
    const world = new World(createRandom(), { map: 'cave' });
    stepTimes(world, TOBY_LOOP_STEPS);
    expect(world.describeItems().tobyFind).toBeUndefined();
  });
});

/** Where Toby squats at the patch of clover by the gate. */
const TOBY_BY_GATE: GroundVector = TOBY_ENDS[1];

/**
 * Brings a player into the village, standing beyond the patch of clover by
 * the gate from where Toby squats at it, facing him, within reach of him,
 * carrying some items, among which is Martha's token, so that she leaves
 * it alone.
 *
 * @param {World} world - The world.
 * @param {readonly ItemKindId[]} carried - What else the player carries.
 * @param {QuestLog} [quests] - How far the player has got with the
 *   quests, which is having done the quest of Toby, hurt, by default.
 * @returns {number} The identifier of the player.
 */
function admitTalker(
  world: World,
  carried: readonly ItemKindId[],
  quests: QuestLog = { 'toby-hurt': 'done' },
): number {
  const patch: GroundVector = CLOVER_PATCHES[TOBY_PATCHES[1]] ?? PLAZA_CENTRE;
  const [first, second] = TOBY_ENDS;
  const away: number = measureDistance(first, second);
  const place: GroundVector = {
    x: patch.x + ((second.x - first.x) / away) * 0.8,
    z: patch.z + ((second.z - first.z) / away) * 0.8,
  };
  const yaw: number =
    (Math.atan2(TOBY_BY_GATE.x - place.x, TOBY_BY_GATE.z - place.z) * 180) /
    Math.PI;
  const player: Player = {
    id: 1,
    appearance: 1,
    mover: new AuthoritativePlayer(createMotion(place, yaw)),
    health: PLAYER_HEALTH,
    deathSteps: 0,
    lastSlash: null,
    inventory: ['spy-token', ...carried],
    silver: 0,
    acquaintances: [],
    quests: { ...quests },
    dialogue: null,
    turnCount: 0,
    isHunted: false,
    speeches: [],
    sayings: [],
    saidStep: null,
  };
  world.admitPlayer(player, { ...place, yaw });
  return player.id;
}

/**
 * Has a player of a world talk to Toby as he picks at the patch of clover
 * by the gate, once his hand has grabbed there, and tells what he says.
 *
 * @param {RecordingWorld} world - The world.
 * @param {number} id - The identifier of the player, which stands where
 *   {@link admitTalker} brings it.
 * @returns {string[]} The lines he says to the player.
 * @throws {Error} If the player does not talk to him.
 */
function talkToToby(world: RecordingWorld, id: number): string[] {
  for (let step = 0; step < 2 * TOBY_LOOP_STEPS; step++) {
    const next: number = world.stepCount + 1;
    const grab: TobyGrab = findTobyGrab(next);
    if (
      grab.patch === TOBY_PATCHES[1] &&
      next - grab.step < TOBY_ACTIVITY_STEPS.Pick - TOBY_GRAB_STEPS - 15
    ) {
      break;
    }
    world.step();
  }
  world.takeSpeeches(id);
  interactPlayer(world, id);
  world.step();
  expect(findPlayer(world, id).action).toBe('Talk');
  stepTimes(world, TALK_STEPS);
  return world
    .takeSpeeches(id)
    .map(({ villager, line }) => `${villager}:${line}`);
}

describe('a player who talks to Toby', () => {
  it('gets a clover with his line of giving it', () => {
    const world = new RecordingWorld(() => 0.99);
    const id: number = admitTalker(world, []);
    expect(talkToToby(world, id)).toEqual(['toby:villager.toby.gift']);
    expect(world.findInventory(id)).toEqual(['spy-token', 'clover']);
    expect(talkToToby(world, id)).toEqual(['toby:villager.toby.gift']);
    expect(world.findInventory(id)).toEqual([
      'spy-token',
      'clover',
      'clover',
    ]);
  });

  it('gets a clover each time its bag has room, however few he has picked', () => {
    const world = new RecordingWorld(() => 0.99);
    const id: number = admitTalker(world, []);
    for (let count = 1; count < INVENTORY_SIZE; count++) {
      expect(talkToToby(world, id)).toEqual(['toby:villager.toby.gift']);
    }
    expect(world.findInventory(id)).toHaveLength(INVENTORY_SIZE);
  });

  it('gives no clover to a player whose bag is full', () => {
    const world = new RecordingWorld(() => 0.99);
    const full: ItemKindId[] = Array.from(
      { length: INVENTORY_SIZE - 1 },
      (): ItemKindId => 'sword',
    );
    const id: number = admitTalker(world, full);
    expect(talkToToby(world, id)).toEqual(['toby:villager.toby.line.3']);
    expect(world.findInventory(id)).toHaveLength(INVENTORY_SIZE);
    expect(world.describeItems().items).toEqual([]);
  });

  it('says each of his lines, at random', () => {
    const heard = new Set<string>();
    for (const draw of [0, 0.3, 0.6, 0.9]) {
      const world = new RecordingWorld(() => draw);
      const id: number = admitTalker(world, []);
      for (const line of talkToToby(world, id)) {
        heard.add(line);
      }
    }
    expect(heard).toEqual(
      new Set([
        'toby:villager.toby.line.1',
        'toby:villager.toby.line.2',
        'toby:villager.toby.line.3',
        'toby:villager.toby.gift',
      ]),
    );
  });
});

describe('a player on the quest of Toby, hurt, who talks to him', () => {
  /**
   * Has a player choose the first reply in its dialogue, and takes a step.
   *
   * @param {World} world - The world.
   * @param {number} id - The identifier of the player.
   */
  function reply(world: World, id: number): void {
    world.receiveInput(id, {
      type: 'reply',
      choice: 0,
      sequence: ++lastSequence,
      after: 0,
    });
    world.step();
  }

  it('takes the quest on as he tells of his fall the first time', () => {
    const world = new RecordingWorld(() => 0.99);
    const id: number = admitTalker(world, [], {});
    expect(world.findQuests(id)).toEqual({});
    expect(talkToToby(world, id)).toEqual([]);
    expect(world.findDialogue(id)).toEqual({
      villager: 'toby',
      line: 'dialogue.toby.hurt',
      replies: ['dialogue.toby.promise'],
      turn: 1,
    });
    expect(world.findQuests(id)).toEqual({ 'toby-hurt': 'started' });
    expect(world.findInventory(id)).toEqual(['spy-token']);
    reply(world, id);
    expect(world.findDialogue(id)).toBeNull();
    expect(world.findQuests(id)).toEqual({ 'toby-hurt': 'started' });
  });

  it('stands still in the dialogue while Toby runs on', () => {
    const world = new RecordingWorld(() => 0.99);
    const id: number = admitTalker(world, [], {});
    talkToToby(world, id);
    const player: PlayerState = findPlayer(world, id);
    steerPlayer(world, id, { x: 1, z: 0 });
    stepTimes(world, 2 * SIMULATION_RATE);
    expect(world.findDialogue(id)).not.toBeNull();
    expect(findPlayer(world, id)).toMatchObject({
      x: player.x,
      z: player.z,
      action: 'Idle',
    });
  });

  it('only hears him moan in passing without the ointment', () => {
    for (const stage of ['started', 'supplied'] as const) {
      const world = new RecordingWorld(() => 0.99);
      const id: number = admitTalker(world, [], { 'toby-hurt': stage });
      expect(talkToToby(world, id)).toEqual(['toby:dialogue.toby.moan']);
      expect(world.findDialogue(id)).toBeNull();
      expect(world.findInventory(id)).toEqual(['spy-token']);
      expect(talkToToby(world, id)).toEqual(['toby:dialogue.toby.moan']);
      expect(world.findQuests(id)).toEqual({ 'toby-hurt': stage });
    }
  });

  it('gives him the ointment and gets a clover, which ends the quest', () => {
    const world = new RecordingWorld(() => 0.99);
    const id: number = admitTalker(world, ['martha-ointment'], {
      'toby-hurt': 'supplied',
    });
    expect(talkToToby(world, id)).toEqual([]);
    expect(world.findDialogue(id)).toEqual({
      villager: 'toby',
      line: 'dialogue.toby.moan',
      replies: ['dialogue.toby.dress'],
      turn: 1,
    });
    expect(world.findInventory(id)).toEqual(['spy-token', 'martha-ointment']);
    reply(world, id);
    expect(world.findDialogue(id)).toEqual({
      villager: 'toby',
      line: 'dialogue.toby.thanks',
      replies: [],
      turn: 2,
    });
    expect(world.findInventory(id)).toEqual(['spy-token', 'clover']);
    expect(world.findQuests(id)).toEqual({ 'toby-hurt': 'done' });
    reply(world, id);
    expect(world.findDialogue(id)).toBeNull();
    expect(talkToToby(world, id)).toEqual(['toby:villager.toby.gift']);
  });

  it('gets the clover into the slot of the ointment in a full bag', () => {
    const world = new RecordingWorld(() => 0.99);
    const full: ItemKindId[] = [
      'martha-ointment',
      ...Array.from({ length: INVENTORY_SIZE - 2 }, (): ItemKindId => 'sword'),
    ];
    const id: number = admitTalker(world, full, { 'toby-hurt': 'started' });
    talkToToby(world, id);
    reply(world, id);
    expect(world.findInventory(id)).toHaveLength(INVENTORY_SIZE);
    expect(world.findInventory(id)).not.toContain('martha-ointment');
    expect(world.findInventory(id)?.at(-1)).toBe('clover');
    expect(world.describeItems().items).toEqual([]);
  });

  it('gets no clover once it has put the ointment down in the dialogue', () => {
    const world = new RecordingWorld(() => 0.99);
    const id: number = admitTalker(world, ['martha-ointment'], {
      'toby-hurt': 'started',
    });
    talkToToby(world, id);
    dropItem(world, id, 1);
    world.step();
    reply(world, id);
    expect(world.findDialogue(id)).toBeNull();
    expect(world.findInventory(id)).toEqual(['spy-token']);
    expect(world.findQuests(id)).toEqual({ 'toby-hurt': 'started' });
  });
});

/**
 * Lets a player into a world in front of the door of the apothecary's,
 * facing Basil, with some silver coins and some items.
 *
 * @param {World} world - The world.
 * @param {number} silver - The number of its silver coins.
 * @param {readonly ItemKindId[]} [carried] - What it carries, nothing by
 *   default.
 * @returns {number} The identifier of the player.
 */
function admitShopper(
  world: World,
  silver: number,
  carried: readonly ItemKindId[] = [],
): number {
  const place: GroundVector = placePoint(findPlacement('prop-apothecary.glb'), {
    x: 0.9,
    z: 4.1,
  });
  const basil: Placement = findPlacement('npc-basil.glb');
  const yaw: number =
    (Math.atan2(basil.x - place.x, basil.z - place.z) * 180) / Math.PI;
  const player: Player = {
    id: 1,
    appearance: 1,
    mover: new AuthoritativePlayer(createMotion(place, yaw)),
    health: PLAYER_HEALTH,
    deathSteps: 0,
    lastSlash: null,
    inventory: [...carried],
    silver,
    acquaintances: [],
    quests: {},
    dialogue: null,
    turnCount: 0,
    isHunted: false,
    speeches: [],
    sayings: [],
    saidStep: null,
  };
  world.admitPlayer(player, { ...place, yaw });
  return player.id;
}

describe('a player who talks to Basil the apothecary', () => {
  /**
   * Has a player talk to Basil, and waits for the talk to end.
   *
   * @param {World} world - The world.
   * @param {number} id - The identifier of the player.
   * @returns {string[]} What is said to the player in passing meanwhile.
   */
  function talkToBasil(world: World, id: number): string[] {
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id).action).toBe('Talk');
    stepTimes(world, TALK_STEPS);
    return world
      .takeSpeeches(id)
      .map(({ villager, line }) => `${villager}:${line}`);
  }

  /**
   * Has a player choose a reply in its dialogue, and takes a step.
   *
   * @param {World} world - The world.
   * @param {number} id - The identifier of the player.
   * @param {number} choice - The number of the reply, from 0.
   */
  function reply(world: World, id: number, choice: number): void {
    world.receiveInput(id, {
      type: 'reply',
      choice,
      sequence: ++lastSequence,
      after: 0,
    });
    world.step();
  }

  /** The replies Basil offers to his offer of a potion. */
  const OFFER_REPLIES: readonly string[] = [
    'dialogue.basil.buy',
    'dialogue.basil.decline',
  ];

  it('is offered a healing potion, and nothing else is said', () => {
    const world = new World(createRandom());
    const id: number = admitShopper(world, 3);
    expect(talkToBasil(world, id)).toEqual([]);
    expect(world.findDialogue(id)).toEqual({
      villager: 'basil',
      line: 'dialogue.basil.offer',
      replies: OFFER_REPLIES,
      turn: 1,
    });
    expect(world.findSilver(id)).toBe(3);
    expect(world.findInventory(id)).toEqual([]);
  });

  it('buys a potion for its price, and may buy another', () => {
    const world = new World(createRandom());
    const id: number = admitShopper(world, 2 * HEALING_POTION_PRICE + 1, [
      'sword',
    ]);
    talkToBasil(world, id);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toEqual({
      villager: 'basil',
      line: 'dialogue.basil.sold',
      replies: OFFER_REPLIES,
      turn: 2,
    });
    expect(world.findSilver(id)).toBe(HEALING_POTION_PRICE + 1);
    expect(world.findInventory(id)).toEqual(['sword', 'healing-potion']);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.basil.sold',
      turn: 3,
    });
    expect(world.findSilver(id)).toBe(1);
    expect(world.findInventory(id)).toEqual([
      'sword',
      'healing-potion',
      'healing-potion',
    ]);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toEqual({
      villager: 'basil',
      line: 'dialogue.basil.short',
      replies: [],
      turn: 4,
    });
    expect(world.findSilver(id)).toBe(1);
    expect(world.findInventory(id)).toHaveLength(3);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toBeNull();
  });

  it('buys nothing without enough silver coins', () => {
    const world = new World(createRandom());
    const id: number = admitShopper(world, HEALING_POTION_PRICE - 1);
    talkToBasil(world, id);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.basil.short',
      replies: [],
    });
    expect(world.findSilver(id)).toBe(HEALING_POTION_PRICE - 1);
    expect(world.findInventory(id)).toEqual([]);
  });

  it('buys nothing with a full bag, and nothing is laid on the ground', () => {
    const world = new World(createRandom());
    const full: ItemKindId[] = Array.from(
      { length: INVENTORY_SIZE },
      (): ItemKindId => 'sword',
    );
    const id: number = admitShopper(world, HEALING_POTION_PRICE, full);
    talkToBasil(world, id);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.basil.full',
      replies: [],
    });
    expect(world.findSilver(id)).toBe(HEALING_POTION_PRICE);
    expect(world.findInventory(id)).toEqual(full);
    expect(world.describeItems().items).toEqual([]);
  });

  it('is told it has too few coins first, if its bag is full as well', () => {
    const world = new World(createRandom());
    const full: ItemKindId[] = Array.from(
      { length: INVENTORY_SIZE },
      (): ItemKindId => 'sword',
    );
    const id: number = admitShopper(world, 0, full);
    talkToBasil(world, id);
    reply(world, id, 0);
    expect(world.findDialogue(id)?.line).toBe('dialogue.basil.short');
  });

  it('is bidden farewell when it buys nothing', () => {
    const world = new World(createRandom());
    const id: number = admitShopper(world, HEALING_POTION_PRICE);
    talkToBasil(world, id);
    reply(world, id, 1);
    expect(world.findDialogue(id)).toEqual({
      villager: 'basil',
      line: 'dialogue.basil.farewell',
      replies: [],
      turn: 2,
    });
    expect(world.findSilver(id)).toBe(HEALING_POTION_PRICE);
    expect(world.findInventory(id)).toEqual([]);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toBeNull();
  });
});

describe('a player who puts an item down', () => {
  it('lays the item of the slot it names at its feet', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickItem(world, id);
    world.step();
    dropItem(world, id);
    world.step();
    expect(world.findInventory(id)).toEqual([]);
    const player: PlayerState = findPlayer(world, id);
    const [item] = world.describeItems().items;
    expect(item?.kind).toBe('clover');
    expect(measureDistance(item ?? PATCH_CENTRE, player)).toBeLessThan(0.01);
  });

  it('closes up the items after the slot it empties', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickClovers(world, id, 3);
    dropItem(world, id, 1);
    world.step();
    expect(world.findInventory(id)).toEqual(['clover', 'clover']);
    expect(world.describeItems().items).toHaveLength(1);
    dropItem(world, id, 1);
    world.step();
    expect(world.findInventory(id)).toEqual(['clover']);
    expect(world.describeItems().items).toHaveLength(2);
  });

  it('lays nothing down from an empty slot, or one out of range', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickClovers(world, id, 2);
    for (const slot of [2, INVENTORY_SIZE - 1, INVENTORY_SIZE, 1000]) {
      dropItem(world, id, slot);
      world.step();
    }
    expect(world.findInventory(id)).toEqual(['clover', 'clover']);
    expect(world.describeItems().items).toEqual([]);
  });

  it('cannot lay down what another player carries', () => {
    const world = new World(createRandom());
    const carrier: number = addPicker(world);
    pickItem(world, carrier);
    world.step();
    const { id: other }: PlayerState = world.addPlayer();
    dropItem(world, other, 0);
    world.step();
    expect(world.findInventory(carrier)).toEqual(['clover']);
    expect(world.findInventory(other)).toEqual([]);
    expect(world.describeItems().items).toEqual([]);
  });

  it('lays nothing down while it carries nothing', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    dropItem(world, id);
    world.step();
    expect(world.describeItems().items).toEqual([]);
  });

  it('leaves the item for another player to pick up', () => {
    const world = new World(createRandom());
    const dropper: number = addPicker(world);
    pickItem(world, dropper);
    world.step();
    walkPlayer(world, dropper, { x: BY_PATCH.x, z: BY_PATCH.z + 1 });
    dropItem(world, dropper);
    world.step();
    const [item] = world.describeItems().items;
    const picker: number = addPicker(world);
    turnPlayer(world, picker, item ?? PATCH_CENTRE);
    pickItem(world, picker);
    world.step();
    expect(world.findInventory(picker)).toEqual(['clover']);
    expect(world.findInventory(dropper)).toEqual([]);
    expect(world.describeItems().items).toEqual([]);
  });

  it('picks the item back at once, whichever way it faces', () => {
    for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const world = new World(createRandom());
      const id: number = addPicker(world);
      pickItem(world, id);
      world.step();
      const { x, z }: PlayerState = findPlayer(world, id);
      const radians: number = (yaw * Math.PI) / 180;
      turnPlayer(world, id, {
        x: x + Math.sin(radians),
        z: z + Math.cos(radians),
      });
      dropItem(world, id);
      world.step();
      pickItem(world, id);
      world.step();
      expect(world.findInventory(id), `facing ${String(yaw)}`).toEqual([
        'clover',
      ]);
      expect(world.describeItems().items).toEqual([]);
    }
  });

  it('leaves the item on the ground for a while, and then it is gone', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickItem(world, id);
    world.step();
    dropItem(world, id);
    world.step();
    const items: readonly GroundItem[] = world.describeItems().items;
    stepTimes(world, GROUND_ITEM_STEPS - 1);
    expect(world.describeItems().items).toEqual(items);
    world.step();
    expect(world.describeItems().items).toEqual([]);
  });
});

/**
 * Brings a player into a world, at the spawn point of the village or at the
 * landing of the cave, with some health, carrying some items.
 *
 * @param {World} world - The world.
 * @param {number} health - The health of the player.
 * @param {readonly ItemKindId[]} carried - What the player carries.
 * @param {boolean} [isInCave] - Whether the world is a cave, which it is
 *   not by default.
 * @param {number} [silver] - The number of silver coins the player has,
 *   none by default.
 * @returns {number} The identifier of the player.
 */
function admitCarrier(
  world: World,
  health: number,
  carried: readonly ItemKindId[],
  isInCave = false,
  silver = 0,
): number {
  const player: Player = {
    id: 1,
    appearance: 1,
    mover: new AuthoritativePlayer(createMotion(CAVE_LANDING, 0)),
    health,
    deathSteps: 0,
    lastSlash: null,
    inventory: [...carried],
    silver,
    acquaintances: [],
    quests: {},
    dialogue: null,
    turnCount: 0,
    isHunted: false,
    speeches: [],
    sayings: [],
    saidStep: null,
  };
  world.admitPlayer(player, isInCave ? CAVE_LANDING : null);
  return player.id;
}

/**
 * Tells a world, as the next input of a player, that the player uses the
 * item of a slot of its inventory at the next step.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {number} slot - The number of the slot, from 0.
 */
function useItem(world: World, id: number, slot: number): void {
  world.receiveInput(id, {
    type: 'use',
    sequence: ++lastSequence,
    after: 0,
    slot,
  });
}

describe('a player who uses a healing potion', () => {
  it('gets 50 health back at once, as an event, and the potion is gone', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, 30, [
      'clover',
      'healing-potion',
      'sword',
    ]);
    useItem(world, id, 1);
    world.step();
    expect(findPlayer(world, id).health).toBe(80);
    expect(world.findInventory(id)).toEqual(['clover', 'sword']);
    expect(world.takeEvents()).toEqual([
      expect.objectContaining({
        type: 'heal',
        target: { kind: 'player', id },
        amount: 50,
      }),
    ]);
  });

  it('gets no more health back than it lacks', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, PLAYER_HEALTH - 20, [
      'healing-potion',
    ]);
    useItem(world, id, 0);
    world.step();
    expect(findPlayer(world, id).health).toBe(PLAYER_HEALTH);
    expect(world.findInventory(id)).toEqual([]);
    expect(world.takeEvents()).toEqual([
      expect.objectContaining({ type: 'heal', amount: 20 }),
    ]);
  });

  it('keeps the potion at full health', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, PLAYER_HEALTH, ['healing-potion']);
    useItem(world, id, 0);
    world.step();
    expect(findPlayer(world, id).health).toBe(PLAYER_HEALTH);
    expect(world.findInventory(id)).toEqual(['healing-potion']);
    expect(world.takeEvents()).toEqual([]);
  });

  it('keeps the potion while it lies dead', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, 20, ['healing-potion']);
    killPlayer(world, id);
    useItem(world, id, 0);
    world.step();
    expect(findPlayer(world, id).health).toBe(0);
    expect(world.findInventory(id)).toEqual(['healing-potion']);
    expect(world.takeEvents()).toEqual([]);
  });

  it('uses nothing from an empty slot, one out of range, or one that cannot be used', () => {
    const world = new World(createRandom());
    const carried: ItemKindId[] = ['clover', 'sword', 'leather-armour'];
    const id: number = admitCarrier(world, 30, carried);
    for (const slot of [0, 1, 2, 3, INVENTORY_SIZE, 1000]) {
      useItem(world, id, slot);
      world.step();
    }
    expect(findPlayer(world, id).health).toBe(30);
    expect(world.findInventory(id)).toEqual(carried);
    expect(world.takeEvents()).toEqual([]);
  });

  it('gets health back in the cave too', () => {
    const world = new World(createRandom(), { map: 'cave', monsters: [] });
    const id: number = admitCarrier(world, 40, ['healing-potion'], true);
    useItem(world, id, 0);
    world.step();
    expect(findPlayer(world, id).health).toBe(90);
    expect(world.findInventory(id)).toEqual([]);
  });
});

describe('the inventory of a player', () => {
  it('is empty when the player comes into the world', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    expect(world.findInventory(id)).toEqual([]);
  });

  it('is kept through death', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickItem(world, id);
    world.step();
    killPlayer(world, id);
    stepTimes(world, DEATH_STEPS);
    expect(findPlayer(world, id).health).toBe(PLAYER_HEALTH);
    expect(world.findInventory(id)).toEqual(['clover']);
  });

  it('is told of its player alone', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    const { id: other }: PlayerState = world.addPlayer();
    pickItem(world, id);
    world.step();
    expect(world.findInventory(other)).toEqual([]);
    for (const player of world.listPlayers()) {
      expect(Object.keys(player).sort()).toEqual(
        Object.keys(findPlayer(world, other)).sort(),
      );
      expect(JSON.stringify(player)).not.toContain('clover');
    }
  });

  it('is lost when the player leaves', () => {
    const world = new World(createRandom());
    const id: number = addPicker(world);
    pickItem(world, id);
    world.step();
    world.removePlayer(id);
    expect(world.findInventory(id)).toBeNull();
    expect(world.describeItems().items).toEqual([]);
  });
});

/**
 * Makes a source of random numbers that gives the same numbers every time,
 * as {@link createRandom} does, but one number alone while it is rigged.
 *
 * @returns {[() => number, (value: number | null) => void]} The source,
 *   and what rigs it to give a number, or, given `null`, unrigs it.
 */
function createRiggedRandom(): [
  () => number,
  (value: number | null) => void,
] {
  const draw: () => number = createRandom();
  let rigged: number | null = null;
  return [
    (): number => rigged ?? draw(),
    (value: number | null): void => {
      rigged = value;
    },
  ];
}

/**
 * Has a player of the village slash at the wild dog until it is dead, with
 * the source of random numbers of the world rigged from the slash that is
 * to kill it, and stops at the step at which that slash is over.
 *
 * @param {World} world - The village.
 * @param {number} id - The identifier of the player.
 * @param {() => void} rig - Rigs the source of random numbers.
 * @throws {Error} If the dog does not die.
 */
function killVillageDog(world: World, id: number, rig: () => void): void {
  meetMonster(world, id);
  for (let tries = 0; tries < 20; tries++) {
    const dog: MonsterState = findMonster(world);
    if (dog.mode === 'dead') {
      return;
    }
    if (dog.health <= SLASH_DAMAGE) {
      rig();
    }
    turnPlayer(world, id, dog);
    interactPlayer(world, id);
    stepTimes(world, SLASH_STEPS + 1);
  }
  throw new Error('The wild dog does not die.');
}

describe('the silver coins of a player', () => {
  it('are none when the player comes into the world', () => {
    const world = new World(createRandom());
    const { id }: PlayerState = world.addPlayer();
    expect(world.findSilver(id)).toBe(0);
  });

  it.each([
    [0, 0],
    [0.3, 0],
    [0.34, 1],
    [0.66, 1],
    [0.67, 2],
    [0.99, 2],
  ])(
    'come from the wild dog of the village, drawn as %f, %i of them',
    (value: number, silver: number) => {
      const [draw, rig] = createRiggedRandom();
      const world = new World(draw);
      const { id }: PlayerState = world.addPlayer();
      killVillageDog(world, id, () => {
        rig(value);
      });
      expect(world.findSilver(id)).toBe(silver);
      expect(world.describeItems().items).toEqual([]);
    },
  );

  it('go to the player who kills the dog alone', () => {
    const [draw, rig] = createRiggedRandom();
    const world = new World(draw);
    const { id }: PlayerState = world.addPlayer();
    const { id: other }: PlayerState = world.addPlayer();
    killVillageDog(world, id, () => {
      rig(0.99);
    });
    expect(world.findSilver(id)).toBe(2);
    expect(world.findSilver(other)).toBe(0);
  });

  it('come once for each death of the dog', () => {
    const [draw, rig] = createRiggedRandom();
    const world = new World(draw);
    const { id }: PlayerState = world.addPlayer();
    killVillageDog(world, id, () => {
      rig(0.99);
    });
    rig(null);
    stepTimes(world, 3 * SIMULATION_RATE);
    expect(world.findSilver(id)).toBe(2);
  });

  it('are kept through death', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, PLAYER_HEALTH, [], false, 7);
    killPlayer(world, id);
    stepTimes(world, DEATH_STEPS);
    expect(findPlayer(world, id).health).toBe(PLAYER_HEALTH);
    expect(world.findSilver(id)).toBe(7);
  });

  it('are told of their player alone', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, PLAYER_HEALTH, [], false, 7);
    for (const player of world.listPlayers()) {
      expect(player).not.toHaveProperty('silver');
    }
    expect(world.findSilver(id)).toBe(7);
  });

  it('are lost when the player leaves', () => {
    const world = new World(createRandom());
    const id: number = admitCarrier(world, PLAYER_HEALTH, [], false, 7);
    world.removePlayer(id);
    expect(world.findSilver(id)).toBeNull();
  });
});

describe('a world of the cave', () => {
  /** The ways around the cave. */
  const graph = new NavigationGraph(CAVE_TERRAIN);

  /** The prisoner in the north cell. */
  const edwin: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.id === 'edwin',
  );

  /**
   * Makes a fresh cave with a player in it at the landing, as it comes down
   * from the village.
   *
   * @param {readonly ItemKindId[]} [carried] - What the player carries,
   *   nothing by default.
   * @param {boolean} [hasDogs] - Whether the cave has its wild dogs, which
   *   it has not by default, so that nothing gets in the way of the player.
   * @param {readonly MonsterSpawn[]} [dogs] - The wild dogs the cave has,
   *   if it has any, those of the cave by default.
   * @returns {[World, number]} The cave, and the identifier of the player.
   */
  function enterCave(
    carried: readonly ItemKindId[] = [],
    hasDogs = false,
    dogs?: readonly MonsterSpawn[],
  ): [World, number] {
    const monsters: readonly MonsterSpawn[] | undefined = hasDogs ? dogs : [];
    const world = new World(createRandom(), {
      map: 'cave',
      ...(monsters === undefined ? {} : { monsters }),
    });
    const player: Player = {
      id: 1,
      appearance: 1,
      mover: new AuthoritativePlayer(createMotion(CAVE_LANDING, 0)),
      health: PLAYER_HEALTH,
      deathSteps: 0,
      lastSlash: null,
      inventory: [...carried],
      silver: 0,
      acquaintances: [],
      quests: {},
      dialogue: null,
      turnCount: 0,
      isHunted: false,
      speeches: [],
      sayings: [],
      saidStep: null,
    };
    world.admitPlayer(player, CAVE_LANDING);
    return [world, player.id];
  }

  /**
   * Walks a player of the cave to a point around what stands in the way,
   * steering it at every step, and stops it there.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   * @param {GroundVector} to - The point.
   * @throws {Error} If the player finds no way there.
   */
  function walkInCave(world: World, id: number, to: GroundVector): void {
    const path: GroundVector[] | null = graph.findPath(
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
   * Walks a player of the cave up to a container, and turns it to face it.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   * @param {CaveContainer} container - The container.
   */
  function walkToContainer(
    world: World,
    id: number,
    container: CaveContainer,
  ): void {
    const yaw: number = (container.yaw * Math.PI) / 180;
    walkInCave(world, id, {
      x: container.x + Math.sin(yaw) * 0.75,
      z: container.z + Math.cos(yaw) * 0.75,
    });
    turnPlayer(world, id, container);
  }

  /**
   * Finds the container that holds a kind of item.
   *
   * @param {ItemKindId} item - The kind of item.
   * @returns {CaveContainer} The first container that holds it.
   * @throws {Error} If no container holds it.
   */
  function findContainer(item: ItemKindId): CaveContainer {
    const found: CaveContainer | undefined = CAVE_CONTAINERS.find(
      (container: CaveContainer) => container.item === item,
    );
    if (found === undefined) {
      throw new Error(`No container holds ${item}.`);
    }
    return found;
  }

  /**
   * Has a player of a world pick what is within its reach at the next step,
   * and takes that step.
   *
   * @param {World} world - The world.
   * @param {number} id - The identifier of the player.
   */
  function pickOnce(world: World, id: number): void {
    const stamp = { sequence: ++lastSequence, after: 0 };
    world.receiveInput(id, { type: 'pick', ...stamp });
    world.step();
  }

  it('gives what each container holds once, and leaves it looted', () => {
    const [world, id] = enterCave();
    const taken: ItemKindId[] = [];
    let silver = 0;
    CAVE_CONTAINERS.forEach((container: CaveContainer, number: number) => {
      walkToContainer(world, id, container);
      pickOnce(world, id);
      if (container.item !== null) {
        taken.push(container.item);
      }
      silver += container.silver ?? 0;
      expect(world.findInventory(id)).toEqual(taken);
      expect(world.findSilver(id)).toBe(silver);
      pickOnce(world, id);
      expect(world.findInventory(id)).toEqual(taken);
      expect(world.findSilver(id)).toBe(silver);
      expect(world.describeItems().looted).toContain(number);
    });
    expect([...taken].sort()).toEqual([
      'clover',
      'clover',
      'healing-potion',
      'leather-armour',
      'sword',
    ]);
    expect(silver).toBe(5);
    expect(world.describeItems().looted).toEqual(
      CAVE_CONTAINERS.map((_, number: number) => number),
    );
  });

  it('gives the silver coins of its barrel into a full inventory', () => {
    const full: ItemKindId[] = new Array<ItemKindId>(INVENTORY_SIZE).fill(
      'clover',
    );
    const [world, id] = enterCave(full);
    const number: number = CAVE_CONTAINERS.findIndex(
      (container: CaveContainer) => (container.silver ?? 0) > 0,
    );
    const barrel: CaveContainer | undefined = CAVE_CONTAINERS[number];
    if (barrel === undefined) {
      throw new Error('No container holds silver coins.');
    }
    walkToContainer(world, id, barrel);
    pickOnce(world, id);
    expect(world.findSilver(id)).toBe(5);
    expect(world.findInventory(id)).toEqual(full);
    expect(world.describeItems().looted).toEqual([number]);
  });

  it('starts with every container full', () => {
    const [world] = enterCave();
    expect(world.describeItems()).toEqual({
      clovers: [],
      items: [],
      looted: [],
    });
  });

  it('takes nothing into a full inventory, and leaves the container full', () => {
    const full: ItemKindId[] = new Array<ItemKindId>(INVENTORY_SIZE).fill(
      'clover',
    );
    const [world, id] = enterCave(full);
    walkToContainer(world, id, findContainer('sword'));
    pickOnce(world, id);
    expect(world.findInventory(id)).toEqual(full);
    expect(world.describeItems().looted).toEqual([]);
  });

  it('holds a healing potion in the barrel in the corner of the south store room', () => {
    const barrel: CaveContainer | undefined = CAVE_CONTAINERS.find(
      (container: CaveContainer) =>
        container.kind === 'barrel' && container.x === 7 && container.z === 4.5,
    );
    if (barrel === undefined) {
      throw new Error('There is no barrel at (7.0, 4.5).');
    }
    const [world, id] = enterCave();
    walkToContainer(world, id, barrel);
    pickOnce(world, id);
    expect(world.findInventory(id)).toEqual(['healing-potion']);
  });

  it('lets the new items be put down and picked up again', () => {
    for (const item of ['sword', 'leather-armour', 'healing-potion'] as const) {
      const [world, id] = enterCave();
      walkToContainer(world, id, findContainer(item));
      pickOnce(world, id);
      const stamp = { sequence: ++lastSequence, after: 0 };
      world.receiveInput(id, { type: 'drop', slot: 0, ...stamp });
      world.step();
      expect(world.findInventory(id)).toEqual([]);
      const { x, z }: PlayerState = findPlayer(world, id);
      const lying: GroundItem[] = [...world.describeItems().items];
      expect(lying.map((ground: GroundItem) => ground.kind)).toEqual([item]);
      expect(lying[0]?.x).toBeCloseTo(x, 2);
      expect(lying[0]?.z).toBeCloseTo(z, 2);
      pickOnce(world, id);
      expect(world.findInventory(id)).toEqual([item]);
      expect(world.describeItems().items).toEqual([]);
    }
  });

  /**
   * Finds a wild dog of a cave as it is now.
   *
   * @param {World} world - The cave.
   * @param {number} dogId - The identifier of the dog.
   * @returns {MonsterState | undefined} The dog, if it is to be seen.
   */
  function findDog(world: World, dogId: number): MonsterState | undefined {
    return world
      .listMonsters()
      .find((monster: MonsterState) => monster.id === dogId);
  }

  /**
   * Waits, with a player of a cave standing still, until a wild dog has
   * come to it, and turns the player to face it.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   * @param {number} dogId - The identifier of the dog.
   * @throws {Error} If the dog does not come.
   */
  function awaitDog(world: World, id: number, dogId: number): void {
    for (let step = 0; step < 20 * SIMULATION_RATE; step++) {
      const dog: MonsterState | undefined = findDog(world, dogId);
      if (
        dog?.mode === 'chase' &&
        dog.action !== 'Walk' &&
        measureDistance(findPlayer(world, id), dog) <= MONSTER_APPROACH_DISTANCE
      ) {
        turnPlayer(world, id, dog);
        return;
      }
      world.step();
    }
    throw new Error(`Dog ${String(dogId)} does not come.`);
  }

  /**
   * Has a player of a cave slash once after another, facing the way it
   * does, until a wild dog is dead, and stops at the step at which it dies.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   * @param {number} dogId - The identifier of the dog.
   * @returns {number[]} The health of the dog after each slash.
   */
  function slashDog(world: World, id: number, dogId: number): number[] {
    const healths: number[] = [];
    for (let tries = 0; tries < 20; tries++) {
      interactPlayer(world, id);
      world.step();
      const health: number = findDog(world, dogId)?.health ?? NaN;
      healths.push(health);
      if (health === 0) {
        break;
      }
      stepTimes(world, SLASH_STEPS);
    }
    return healths;
  }

  it('has its two wild dogs idling at their homes, at full health', () => {
    const world = new World(createRandom(), { map: 'cave' });
    expect(world.listMonsters()).toEqual(
      CAVE_DOG_HOMES.map((home: Pose, index: number) => ({
        id: index + 1,
        kind: 'cave-dog',
        x: home.x,
        z: home.z,
        yaw: home.yaw,
        action: 'Idle',
        actionCount: expect.any(Number) as number,
        health: CAVE_DOG.health,
        mode: 'idle',
      })),
    );
  });

  it('has its dogs in the passage, by the cells and before them', () => {
    expect(CAVE_DOG_HOMES).toEqual([
      { x: 14.5, z: 0, yaw: 90 },
      { x: 9.25, z: 0, yaw: 90 },
    ]);
  });

  it('has its dogs wander a little round their homes, in the passage', () => {
    const world = new World(createRandom(), { map: 'cave' });
    const modes = new Set<string>();
    for (let step = 0; step < 120 * SIMULATION_RATE; step++) {
      world.step();
      world.listMonsters().forEach((dog: MonsterState, index: number) => {
        modes.add(dog.mode);
        const home: GroundVector = CAVE_DOG_HOMES[index] ?? { x: NaN, z: NaN };
        expect(measureDistance(dog, home)).toBeLessThanOrEqual(
          CAVE_DOG.wanderRadius,
        );
        expect(Math.abs(dog.z)).toBeLessThan(1.5);
        expect(CAVE_TERRAIN.isClear(dog)).toBe(true);
      });
    }
    expect([...modes].sort()).toEqual(['idle', 'wander']);
  });

  it('has the dog by the cells notice a player at the landing', () => {
    const [world, id] = enterCave([], true);
    world.step();
    expect(findDog(world, 1)?.mode).toBe('chase');
    expect(findDog(world, 2)?.mode).toBe('idle');
    awaitDog(world, id, 1);
    expect(findPlayer(world, id).x).toBeCloseTo(CAVE_LANDING.x, 0);
  });

  it('has a dog go home once the player it chases is gone', () => {
    const [world, id] = enterCave([], true);
    awaitDog(world, id, 1);
    world.removePlayer(id);
    const modes = new Set<string>();
    for (let step = 0; step < 20 * SIMULATION_RATE; step++) {
      world.step();
      modes.add(findDog(world, 1)?.mode ?? '');
    }
    expect(modes).toContain('return');
    const dog: MonsterState | undefined = findDog(world, 1);
    expect(['idle', 'wander']).toContain(dog?.mode);
    const home: GroundVector = CAVE_DOG_HOMES[0] ?? { x: NaN, z: NaN };
    expect(
      measureDistance(dog ?? { x: NaN, z: NaN }, home),
    ).toBeLessThanOrEqual(CAVE_DOG.wanderRadius);
  });

  it('has a dog bite as hard and as often as a cave dog does', () => {
    const [world, id] = enterCave([], true);
    awaitDog(world, id, 1);
    world.takeEvents();
    const steps: number[] = [];
    for (let step = 0; step < 5 * SIMULATION_RATE; step++) {
      world.step();
      for (const event of world.takeEvents()) {
        expect(event).toMatchObject({
          type: 'hit',
          attacker: { kind: 'monster', id: 1 },
          target: { kind: 'player', id },
          damage: CAVE_DOG.biteDamage,
        });
        steps.push(step);
      }
    }
    expect(steps.length).toBeGreaterThan(2);
    for (let index = 1; index < steps.length; index++) {
      expect((steps[index] ?? 0) - (steps[index - 1] ?? 0)).toBe(
        CAVE_DOG.biteInterval * SIMULATION_RATE,
      );
    }
  });

  it('has a dog killed by as many slashes as its health takes', () => {
    const [world, id] = enterCave([], true);
    awaitDog(world, id, 1);
    const slashes: number = Math.ceil(CAVE_DOG.health / SLASH_DAMAGE);
    expect(slashDog(world, id, 1)).toEqual(
      Array.from({ length: slashes }, (_, index: number) =>
        Math.max(CAVE_DOG.health - (index + 1) * SLASH_DAMAGE, 0),
      ),
    );
    expect(findDog(world, 1)?.mode).toBe('dead');
    expect(findDog(world, 2)).toMatchObject({ health: CAVE_DOG.health });
    expect(world.findSilver(id)).toBe(0);
  });

  it('brings a dead dog back at its home after its respawn time, not before', () => {
    const [world, id] = enterCave([], true);
    awaitDog(world, id, 1);
    slashDog(world, id, 1);
    stepTimes(world, CAVE_DOG.respawnDelay * SIMULATION_RATE - 1);
    expect(findDog(world, 1)).toBeUndefined();
    world.step();
    const home: Pose = CAVE_DOG_HOMES[0] ?? { x: NaN, z: NaN, yaw: NaN };
    expect(findDog(world, 1)).toMatchObject({
      kind: 'cave-dog',
      x: home.x,
      z: home.z,
      yaw: home.yaw,
      action: 'Idle',
      health: CAVE_DOG.health,
      mode: 'idle',
    });
    expect(findPlayer(world, id).health).toBeGreaterThan(0);
  });

  it('has a slash hit the dog in front of the player, and that dog alone', () => {
    const [world, id] = enterCave([], true);
    awaitDog(world, id, 1);
    slashDog(world, id, 1);
    steerPlayer(world, id, { x: -1, z: 0 });
    for (
      let step = 0;
      step < 10 * SIMULATION_RATE && findDog(world, 2)?.mode !== 'chase';
      step++
    ) {
      world.step();
    }
    steerPlayer(world, id, { x: 0, z: 0 });
    awaitDog(world, id, 2);
    world.takeEvents();
    interactPlayer(world, id);
    world.step();
    expect(
      world
        .takeEvents()
        .filter((event: GameEvent) => event.target.kind === 'monster'),
    ).toEqual([
      expect.objectContaining({
        type: 'hit',
        attacker: { kind: 'player', id },
        target: { kind: 'monster', id: 2 },
        damage: SLASH_DAMAGE,
      }),
    ]);
    expect(findDog(world, 2)?.health).toBe(CAVE_DOG.health - SLASH_DAMAGE);
    expect(world.findSlash(id)).toMatchObject({ isHit: true });
    expect(findDog(world, 1)?.mode ?? 'dead').toBe('dead');
  });

  /**
   * Walks a player of the cave up to the bars of the cell of Edwin, facing
   * him, and stops it there.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   */
  function faceEdwin(world: World, id: number): void {
    const at: GroundVector =
      edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0);
    walkInCave(world, id, { x: at.x, z: 0 });
    steerPlayer(world, id, { x: 0, z: -1 });
    stepTimes(world, 2 * SIMULATION_RATE);
    steerPlayer(world, id, { x: 0, z: 0 });
    world.step();
  }

  /**
   * Has a player talk to whoever it faces, and waits for the talk to end.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   */
  function talkTo(world: World, id: number): void {
    interactPlayer(world, id);
    stepTimes(world, TALK_STEPS + 1);
  }

  /**
   * Has a player choose a reply in its dialogue, and takes a step.
   *
   * @param {World} world - The cave.
   * @param {number} id - The identifier of the player.
   * @param {number} choice - The number of the reply, from 0.
   */
  function reply(world: World, id: number, choice: number): void {
    world.receiveInput(id, {
      type: 'reply',
      choice,
      sequence: ++lastSequence,
      after: 0,
    });
    world.step();
  }

  it('has the prisoner talked to through his bars, unhurt', () => {
    const [world, id] = enterCave();
    const at: GroundVector =
      edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0);
    faceEdwin(world, id);
    const before: PlayerState = findPlayer(world, id);
    expect(before.z).toBeGreaterThan(at.z);
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id)).toMatchObject({
      action: 'Talk',
      x: before.x,
      z: before.z,
    });
    expect(world.findSlash(id)).toBeNull();
    expect(world.takeEvents()).toEqual([]);
  });

  it('has a player slash at a dog in front of it, rather than talk', () => {
    const at: GroundVector =
      edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0);
    const [world, id] = enterCave([], true, [
      { kind: 'cave-dog', home: { x: at.x + 3, z: 0, yaw: -90 } },
    ]);
    walkInCave(world, id, { x: at.x - 0.8, z: 0 });
    steerPlayer(world, id, { x: 0, z: -1 });
    stepTimes(world, 2 * SIMULATION_RATE);
    steerPlayer(world, id, { x: 0, z: 0 });
    world.step();
    awaitDog(world, id, 1);
    const near: MonsterState | undefined = findDog(world, 1);
    turnPlayer(world, id, {
      x: (at.x + (near?.x ?? NaN)) / 2,
      z: (at.z + (near?.z ?? NaN)) / 2,
    });
    const player: PlayerState = findPlayer(world, id);
    const dog: MonsterState | undefined = findDog(world, 1);
    expect(findInteraction(player, 0, 'cave')).toBe('Talk');
    expect(isWithinStrike(player, dog ?? player, SLASH_REACH)).toBe(true);
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id).action).toBe('Slash');
    expect(world.findSlash(id)).toMatchObject({ isHit: true });
    stepTimes(world, TALK_STEPS + 1);
    expect(world.findDialogue(id)).toBeNull();
  });

  it('has Edwin plead, tell who he is, and give his message', () => {
    const [world, id] = enterCave();
    faceEdwin(world, id);
    expect(world.findDialogue(id)).toBeNull();
    talkTo(world, id);
    expect(world.findDialogue(id)).toEqual({
      villager: 'edwin',
      line: 'dialogue.edwin.plea',
      replies: ['dialogue.edwin.askWho'],
      turn: 1,
    });
    expect(world.findAcquaintances(id)).toEqual([]);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toEqual({
      villager: 'edwin',
      line: 'dialogue.edwin.identity',
      replies: ['dialogue.edwin.offerKey'],
      turn: 2,
    });
    expect(world.findAcquaintances(id)).toEqual(['edwin']);
    expect(world.findInventory(id)).toEqual([]);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.edwin.errand',
      replies: [],
    });
    expect(world.findInventory(id)).toEqual(['clovervale-message']);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toBeNull();
    expect(world.takeSpeeches(id)).toEqual([]);
  });

  it('ignores a reply that is not offered', () => {
    const [world, id] = enterCave();
    faceEdwin(world, id);
    talkTo(world, id);
    reply(world, id, 1);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.edwin.plea',
      turn: 1,
    });
  });

  it('has Edwin only remind a player who carries his message', () => {
    const [world, id] = enterCave();
    faceEdwin(world, id);
    talkTo(world, id);
    reply(world, id, 0);
    reply(world, id, 0);
    reply(world, id, 0);
    talkTo(world, id);
    expect(world.findDialogue(id)).toBeNull();
    expect(world.takeSpeeches(id)).toEqual([
      { villager: 'edwin', line: 'dialogue.edwin.reminder' },
    ]);
    expect(world.takeSpeeches(id)).toEqual([]);
    expect(world.findInventory(id)).toEqual(['clovervale-message']);
  });

  it('has Edwin write his message again for a player who lost it', () => {
    const [world, id] = enterCave();
    faceEdwin(world, id);
    talkTo(world, id);
    reply(world, id, 0);
    reply(world, id, 0);
    reply(world, id, 0);
    world.receiveInput(id, {
      type: 'drop',
      slot: 0,
      sequence: ++lastSequence,
      after: 0,
    });
    world.step();
    expect(world.findInventory(id)).toEqual([]);
    talkTo(world, id);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.edwin.wonder',
      replies: ['dialogue.edwin.tellLost'],
    });
    reply(world, id, 0);
    expect(world.findDialogue(id)).toMatchObject({
      line: 'dialogue.edwin.rewrite',
      replies: [],
    });
    expect(world.findInventory(id)).toEqual(['clovervale-message']);
  });

  it('lays his message at the feet of a player with a full bag', () => {
    const [world, id] = enterCave(
      new Array<ItemKindId>(INVENTORY_SIZE).fill('clover'),
    );
    faceEdwin(world, id);
    talkTo(world, id);
    reply(world, id, 0);
    reply(world, id, 0);
    const { x, z }: PlayerState = findPlayer(world, id);
    expect(world.describeItems().items).toEqual([
      expect.objectContaining({ kind: 'clovervale-message' }),
    ]);
    const [item] = world.describeItems().items;
    expect(Math.hypot((item?.x ?? NaN) - x, (item?.z ?? NaN) - z)).toBeLessThan(
      0.01,
    );
  });

  it('holds the player and pauses the dogs while it is in a dialogue', () => {
    const [world, id] = enterCave([], true);
    faceEdwin(world, id);
    talkTo(world, id);
    expect(world.findDialogue(id)).not.toBeNull();
    const player: PlayerState = findPlayer(world, id);
    const dogs: MonsterState[] = world.listMonsters();
    steerPlayer(world, id, { x: 0, z: 1 });
    stepTimes(world, 10 * SIMULATION_RATE);
    expect(findPlayer(world, id)).toMatchObject({
      x: player.x,
      z: player.z,
      action: 'Idle',
    });
    expect(world.listMonsters()).toEqual(dogs);
    reply(world, id, 0);
    reply(world, id, 0);
    reply(world, id, 0);
    expect(world.findDialogue(id)).toBeNull();
    steerPlayer(world, id, { x: 0, z: 0 });
    stepTimes(world, 10 * SIMULATION_RATE);
    expect(world.listMonsters()).not.toEqual(dogs);
  });
});

describe('Martha in the village', () => {
  /** The numbers of Martha. */
  const MARTHA: MonsterKind = MONSTER_KINDS.martha;

  /** The number of steps Martha sits on the ground once beaten. */
  const SIT_STEPS: number = MARTHA.respawnDelay * SIMULATION_RATE;

  /** Where Martha stands on her porch. */
  const PORCH: Placement = findPlacement('npc-martha.glb');

  /** The number of the latest player a test has had climb out. */
  let lastClimber = 100;

  /**
   * Makes a village without its wild dog, so that nothing but Martha gets
   * in the way of the players.
   *
   * @returns {World} The village.
   */
  function createVillage(): World {
    return new World(createRandom(), { monsters: [] });
  }

  /**
   * Has a player climb out of the well into a village.
   *
   * @param {World} world - The village.
   * @param {readonly ItemKindId[]} [carried] - What the player carries,
   *   nothing by default.
   * @param {readonly Villager['id'][]} [known] - The villagers who have
   *   told the player who they are, none by default.
   * @param {QuestLog} [quests] - How far the player has got with the
   *   quests, none by default.
   * @returns {Player} The player.
   */
  function climbOut(
    world: World,
    carried: readonly ItemKindId[] = [],
    known: readonly Villager['id'][] = [],
    quests: QuestLog = {},
  ): Player {
    const player: Player = {
      id: ++lastClimber,
      appearance: 1,
      mover: new AuthoritativePlayer(createMotion(CAVE_LANDING, 0)),
      health: PLAYER_HEALTH,
      deathSteps: 0,
      lastSlash: null,
      inventory: [...carried],
      silver: 0,
      acquaintances: [...known],
      quests: { ...quests },
      dialogue: null,
      turnCount: 0,
      isHunted: false,
      speeches: [],
      sayings: [],
      saidStep: null,
    };
    world.admitPlayer(player, WELL_STAND);
    return player;
  }

  /**
   * Finds Martha in a world as she is now.
   *
   * @param {World} world - The village.
   * @returns {MonsterState} Martha.
   * @throws {Error} If she is not among the monsters.
   */
  function findMartha(world: World): MonsterState {
    const martha: MonsterState | undefined = world
      .listMonsters()
      .find((monster: MonsterState) => monster.kind === 'martha');
    if (martha === undefined) {
      throw new Error('Martha is not to be seen.');
    }
    return martha;
  }

  /**
   * Moves a world forward until Martha is up to something, or for a while.
   *
   * @param {World} world - The village.
   * @param {MonsterState['mode']} mode - What she is to be up to.
   * @param {number} [seconds] - The longest to wait, in seconds, 20 by
   *   default.
   */
  function waitForMartha(
    world: World,
    mode: MonsterState['mode'],
    seconds = 20,
  ): void {
    for (let step = 0; step < seconds * SIMULATION_RATE; step++) {
      if (findMartha(world).mode === mode) {
        return;
      }
      world.step();
    }
  }

  /**
   * Has a player choose a reply in its dialogue, and takes a step.
   *
   * @param {World} world - The village.
   * @param {number} id - The identifier of the player.
   */
  function reply(world: World, id: number): void {
    world.receiveInput(id, {
      type: 'reply',
      choice: 0,
      sequence: ++lastSequence,
      after: 0,
    });
    world.step();
  }

  /**
   * Has a player climb out of the well, wait for Martha to come up to it,
   * and talk with her to the end, so that she fights it.
   *
   * @param {World} world - The village.
   * @returns {number} The identifier of the player.
   */
  function startFight(world: World): number {
    const { id }: Player = climbOut(world);
    waitForMartha(world, 'talk');
    world.step();
    reply(world, id);
    reply(world, id);
    world.step();
    return id;
  }

  /**
   * Has a player slash at Martha until she sits beaten on the ground, or
   * for a while.
   *
   * @param {World} world - The village.
   * @param {number} id - The identifier of the player.
   */
  function beatMartha(world: World, id: number): void {
    for (let tries = 0; tries < 20; tries++) {
      if (findMartha(world).mode === 'sit') {
        return;
      }
      turnPlayer(world, id, findMartha(world));
      interactPlayer(world, id);
      stepTimes(world, SLASH_STEPS + 1);
    }
  }

  /**
   * Walks a player straight away from Martha's porch until it is beyond
   * her leash, and stops it.
   *
   * @param {World} world - The village.
   * @param {number} id - The identifier of the player.
   */
  function runAway(world: World, id: number): void {
    walkPlayer(world, id, BEYOND_LEASH);
  }

  /** A point on the plaza beyond Martha's leash, and clear of the fountain. */
  const BEYOND_LEASH: GroundVector = { x: 4, z: -6 };

  it('walks up to a player who climbs out of the well, and talks with it', () => {
    const world: World = createVillage();
    expect(findMartha(world).isArmed).toBe(false);
    const { id }: Player = climbOut(world);
    world.step();
    expect(findMartha(world).mode).toBe('approach');
    waitForMartha(world, 'talk');
    expect(
      measureDistance(findMartha(world), findPlayer(world, id)),
    ).toBeLessThanOrEqual(1.2);
    expect(findMartha(world).isArmed).toBe(true);
    expect(world.findDialogue(id)).toEqual({
      villager: 'martha',
      line: 'dialogue.martha.ask',
      replies: ['dialogue.martha.tellPrisoner'],
      turn: 1,
    });
  });

  it('is told of the envoy by a player Edwin has told who he is', () => {
    const world: World = createVillage();
    const { id }: Player = climbOut(world, [], ['edwin']);
    waitForMartha(world, 'talk');
    expect(world.findDialogue(id)?.replies).toEqual([
      'dialogue.martha.tellEnvoy',
    ]);
    reply(world, id);
    expect(world.findDialogue(id)).toEqual({
      villager: 'martha',
      line: 'dialogue.martha.confession',
      replies: [],
      turn: 2,
    });
  });

  it('takes up her pitchfork from the wall on her way, and leans it back', () => {
    const world: World = createVillage();
    climbOut(world);
    let isAtWall = false;
    for (let step = 0; step < 10 * SIMULATION_RATE; step++) {
      world.step();
      const martha: MonsterState = findMartha(world);
      if (measureDistance(martha, PITCHFORK_STAND) === 0) {
        isAtWall = true;
        expect(martha.isArmed).toBe(true);
        break;
      }
      expect(martha.isArmed).toBe(false);
    }
    expect(isAtWall).toBe(true);
  });

  it('lets a player that carries her token be', () => {
    const world: World = createVillage();
    climbOut(world, ['spy-token']);
    stepTimes(world, 5 * SIMULATION_RATE);
    expect(findMartha(world)).toMatchObject({
      mode: 'idle',
      x: PORCH.x,
      z: PORCH.z,
    });
  });

  it('fights the player once the dialogue is over, with her pitchfork', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    expect(world.findDialogue(id)).toBeNull();
    expect(findMartha(world).mode).toBe('chase');
    world.takeEvents();
    stepTimes(world, 3 * SIMULATION_RATE);
    const hits: GameEvent[] = world
      .takeEvents()
      .filter((event: GameEvent) => event.type === 'hit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatchObject({
      attacker: { kind: 'monster', id: findMartha(world).id },
      target: { kind: 'player', id },
      damage: MARTHA.biteDamage,
    });
  });

  it('sits once beaten, gives the token, and gets up later', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    beatMartha(world, id);
    expect(findMartha(world)).toMatchObject({
      mode: 'sit',
      action: 'Sit',
      isArmed: false,
    });
    expect(world.findInventory(id)).toEqual(['spy-token']);
    expect(world.findSilver(id)).toBe(0);
    stepTimes(world, SIT_STEPS);
    expect(findMartha(world)).toMatchObject({
      mode: 'return',
      health: MARTHA.health,
      isArmed: true,
    });
    waitForMartha(world, 'idle');
    expect(findMartha(world)).toMatchObject({
      x: PORCH.x,
      z: PORCH.z,
      isArmed: false,
    });
  });

  it('is not hurt by anyone but the player she fights', () => {
    const world: World = createVillage();
    startFight(world);
    const { id: other }: PlayerState = world.addPlayer();
    walkPlayer(world, other, findMartha(world));
    world.takeEvents();
    for (let tries = 0; tries < 3; tries++) {
      turnPlayer(world, other, findMartha(world));
      interactPlayer(world, other);
      stepTimes(world, SLASH_STEPS + 1);
    }
    const struck: GameEvent[] = world
      .takeEvents()
      .filter((event: GameEvent) => event.target.kind === 'monster');
    expect(struck).toEqual([]);
    expect(findMartha(world).health).toBe(MARTHA.health);
  });

  it('lets a player go that leaves before she comes up to it', () => {
    const world: World = createVillage();
    const { id }: Player = climbOut(world);
    runAway(world, id);
    waitForMartha(world, 'idle');
    expect(findMartha(world)).toMatchObject({ x: PORCH.x, z: PORCH.z });
    walkPlayer(world, id, WELL_STAND);
    stepTimes(world, 2 * SIMULATION_RATE);
    expect(findMartha(world).mode).toBe('idle');
  });

  it('hunts a player that gets away in a fight, without a word', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    runAway(world, id);
    waitForMartha(world, 'idle');
    walkPlayer(world, id, WELL_STAND);
    waitForMartha(world, 'chase', 3);
    expect(findMartha(world).mode).toBe('chase');
    expect(world.findDialogue(id)).toBeNull();
  });

  it('hunts a player she has killed, once it is back', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    for (let step = 0; step < 30 * SIMULATION_RATE; step++) {
      if (findPlayer(world, id).health === 0) {
        break;
      }
      world.step();
    }
    expect(findPlayer(world, id).health).toBe(0);
    stepTimes(world, DEATH_STEPS);
    waitForMartha(world, 'idle');
    walkPlayer(world, id, WELL_STAND);
    waitForMartha(world, 'chase', 3);
    expect(findMartha(world).mode).toBe('chase');
  });

  /**
   * Has a player slash at Martha until she has lost some health, or for a
   * while.
   *
   * @param {World} world - The village.
   * @param {number} id - The identifier of the player.
   */
  function woundMartha(world: World, id: number): void {
    for (let tries = 0; tries < 20; tries++) {
      if (findMartha(world).health < MARTHA.health) {
        return;
      }
      turnPlayer(world, id, findMartha(world));
      interactPlayer(world, id);
      stepTimes(world, SLASH_STEPS + 1);
    }
  }

  /**
   * Moves a world forward until Martha no longer fights, or for a while.
   *
   * @param {World} world - The village.
   * @param {number} [seconds] - The longest to wait, in seconds, 30 by
   *   default.
   */
  function waitForFightEnd(world: World, seconds = 30): void {
    for (let step = 0; step < seconds * SIMULATION_RATE; step++) {
      if (findMartha(world).mode !== 'chase') {
        return;
      }
      world.step();
    }
  }

  it('is at full health at once when a player gets away in a fight', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    woundMartha(world, id);
    expect(findMartha(world).health).toBeLessThan(MARTHA.health);
    runAway(world, id);
    waitForFightEnd(world);
    expect(findMartha(world)).toMatchObject({
      mode: 'return',
      health: MARTHA.health,
    });
  });

  it('is at full health at once when she kills the player she fights', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    woundMartha(world, id);
    expect(findMartha(world).health).toBeLessThan(MARTHA.health);
    waitForFightEnd(world);
    expect(findPlayer(world, id).health).toBe(0);
    expect(findMartha(world)).toMatchObject({
      mode: 'return',
      health: MARTHA.health,
    });
  });

  it('is at full health at once when the player she fights leaves', () => {
    const world: World = createVillage();
    const id: number = startFight(world);
    woundMartha(world, id);
    expect(findMartha(world).health).toBeLessThan(MARTHA.health);
    world.removePlayer(id);
    world.step();
    expect(findMartha(world)).toMatchObject({
      mode: 'return',
      health: MARTHA.health,
    });
  });

  it('deals with the players who climb out one at a time, in turn', () => {
    const world: World = createVillage();
    const first: number = startFight(world);
    const { id: second }: Player = climbOut(world);
    stepTimes(world, SIMULATION_RATE);
    expect(world.findDialogue(second)).toBeNull();
    beatMartha(world, first);
    stepTimes(world, SIT_STEPS);
    waitForMartha(world, 'talk');
    expect(world.findDialogue(second)?.villager).toBe('martha');
  });

  /** Where a player stands before Martha on her porch, facing her. */
  const BY_MARTHA: GroundVector = {
    x: PORCH.x + Math.sin((PORCH.yaw * Math.PI) / 180) * 1.2,
    z: PORCH.z + Math.cos((PORCH.yaw * Math.PI) / 180) * 1.2,
  };

  /**
   * Brings a player into the village on the plaza, as one that comes back
   * after dying does, which Martha leaves alone.
   *
   * @param {World} world - The village.
   * @param {readonly ItemKindId[]} carried - What the player carries.
   * @param {QuestLog} quests - How far the player has got with the quests.
   * @returns {number} The identifier of the player.
   */
  function admitVisitor(
    world: World,
    carried: readonly ItemKindId[],
    quests: QuestLog,
  ): number {
    const player: Player = {
      id: ++lastClimber,
      appearance: 1,
      mover: new AuthoritativePlayer(createMotion(PLAZA_CENTRE, 0)),
      health: PLAYER_HEALTH,
      deathSteps: 0,
      lastSlash: null,
      inventory: [...carried],
      silver: 0,
      acquaintances: [],
      quests: { ...quests },
      dialogue: null,
      turnCount: 0,
      isHunted: false,
      speeches: [],
      sayings: [],
      saidStep: null,
    };
    world.admitPlayer(player, null);
    return player.id;
  }

  /**
   * Walks a player up to Martha on her porch, unless it is there already,
   * and has it talk to her, as she stands idling there.
   *
   * @param {World} world - The village.
   * @param {number} id - The identifier of the player.
   * @returns {string[]} What she says to the player in passing.
   */
  function talkToMartha(world: World, id: number): string[] {
    if (measureDistance(findPlayer(world, id), BY_MARTHA) > 0.1) {
      walkPlayer(world, id, BY_MARTHA);
      turnPlayer(world, id, PORCH);
    }
    world.takeSpeeches(id);
    expect(findMartha(world).mode).toBe('idle');
    interactPlayer(world, id);
    world.step();
    expect(findPlayer(world, id).action).toBe('Talk');
    stepTimes(world, TALK_STEPS);
    return world
      .takeSpeeches(id)
      .map(({ villager, line }) => `${villager}:${line}`);
  }

  it('gives her ointment to a player on the quest of Toby, hurt', () => {
    const world: World = createVillage();
    const id: number = admitVisitor(world, [], { 'toby-hurt': 'started' });
    expect(talkToMartha(world, id)).toEqual([]);
    expect(world.findDialogue(id)).toEqual({
      villager: 'martha',
      line: 'dialogue.martha.welcome',
      replies: ['dialogue.martha.askMedicine'],
      turn: 1,
    });
    reply(world, id);
    expect(world.findDialogue(id)).toEqual({
      villager: 'martha',
      line: 'dialogue.martha.ointment',
      replies: [],
      turn: 2,
    });
    expect(world.findInventory(id)).toEqual(['martha-ointment']);
    reply(world, id);
    expect(world.findDialogue(id)).toBeNull();
    expect(findMartha(world)).toMatchObject({ mode: 'idle', isArmed: false });
    expect(world.findQuests(id)).toEqual({ 'toby-hurt': 'supplied' });
  });

  it('only tells a player who carries her ointment to hurry', () => {
    for (const stage of ['started', 'supplied'] as const) {
      const world: World = createVillage();
      const id: number = admitVisitor(world, ['martha-ointment'], {
        'toby-hurt': stage,
      });
      expect(talkToMartha(world, id)).toEqual([
        'martha:dialogue.martha.hurry',
      ]);
      expect(world.findDialogue(id)).toBeNull();
      expect(world.findInventory(id)).toEqual(['martha-ointment']);
    }
  });

  it('asks after Toby and gives another jar to a player who lost hers', () => {
    const world: World = createVillage();
    const id: number = admitVisitor(world, [], { 'toby-hurt': 'started' });
    talkToMartha(world, id);
    reply(world, id);
    reply(world, id);
    dropItem(world, id);
    world.step();
    expect(world.findInventory(id)).toEqual([]);
    talkToMartha(world, id);
    expect(world.findDialogue(id)).toEqual({
      villager: 'martha',
      line: 'dialogue.martha.wonder',
      replies: ['dialogue.martha.tellLost'],
      turn: 3,
    });
    reply(world, id);
    expect(world.findDialogue(id)).toEqual({
      villager: 'martha',
      line: 'dialogue.martha.replace',
      replies: [],
      turn: 4,
    });
    expect(world.findInventory(id)).toEqual(['martha-ointment']);
    expect(world.findQuests(id)).toEqual({ 'toby-hurt': 'supplied' });
    reply(world, id);
    expect(world.findDialogue(id)).toBeNull();
    expect(talkToMartha(world, id)).toEqual(['martha:dialogue.martha.hurry']);
  });

  it('asks after Toby whenever a player she has supplied comes without', () => {
    const world: World = createVillage();
    const id: number = admitVisitor(world, [], { 'toby-hurt': 'supplied' });
    expect(talkToMartha(world, id)).toEqual([]);
    expect(world.findDialogue(id)?.line).toBe('dialogue.martha.wonder');
    reply(world, id);
    expect(world.findInventory(id)).toEqual(['martha-ointment']);
  });

  it('gives her ointment to a player on the quest who has beaten her', () => {
    const world: World = createVillage();
    const id: number = admitVisitor(world, ['spy-token'], {
      'toby-hurt': 'started',
    });
    talkToMartha(world, id);
    reply(world, id);
    expect(world.findInventory(id)).toEqual(['spy-token', 'martha-ointment']);
  });

  it('says nothing of the quest to a player not on it', () => {
    for (const quests of [{}, { 'toby-hurt': 'done' }] as const) {
      const world: World = createVillage();
      const id: number = admitVisitor(world, [], quests);
      expect(talkToMartha(world, id)).toEqual([]);
      expect(world.findDialogue(id)).toBeNull();
      expect(world.findInventory(id)).toEqual([]);
    }
  });

  it('comes up to a player on the quest who climbs out of the well', () => {
    const world: World = createVillage();
    const { id }: Player = climbOut(world, [], [], { 'toby-hurt': 'started' });
    waitForMartha(world, 'talk');
    expect(world.findDialogue(id)).toMatchObject({
      villager: 'martha',
      line: 'dialogue.martha.ask',
    });
    reply(world, id);
    reply(world, id);
    world.step();
    expect(findMartha(world).mode).toBe('chase');
    expect(world.findInventory(id)).toEqual([]);
  });

  it('ends a talk of the quest as she sets out to a player out of the well', () => {
    const world: World = createVillage();
    const id: number = admitVisitor(world, [], { 'toby-hurt': 'started' });
    talkToMartha(world, id);
    expect(world.findDialogue(id)?.line).toBe('dialogue.martha.welcome');
    const { id: climber }: Player = climbOut(world);
    world.step();
    expect(findMartha(world).mode).toBe('approach');
    expect(world.findDialogue(id)).toBeNull();
    waitForMartha(world, 'talk');
    expect(world.findDialogue(climber)?.line).toBe('dialogue.martha.ask');
  });
});

/** The number of simulation steps between two lines of a player. */
const SAY_INTERVAL_STEPS: number = SAY_INTERVAL * SIMULATION_RATE;

/** Where the players who say something stand, on the open plaza. */
const SPEAKER_SPOT: GroundVector = { x: -3, z: 4 };

/**
 * Brings a player into a world at a place, where Martha leaves it alone.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} place - Where it stands.
 * @returns {number} The identifier of the player.
 */
function admitSpeaker(world: World, id: number, place: GroundVector): number {
  const player: Player = {
    id,
    appearance: 1,
    mover: new AuthoritativePlayer(createMotion(place, 0)),
    health: PLAYER_HEALTH,
    deathSteps: 0,
    lastSlash: null,
    inventory: ['spy-token'],
    silver: 0,
    acquaintances: [],
    quests: {},
    dialogue: null,
    turnCount: 0,
    isHunted: false,
    speeches: [],
    sayings: [],
    saidStep: null,
  };
  world.admitPlayer(player, { ...place, yaw: 0 });
  return id;
}

/**
 * Brings a player into a world a distance east of where the players who
 * say something stand.
 *
 * @param {World} world - The world.
 * @param {number} id - The identifier of the player.
 * @param {number} distance - The distance, in metres.
 * @returns {number} The identifier of the player.
 */
function admitListener(world: World, id: number, distance: number): number {
  const { x, z } = SPEAKER_SPOT;
  return admitSpeaker(world, id, { x: x + distance, z });
}

describe('a player who says a line', () => {
  it('is heard by itself and by the players within range', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    const near: number = admitListener(world, 2, 1.5);
    const edge: number = admitListener(world, 3, SAY_RANGE);
    expect(world.say(speaker, 'Hello there!')).toBe(true);
    const said: Saying[] = [{ player: speaker, text: 'Hello there!' }];
    expect(world.takeSayings(speaker)).toEqual(said);
    expect(world.takeSayings(near)).toEqual(said);
    expect(world.takeSayings(edge)).toEqual(said);
  });

  it('is not heard by a player out of range', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    const far: number = admitListener(world, 2, SAY_RANGE + 0.1);
    expect(world.say(speaker, 'Hello there!')).toBe(true);
    expect(world.takeSayings(far)).toEqual([]);
    expect(world.takeSayings(speaker)).toHaveLength(1);
  });

  it('is heard from where it stands as it speaks', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    const listener: number = admitListener(world, 2, SAY_RANGE + 2);
    steerPlayer(world, speaker, { x: 1, z: 0 });
    stepTimes(world, Math.ceil(2.5 / STEP_DISTANCE));
    expect(world.say(speaker, 'Coming!')).toBe(true);
    expect(world.takeSayings(listener)).toEqual([
      { player: speaker, text: 'Coming!' },
    ]);
  });

  it('is told to each player who heard it once', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    world.say(speaker, 'Hello there!');
    expect(world.takeSayings(speaker)).toHaveLength(1);
    expect(world.takeSayings(speaker)).toEqual([]);
  });

  it('says its line as plain text, trimmed, with its line breaks', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    world.say(speaker, '  <b>one</b>\r\n\ntwo\u0007three  \n');
    expect(world.takeSayings(speaker)).toEqual([
      { player: speaker, text: '<b>one</b>\ntwo three' },
    ]);
  });

  it('says a line of four rows at most, whatever its peer sent', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    world.say(speaker, 'a\n'.repeat(60));
    expect(world.takeSayings(speaker)).toEqual([
      { player: speaker, text: `a\na\na\n${'a '.repeat(46)}a` },
    ]);
  });

  it('says no more than a line may hold, whatever its peer sent', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    world.say(speaker, '葉'.repeat(SAY_LENGTH_LIMIT * 3));
    expect(world.takeSayings(speaker)).toEqual([
      { player: speaker, text: '葉'.repeat(SAY_LENGTH_LIMIT) },
    ]);
  });

  it('says nothing of an empty line', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    expect(world.say(speaker, ' \n ')).toBe(false);
    expect(world.takeSayings(speaker)).toEqual([]);
    // An empty line does not keep the next one from being said.
    expect(world.say(speaker, 'Now then.')).toBe(true);
  });

  it('says one line at most in the time between two lines', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    const listener: number = admitListener(world, 2, 1.5);
    expect(world.say(speaker, 'One.')).toBe(true);
    stepTimes(world, SAY_INTERVAL_STEPS - 1);
    expect(world.say(speaker, 'Two.')).toBe(false);
    world.step();
    expect(world.say(speaker, 'Three.')).toBe(true);
    const said: Saying[] = [
      { player: speaker, text: 'One.' },
      { player: speaker, text: 'Three.' },
    ];
    expect(world.takeSayings(listener)).toEqual(said);
    expect(world.takeSayings(speaker)).toEqual(said);
  });

  it('does not keep another player from saying a line at once', () => {
    const world = new World(createRandom());
    const speaker: number = admitListener(world, 1, 0);
    const other: number = admitListener(world, 2, 1.5);
    expect(world.say(speaker, 'One.')).toBe(true);
    expect(world.say(other, 'Two.')).toBe(true);
    expect(world.takeSayings(speaker)).toEqual([
      { player: speaker, text: 'One.' },
      { player: other, text: 'Two.' },
    ]);
  });

  it('says nothing for a player who is not in the world', () => {
    const world = new World(createRandom());
    const listener: number = admitListener(world, 1, 0);
    expect(world.say(99, 'Hello there!')).toBe(false);
    expect(world.takeSayings(listener)).toEqual([]);
    expect(world.takeSayings(99)).toEqual([]);
  });
});
