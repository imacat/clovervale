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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/20
// AI assistance: Claude Code (Anthropic)

/**
 * @module server/tests/realm Tests for the worlds the server holds, and the
 *   players going between them.
 */

import { describe, expect, it } from 'vitest';

import {
  CAVE_LANDING,
  CAVE_ROPE,
  CLOVER_PATCHES,
  DEATH_DURATION,
  PLAYER_HEALTH,
  SIMULATION_RATE,
  SLASH_DURATION,
  SLASH_REACH,
  SPAWN_POINT_COUNT,
  WALK_SPEED,
  WELL_STAND,
  createInteractMessage,
  createMoveMessage,
  findPlacement,
  findSpawnPoint,
  findVillagePath,
  isWithinStrike,
} from '@clovervale/shared';
import type {
  GroundVector,
  MonsterState,
  PlayerInput,
  PlayerState,
  ServerMessage,
  SnapshotMessage,
} from '@clovervale/shared';

import { Realm } from '../src/realm.ts';
import type { World } from '../src/world.ts';

/** How far a walking player goes in one simulation step, in metres. */
const STEP_DISTANCE: number = WALK_SPEED / SIMULATION_RATE;

/** The number of simulation steps a dead player lies where it fell. */
const DEATH_STEPS: number = DEATH_DURATION * SIMULATION_RATE;

/** The middle of the burrow of the wild dog, among the spawn stones. */
const BURROW: GroundVector = findPlacement('prop-spawn-stones.glb');

/** Where a player stands in the cave by the rope, east of it. */
const BY_ROPE: GroundVector = { x: CAVE_ROPE.x + 0.8, z: CAVE_ROPE.z };

/** A point near the home of the wild dog, where nothing stands. */
const NEAR_DOG: GroundVector = { x: 8, z: 9 };

/**
 * A point outside the village gate, far enough east of the burrow that the
 * dog does not notice a player there, wherever it wanders.
 */
const FAR_EAST_OF_BURROW: GroundVector = { x: 19.5, z: 5 };

/**
 * A point west of the home of the wild dog, within the reach of its chase,
 * where nothing stands.
 */
const WEST_OF_DOG: GroundVector = { x: 4.5, z: 9 };

/** The number of the last input a test has given a realm. */
let lastSequence = 0;

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
 * Gives a player of a realm its next input.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 * @param {PlayerInput} input - The input.
 * @returns {boolean} Whether the realm accepted the input.
 */
function giveInput(realm: Realm, id: number, input: PlayerInput): boolean {
  const stamp = { sequence: ++lastSequence, after: 0 };
  if (input.type === 'move') {
    return realm.receiveInput(id, createMoveMessage(stamp, input.direction));
  }
  if (input.type === 'interact') {
    return realm.receiveInput(id, createInteractMessage(stamp));
  }
  return realm.receiveInput(id, { ...input, ...stamp });
}

/**
 * Moves a realm several steps of the simulation forward.
 *
 * @param {Realm} realm - The realm.
 * @param {number} count - The number of steps.
 */
function stepTimes(realm: Realm, count: number): void {
  for (let step = 0; step < count; step++) {
    realm.step();
  }
}

/**
 * Finds a player of a realm as it is now, in the world it is in.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 * @returns {PlayerState} The player.
 * @throws {Error} If the player is in no world.
 */
function findPlayer(realm: Realm, id: number): PlayerState {
  const player: PlayerState | undefined = realm
    .findWorld(id)
    ?.listPlayers()
    .find((candidate: PlayerState) => candidate.id === id);
  if (player === undefined) {
    throw new Error(`Player ${String(id)} is in no world.`);
  }
  return player;
}

/**
 * Lists the identifiers of the players in the world a player is in.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 * @returns {number[]} The identifiers.
 */
function listCompany(realm: Realm, id: number): number[] {
  return (realm.findWorld(id)?.listPlayers() ?? []).map(
    (player: PlayerState) => player.id,
  );
}

/**
 * Finds the wild dog of the village.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of a player in the village.
 * @returns {MonsterState | undefined} The dog, if it is to be seen.
 */
function findDog(realm: Realm, id: number): MonsterState | undefined {
  return realm.findWorld(id)?.listMonsters()[0];
}

/**
 * Walks a player of a realm along points one straight walk after another,
 * steering it at every step, and stops it at the last.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 * @param {readonly GroundVector[]} path - The points.
 */
