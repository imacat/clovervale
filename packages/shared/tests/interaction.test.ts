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
 * @module shared/tests/interaction Tests for what a player does when it
 *   interacts with the world.
 */

import { describe, expect, it } from 'vitest';

import {
  CAVE_CONTAINERS,
  CAVE_TERRAIN,
  FOUNTAIN_REACH,
  FOUNTAIN_RIM_RADIUS,
  CLOVER_PATCHES,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  SLASH_REACH,
  TOBY_LOOP_STEPS,
  VILLAGERS,
  VILLAGE_TERRAIN,
  createMotion,
  findInteraction,
  findPassage,
  findPickTarget,
  findPlacement,
  findTobyPose,
  findVillager,
  locateVillager,
  placePoint,
  stepMotion,
} from '../src/index.ts';
import type {
  GroundItem,
  GroundVector,
  MonsterState,
  Passage,
  Placement,
  PlayerMotion,
  Pose,
  Villager,
  WorldItems,
} from '../src/index.ts';
import { CAVE_LANDING, CAVE_ROPE } from '../src/cave.ts';
import {
  BURROW_REACH,
  INTERACTION_HALF_ANGLE,
  PICK_REACH,
  TALK_REACH,
  ROPE_REACH,
} from '../src/interaction.ts';
import { findTurn, turnVector } from '../src/terrain.ts';
import { WELL_STAND } from '../src/village-layout.ts';

/**
 * The farthest a player can stand from the centre of the fountain to drink
 * from it.
 */
const REACH: number = FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + FOUNTAIN_REACH;

/** Where Nancy the villager stands. */
const NANCY: Placement = findPlacement('npc-nancy.glb');

/**
 * Makes the pose of a player some way south of Nancy.
 *
 * @param {number} distance - How far from her it stands, from centre to
 *   centre, in metres.
 * @param {number} yaw - The way it faces, 180 to face her.
 * @returns {Pose} The pose.
 */
function standByNancy(distance: number, yaw: number): Pose {
  return { x: NANCY.x, z: NANCY.z + distance, yaw };
}

/** Where Martha the village chief stands, on the porch of her house. */
const MARTHA: Placement = findPlacement('npc-martha.glb');

/**
 * Makes the pose of a player on the porch in front of Martha, facing her.
 *
 * @returns {Pose} The pose, clear of everything that stands in the way.
 */
function standBeforeMartha(): Pose {
  const front: GroundVector = turnVector({ x: 0, z: 1 }, findTurn(MARTHA.yaw));
  const pose: Pose = {
    x: MARTHA.x + front.x * 0.8,
    z: MARTHA.z + front.z * 0.8,
    yaw: MARTHA.yaw + 180,
  };
  expect(VILLAGE_TERRAIN.isClear(pose)).toBe(true);
  return pose;
}

/**
 * Lists the poses of a player that stands within talking reach of Emma the
 * smith, wherever the ground around her is clear, facing her.
 *
 * @returns {Pose[]} The poses, of which there is at least one.
 */
function listPosesFacingEmma(): Pose[] {
  const emma: Placement = findPlacement('npc-emma.glb');
  const poses: Pose[] = [];
  for (let degrees = 0; degrees < 360; degrees += 15) {
    const angle: number = (degrees * Math.PI) / 180;
    const x: number = emma.x + (TALK_REACH - 0.1) * Math.sin(angle);
    const z: number = emma.z + (TALK_REACH - 0.1) * Math.cos(angle);
    if (VILLAGE_TERRAIN.isClear({ x, z })) {
      poses.push({ x, z, yaw: degrees + 180 });
    }
  }
  expect(poses.length).toBeGreaterThan(0);
  return poses;
}

