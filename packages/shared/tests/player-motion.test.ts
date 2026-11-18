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
 * @module shared/tests/player-motion Tests for the rules that move a
 *   player.
 */

import { describe, expect, it } from 'vitest';

import {
  DRINK_DURATION,
  DRINK_STEPS,
  FOUNTAIN_RIM_RADIUS,
  PLAYER_RADIUS,
  PLAZA_CENTRE,
  SIMULATION_RATE,
  SLASH_DURATION,
  SLASH_STEPS,
  TALK_DURATION,
  TALK_REACH,
  TALK_STEPS,
  VILLAGE_BOUNDARY,
  WALK_SPEED,
  applyInput,
  canInteract,
  createMotion,
  findPlacement,
  isResting,
  killMotion,
  stepMotion,
} from '../src/index.ts';
import type { PlayerInput, PlayerMotion } from '../src/index.ts';

/** The input that makes a player interact. */
const INTERACT: PlayerInput = { type: 'interact' };

/** Where a player stands against the rim of the fountain, facing it. */
const BY_FOUNTAIN: PlayerMotion = createMotion(
  {
    x: PLAZA_CENTRE.x,
    z: PLAZA_CENTRE.z + FOUNTAIN_RIM_RADIUS + PLAYER_RADIUS + 0.1,
  },
  180,
);

/** Where a player stands south of Nancy the villager, facing her. */
const BY_NANCY: PlayerMotion = createMotion(
  {
    x: findPlacement('npc-nancy.glb').x,
    z: findPlacement('npc-nancy.glb').z + TALK_REACH - 0.1,
  },
  180,
);

/**
 * Makes the input that steers a player.
 *
 * @param {number} x - The east-west component of the direction.
 * @param {number} z - The north-south component of the direction.
 * @returns {PlayerInput} The input.
 */
function steer(x: number, z: number): PlayerInput {
  return { type: 'move', direction: { x, z } };
}

/**
 * Moves a player several steps of the simulation forward.
 *
 * @param {PlayerMotion} motion - The motion of the player.
 * @param {number} count - The number of steps.
 * @returns {PlayerMotion} The motion after the steps.
 */
function stepTimes(motion: PlayerMotion, count: number): PlayerMotion {
  let stepped: PlayerMotion = motion;
  for (let step = 0; step < count; step++) {
    stepped = stepMotion(stepped);
  }
  return stepped;
}

describe('a new motion', () => {
  it('idles where it is told, facing the way it is told', () => {
    const motion: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);
    expect(motion).toMatchObject({ x: 2, z: -3, yaw: 180, action: 'Idle' });
    expect(isResting(motion)).toBe(true);
  });

  it('stays as it is without input', () => {
    const motion: PlayerMotion = createMotion({ x: 2, z: -3 }, 180);
    expect(stepTimes(motion, SIMULATION_RATE)).toEqual(motion);
  });
});

describe('a player who wants to move', () => {
  it('stays put until the next step', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 0 }, 0);
    const steered: PlayerMotion = applyInput(start, steer(1, 0));
    expect(steered).toMatchObject({ x: 0, z: 0, yaw: 0, action: 'Idle' });
    expect(isResting(steered)).toBe(false);
  });

  it('walks at walking speed, facing the way it goes', () => {
    const start: PlayerMotion = createMotion({ x: 1, z: 2 }, 0);
    const walking: PlayerMotion = stepTimes(
      applyInput(start, steer(-30, 0)),
      SIMULATION_RATE * 2,
    );
    expect(walking.x).toBeCloseTo(1 - WALK_SPEED * 2);
    expect(walking.z).toBeCloseTo(2);
    expect(walking.yaw).toBeCloseTo(-90);
    expect(walking.action).toBe('Walk');
    expect(walking.actionCount).toBe(1);
  });

  it('stops where it is, facing the same way, and rests', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 0 }, 0);
    const walking: PlayerMotion = stepTimes(
      applyInput(start, steer(1, 0)),
      5,
    );
    const stopping: PlayerMotion = applyInput(walking, steer(0, 0));
    expect(isResting(stopping)).toBe(false);
    const stopped: PlayerMotion = stepMotion(stopping);
    expect(stopped).toMatchObject({ x: walking.x, yaw: 90, action: 'Idle' });
    expect(stopped.actionCount).toBe(2);
    expect(isResting(stopped)).toBe(true);
    expect(stepMotion(stopped)).toEqual(stopped);
  });

  it('is left as it was by an input', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 0 }, 0);
    const before: PlayerMotion = {
      ...start,
      direction: { ...start.direction },
    };
    stepMotion(applyInput(applyInput(start, steer(1, 0)), INTERACT));
    expect(start).toEqual(before);
  });
});