function walkAlong(
  realm: Realm,
  id: number,
  path: readonly GroundVector[],
): void {
  for (const point of path) {
    for (let step = 0; step < 100 * SIMULATION_RATE; step++) {
      const { x, z }: PlayerState = findPlayer(realm, id);
      if (Math.hypot(point.x - x, point.z - z) <= STEP_DISTANCE) {
        break;
      }
      giveInput(realm, id, {
        type: 'move',
        direction: { x: point.x - x, z: point.z - z },
      });
      realm.step();
    }
  }
  giveInput(realm, id, { type: 'move', direction: { x: 0, z: 0 } });
  realm.step();
}

/**
 * Walks several players of a realm, each along points one straight walk
 * after another, all at once, steering each at every step, and stops each
 * at its last point.
 *
 * @param {Realm} realm - The realm.
 * @param {readonly [number, readonly GroundVector[]][]} walks - The
 *   identifier of each player, and its points.
 */
function walkTogether(
  realm: Realm,
  walks: readonly [number, readonly GroundVector[]][],
): void {
  const legs = new Map<number, GroundVector[]>(
    walks.map(([id, path]: [number, readonly GroundVector[]]) => [
      id,
      [...path],
    ]),
  );
  for (let step = 0; step < 100 * SIMULATION_RATE && legs.size > 0; step++) {
    for (const [id, path] of legs) {
      const { x, z }: PlayerState = findPlayer(realm, id);
      while (
        path[0] !== undefined &&
        Math.hypot(path[0].x - x, path[0].z - z) <= STEP_DISTANCE
      ) {
        path.shift();
      }
      const next: GroundVector | undefined = path[0];
      const direction: GroundVector =
        next === undefined ? { x: 0, z: 0 } : { x: next.x - x, z: next.z - z };
      giveInput(realm, id, { type: 'move', direction });
      if (next === undefined) {
        legs.delete(id);
      }
    }
    realm.step();
  }
}

/**
 * Walks a player of the village of a realm to a point around the
 * obstacles.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} to - The point.
 * @throws {Error} If the player finds no way there.
 */
function walkInVillage(realm: Realm, id: number, to: GroundVector): void {
  const path: GroundVector[] | null = findVillagePath(
    findPlayer(realm, id),
    to,
  );
  if (path === null) {
    throw new Error('The player finds no way.');
  }
  walkAlong(realm, id, path);
}

/**
 * Turns a player of a realm towards a point, with a single step towards
 * it, and stops it.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 * @param {GroundVector} point - The point.
 */
function turnPlayer(realm: Realm, id: number, point: GroundVector): void {
  const { x, z }: PlayerState = findPlayer(realm, id);
  giveInput(realm, id, {
    type: 'move',
    direction: { x: point.x - x, z: point.z - z },
  });
  realm.step();
  giveInput(realm, id, { type: 'move', direction: { x: 0, z: 0 } });
  realm.step();
}

/**
 * Has a player of a realm travel at the next step, and takes that step.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player.
 */
function travel(realm: Realm, id: number): void {
  giveInput(realm, id, { type: 'travel' });
  realm.step();
}

/**
 * Lets a new player into a realm, and walks it to the burrow of the wild
 * dog.
 *
 * @param {Realm} realm - The realm.
 * @returns {number} The identifier of the player, standing in the burrow.
 */
function addDigger(realm: Realm): number {
  const { id }: PlayerState = realm.addPlayer();
  walkInVillage(realm, id, BURROW);
  return id;
}

/**
 * Has a player of a realm go down into the cave from where it stands in
 * the burrow, facing away from the wild dog, if it is there.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player, in the burrow.
 */
function goDown(realm: Realm, id: number): void {
  const dog: MonsterState | undefined = findDog(realm, id);
  const { x, z }: PlayerState = findPlayer(realm, id);
  const away: GroundVector =
    dog === undefined ? { x, z: z - 1 } : { x: 2 * x - dog.x, z: 2 * z - dog.z };
  turnPlayer(realm, id, away);
  travel(realm, id);
}

/**
 * Walks a player of a realm in the cave from the landing to the rope,
 * facing it.
 *
 * @param {Realm} realm - The realm.
 * @param {number} id - The identifier of the player, in the cave.
 */
