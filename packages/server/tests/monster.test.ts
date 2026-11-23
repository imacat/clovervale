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
//   imacat@mail.imacat.idv.tw (imacat), 2026/11/18
// AI assistance: Claude Code (Anthropic)

/**
 * @module server/tests/monster Tests for the monster.
 */

import { describe, expect, it } from 'vitest';

import {
  MONSTER_KINDS,
  SIMULATION_RATE,
  VILLAGE_TERRAIN,
} from '@clovervale/shared';
import type {
  GroundVector,
  MonsterKind,
  MonsterState,
} from '@clovervale/shared';

import { MONSTER_STRIKE_DELAY } from '../src/monster-body.ts';
import {
  MONSTER_APPROACH_DISTANCE,
  MONSTER_CORPSE_DURATION,
  MONSTER_SPAWNS,
  Monster,
} from '../src/monster.ts';
import type { MonsterSpawn, Quarry } from '../src/monster.ts';

/** The numbers of the wild dog of the village. */
const DOG: MonsterKind = MONSTER_KINDS['village-dog'];

/** The farthest from its home the wild dog of the village wanders to. */
const DOG_WANDER_RADIUS: number = DOG.wander?.radius ?? 0;

/** Where the wild dog of the village lives, and how it faces there. */
const HOME: MonsterSpawn['home'] = MONSTER_SPAWNS.village[0]?.home ?? {
  x: NaN,
  z: NaN,
  yaw: NaN,
};

/** A player near the home of the monster, where nothing stands. */
const NEAR_PLAYER: Quarry = { id: 5, x: 8, z: 9 };

/** A player on the plaza, far from the home of the monster. */
const FAR_PLAYER: Quarry = { id: 5, x: 0, z: -3.5 };

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
 * Brings the wild dog of the village to life, as the village has it.
 *
 * @returns {Monster} The dog.
 * @throws {Error} If the village has no monster.
 */
function createVillageDog(): Monster {
  const [spawn] = MONSTER_SPAWNS.village;
  if (spawn === undefined) {
    throw new Error('The village has no monster.');
  }
  return new Monster(1, 'village', spawn, createRandom());
}

/**
 * Reads the monster as it is to be seen.
 *
 * @param {Monster} monster - The monster.
 * @returns {MonsterState} Its state.
 * @throws {Error} If the monster is gone.
 */
function readState(monster: Monster): MonsterState {
  const { state } = monster;
  if (state === null) {
    throw new Error('The monster is gone.');
  }
  return state;
}

/**
 * Measures how far apart two points are.
 *
 * @param {GroundVector} a - One point.
 * @param {GroundVector} b - The other point.
 * @returns {number} The distance between them, in metres.
 */
function measureDistance(a: GroundVector, b: GroundVector): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Moves a monster several steps forward, with the same players around.
 *
 * @param {Monster} monster - The monster.
 * @param {number} count - The number of steps.
 * @param {readonly Quarry[]} players - The players.
 * @returns {number[]} The steps, counted from 1, at which it struck.
 */
function stepTimes(
  monster: Monster,
  count: number,
  players: readonly Quarry[],
): number[] {
  const strikes: number[] = [];
  for (let step = 1; step <= count; step++) {
    if (monster.step(players)) {
      strikes.push(step);
    }
  }
  return strikes;
}

describe('a monster left alone', () => {
  it('starts idling at its home at full health', () => {
    expect(createVillageDog().state).toMatchObject({
      id: 1,
      kind: 'village-dog',
      x: HOME.x,
      z: HOME.z,
      yaw: HOME.yaw,
      action: 'Idle',
      health: DOG.health,
      mode: 'idle',
    });
  });

  it('wanders near its home, clear of the obstacles', () => {
    const monster = createVillageDog();
    const modes = new Set<string>();
    let farthest = 0;
    for (let step = 0; step < 60 * SIMULATION_RATE; step++) {
      monster.step([]);
      const state: MonsterState = readState(monster);
      modes.add(state.mode);
      farthest = Math.max(farthest, measureDistance(state, HOME));
      expect(VILLAGE_TERRAIN.isClear(state)).toBe(true);
    }
    expect([...modes].sort()).toEqual(['idle', 'wander']);
    expect(farthest).toBeGreaterThan(0);
    expect(farthest).toBeLessThanOrEqual(DOG_WANDER_RADIUS);
  });

  it('pays no heed to a player far from its home', () => {
    const monster = createVillageDog();
    for (let step = 0; step < 20 * SIMULATION_RATE; step++) {
      monster.step([FAR_PLAYER]);
      expect(readState(monster).mode).not.toBe('chase');
    }
  });
});