describe('findInteraction', () => {
  it('drinks by the rim of the fountain, facing it', () => {
    const z: number = PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS;
    expect(findInteraction({ x: PLAZA_CENTRE.x, z, yaw: 180 }, 0)).toBe(
      'Drink',
    );
  });

  it('drinks as far from the rim as the fountain reaches', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 1e-9;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw: -90 }, 0)).toBe(
      'Drink',
    );
  });

  it('slashes beyond the reach of the fountain, facing it', () => {
    const x: number = PLAZA_CENTRE.x + REACH + 0.01;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw: -90 }, 0)).toBe(
      'Slash',
    );
  });

  it('drinks facing to one side of the fountain within the angle', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 0.1;
    const yaw: number = -90 + INTERACTION_HALF_ANGLE - 1;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw }, 0)).toBe('Drink');
  });

  it('slashes by the fountain, facing too far to one side of it', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 0.1;
    const yaw: number = -90 - INTERACTION_HALF_ANGLE - 1;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw }, 0)).toBe('Slash');
  });

  it('slashes by the fountain, facing away from it', () => {
    const x: number = PLAZA_CENTRE.x + REACH - 0.1;
    expect(findInteraction({ x, z: PLAZA_CENTRE.z, yaw: 90 }, 0)).toBe('Slash');
  });

  it('slashes away from anything to interact with', () => {
    expect(findInteraction({ x: 11, z: 9, yaw: 0 }, 0)).toBe('Slash');
  });
});

describe('findInteraction by Nancy', () => {
  it('talks to her as far from her as she can be talked to', () => {
    expect(findInteraction(standByNancy(TALK_REACH - 1e-9, 180), 0)).toBe(
      'Talk',
    );
  });

  it('talks to her facing to one side of her within the angle', () => {
    const yaw: number = 180 + INTERACTION_HALF_ANGLE - 1;
    expect(findInteraction(standByNancy(TALK_REACH - 0.1, yaw), 0)).toBe(
      'Talk',
    );
  });

  it('slashes beyond her reach, facing her', () => {
    expect(findInteraction(standByNancy(TALK_REACH + 0.01, 180), 0)).toBe(
      'Slash',
    );
  });

  it('slashes by her, facing away from her', () => {
    expect(findInteraction(standByNancy(TALK_REACH - 0.1, 0), 0)).toBe('Slash');
  });
});

describe('findInteraction by Emma the smith', () => {
  it('talks to her close by, facing her', () => {
    for (const pose of listPosesFacingEmma()) {
      expect(findInteraction(pose, 0)).toBe('Talk');
      expect(findVillager(pose, 0, 'village', [])).toEqual({
        id: 'emma',
        file: 'npc-emma.glb',
        map: 'village',
      });
    }
  });

  it('slashes close by her, facing away from her', () => {
    for (const pose of listPosesFacingEmma()) {
      expect(findInteraction({ ...pose, yaw: pose.yaw + 180 }, 0)).toBe(
        'Slash',
      );
    }
  });
});

describe('findInteraction by Martha the village chief', () => {
  it('talks to her from in front of her on the porch, facing her', () => {
    expect(findInteraction(standBeforeMartha(), 0)).toBe('Talk');
  });

  it('slashes in front of her, facing away from her', () => {
    const pose: Pose = standBeforeMartha();
    expect(findInteraction({ ...pose, yaw: MARTHA.yaw }, 0)).toBe('Slash');
  });
});

describe('findVillager', () => {
  it('finds Nancy, facing her', () => {
    expect(
      findVillager(standByNancy(TALK_REACH - 0.1, 180), 0, 'village', []),
    ).toEqual({
      id: 'nancy',
      file: 'npc-nancy.glb',
      map: 'village',
      greetsFirst: true,
    });
  });

  it('finds Martha, facing her on the porch', () => {
    expect(findVillager(standBeforeMartha(), 0, 'village', [])).toEqual({
      id: 'martha',
      file: 'npc-martha.glb',
      map: 'village',
      fighter: 'martha',
    });
  });

  it('finds nobody by her, facing away from her', () => {
    expect(
      findVillager(standByNancy(TALK_REACH - 0.1, 0), 0, 'village', []),
    ).toBeNull();
  });

  it('finds nobody by the fountain, facing it', () => {
    const z: number = PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS;
    expect(
      findVillager({ x: PLAZA_CENTRE.x, z, yaw: 180 }, 0, 'village', []),
    ).toBeNull();
  });
});