function walkToRope(realm: Realm, id: number): void {
  walkAlong(realm, id, [BY_ROPE]);
  turnPlayer(realm, id, CAVE_ROPE);
}

/**
 * Lists the snapshots in the messages for a player, as the realm composes
 * them.
 *
 * @param {readonly ServerMessage[]} messages - The messages.
 * @returns {SnapshotMessage[]} The snapshots among them.
 */
function listSnapshots(messages: readonly ServerMessage[]): SnapshotMessage[] {
  return messages.filter(
    (message: ServerMessage): message is SnapshotMessage =>
      message.type === 'snapshot',
  );
}

describe('a player who comes into the realm', () => {
  it('is in the village, which holds every newcomer', () => {
    const realm = new Realm(createRandom());
    const { id: first }: PlayerState = realm.addPlayer();
    const { id: second }: PlayerState = realm.addPlayer();
    expect(realm.findMap(first)).toBe('village');
    expect(realm.findWorld(first)).toBe(realm.findWorld(second));
    expect(listCompany(realm, first)).toEqual([first, second]);
    expect(realm.caveCount).toBe(0);
  });
});

describe('a player at the burrow of the wild dog', () => {
  it('goes down into a cave of its own, at the landing', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    const { id: other }: PlayerState = realm.addPlayer();
    goDown(realm, id);
    expect(realm.findMap(id)).toBe('cave');
    expect(realm.caveCount).toBe(1);
    expect(findPlayer(realm, id)).toMatchObject({
      x: CAVE_LANDING.x,
      z: CAVE_LANDING.z,
      yaw: CAVE_LANDING.yaw,
      action: 'Idle',
    });
    expect(listCompany(realm, id)).toEqual([id]);
    expect(listCompany(realm, other)).toEqual([other]);
    expect(realm.findMap(other)).toBe('village');
  });

  it('goes down with the dog alive, close behind it', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    for (let step = 0; step < 10 * SIMULATION_RATE; step++) {
      const dog: MonsterState | undefined = findDog(realm, id);
      if (dog?.mode === 'chase' && dog.action === 'Attack') {
        break;
      }
      realm.step();
    }
    const dog: MonsterState | undefined = findDog(realm, id);
    expect(dog?.mode).toBe('chase');
    goDown(realm, id);
    expect(realm.findMap(id)).toBe('cave');
  });

  it('goes down with the dog alive and drawn away by another', () => {
    const realm = new Realm(createRandom());
    const { id }: PlayerState = realm.addPlayer();
    const { id: lure }: PlayerState = realm.addPlayer();
    walkInVillage(realm, id, FAR_EAST_OF_BURROW);
    walkInVillage(realm, lure, NEAR_DOG);
    walkTogether(realm, [
      [lure, [WEST_OF_DOG]],
      [id, findVillagePath(findPlayer(realm, id), BURROW) ?? []],
    ]);
    const dog: MonsterState | undefined = findDog(realm, id);
    const here: PlayerState = findPlayer(realm, id);
    expect(dog?.mode).toBe('chase');
    expect(
      Math.hypot((dog?.x ?? 0) - here.x, (dog?.z ?? 0) - here.z),
    ).toBeGreaterThan(SLASH_REACH * 2);
    turnPlayer(realm, id, dog ?? BURROW);
    travel(realm, id);
    expect(realm.findMap(id)).toBe('cave');
    expect(realm.findMap(lure)).toBe('village');
  });

  it('slashes rather than goes down with the living dog in reach in front', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    for (let step = 0; step < 10 * SIMULATION_RATE; step++) {
      const dog: MonsterState | undefined = findDog(realm, id);
      const { x, z }: PlayerState = findPlayer(realm, id);
      if (dog !== undefined && Math.hypot(dog.x - x, dog.z - z) <= 1.2) {
        break;
      }
      realm.step();
    }
    const dog: MonsterState | undefined = findDog(realm, id);
    if (dog !== undefined) {
      turnPlayer(realm, id, dog);
    }
    const near: MonsterState | undefined = findDog(realm, id);
    expect(near?.mode).toBe('chase');
    expect(
      near !== undefined &&
        isWithinStrike(findPlayer(realm, id), near, SLASH_REACH),
    ).toBe(true);
    travel(realm, id);
    expect(realm.findMap(id)).toBe('village');
    expect(realm.caveCount).toBe(0);
  });

  it('goes down with the dog dead', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    for (let tries = 0; tries < 20; tries++) {
      const dog: MonsterState | undefined = findDog(realm, id);
      if (dog === undefined || dog.mode === 'dead') {
        break;
      }
      turnPlayer(realm, id, dog);
      giveInput(realm, id, { type: 'interact' });
      stepTimes(realm, SLASH_DURATION * SIMULATION_RATE + 1);
    }
    expect(findDog(realm, id)?.mode ?? 'dead').toBe('dead');
    walkInVillage(realm, id, BURROW);
    travel(realm, id);
    expect(realm.findMap(id)).toBe('cave');
  });

  it('stays in the village away from the burrow', () => {
    const realm = new Realm(createRandom());
    const { id }: PlayerState = realm.addPlayer();
    travel(realm, id);
    expect(realm.findMap(id)).toBe('village');
    expect(realm.caveCount).toBe(0);
  });

  it('leaves the dog of the village where it is when it goes down', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    const { id: other }: PlayerState = realm.addPlayer();
    const before: MonsterState | undefined = findDog(realm, id);
    goDown(realm, id);
    const after: MonsterState | undefined = findDog(realm, other);
    expect(after?.health).toBe(before?.health);
    expect(
      Math.hypot((after?.x ?? 0) - (before?.x ?? 0), (after?.z ?? 0) - (before?.z ?? 0)),
    ).toBeLessThan(1);
  });
});