describe('a monster with a player near', () => {
  it('chases the player and stops near it, facing it', () => {
    const monster = createVillageDog();
    monster.step([NEAR_PLAYER]);
    expect(readState(monster)).toMatchObject({ mode: 'chase' });
    stepTimes(monster, 5 * SIMULATION_RATE, [NEAR_PLAYER]);
    const state: MonsterState = readState(monster);
    expect(measureDistance(state, NEAR_PLAYER)).toBeLessThanOrEqual(
      MONSTER_APPROACH_DISTANCE,
    );
    // The player is due west of the monster.
    expect(state.yaw).toBeCloseTo(-90, 0);
  });

  it('strikes once in every attack, partway through', () => {
    const monster = createVillageDog();
    const strikes: number[] = [];
    let attackStart: number | null = null;
    let lastCount: number = readState(monster).actionCount;
    for (let step = 1; step <= 10 * SIMULATION_RATE; step++) {
      const isStriking: boolean = monster.step([NEAR_PLAYER]);
      const state: MonsterState = readState(monster);
      if (state.action === 'Attack' && state.actionCount !== lastCount) {
        attackStart = step;
      }
      lastCount = state.actionCount;
      if (isStriking) {
        strikes.push(step);
        expect(step - (attackStart ?? NaN)).toBe(
          MONSTER_STRIKE_DELAY * SIMULATION_RATE,
        );
      }
    }
    expect(strikes.length).toBeGreaterThan(2);
    for (let index = 1; index < strikes.length; index++) {
      expect((strikes[index] ?? 0) - (strikes[index - 1] ?? 0)).toBe(
        DOG.biteInterval * SIMULATION_RATE,
      );
    }
  });

  it('chases around the obstacles, never into them', () => {
    // The player is on the other side of the fence south of the monster,
    // where it goes once the monster has noticed it.
    const behind: Quarry = { id: 5, x: 8.5, z: 2 };
    const monster = createVillageDog();
    monster.step([NEAR_PLAYER]);
    let isNear = false;
    for (let step = 0; step < 30 * SIMULATION_RATE && !isNear; step++) {
      monster.step([behind]);
      const state: MonsterState = readState(monster);
      expect(VILLAGE_TERRAIN.isClear(state)).toBe(true);
      isNear = measureDistance(state, behind) <= MONSTER_APPROACH_DISTANCE;
    }
    expect(isNear).toBe(true);
  });

  it('gives up once the player is far from its home, and goes back', () => {
    const monster = createVillageDog();
    stepTimes(monster, 5 * SIMULATION_RATE, [NEAR_PLAYER]);
    const modes = new Set<string>();
    for (let step = 0; step < 10 * SIMULATION_RATE; step++) {
      monster.step([FAR_PLAYER]);
      modes.add(readState(monster).mode);
    }
    expect(modes).toContain('return');
    const state: MonsterState = readState(monster);
    expect(state.mode).not.toBe('chase');
    expect(measureDistance(state, HOME)).toBeLessThanOrEqual(
      DOG_WANDER_RADIUS,
    );
  });

  it('gives up once the player is gone', () => {
    const monster = createVillageDog();
    stepTimes(monster, SIMULATION_RATE, [NEAR_PLAYER]);
    monster.step([]);
    expect(readState(monster).mode).toBe('return');
  });
});

describe('a monster that is hit', () => {
  it('loses the health the hit takes, and chases whoever hit it', () => {
    const monster = createVillageDog();
    expect(monster.takeHit(20, 9)).toBe(20);
    expect(readState(monster)).toMatchObject({
      health: DOG.health - 20,
      mode: 'chase',
    });
    // The player that hit it is the one it chases, not the nearer one.
    const hitter: Quarry = { id: 9, x: 11.4, z: 12 };
    stepTimes(monster, 5 * SIMULATION_RATE, [hitter, NEAR_PLAYER]);
    expect(
      measureDistance(readState(monster), hitter),
    ).toBeLessThanOrEqual(MONSTER_APPROACH_DISTANCE);
  });

  it('dies once it has no health left, and loses no more', () => {
    const monster = createVillageDog();
    expect(monster.takeHit(DOG.health - 10, 9)).toBe(DOG.health - 10);
    expect(monster.takeHit(20, 9)).toBe(10);
    expect(monster.isAlive).toBe(false);
    expect(readState(monster)).toMatchObject({
      action: 'Die',
      health: 0,
      mode: 'dead',
    });
  });

  it('lies dead without striking, is gone, and comes back at home', () => {
    const monster = createVillageDog();
    stepTimes(monster, 5 * SIMULATION_RATE, [NEAR_PLAYER]);
    monster.takeHit(DOG.health, 9);
    const corpse: MonsterState = readState(monster);
    const corpseSteps: number = MONSTER_CORPSE_DURATION * SIMULATION_RATE;
    expect(stepTimes(monster, corpseSteps - 1, [NEAR_PLAYER])).toEqual([]);
    expect(monster.state).toEqual(corpse);
    monster.step([NEAR_PLAYER]);
    expect(monster.state).toBeNull();
    const goneSteps: number =
      (DOG.respawnDelay - MONSTER_CORPSE_DURATION) * SIMULATION_RATE;
    stepTimes(monster, goneSteps - 1, []);
    expect(monster.state).toBeNull();
    monster.step([]);
    expect(monster.isAlive).toBe(true);
    expect(monster.state).toMatchObject({
      x: HOME.x,
      z: HOME.z,
      yaw: HOME.yaw,
      action: 'Idle',
      health: DOG.health,
      mode: 'idle',
    });
  });
});