describe('a player who interacts', () => {
  it('slashes from the next step, for as long as a slash lasts', () => {
    expect(SLASH_STEPS / SIMULATION_RATE).toBeCloseTo(SLASH_DURATION);
    const asked: PlayerMotion = applyInput(
      createMotion({ x: 0, z: 0 }, 0),
      INTERACT,
    );
    expect(asked.action).toBe('Idle');
    expect(isResting(asked)).toBe(false);
    const slashing: PlayerMotion = stepMotion(asked);
    expect(slashing.action).toBe('Slash');
    expect(stepTimes(slashing, SLASH_STEPS - 1).action).toBe('Slash');
    const over: PlayerMotion = stepTimes(slashing, SLASH_STEPS);
    expect(over.action).toBe('Idle');
    expect(isResting(over)).toBe(true);
  });

  it('carries on with its slash alone when asked again during it', () => {
    const slashing: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
      SLASH_STEPS / 2,
    );
    const again: PlayerMotion = applyInput(slashing, INTERACT);
    expect(again).toEqual(slashing);
    const over: PlayerMotion = stepTimes(again, SLASH_STEPS / 2 + 1);
    expect(over.action).toBe('Idle');
    expect(stepTimes(over, SLASH_STEPS).action).toBe('Idle');
  });

  it('stands still without turning while it slashes', () => {
    const walking: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), steer(1, 0)),
      4,
    );
    const slashing: PlayerMotion = stepTimes(
      applyInput(applyInput(walking, INTERACT), steer(0, 1)),
      SLASH_STEPS,
    );
    expect(slashing).toMatchObject({
      x: walking.x,
      z: walking.z,
      yaw: walking.yaw,
      action: 'Slash',
    });
  });

  it('walks on after the slash the way it wants to move by then', () => {
    const slashing: PlayerMotion = stepMotion(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
    );
    const turned: PlayerMotion = applyInput(
      stepTimes(applyInput(slashing, steer(1, 0)), 3),
      steer(0, 1),
    );
    const walking: PlayerMotion = stepTimes(turned, SLASH_STEPS - 3);
    expect(walking.action).toBe('Walk');
    expect(walking.yaw).toBeCloseTo(0);
    expect(walking.x).toBeCloseTo(0);
    expect(walking.z).toBeCloseTo(WALK_SPEED / SIMULATION_RATE);
  });

  it('can slash again as soon as the slash is over', () => {
    const over: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
      SLASH_STEPS + 1,
    );
    const again: PlayerMotion = stepMotion(applyInput(over, INTERACT));
    expect(again.action).toBe('Slash');
    expect(again.actionCount).toBe(3);
  });
});