describe('the caves of the realm', () => {
  it('are one for each player, apart from each other', () => {
    const realm = new Realm(createRandom());
    const first: number = addDigger(realm);
    goDown(realm, first);
    const second: number = addDigger(realm);
    goDown(realm, second);
    expect(realm.caveCount).toBe(2);
    expect(realm.findWorld(first)).not.toBe(realm.findWorld(second));
    expect(listCompany(realm, first)).toEqual([first]);
    expect(listCompany(realm, second)).toEqual([second]);
  });

  it('are fresh every time a player goes down', () => {
    const realm = new Realm(createRandom());
    const { id }: PlayerState = realm.addPlayer();
    const patch: GroundVector = CLOVER_PATCHES[3] ?? { x: NaN, z: NaN };
    walkInVillage(realm, id, { x: patch.x, z: patch.z + 1 });
    turnPlayer(realm, id, patch);
    giveInput(realm, id, { type: 'pick' });
    realm.step();
    expect(realm.findWorld(id)?.findInventory(id)).toEqual(['clover']);
    walkInVillage(realm, id, BURROW);
    goDown(realm, id);
    const first: World | null = realm.findWorld(id);
    giveInput(realm, id, { type: 'drop', slot: 0 });
    realm.step();
    expect(first?.describeItems().items).toHaveLength(1);
    walkToRope(realm, id);
    travel(realm, id);
    walkInVillage(realm, id, BURROW);
    goDown(realm, id);
    expect(realm.findWorld(id)).not.toBe(first);
    expect(realm.findWorld(id)?.describeItems().items).toEqual([]);
  });
});

describe('a player at the rope in the cave', () => {
  it('climbs up to beside the old well, and its cave is gone', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    const { id: other }: PlayerState = realm.addPlayer();
    goDown(realm, id);
    walkToRope(realm, id);
    const below: PlayerState = findPlayer(realm, id);
    travel(realm, id);
    expect(realm.findMap(id)).toBe('village');
    expect(realm.caveCount).toBe(0);
    expect(findPlayer(realm, id)).toMatchObject({
      x: WELL_STAND.x,
      z: WELL_STAND.z,
      yaw: WELL_STAND.yaw,
      action: 'Idle',
      health: below.health,
    });
    expect(listCompany(realm, other)).toEqual([other, id]);
  });

  it('keeps what it carries, there and back', () => {
    const realm = new Realm(createRandom());
    const { id }: PlayerState = realm.addPlayer();
    const patch: GroundVector = CLOVER_PATCHES[3] ?? { x: NaN, z: NaN };
    walkInVillage(realm, id, { x: patch.x, z: patch.z + 1 });
    turnPlayer(realm, id, patch);
    giveInput(realm, id, { type: 'pick' });
    realm.step();
    walkInVillage(realm, id, BURROW);
    goDown(realm, id);
    expect(realm.findWorld(id)?.findInventory(id)).toEqual(['clover']);
    walkToRope(realm, id);
    travel(realm, id);
    expect(realm.findWorld(id)?.findInventory(id)).toEqual(['clover']);
  });

  it('stays below, away from the rope', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    goDown(realm, id);
    travel(realm, id);
    expect(realm.findMap(id)).toBe('cave');
  });
});