describe('findVillager by Martha, who fights as a monster', () => {
  /**
   * Places Martha, as the monsters tell of her.
   *
   * @param {GroundVector} point - Where she stands.
   * @param {MonsterState['mode']} mode - What she is up to.
   * @returns {MonsterState} Martha.
   */
  function placeMartha(
    point: GroundVector,
    mode: MonsterState['mode'],
  ): MonsterState {
    return {
      id: 2,
      kind: 'martha',
      x: point.x,
      z: point.z,
      yaw: 0,
      action: 'Idle',
      actionCount: 0,
      health: 100,
      mode,
    };
  }

  it.each(['approach', 'talk', 'chase', 'sit'] as const)(
    'finds nobody before her while she is up to %s',
    (mode: MonsterState['mode']) => {
      const martha: MonsterState = placeMartha(MARTHA, mode);
      expect(findVillager(standBeforeMartha(), 0, 'village', [martha])).toBe(
        null,
      );
      expect(
        findInteraction(standBeforeMartha(), 0, 'village', [martha]),
      ).toBe('Slash');
    },
  );

  it('finds her where she is as she walks back home', () => {
    const away: GroundVector = { x: MARTHA.x, z: MARTHA.z + 3 };
    const martha: MonsterState = placeMartha(away, 'return');
    const facing: Pose = { x: away.x, z: away.z - 1, yaw: 0 };
    expect(findVillager(facing, 0, 'village', [martha])?.id).toBe('martha');
    expect(findVillager(standBeforeMartha(), 0, 'village', [martha])).toBe(
      null,
    );
  });

  it.each(['chase', 'sit'] as const)(
    'picks up an item before her porch while she is up to %s away',
    (mode: MonsterState['mode']) => {
      const pose: Pose = standBeforeMartha();
      const item: GroundItem = layItem(7, MARTHA);
      const away: GroundVector = { x: MARTHA.x, z: MARTHA.z + 5 };
      const martha: MonsterState = placeMartha(away, mode);
      expect(
        findPickTarget(pose, 0, { clovers: [], items: [item] }, 'village', [
          martha,
        ]),
      ).toMatchObject({ source: 'ground', id: 7 });
    },
  );

  it('picks up an item beside her while she sits beaten', () => {
    const pose: Pose = standBeforeMartha();
    const item: GroundItem = layItem(7, MARTHA);
    const martha: MonsterState = placeMartha(MARTHA, 'sit');
    expect(
      findPickTarget(pose, 0, { clovers: [], items: [item] }, 'village', [
        martha,
      ]),
    ).toMatchObject({ source: 'ground', id: 7 });
  });

  it('leaves talking to her at her porch before picking', () => {
    const pose: Pose = standBeforeMartha();
    const item: GroundItem = layItem(7, MARTHA);
    const martha: MonsterState = placeMartha(MARTHA, 'idle');
    expect(
      findPickTarget(pose, 0, { clovers: [], items: [item] }, 'village', [
        martha,
      ]),
    ).toBeNull();
  });
});

describe('findVillager by Toby', () => {
  /** The steps of one whole loop of his course, from the first. */
  const LOOP: readonly number[] = Array.from(
    { length: TOBY_LOOP_STEPS },
    (_, step: number) => step,
  );

  /** A step in the middle of a run of his. */
  const RUNNING: number =
    LOOP.findIndex((step: number) => findTobyPose(step).activity === 'Run') +
    SIMULATION_RATE;

  it('finds him where he is at the step, facing him, as he runs', () => {
    const toby: Pose = findTobyPose(RUNNING);
    const facing: Pose = { x: toby.x, z: toby.z + TALK_REACH - 0.1, yaw: 180 };
    expect(findVillager(facing, RUNNING, 'village', [])).toEqual({
      id: 'toby',
      file: 'npc-toby.glb',
      map: 'village',
      hasServerLines: true,
    });
    expect(findInteraction(facing, RUNNING)).toBe('Talk');
  });

  it('finds nobody where he was, once he has run on', () => {
    const toby: Pose = findTobyPose(RUNNING);
    const facing: Pose = { x: toby.x, z: toby.z + TALK_REACH - 0.1, yaw: 180 };
    expect(
      findVillager(facing, RUNNING + SIMULATION_RATE, 'village', []),
    ).toBeNull();
    expect(findInteraction(facing, RUNNING + SIMULATION_RATE)).toBe('Slash');
  });
});

/** The patch of clover east of the fountain, by the bushes. */
const PATCH = 6;

