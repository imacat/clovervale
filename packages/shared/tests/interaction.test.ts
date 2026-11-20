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
  FOUNTAIN_REACH,
  FOUNTAIN_RIM_RADIUS,
  CLOVER_PATCHES,
  INTERACTION_HALF_ANGLE,
  PICK_REACH,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  TALK_REACH,
  TOBY_LOOP_STEPS,
  VILLAGE_TERRAIN,
  findInteraction,
  findPickTarget,
  findPlacement,
  findTobyPose,
  findTurn,
  findVillager,
  turnVector,
} from '../src/index.ts';
import type {
  GroundItem,
  GroundVector,
  Placement,
  Pose,
  WorldItems,
} from '../src/index.ts';

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
      expect(findVillager(pose, 0)).toEqual({
        id: 'emma',
        file: 'npc-emma.glb',
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
    expect(findVillager(standByNancy(TALK_REACH - 0.1, 180), 0)).toEqual({
      id: 'nancy',
      file: 'npc-nancy.glb',
    });
  });

  it('finds Martha, facing her on the porch', () => {
    expect(findVillager(standBeforeMartha(), 0)).toEqual({
      id: 'martha',
      file: 'npc-martha.glb',
    });
  });

  it('finds nobody by her, facing away from her', () => {
    expect(findVillager(standByNancy(TALK_REACH - 0.1, 0), 0)).toBeNull();
  });

  it('finds nobody by the fountain, facing it', () => {
    const z: number = PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS;
    expect(findVillager({ x: PLAZA_CENTRE.x, z, yaw: 180 }, 0)).toBeNull();
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
    expect(findVillager(facing, RUNNING)).toEqual({
      id: 'toby',
      file: 'npc-toby.glb',
    });
    expect(findInteraction(facing, RUNNING)).toBe('Talk');
  });

  it('finds nobody where he was, once he has run on', () => {
    const toby: Pose = findTobyPose(RUNNING);
    const facing: Pose = { x: toby.x, z: toby.z + TALK_REACH - 0.1, yaw: 180 };
    expect(findVillager(facing, RUNNING + SIMULATION_RATE)).toBeNull();
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
      findPickTarget(standByPatch(PICK_REACH - 0.01, 180), 0, WITH_CLOVER),
    ).toEqual({ source: 'patch', id: PATCH, kind: 'clover' });
  });

  it('picks nothing from a patch whose clover is gone', () => {
    const pose: Pose = standByPatch(0.8, 180);
    expect(findPickTarget(pose, 0, { clovers: [], items: [] })).toBeNull();
    expect(findInteraction(pose, 0)).toBe('Slash');
  });

  it('picks nothing out of reach, or facing away', () => {
    expect(
      findPickTarget(standByPatch(PICK_REACH + 0.01, 180), 0, WITH_CLOVER),
    ).toBeNull();
    expect(
      findPickTarget(
        standByPatch(0.8, 180 + INTERACTION_HALF_ANGLE + 1),
        0,
        WITH_CLOVER,
      ),
    ).toBeNull();
  });

  it('picks an item on the ground in the same way', () => {
    const at: GroundVector = { x: PATCH_CENTRE.x, z: PATCH_CENTRE.z + 0.5 };
    const pose: Pose = standByPatch(1.5, 180);
    expect(
      findPickTarget(pose, 0, { clovers: [], items: [layItem(3, at)] }),
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
      findPickTarget(pose, 0, { clovers: [PATCH], items: [far, near] }),
    ).toMatchObject({ source: 'ground', id: 5 });
    expect(
      findPickTarget(pose, 0, { clovers: [PATCH], items: [far] }),
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
    expect(findPickTarget(byFountain, 0, { clovers: [], items })).toBeNull();
    expect(findPickTarget(byNancy, 0, { clovers: [], items })).toBeNull();
  });
});