describe('a player who dies in the cave', () => {
  it('comes back on the plaza after a death, and its cave is gone', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    goDown(realm, id);
    realm.findWorld(id)?.hurtPlayer(id, PLAYER_HEALTH);
    realm.step();
    expect(findPlayer(realm, id)).toMatchObject({ action: 'Die', health: 0 });
    stepTimes(realm, DEATH_STEPS - 2);
    expect(realm.findMap(id)).toBe('cave');
    realm.step();
    expect(realm.findMap(id)).toBe('village');
    expect(realm.caveCount).toBe(0);
    const player: PlayerState = findPlayer(realm, id);
    expect(player).toMatchObject({ action: 'Idle', health: PLAYER_HEALTH });
    const spawnPoints: GroundVector[] = Array.from(
      { length: SPAWN_POINT_COUNT },
      (_, index: number) => findSpawnPoint(index),
    );
    expect(
      spawnPoints.some(
        (point: GroundVector) => point.x === player.x && point.z === player.z,
      ),
    ).toBe(true);
  });
});

describe('a player who leaves from the cave', () => {
  it('takes its cave with it', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    goDown(realm, id);
    realm.removePlayer(id);
    expect(realm.caveCount).toBe(0);
    expect(realm.findMap(id)).toBeNull();
  });
});

describe('what the realm has sent to each player', () => {
  it('tells a player in the village of the village alone', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    const { id: other }: PlayerState = realm.addPlayer();
    goDown(realm, id);
    const messages: ReadonlyMap<number, readonly ServerMessage[]> =
      realm.composeMessages();
    const [snapshot] = listSnapshots(messages.get(other) ?? []);
    expect(messages.get(other)?.[0]?.type).toBe('snapshot');
    expect(snapshot?.players.map((player: PlayerState) => player.id)).toEqual([
      other,
    ]);
    expect(snapshot?.monsters).toHaveLength(1);
    expect(snapshot?.clovers).toHaveLength(CLOVER_PATCHES.length);
    expect(snapshot?.step).toBe(realm.stepCount);
  });

  it('tells a player in its cave of its cave alone, once that it is there', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    realm.addPlayer();
    goDown(realm, id);
    const messages: readonly ServerMessage[] =
      realm.composeMessages().get(id) ?? [];
    expect(messages[0]).toEqual({ type: 'map', map: 'cave' });
    const [snapshot] = listSnapshots(messages);
    expect(snapshot).toMatchObject({
      step: realm.stepCount,
      monsters: [],
      clovers: [],
      items: [],
    });
    expect(snapshot?.players.map((player: PlayerState) => player.id)).toEqual([
      id,
    ]);
    expect(snapshot?.own.motion).toMatchObject({
      x: CAVE_LANDING.x,
      z: CAVE_LANDING.z,
    });
    realm.step();
    const later: readonly ServerMessage[] =
      realm.composeMessages().get(id) ?? [];
    expect(later.map((message: ServerMessage) => message.type)).toEqual([
      'snapshot',
    ]);
  });

  it('tells a player who climbs up that it is in the village again', () => {
    const realm = new Realm(createRandom());
    const id: number = addDigger(realm);
    const { id: other }: PlayerState = realm.addPlayer();
    goDown(realm, id);
    realm.composeMessages();
    walkToRope(realm, id);
    travel(realm, id);
    const messages: readonly ServerMessage[] =
      realm.composeMessages().get(id) ?? [];
    expect(messages[0]).toEqual({ type: 'map', map: 'village' });
    const [snapshot] = listSnapshots(messages);
    expect(
      snapshot?.players.map((player: PlayerState) => player.id).sort(),
    ).toEqual([id, other].sort());
  });

  it('tells nothing to a player who has left', () => {
    const realm = new Realm(createRandom());
    const { id }: PlayerState = realm.addPlayer();
    realm.removePlayer(id);
    expect(realm.composeMessages().has(id)).toBe(false);
  });
});