/** Where the patch of clover east of the fountain is. */
const PATCH_CENTRE: GroundVector = CLOVER_PATCHES[PATCH] ?? { x: NaN, z: NaN };

/**
 * Makes the pose of a player some way south of the patch of clover east of
 * the fountain.
 *
 * @param {number} distance - How far from its centre the player stands, in
 *   metres.
 * @param {number} yaw - The way it faces, 180 to face the patch.
 * @returns {Pose} The pose.
 */
function standByPatch(distance: number, yaw: number): Pose {
  return { x: PATCH_CENTRE.x, z: PATCH_CENTRE.z + distance, yaw };
}

/**
 * Makes an item lying on the ground.
 *
 * @param {number} id - The identifier of the item.
 * @param {GroundVector} at - Where it lies.
 * @returns {GroundItem} The item.
 */
function layItem(id: number, at: GroundVector): GroundItem {
  return { id, kind: 'clover', x: at.x, z: at.z };
}

describe('findPickTarget', () => {
  /** The world with only the clover of the patch to pick. */
  const WITH_CLOVER: WorldItems = { clovers: [PATCH], items: [] };

  it('picks the clover of a patch within reach, facing it', () => {
    expect(
      findPickTarget(
        standByPatch(PICK_REACH - 0.01, 180),
        0,
        WITH_CLOVER,
        'village',
        [],
      ),
    ).toEqual({ source: 'patch', id: PATCH, kind: 'clover' });
  });

  it('picks nothing from a patch whose clover is gone', () => {
    const pose: Pose = standByPatch(0.8, 180);
    expect(
      findPickTarget(pose, 0, { clovers: [], items: [] }, 'village', []),
    ).toBeNull();
    expect(findInteraction(pose, 0)).toBe('Slash');
  });

  it('picks nothing out of reach, or facing away', () => {
    expect(
      findPickTarget(
        standByPatch(PICK_REACH + 0.01, 180),
        0,
        WITH_CLOVER,
        'village',
        [],
      ),
    ).toBeNull();
    expect(
      findPickTarget(
        standByPatch(0.8, 180 + INTERACTION_HALF_ANGLE + 1),
        0,
        WITH_CLOVER,
        'village',
        [],
      ),
    ).toBeNull();
  });

  it('picks an item on the ground in the same way', () => {
    const at: GroundVector = { x: PATCH_CENTRE.x, z: PATCH_CENTRE.z + 0.5 };
    const pose: Pose = standByPatch(1.5, 180);
    expect(
      findPickTarget(
        pose,
        0,
        { clovers: [], items: [layItem(3, at)] },
        'village',
        [],
      ),
    ).toEqual({ source: 'ground', id: 3, kind: 'clover' });
  });

  it('picks the nearest of what is within reach', () => {
    const near: GroundItem = layItem(5, {
      x: PATCH_CENTRE.x,
      z: PATCH_CENTRE.z + 0.6,
    });
    const far: GroundItem = layItem(4, {
      x: PATCH_CENTRE.x,
      z: PATCH_CENTRE.z + 0.3,
    });
    const pose: Pose = standByPatch(1, 180);
    expect(
      findPickTarget(
        pose,
        0,
        { clovers: [PATCH], items: [far, near] },
        'village',
        [],
      ),
    ).toMatchObject({ source: 'ground', id: 5 });
    expect(
      findPickTarget(
        pose,
        0,
        { clovers: [PATCH], items: [far] },
        'village',
        [],
      ),
    ).toMatchObject({ source: 'ground', id: 4 });
  });

  it('leaves drinking and talking before picking', () => {
    const z: number = PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS;
    const byFountain: Pose = { x: PLAZA_CENTRE.x, z, yaw: 180 };
    const byNancy: Pose = standByNancy(TALK_REACH - 0.3, 180);
    const items: GroundItem[] = [
      layItem(1, { x: byFountain.x, z: byFountain.z - 0.3 }),
      layItem(2, { x: byNancy.x, z: byNancy.z - 0.3 }),
    ];
    expect(
      findPickTarget(byFountain, 0, { clovers: [], items }, 'village', []),
    ).toBeNull();
    expect(
      findPickTarget(byNancy, 0, { clovers: [], items }, 'village', []),
    ).toBeNull();
  });
});