describe('a player who interacts by the fountain', () => {
  it('drinks from the next step, for as long as a drink lasts', () => {
    expect(DRINK_STEPS / SIMULATION_RATE).toBeCloseTo(DRINK_DURATION);
    const asked: PlayerMotion = applyInput(BY_FOUNTAIN, INTERACT);
    expect(asked.action).toBe('Idle');
    const drinking: PlayerMotion = stepMotion(asked);
    expect(drinking.action).toBe('Drink');
    expect(drinking.actionCount).toBe(1);
    expect(canInteract(drinking)).toBe(false);
    expect(stepTimes(drinking, DRINK_STEPS - 1).action).toBe('Drink');
    const over: PlayerMotion = stepTimes(drinking, DRINK_STEPS);
    expect(over.action).toBe('Idle');
    expect(canInteract(over)).toBe(true);
    expect(isResting(over)).toBe(true);
  });

  it('carries on with its drink alone when asked again during it', () => {
    const drinking: PlayerMotion = stepTimes(
      applyInput(BY_FOUNTAIN, INTERACT),
      DRINK_STEPS / 2,
    );
    const again: PlayerMotion = applyInput(drinking, INTERACT);
    expect(again).toEqual(drinking);
    const over: PlayerMotion = stepTimes(again, DRINK_STEPS / 2 + 1);
    expect(over.action).toBe('Idle');
    expect(stepTimes(over, DRINK_STEPS).action).toBe('Idle');
  });

  it('stands still without turning while it drinks', () => {
    const drinking: PlayerMotion = stepTimes(
      applyInput(applyInput(BY_FOUNTAIN, INTERACT), steer(1, 0)),
      DRINK_STEPS,
    );
    expect(drinking).toMatchObject({
      x: BY_FOUNTAIN.x,
      z: BY_FOUNTAIN.z,
      yaw: BY_FOUNTAIN.yaw,
      action: 'Drink',
    });
    const walking: PlayerMotion = stepMotion(drinking);
    expect(walking.action).toBe('Walk');
    expect(walking.x).toBeGreaterThan(BY_FOUNTAIN.x);
  });

  it('slashes facing away from the fountain', () => {
    const away: PlayerMotion = { ...BY_FOUNTAIN, yaw: 0 };
    expect(stepMotion(applyInput(away, INTERACT)).action).toBe('Slash');
  });

  it('does not drink while it slashes', () => {
    const away: PlayerMotion = { ...BY_FOUNTAIN, yaw: 0 };
    const slashing: PlayerMotion = stepMotion(applyInput(away, INTERACT));
    const turned: PlayerMotion = { ...slashing, yaw: 180 };
    expect(canInteract(turned)).toBe(false);
    expect(applyInput(turned, INTERACT)).toEqual(turned);
  });

  it('does not drink once dead, then or later', () => {
    const dead: PlayerMotion = killMotion(BY_FOUNTAIN);
    expect(canInteract(dead)).toBe(false);
    const asked: PlayerMotion = applyInput(dead, INTERACT);
    expect(asked).toEqual(dead);
    expect(stepTimes(asked, SIMULATION_RATE)).toEqual(dead);
  });

  it('stops drinking when it dies', () => {
    const drinking: PlayerMotion = stepMotion(
      applyInput(BY_FOUNTAIN, INTERACT),
    );
    const dead: PlayerMotion = stepTimes(killMotion(drinking), DRINK_STEPS);
    expect(dead.action).toBe('Die');
    expect(dead.actionCount).toBe(drinking.actionCount + 1);
  });
});

describe('a player who interacts by Nancy', () => {
  it('talks from the next step, for as long as a talk lasts', () => {
    expect(TALK_STEPS / SIMULATION_RATE).toBeCloseTo(TALK_DURATION);
    const talking: PlayerMotion = stepMotion(applyInput(BY_NANCY, INTERACT));
    expect(talking.action).toBe('Talk');
    expect(talking.actionCount).toBe(1);
    expect(canInteract(talking)).toBe(false);
    expect(stepTimes(talking, TALK_STEPS - 1).action).toBe('Talk');
    const over: PlayerMotion = stepTimes(talking, TALK_STEPS);
    expect(over.action).toBe('Idle');
    expect(canInteract(over)).toBe(true);
  });

  it('stands still without turning while it talks', () => {
    const talking: PlayerMotion = stepTimes(
      applyInput(applyInput(BY_NANCY, INTERACT), steer(1, 0)),
      TALK_STEPS,
    );
    expect(talking).toMatchObject({
      x: BY_NANCY.x,
      z: BY_NANCY.z,
      yaw: BY_NANCY.yaw,
      action: 'Talk',
    });
    expect(stepMotion(talking).action).toBe('Walk');
  });

  it('can talk again as soon as the talk is over', () => {
    const over: PlayerMotion = stepTimes(
      applyInput(BY_NANCY, INTERACT),
      TALK_STEPS + 1,
    );
    const again: PlayerMotion = stepMotion(applyInput(over, INTERACT));
    expect(again.action).toBe('Talk');
    expect(again.actionCount).toBe(3);
  });

  it('slashes facing away from her', () => {
    const away: PlayerMotion = { ...BY_NANCY, yaw: 0 };
    expect(stepMotion(applyInput(away, INTERACT)).action).toBe('Slash');
  });
});