/** The middle of the burrow of the wild dog, among the spawn stones. */
const BURROW: Placement = findPlacement('prop-spawn-stones.glb');

/**
 * Makes the wild dog, standing somewhere.
 *
 * @param {GroundVector} point - Where it stands.
 * @param {boolean} [isDead] - Whether it lies dead, which it does not by
 *   default.
 * @returns {MonsterState} The dog.
 */
function placeDog(point: GroundVector, isDead = false): MonsterState {
  return {
    id: 1,
    kind: 'village-dog',
    x: point.x,
    z: point.z,
    yaw: 0,
    action: isDead ? 'Die' : 'Idle',
    actionCount: 0,
    health: isDead ? 0 : 60,
    mode: isDead ? 'dead' : 'idle',
  };
}

/** A player in the middle of the burrow, facing north. */
const IN_BURROW: Pose = { x: BURROW.x, z: BURROW.z, yaw: 180 };

describe('findPassage at the burrow of the wild dog', () => {
  it('goes down into the cave, to the landing, whichever way it faces', () => {
    for (const yaw of [0, 90, 180, 270]) {
      const passage: Passage | null = findPassage(
        { ...IN_BURROW, yaw },
        0,
        'village',
        [],
      );
      expect(passage?.destination).toBe('cave');
      expect(passage?.arrival).toEqual(CAVE_LANDING);
    }
  });

  it('goes down as far from the middle as the burrow reaches', () => {
    const near: Pose = { ...IN_BURROW, x: BURROW.x + BURROW_REACH - 0.01 };
    const far: Pose = { ...IN_BURROW, x: BURROW.x + BURROW_REACH + 0.01 };
    expect(findPassage(near, 0, 'village', [])).not.toBeNull();
    expect(findPassage(far, 0, 'village', [])).toBeNull();
  });

  it('goes down with the living dog away from the burrow', () => {
    const dog: MonsterState = placeDog({ x: BURROW.x - 4, z: BURROW.z });
    expect(findPassage(IN_BURROW, 0, 'village', [dog])).not.toBeNull();
  });

  it('goes down with the living dog close behind the player', () => {
    const dog: MonsterState = placeDog({ x: BURROW.x, z: BURROW.z + 1 });
    expect(findPassage(IN_BURROW, 0, 'village', [dog])).not.toBeNull();
  });

  it('slashes at the living dog in front of it and within reach', () => {
    const dog: MonsterState = placeDog({
      x: BURROW.x,
      z: BURROW.z - SLASH_REACH + 0.1,
    });
    expect(findPassage(IN_BURROW, 0, 'village', [dog])).toBeNull();
    expect(findInteraction(IN_BURROW, 0)).toBe('Slash');
  });

  it('goes down by the dead dog in front of it', () => {
    const dog: MonsterState = placeDog({ x: BURROW.x, z: BURROW.z - 1 }, true);
    expect(findPassage(IN_BURROW, 0, 'village', [dog])).not.toBeNull();
  });

  it('goes nowhere from the same spot in the cave', () => {
    expect(findPassage(IN_BURROW, 0, 'cave', [])).toBeNull();
  });
});

describe('findPassage at the rope in the cave', () => {
  /** A player east of the rope, facing it. */
  const byRope: Pose = { x: CAVE_ROPE.x + 0.8, z: CAVE_ROPE.z, yaw: -90 };

  it('climbs up to beside the old well, facing the rope', () => {
    const passage: Passage | null = findPassage(byRope, 0, 'cave', []);
    expect(passage?.destination).toBe('village');
    expect(passage?.arrival).toEqual(WELL_STAND);
  });

  it('climbs up as far from the rope as it reaches, and no farther', () => {
    const near: Pose = { ...byRope, x: CAVE_ROPE.x + ROPE_REACH - 0.01 };
    const far: Pose = { ...byRope, x: CAVE_ROPE.x + ROPE_REACH + 0.01 };
    expect(findPassage(near, 0, 'cave', [])).not.toBeNull();
    expect(findPassage(far, 0, 'cave', [])).toBeNull();
  });

  it('does not climb facing away from the rope', () => {
    expect(findPassage({ ...byRope, yaw: 90 }, 0, 'cave', [])).toBeNull();
  });

  it('goes nowhere from the same spot in the village', () => {
    expect(findPassage(byRope, 0, 'village', [])).toBeNull();
  });
});

describe('the spot beside the old well', () => {
  /** The old well in the yard of the chief's house. */
  const well: Placement = findPlacement('prop-old-well.glb');

  it('is clear, right beside the well', () => {
    expect(VILLAGE_TERRAIN.isClear(WELL_STAND, 0.1)).toBe(true);
    expect(
      Math.hypot(WELL_STAND.x - well.x, WELL_STAND.z - well.z),
    ).toBeLessThan(1.5);
  });

  it('faces the porch of the house of the chief, roughly', () => {
    const house: Placement = findPlacement('prop-chief-house.glb');
    const porch: GroundVector = placePoint(house, { x: 0, z: 3.45 });
    const yaw: number = (WELL_STAND.yaw * Math.PI) / 180;
    const dx: number = porch.x - WELL_STAND.x;
    const dz: number = porch.z - WELL_STAND.z;
    const along: number =
      (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.hypot(dx, dz);
    expect(along).toBeGreaterThan(Math.cos(Math.PI / 6));
  });

  it('has the plaza behind it', () => {
    const yaw: number = (WELL_STAND.yaw * Math.PI) / 180;
    const dx: number = PLAZA_CENTRE.x - WELL_STAND.x;
    const dz: number = PLAZA_CENTRE.z - WELL_STAND.z;
    const along: number =
      (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.hypot(dx, dz);
    expect(along).toBeLessThan(0);
  });
});

describe('the prisoner in the north cell of the cave', () => {
  /** The prisoner. */
  const edwin: Villager | undefined = VILLAGERS.find(
    (villager: Villager) => villager.id === 'edwin',
  );

  /** Where he stands, behind the bars of his cell. */
  const at: GroundVector =
    edwin === undefined ? { x: NaN, z: NaN } : locateVillager(edwin, 0, []);

  /**
   * Walks a player along the passage up to the bars of his cell, and has it
   * stop there, facing them.
   *
   * @param {number} x - How far east of the foot of the well shaft the
   *   player walks up to the bars, in metres.
   * @returns {Pose} Where it stops, and which way it faces.
   */
  function walkToBars(x: number): Pose {
    let motion: PlayerMotion = {
      ...createMotion({ x, z: 0 }, 180),
      direction: { x: 0, z: -1 },
    };
    for (let step = 1; step <= 60; step++) {
      motion = stepMotion(motion, step, 'cave', []);
    }
    return motion;
  }

  it('stands in the cave, and in no other map', () => {
    expect(edwin?.map).toBe('cave');
    expect(CAVE_TERRAIN.isClear(at)).toBe(false);
    expect(
      findVillager({ x: at.x, z: at.z + 0.8, yaw: 180 }, 0, 'village', []),
    ).toBeNull();
  });

  it('is talked to through the bars, before him and along them', () => {
    for (const x of [at.x - 0.8, at.x, at.x + 0.8]) {
      const pose: Pose = walkToBars(x);
      expect(findVillager(pose, 0, 'cave', [])?.id).toBe('edwin');
      expect(findInteraction(pose, 0, 'cave')).toBe('Talk');
    }
  });

  it('is talked to rather than picked by', () => {
    const pose: Pose = walkToBars(at.x);
    const world: WorldItems = {
      clovers: [],
      items: [layItem(1, { x: pose.x, z: pose.z })],
    };
    expect(findPickTarget(pose, 0, world, 'cave', [])).toBeNull();
  });

  it('is not talked to facing away from him', () => {
    const pose: Pose = { ...walkToBars(at.x), yaw: 0 };
    expect(findVillager(pose, 0, 'cave', [])).toBeNull();
    expect(findInteraction(pose, 0, 'cave')).toBe('Slash');
  });

  /**
   * A player at the bars, turned towards the east, with him still within
   * reach to talk to.
   */
  const turned: Pose = { ...walkToBars(at.x), yaw: 135 };

  it('is slashed past at a living dog in front of the player', () => {
    const dog: MonsterState = placeDog({ x: turned.x + 1, z: turned.z });
    expect(findInteraction(turned, 0, 'cave')).toBe('Talk');
    expect(findInteraction(turned, 0, 'cave', [dog])).toBe('Slash');
    expect(findVillager(turned, 0, 'cave', [dog])).toBeNull();
    const motion: PlayerMotion = {
      ...createMotion(turned, turned.yaw),
      isInteracting: true,
    };
    expect(stepMotion(motion, 0, 'cave', [dog]).action).toBe('Slash');
  });

  it('is talked to with a living dog behind the player', () => {
    const dog: MonsterState = placeDog({ x: turned.x - 0.7, z: turned.z });
    expect(findInteraction(turned, 0, 'cave', [dog])).toBe('Talk');
    expect(findVillager(turned, 0, 'cave', [dog])?.id).toBe('edwin');
  });

  it('is talked to with a dead dog in front of the player', () => {
    const dog: MonsterState = placeDog({ x: turned.x + 1, z: turned.z }, true);
    expect(findInteraction(turned, 0, 'cave', [dog])).toBe('Talk');
  });
});

describe('findPickTarget by the containers of the cave', () => {
  /**
   * Makes the pose of a player in front of a container, close by it,
   * facing it.
   *
   * @param {number} id - The number of the container.
   * @returns {Pose} The pose.
   */
  function standBefore(id: number): Pose {
    const container = CAVE_CONTAINERS[id];
    if (container === undefined) {
      throw new Error(`There is no container ${String(id)}.`);
    }
    const yaw: number = (container.yaw * Math.PI) / 180;
    return {
      x: container.x + Math.sin(yaw) * 0.75,
      z: container.z + Math.cos(yaw) * 0.75,
      yaw: container.yaw + 180,
    };
  }

  /** The numbers of the chests, and of the barrels. */
  const [chests, barrels] = [
    CAVE_CONTAINERS.flatMap((container, id: number) =>
      container.kind === 'chest' ? [id] : [],
    ),
    CAVE_CONTAINERS.flatMap((container, id: number) =>
      container.kind === 'barrel' ? [id] : [],
    ),
  ];

  /** Nothing to pick in the cave, but the containers. */
  const NOTHING: WorldItems = { clovers: [], items: [] };

  it('takes what a container holds while it has not been looted', () => {
    CAVE_CONTAINERS.forEach((container, id: number) => {
      expect(findPickTarget(standBefore(id), 0, NOTHING, 'cave', [])).toEqual({
        source: 'container',
        id,
        kind: container.item,
        ...(container.silver === undefined ? {} : { silver: container.silver }),
      });
    });
  });

  it('takes the five silver coins of the last barrel that holds no item', () => {
    const empty: number[] = barrels.filter(
      (id: number) => CAVE_CONTAINERS[id]?.item === null,
    );
    const last: number = empty.at(-1) ?? -1;
    expect(findPickTarget(standBefore(last), 0, NOTHING, 'cave', [])).toEqual({
      source: 'container',
      id: last,
      kind: null,
      silver: 5,
    });
  });

  it('finds nothing to take from a container once it has been looted', () => {
    const looted: number[] = CAVE_CONTAINERS.map((_, id: number) => id);
    CAVE_CONTAINERS.forEach((_, id: number) => {
      expect(
        findPickTarget(standBefore(id), 0, { ...NOTHING, looted }, 'cave', []),
      ).toEqual({ source: 'container', id, kind: null });
    });
  });

  it('picks an item on the ground before an empty container', () => {
    const [empty = -1] = barrels;
    const pose: Pose = standBefore(empty);
    const item: GroundItem = layItem(7, { x: pose.x, z: pose.z });
    expect(
      findPickTarget(
        pose,
        0,
        { ...NOTHING, items: [item], looted: [empty] },
        'cave',
        [],
      ),
    ).toEqual({ source: 'ground', id: 7, kind: 'clover' });
  });

  it('finds no container facing away, nor in the village', () => {
    const pose: Pose = standBefore(chests[0] ?? -1);
    expect(
      findPickTarget({ ...pose, yaw: pose.yaw + 180 }, 0, NOTHING, 'cave', []),
    ).toBeNull();
    expect(findPickTarget(pose, 0, NOTHING, 'village', [])).toBeNull();
  });
});