describe('a player who walks into the scenery', () => {
  // The cottage by the plaza faces it, its front wall along the Z axis.
  const cottage = findPlacement('prop-cottage.glb');
  const front: number = cottage.x + 2.35 + PLAYER_RADIUS;

  it('walks on the spot against what it walks straight into', () => {
    const start: PlayerMotion = createMotion({ x: front + 2, z: -3.5 }, 0);
    const walked: PlayerMotion = stepTimes(applyInput(start, steer(-1, 0)), 60);
    expect(walked.x).toBeCloseTo(front, 9);
    expect(walked.z).toBe(-3.5);
    expect(walked).toMatchObject({ yaw: -90, action: 'Walk' });
    expect(stepMotion(walked)).toMatchObject({ x: walked.x, z: walked.z });
  });

  it('slides along what it walks into at an angle', () => {
    const start: PlayerMotion = createMotion({ x: front + 0.5, z: -3 }, 0);
    const walked: PlayerMotion = stepTimes(
      applyInput(start, steer(-1, -1)),
      20,
    );
    expect(walked.x).toBeCloseTo(front, 9);
    expect(walked.z).toBeLessThan(-3 - 0.8);
  });

  it('cannot leave the village', () => {
    const start: PlayerMotion = createMotion({ x: 0, z: 15 }, 0);
    const walked: PlayerMotion = stepTimes(
      applyInput(start, steer(0, 1)),
      SIMULATION_RATE * 10,
    );
    expect(walked.z).toBeCloseTo(
      VILLAGE_BOUNDARY.z + VILLAGE_BOUNDARY.radius - PLAYER_RADIUS,
      9,
    );
  });
});

describe('a player who dies', () => {
  it('falls where it is, facing the same way', () => {
    const walking: PlayerMotion = stepTimes(
      applyInput(createMotion({ x: 0, z: 0 }, 0), steer(1, 0)),
      4,
    );
    const dead: PlayerMotion = killMotion(walking);
    expect(dead).toMatchObject({
      x: walking.x,
      z: walking.z,
      yaw: walking.yaw,
      action: 'Die',
      actionCount: walking.actionCount + 1,
    });
    expect(isResting(dead)).toBe(false);
  });

  it('stops slashing', () => {
    const slashing: PlayerMotion = stepMotion(
      applyInput(createMotion({ x: 0, z: 0 }, 0), INTERACT),
    );
    const dead: PlayerMotion = stepTimes(killMotion(slashing), SLASH_STEPS);
    expect(dead.action).toBe('Die');
    expect(dead.actionCount).toBe(slashing.actionCount + 1);
  });

  it('neither moves nor turns while it wants to', () => {
    const dead: PlayerMotion = killMotion(createMotion({ x: 1, z: 2 }, 30));
    const steered: PlayerMotion = applyInput(dead, steer(-1, 0));
    const after: PlayerMotion = stepTimes(steered, SIMULATION_RATE);
    expect(after).toEqual(steered);
    expect(after).toMatchObject({ x: 1, z: 2, yaw: 30, action: 'Die' });
  });

  it('does not slash, then or later', () => {
    const dead: PlayerMotion = killMotion(createMotion({ x: 0, z: 0 }, 0));
    const asked: PlayerMotion = applyInput(dead, INTERACT);
    expect(asked).toEqual(dead);
    expect(stepTimes(asked, SIMULATION_RATE)).toEqual(dead);
  });

  it('still takes in the way it wants to move', () => {
    const walking: PlayerMotion = applyInput(
      createMotion({ x: 0, z: 0 }, 0),
      steer(1, 0),
    );
    const dead: PlayerMotion = killMotion(stepMotion(walking));
    expect(dead.direction).toEqual({ x: 1, z: 0 });
    const stopped: PlayerMotion = applyInput(dead, steer(0, 0));
    expect(stopped.direction).toEqual({ x: 0, z: 0 });
  });
});
